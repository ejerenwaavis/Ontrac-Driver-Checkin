import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Camera, RefreshCw, CheckCircle, XCircle, Upload, ShieldCheck, Loader2 } from 'lucide-react';
import api from '../services/api.js';

// ── Tuning constants ───────────────────────────────────────────────────────────
const READY_HOLD_MS      = 2000;  // ms all checks must pass before auto-trigger
const DETECTION_INTERVAL = 200;   // ms between face-api detection runs
const BRIGHTNESS_MIN     = 55;    // 0-255 — reject if too dark
const BRIGHTNESS_MAX     = 215;   // 0-255 — reject if blown out
const FACE_CENTER_TOL    = 0.22;  // fractional tolerance from viewport centre
const FACE_MIN_RATIO     = 0.28;  // face height / viewport height — must be ≥
const FACE_MAX_RATIO     = 0.78;  // face height / viewport height — must be ≤
const MOTION_THRESHOLD   = 10;    // px shift between frames = "not still"
const FA_SCRIPT_URL      = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js';
const FA_MODEL_URL       = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';

// Singleton promise — inject the script only once per page lifetime
let faceApiScriptPromise = null;
async function loadFaceApi() {
  if (window.faceapi) return;
  if (!faceApiScriptPromise) {
    faceApiScriptPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = FA_SCRIPT_URL;
      s.onload = resolve;
      s.onerror = () => reject(new Error('face-api script failed to load'));
      document.head.appendChild(s);
    });
  }
  return faceApiScriptPromise;
}

// ── Pure quality-check helpers (defined outside component — no re-render cost) ─
function checkCentered(box, vw, vh) {
  const cx = (box.x + box.width  / 2) / vw;
  const cy = (box.y + box.height / 2) / vh;
  return Math.abs(cx - 0.5) < FACE_CENTER_TOL && Math.abs(cy - 0.48) < FACE_CENTER_TOL;
}
function checkSize(box, vh) {
  const r = box.height / vh;
  return r >= FACE_MIN_RATIO && r <= FACE_MAX_RATIO;
}
function checkLighting(video, canvas) {
  const n = 60;
  canvas.width = canvas.height = n;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, (video.videoWidth - n) / 2, (video.videoHeight - n) / 2, n, n, 0, 0, n, n);
  const d = ctx.getImageData(0, 0, n, n).data;
  let t = 0;
  for (let i = 0; i < d.length; i += 4)
    t += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  const avg = t / (n * n);
  return avg >= BRIGHTNESS_MIN && avg <= BRIGHTNESS_MAX;
}
function checkStill(box, prevRef) {
  if (!prevRef.current) { prevRef.current = box; return false; }
  const dx = Math.abs(box.x - prevRef.current.x);
  const dy = Math.abs(box.y - prevRef.current.y);
  return dx < MOTION_THRESHOLD && dy < MOTION_THRESHOLD;
}
function buildHint(c) {
  if (!c.face)   return 'Position your face in the oval';
  if (!c.size)   return 'Move closer or further from the camera';
  if (!c.center) return 'Centre your face in the oval';
  if (!c.light)  return 'Improve lighting — too dark or bright';
  if (!c.still)  return 'Hold still…';
  return 'Hold still — preparing…';
}

const PILL_DEFS = [
  { key: 'face',   icon: '👤', label: 'Face detected' },
  { key: 'center', icon: '🎯', label: 'Centred' },
  { key: 'size',   icon: '📐', label: 'Good size' },
  { key: 'light',  icon: '💡', label: 'Lighting OK' },
  { key: 'still',  icon: '🧘', label: 'Hold still' },
];

const EMPTY_CHECKS = { face: false, center: false, size: false, light: false, still: false };

// Steps: 'loading' | 'invalid' | 'form' | 'camera' | 'uploading' | 'success' | 'error'
export default function PhotoRegister() {
  const { token } = useParams();
  const [step, setStep]                       = useState('loading');
  const [invite, setInvite]                   = useState(null);
  const [driverNumber, setDriverNumber]       = useState('');
  const [dnError, setDnError]                 = useState('');
  const [capturedBlob, setCapturedBlob]       = useState(null);
  const [capturedPreview, setCapturedPreview] = useState(null);
  const [successName, setSuccessName]         = useState('');
  const [errorMsg, setErrorMsg]               = useState('');

  // ── Camera refs ──────────────────────────────────────────────────────────
  const videoRef             = useRef(null);
  const canvasRef            = useRef(null);
  const streamRef            = useRef(null);
  const fileInputRef         = useRef(null);
  const detectionIntervalRef = useRef(null);
  const readyStartRef        = useRef(null);   // timestamp when all checks first passed
  const prevFaceBoxRef       = useRef(null);   // last bounding box for stillness check
  const isCapturingRef       = useRef(false);  // prevents double-trigger during countdown
  const capturePhotoRef      = useRef(null);   // kept in sync, used by triggerAutoCapture

  // ── Camera state ─────────────────────────────────────────────────────────
  const [videoReady, setVideoReady]     = useState(false);
  const [modelStatus, setModelStatus]   = useState('idle'); // 'idle'|'loading'|'ready'|'error'
  const [checks, setChecks]             = useState(EMPTY_CHECKS);
  const [countdown, setCountdown]       = useState(null);  // null | 3 | 2 | 1
  const [showFlash, setShowFlash]       = useState(false);
  const [hint, setHint]                 = useState('');

  // ── 1. Validate token on mount ─────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/invite/${token}/validate`);
        if (data.valid) {
          setInvite(data);
          // Pre-fill driver number for reregister invites
          if (data.type === 'reregister' && data.lockedDriverNumber) {
            setDriverNumber(data.lockedDriverNumber);
          }
          setStep('form');
        } else {
          setErrorMsg(data.reason || 'This invite link is invalid or has expired.');
          setStep('invalid');
        }
      } catch {
        setErrorMsg('Unable to validate this invite link. Please try again.');
        setStep('invalid');
      }
    })();
  }, [token]);

  // ── 2. Open camera ────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setCapturedBlob(null);
    setCapturedPreview(null);
    setVideoReady(false);
    setChecks(EMPTY_CHECKS);
    setHint('');
    setCountdown(null);
    isCapturingRef.current = false;
    readyStartRef.current  = null;
    prevFaceBoxRef.current = null;
    setStep('camera');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
    } catch {
      stopCamera();
      fileInputRef.current?.click();
    }
  }, []);

  const stopCamera = useCallback(() => {
    clearInterval(detectionIntervalRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  // ── 3. capturePhoto — defined before effects to prevent TDZ after minification ─
  const capturePhoto = useCallback(() => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const w    = video.videoWidth  || video.clientWidth  || 480;
    const h    = video.videoHeight || video.clientHeight || 480;
    const size = Math.min(w, h);
    if (size === 0) return;

    canvas.width  = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, (w - size) / 2, (h - size) / 2, size, size, 0, 0, size, size);

    // data: URL — blob: is blocked by production helmet CSP (img-src 'self' data:)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    canvas.toBlob(
      (blob) => {
        if (!blob || blob.size < 100) { requestAnimationFrame(capturePhoto); return; }
        setCapturedBlob(blob);
        setCapturedPreview(dataUrl);
        stopCamera();
      },
      'image/jpeg',
      0.88,
    );
  }, [stopCamera]);

  // Keep capturePhotoRef current so setInterval closures always call the latest version
  useEffect(() => { capturePhotoRef.current = capturePhoto; }, [capturePhoto]);

  // ── triggerAutoCapture: countdown 3→2→1 then flash → capture ────────────
  const triggerAutoCapture = useCallback(async () => {
    if (isCapturingRef.current) return;
    isCapturingRef.current = true;
    clearInterval(detectionIntervalRef.current);
    for (let i = 3; i >= 1; i--) {
      setCountdown(i);
      await new Promise((r) => setTimeout(r, 900));
    }
    setCountdown(null);
    setShowFlash(true);
    await new Promise((r) => setTimeout(r, 80));
    setShowFlash(false);
    capturePhotoRef.current?.();
  }, []);

  // ── 4. Load face-api script + tinyFaceDetector model on entering camera ──
  useEffect(() => {
    if (step !== 'camera' || capturedPreview) return;
    let cancelled = false;
    (async () => {
      setModelStatus('loading');
      try {
        await loadFaceApi();
        if (cancelled) return;
        const fa = window.faceapi;
        if (!fa.nets.tinyFaceDetector.isLoaded) {
          await fa.nets.tinyFaceDetector.loadFromUri(FA_MODEL_URL);
        }
        if (!cancelled) setModelStatus('ready');
      } catch {
        if (!cancelled) setModelStatus('error');
      }
    })();
    return () => { cancelled = true; };
  }, [step, capturedPreview]);

  // ── 5. Detection loop — runs once models ready & video is playing ─────────
  useEffect(() => {
    if (step !== 'camera' || capturedPreview || modelStatus !== 'ready' || !videoReady) {
      clearInterval(detectionIntervalRef.current);
      return;
    }
    readyStartRef.current  = null;
    prevFaceBoxRef.current = null;
    setHint('Looking for your face…');

    detectionIntervalRef.current = setInterval(async () => {
      const video  = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !video.videoWidth || isCapturingRef.current) return;

      const fa        = window.faceapi;
      const detection = await fa
        .detectSingleFace(video, new fa.TinyFaceDetectorOptions({ scoreThreshold: 0.5 }))
        .catch(() => null);

      if (!detection) {
        readyStartRef.current  = null;
        prevFaceBoxRef.current = null;
        setChecks(EMPTY_CHECKS);
        setHint('No face detected — look at the camera');
        return;
      }

      const { box } = detection;
      const vw = video.videoWidth, vh = video.videoHeight;
      const c = {
        face:   true,
        center: checkCentered(box, vw, vh),
        size:   checkSize(box, vh),
        light:  checkLighting(video, canvas),
        still:  checkStill(box, prevFaceBoxRef),
      };
      prevFaceBoxRef.current = box;
      setChecks(c);

      const allGood = c.face && c.center && c.size && c.light && c.still;
      if (allGood) {
        if (!readyStartRef.current) readyStartRef.current = Date.now();
        const remaining = READY_HOLD_MS - (Date.now() - readyStartRef.current);
        if (remaining <= 0) {
          triggerAutoCapture();
        } else {
          setHint(`Hold still — ${(remaining / 1000).toFixed(1)}s`);
        }
      } else {
        readyStartRef.current = null;
        setHint(buildHint(c));
      }
    }, DETECTION_INTERVAL);

    return () => clearInterval(detectionIntervalRef.current);
  }, [step, capturedPreview, modelStatus, videoReady, triggerAutoCapture]);

  // ── 6. File input fallback ────────────────────────────────────────────────
  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCapturedBlob(file);
    // Use FileReader so the preview is a data: URL (allowed by CSP img-src)
    const reader = new FileReader();
    reader.onload = (ev) => setCapturedPreview(ev.target.result);
    reader.readAsDataURL(file);
    setStep('camera');
  }, []);

  // ── 5. Driver number submit ────────────────────────────────────────────────
  const handleDriverSubmit = useCallback((e) => {
    e.preventDefault();
    const num = driverNumber.trim().toUpperCase();
    if (!num) {
      setDnError('Please enter your driver number.');
      return;
    }
    setDnError('');
    setDriverNumber(num);
    startCamera();
  }, [driverNumber, startCamera]);

  // ── 6. Upload ──────────────────────────────────────────────────────────────
  const handleUpload = useCallback(async () => {
    if (!capturedBlob) return;
    setStep('uploading');

    try {
      const form = new FormData();
      form.append('driverNumber', driverNumber);
      form.append('photo', capturedBlob, 'selfie.jpg');

      const { data } = await api.post(`/invite/${token}/register`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setSuccessName(data.driverName);
      setStep('success');
    } catch (err) {
      const msg = err.response?.data?.message || 'Upload failed. Please try again.';
      setErrorMsg(msg);
      setStep('error');
    }
  }, [capturedBlob, driverNumber, token]);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-surface-soft flex flex-col items-center justify-start px-4 py-10">
      {/* Brand header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-9 h-9 bg-brand-600 rounded-lg flex items-center justify-center shadow-sm">
          <ShieldCheck className="w-5 h-5 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-gray-900 leading-tight">OnTrac</p>
          <p className="text-xs text-gray-500">Driver Check-In</p>
        </div>
      </div>

      <div className="w-full max-w-sm">

        {/* Loading */}
        {step === 'loading' && (
          <div className="text-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-brand-600 mx-auto mb-3" />
            <p className="text-sm text-gray-500">Validating link…</p>
          </div>
        )}

        {/* Invalid */}
        {step === 'invalid' && (
          <div className="card p-6 text-center space-y-3">
            <XCircle className="w-12 h-12 text-red-400 mx-auto" />
            <h2 className="text-lg font-bold text-gray-900">Link Invalid</h2>
            <p className="text-sm text-gray-500">{errorMsg}</p>
          </div>
        )}

        {/* Form: enter driver number */}
        {step === 'form' && (
          <div className="card p-6 space-y-5">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Register Your Photo</h2>
              <p className="text-sm text-gray-500 mt-1">
                Team: <span className="font-semibold text-gray-700">{invite?.teamName}</span>
              </p>
              {invite?.type === 'reregister' && (
                <p className="text-xs text-amber-600 mt-1 font-medium">
                  This is a one-time photo update link.
                </p>
              )}
            </div>

            <form onSubmit={handleDriverSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Driver Number
                </label>
                <input
                  type="text"
                  value={driverNumber}
                  onChange={(e) => setDriverNumber(e.target.value.toUpperCase())}
                  disabled={invite?.type === 'reregister'}
                  placeholder="e.g. D12345"
                  className={`input-field w-full font-mono ${invite?.type === 'reregister' ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                  autoCapitalize="characters"
                  autoCorrect="off"
                />
                {dnError && <p className="text-xs text-red-500 mt-1">{dnError}</p>}
              </div>
              <button type="submit" className="btn-primary w-full flex items-center justify-center gap-2">
                <Camera className="w-4 h-4" />
                Take Photo
              </button>
            </form>

            {/* Hidden file fallback */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="user"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        )}

        {/* Camera */}
        {step === 'camera' && (() => {
          const allGood = checks.face && checks.center && checks.size && checks.light && checks.still;
          return (
            <div className="card p-4 space-y-3">
              <h2 className="text-lg font-bold text-gray-900 text-center">
                {capturedPreview ? 'Looks good?' : allGood ? 'Hold still…' : 'Position your face'}
              </h2>

              {capturedPreview ? (
                <img
                  src={capturedPreview}
                  alt="Captured selfie"
                  className="w-full rounded-xl object-cover border border-surface-border"
                  style={{ aspectRatio: '1/1' }}
                />
              ) : (
                <>
                  {/* ── Viewport ── */}
                  <div
                    className="relative rounded-xl overflow-hidden bg-gray-900"
                    style={{ aspectRatio: '3/4' }}
                  >
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      onLoadedMetadata={() => setVideoReady(true)}
                      onCanPlay={() => setVideoReady(true)}
                      className="w-full h-full object-cover"
                    />
                    <canvas ref={canvasRef} className="hidden" />

                    {/* Camera loading */}
                    {!videoReady && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Loader2 className="w-8 h-8 text-white/60 animate-spin" />
                      </div>
                    )}

                    {/* Model loading overlay */}
                    {videoReady && modelStatus === 'loading' && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 gap-3">
                        <Loader2 className="w-7 h-7 text-white animate-spin" />
                        <p className="text-white text-xs font-medium tracking-wide">Loading face models…</p>
                        <p className="text-white/60 text-xs">First load may take a moment</p>
                      </div>
                    )}

                    {/* SVG oval guide */}
                    {videoReady && (
                      <svg
                        className="absolute inset-0 w-full h-full pointer-events-none"
                        viewBox="0 0 300 400"
                        preserveAspectRatio="xMidYMid slice"
                      >
                        <defs>
                          <mask id="face-oval-mask">
                            <rect width="300" height="400" fill="white" />
                            <ellipse cx="150" cy="168" rx="90" ry="116" fill="black" />
                          </mask>
                        </defs>
                        {/* Dim area outside oval */}
                        <rect width="300" height="400" fill="rgba(0,0,0,0.42)" mask="url(#face-oval-mask)" />
                        {/* Oval border: white → amber (face found) → green (all pass) */}
                        <ellipse
                          cx="150" cy="168" rx="90" ry="116"
                          fill="none"
                          stroke={allGood ? '#4ade80' : checks.face ? '#fbbf24' : 'rgba(255,255,255,0.55)'}
                          strokeWidth="2.5"
                          style={{ transition: 'stroke 0.3s' }}
                        />
                        {/* Alignment tick marks */}
                        <line x1="46"  y1="168" x2="66"  y2="168" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
                        <line x1="234" y1="168" x2="254" y2="168" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
                        <line x1="150" y1="44"  x2="150" y2="62"  stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
                        <line x1="150" y1="288" x2="150" y2="306" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
                      </svg>
                    )}

                    {/* Green inner glow when all checks pass */}
                    {allGood && (
                      <div className="absolute inset-0 pointer-events-none rounded-xl ring-2 ring-inset ring-green-400/60 shadow-[inset_0_0_32px_rgba(74,222,128,0.25)]" />
                    )}

                    {/* Countdown */}
                    {countdown !== null && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <span
                          key={countdown}
                          className="font-black text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.7)] photo-countdown-pop"
                          style={{ fontSize: '6rem', lineHeight: 1 }}
                        >
                          {countdown}
                        </span>
                      </div>
                    )}

                    {/* Flash */}
                    {showFlash && <div className="absolute inset-0 bg-white pointer-events-none" />}

                    {/* Status hint strip */}
                    {videoReady && modelStatus === 'ready' && countdown === null && hint && (
                      <div
                        className="absolute bottom-0 left-0 right-0 px-4 py-2 text-center"
                        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.72) 0%, transparent 100%)' }}
                      >
                        <p className="text-white text-xs font-medium">{hint}</p>
                      </div>
                    )}

                    {/* Model error notice */}
                    {modelStatus === 'error' && (
                      <div className="absolute bottom-3 left-3 right-3 bg-red-900/80 text-white text-xs p-2 rounded-lg text-center">
                        Auto-detect unavailable — use the button below
                      </div>
                    )}
                  </div>

                  {/* ── Check pills ── */}
                  {modelStatus === 'ready' && (
                    <div className="flex flex-wrap gap-1.5 justify-center">
                      {PILL_DEFS.map(({ key, icon, label }) => (
                        <div
                          key={key}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-all duration-300 ${
                            checks[key]
                              ? 'bg-green-50 border-green-300 text-green-700'
                              : 'bg-gray-50 border-gray-200 text-gray-400'
                          }`}
                        >
                          <span>{icon}</span>
                          {label}
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}

              <div className="space-y-2">
                {!capturedPreview && (
                  <button
                    onClick={capturePhoto}
                    disabled={!videoReady}
                    className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Camera className="w-4 h-4" />
                    {!videoReady ? 'Camera loading…' : modelStatus === 'ready' ? 'Capture Manually' : 'Capture'}
                  </button>
                )}
                {capturedPreview && (
                  <>
                    <button
                      onClick={handleUpload}
                      className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white font-semibold py-3 px-4 rounded-xl transition-colors"
                    >
                      <Upload className="w-4 h-4" />
                      Use This Photo
                    </button>
                    <button
                      onClick={() => { setCapturedBlob(null); setCapturedPreview(null); startCamera(); }}
                      className="btn-secondary w-full flex items-center justify-center gap-2"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Retake
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })()}

        {/* Uploading */}
        {step === 'uploading' && (
          <div className="card p-6 text-center space-y-3">
            <Loader2 className="w-10 h-10 animate-spin text-brand-600 mx-auto" />
            <p className="text-sm font-medium text-gray-700">Uploading your photo…</p>
          </div>
        )}

        {/* Success */}
        {step === 'success' && (
          <div className="card p-6 text-center space-y-4">
            <CheckCircle className="w-14 h-14 text-green-500 mx-auto" />
            <div>
              <h2 className="text-xl font-bold text-gray-900">Photo Registered!</h2>
              {successName && (
                <p className="text-sm text-gray-500 mt-1">Welcome, <span className="font-semibold">{successName}</span>.</p>
              )}
              <p className="text-sm text-gray-500 mt-1">Your photo will appear at check-in starting today.</p>
            </div>
            {invite?.type !== 'reregister' && (
              <button
                onClick={() => {
                  setCapturedBlob(null);
                  setCapturedPreview(null);
                  setDriverNumber('');
                  setStep('form');
                }}
                className="btn-secondary w-full"
              >
                Register Another Driver
              </button>
            )}
          </div>
        )}

        {/* Error */}
        {step === 'error' && (
          <div className="card p-6 text-center space-y-4">
            <XCircle className="w-12 h-12 text-red-400 mx-auto" />
            <div>
              <h2 className="text-lg font-bold text-gray-900">Registration Failed</h2>
              <p className="text-sm text-gray-500 mt-1">{errorMsg}</p>
            </div>
            <button
              onClick={() => { setCapturedBlob(null); setCapturedPreview(null); setStep('form'); }}
              className="btn-secondary w-full"
            >
              Try Again
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
