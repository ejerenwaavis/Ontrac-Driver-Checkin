import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { Camera, RefreshCw, CheckCircle, XCircle, Upload, ShieldCheck, Loader2 } from 'lucide-react';
import api from '../services/api.js';

// Steps: 'loading' | 'invalid' | 'form' | 'camera' | 'uploading' | 'success' | 'error'

export default function PhotoRegister() {
  const { token } = useParams();
  const [step, setStep] = useState('loading');
  const [invite, setInvite] = useState(null);
  const [driverNumber, setDriverNumber] = useState('');
  const [dnError, setDnError] = useState('');
  const [capturedBlob, setCapturedBlob] = useState(null);
  const [capturedPreview, setCapturedPreview] = useState(null);
  const [successName, setSuccessName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

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

  // ── 2. Open camera ─────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setCapturedBlob(null);
    setCapturedPreview(null);
    setStep('camera');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch {
      // Fall back to file input if camera unavailable
      stopCamera();
      fileInputRef.current?.click();
    }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  // ── 3. Capture frame from video ────────────────────────────────────────────
  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const size = Math.min(video.videoWidth, video.videoHeight);
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const offsetX = (video.videoWidth - size) / 2;
    const offsetY = (video.videoHeight - size) / 2;
    ctx.drawImage(video, offsetX, offsetY, size, size, 0, 0, size, size);

    canvas.toBlob(
      (blob) => {
        setCapturedBlob(blob);
        setCapturedPreview(URL.createObjectURL(blob));
        stopCamera();
      },
      'image/jpeg',
      0.88
    );
  }, [stopCamera]);

  // ── 4. File input fallback ─────────────────────────────────────────────────
  const handleFileSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCapturedBlob(file);
    setCapturedPreview(URL.createObjectURL(file));
    setStep('camera'); // reuse camera step for preview/retake
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

        {/* Camera / preview */}
        {step === 'camera' && (
          <div className="card p-4 space-y-4">
            <h2 className="text-lg font-bold text-gray-900 text-center">
              {capturedPreview ? 'Looks good?' : 'Position your face'}
            </h2>

            {capturedPreview ? (
              <img
                src={capturedPreview}
                alt="Captured selfie"
                className="w-full aspect-square rounded-xl object-cover border border-surface-border"
              />
            ) : (
              <div className="relative">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full aspect-square rounded-xl object-cover bg-gray-900"
                />
                <canvas ref={canvasRef} className="hidden" />
              </div>
            )}

            <div className="space-y-2">
              {!capturedPreview && (
                <button
                  onClick={capturePhoto}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  <Camera className="w-4 h-4" />
                  Capture
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
        )}

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
