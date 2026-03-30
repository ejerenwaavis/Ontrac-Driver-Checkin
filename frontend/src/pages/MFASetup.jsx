import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { ShieldCheck, Smartphone, CheckCircle, Loader2, Copy, Check } from 'lucide-react';
import { useAuth } from '../hooks/useAuth.js';
import api from '../services/api.js';
import toast from 'react-hot-toast';

export default function MFASetup() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const tempToken = location.state?.tempToken;
  const email = location.state?.email;

  const [step, setStep] = useState('loading'); // 'loading' | 'qr' | 'verify' | 'done'
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm();

  useEffect(() => {
    if (!tempToken) { navigate('/login'); return; }
    const init = async () => {
      try {
        const res = await api.post('/auth/setup-mfa', { tempToken });
        setQrCode(res.data.qrCode);
        setSecret(res.data.secret);
        setStep('qr');
      } catch (err) {
        toast.error('Session expired. Please log in again.');
        navigate('/login');
      }
    };
    init();
  }, [tempToken, navigate]);

  const copySecret = async () => {
    await navigator.clipboard.writeText(secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const onVerify = async (data) => {
    setLoading(true);
    try {
      const res = await api.post('/auth/confirm-mfa', { tempToken, totpCode: data.totpCode });
      const { accessToken, refreshToken, user } = res.data;
      setStep('done');
      setTimeout(() => {
        login(user, accessToken, refreshToken);
        toast.success('MFA enabled! Welcome.');
        navigate('/scanner');
      }, 1500);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Invalid code. Try again.');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-soft">
        <Loader2 className="w-8 h-8 text-brand-600 animate-spin" />
      </div>
    );
  }

  if (step === 'done') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-soft">
        <div className="text-center animate-slide-up">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900">MFA Enabled!</h2>
          <p className="text-gray-500 text-sm mt-1">Redirecting to dashboard…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-soft flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-brand-600 rounded-2xl shadow-lg mb-3">
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-xl font-bold text-gray-900">Set up Two-Factor Authentication</h1>
          <p className="text-sm text-gray-500 mt-1">Required for all accounts — scan once, protect always</p>
        </div>

        <div className="card p-6 animate-slide-up">
          {/* Steps indicator */}
          <div className="flex items-center gap-2 mb-6">
            {['Scan QR Code', 'Verify Code'].map((label, i) => (
              <div key={label} className="flex items-center gap-2 flex-1">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                  (step === 'qr' && i === 0) || (step === 'verify' && i === 1)
                    ? 'bg-brand-600 text-white'
                    : step === 'verify' && i === 0
                    ? 'bg-green-500 text-white'
                    : 'bg-surface-muted text-gray-400'
                }`}>
                  {step === 'verify' && i === 0 ? <Check className="w-3.5 h-3.5" /> : i + 1}
                </div>
                <span className={`text-xs font-medium ${
                  (step === 'qr' && i === 0) || (step === 'verify' && i === 1) ? 'text-gray-900' : 'text-gray-400'
                }`}>{label}</span>
                {i === 0 && <div className="flex-1 h-px bg-surface-border" />}
              </div>
            ))}
          </div>

          {step === 'qr' && (
            <div className="space-y-5">
              <div className="flex items-start gap-3 p-3.5 bg-blue-50 rounded-lg border border-blue-100">
                <Smartphone className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-blue-800">Install an authenticator app</p>
                  <p className="text-blue-700 mt-0.5">Google Authenticator or Authy, then scan the QR code below.</p>
                </div>
              </div>

              {qrCode && (
                <div className="flex justify-center p-4 bg-white rounded-xl border border-surface-border">
                  <img src={qrCode} alt="TOTP QR Code" className="w-52 h-52" />
                </div>
              )}

              <div>
                <p className="text-xs text-gray-500 mb-1.5">Or enter this key manually:</p>
                <div className="flex items-center gap-2 p-3 bg-surface-muted rounded-lg border border-surface-border">
                  <code className="flex-1 text-xs font-mono text-gray-700 break-all select-all">{secret}</code>
                  <button onClick={copySecret} className="p-1.5 rounded hover:bg-surface-border text-gray-500 hover:text-gray-700 flex-shrink-0">
                    {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              <button onClick={() => setStep('verify')} className="btn-primary w-full">
                I've scanned the QR code →
              </button>
            </div>
          )}

          {step === 'verify' && (
            <div className="space-y-5">
              <p className="text-sm text-gray-600">
                Enter the 6-digit code from your authenticator app to confirm setup.
              </p>

              <form onSubmit={handleSubmit(onVerify)} className="space-y-4">
                <div>
                  <label className="label">Verification code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    maxLength={6}
                    className="input text-center text-2xl tracking-[0.5em] font-mono"
                    placeholder="000000"
                    {...register('totpCode', {
                      required: 'Code is required',
                      pattern: { value: /^\d{6}$/, message: 'Must be exactly 6 digits' },
                    })}
                  />
                  {errors.totpCode && <p className="mt-1 text-xs text-brand-600">{errors.totpCode.message}</p>}
                </div>
                <button type="submit" disabled={loading} className="btn-primary w-full">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {loading ? 'Verifying…' : 'Activate MFA & Continue'}
                </button>
              </form>

              <button onClick={() => setStep('qr')} className="text-xs text-gray-400 hover:text-gray-600 w-full text-center">
                ← Back to QR code
              </button>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          <a
            href="https://aceddivision.com/devops"
            target="_blank"
            rel="noreferrer"
            className="hover:text-brand-600"
          >
            Developed by ACED DevOps
          </a>
        </p>
      </div>
    </div>
  );
}
