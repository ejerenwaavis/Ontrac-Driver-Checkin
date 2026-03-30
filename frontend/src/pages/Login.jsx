import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { Eye, EyeOff, ShieldCheck, Loader2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth.js';
import api from '../services/api.js';
import toast from 'react-hot-toast';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || '/scanner';

  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState('credentials'); // 'credentials' | 'totp'
  const [tempToken, setTempToken] = useState('');
  const [loadingForm, setLoadingForm] = useState(false);

  const { register, handleSubmit, formState: { errors }, getValues } = useForm();
  const { register: registerTotp, handleSubmit: handleTotpSubmit, formState: { errors: totpErrors } } = useForm();

  const onCredentials = async (data) => {
    setLoadingForm(true);
    try {
      const res = await api.post('/auth/login', data);
      const { requiresMFASetup, requiresMFA, tempToken: token } = res.data;

      if (requiresMFASetup) {
        navigate('/mfa-setup', { state: { tempToken: token, email: data.email } });
        return;
      }
      if (requiresMFA) {
        setTempToken(token);
        setStep('totp');
        return;
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Login failed. Check your credentials.';
      toast.error(msg);
    } finally {
      setLoadingForm(false);
    }
  };

  const onTotp = async (data) => {
    setLoadingForm(true);
    try {
      const res = await api.post('/auth/verify-mfa', { tempToken, totpCode: data.totpCode });
      const { accessToken, refreshToken, user } = res.data;
      login(user, accessToken, refreshToken);
      toast.success(`Welcome back, ${user.name}!`);
      navigate(from, { replace: true });
    } catch (err) {
      const msg = err.response?.data?.message || 'Invalid code. Try again.';
      toast.error(msg);
    } finally {
      setLoadingForm(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface-soft flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-brand-600 rounded-2xl shadow-lg mb-4 animate-bounce-once">
            <ShieldCheck className="w-9 h-9 text-white" strokeWidth={2} />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">OnTrac Check-In</h1>
          <p className="text-sm text-gray-500 mt-1">Driver Admission Management</p>
        </div>

        <div className="card p-6 animate-slide-up">
          {step === 'credentials' ? (
            <>
              <h2 className="text-lg font-semibold text-gray-900 mb-5">Sign in to your account</h2>
              <form onSubmit={handleSubmit(onCredentials)} className="space-y-4">
                <div>
                  <label className="label">Email address</label>
                  <input
                    type="email"
                    autoComplete="email"
                    autoFocus
                    className="input"
                    placeholder="you@example.com"
                    {...register('email', {
                      required: 'Email is required',
                      pattern: { value: /\S+@\S+\.\S+/, message: 'Invalid email' },
                    })}
                  />
                  {errors.email && <p className="mt-1 text-xs text-brand-600">{errors.email.message}</p>}
                </div>

                <div>
                  <label className="label">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      className="input pr-10"
                      placeholder="••••••••••••"
                      {...register('password', { required: 'Password is required' })}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {errors.password && <p className="mt-1 text-xs text-brand-600">{errors.password.message}</p>}
                </div>

                <button type="submit" disabled={loadingForm} className="btn-primary w-full mt-2">
                  {loadingForm ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {loadingForm ? 'Signing in…' : 'Sign in'}
                </button>
              </form>
            </>
          ) : (
            <>
              <button
                onClick={() => setStep('credentials')}
                className="text-xs text-gray-500 hover:text-gray-700 mb-4 flex items-center gap-1"
              >
                ← Back
              </button>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Two-factor authentication</h2>
                  <p className="text-xs text-gray-500">Enter the code from your authenticator app</p>
                </div>
              </div>

              <form onSubmit={handleTotpSubmit(onTotp)} className="space-y-4">
                <div>
                  <label className="label">6-digit code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    autoFocus
                    maxLength={6}
                    className="input text-center text-2xl tracking-[0.5em] font-mono"
                    placeholder="000000"
                    {...registerTotp('totpCode', {
                      required: 'Code is required',
                      pattern: { value: /^\d{6}$/, message: 'Must be exactly 6 digits' },
                    })}
                  />
                  {totpErrors.totpCode && <p className="mt-1 text-xs text-brand-600">{totpErrors.totpCode.message}</p>}
                </div>

                <button type="submit" disabled={loadingForm} className="btn-primary w-full">
                  {loadingForm ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {loadingForm ? 'Verifying…' : 'Verify & Sign in'}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          SOC 2 compliant · Secured with MFA
        </p>
        <p className="text-center text-xs text-gray-400 mt-2">
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
