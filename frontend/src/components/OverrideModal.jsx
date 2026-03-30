import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ShieldAlert, X, Eye, EyeOff, Loader2, AlertTriangle } from 'lucide-react';
import api from '../services/api.js';
import toast from 'react-hot-toast';

/**
 * OverrideModal — supervisor inline re-authentication for admitting
 * drivers who are INACTIVE or NOT_FOUND.
 *
 * Props:
 *   driverNumber: string
 *   driverName: string (optional)
 *   reason: 'INACTIVE' | 'NOT_FOUND'
 *   onSuccess: (result) => void
 *   onClose: () => void
 */
export default function OverrideModal({ driverNumber, driverName, reason, onSuccess, onClose }) {
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  const { register, handleSubmit, formState: { errors }, reset } = useForm();

  const reasonLabel = reason === 'INACTIVE'
    ? 'Driver account is marked INACTIVE'
    : 'Driver number not found in system';

  const onSubmit = async (data) => {
    setLoading(true);
    try {
      const res = await api.post('/admissions/override', {
        driverNumber,
        supervisorEmail: data.email,
        supervisorPassword: data.password,
        totpCode: data.totpCode,
        overrideReason: data.overrideReason,
      });
      toast.success('Override approved');
      reset();
      onSuccess(res.data);
    } catch (err) {
      const msg = err.response?.data?.message || 'Override failed. Check credentials.';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-modal animate-slide-up overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-surface-border bg-amber-50">
          <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <ShieldAlert className="w-5 h-5 text-amber-700" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-gray-900">Supervisor Override Required</h2>
            <p className="text-xs text-gray-500 truncate">{driverNumber}{driverName ? ` — ${driverName}` : ''}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-amber-100 text-gray-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Warning banner */}
        <div className="flex items-start gap-3 mx-5 mt-4 p-3 bg-brand-50 rounded-lg border border-red-100">
          <AlertTriangle className="w-4 h-4 text-brand-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-brand-800 font-medium">{reasonLabel}. A supervisor must authorize this entry.</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
          {/* Override reason */}
          <div>
            <label className="label">Override reason <span className="text-brand-600">*</span></label>
            <textarea
              rows={2}
              placeholder="Brief reason for override (e.g., temporary system delay)"
              className="input resize-none"
              {...register('overrideReason', {
                required: 'Reason is required',
                minLength: { value: 3, message: 'Reason too short' },
                maxLength: { value: 500, message: 'Max 500 characters' },
              })}
            />
            {errors.overrideReason && <p className="mt-1 text-xs text-brand-600">{errors.overrideReason.message}</p>}
          </div>

          <div className="border-t border-surface-border pt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Supervisor Credentials</p>

            <div className="space-y-3">
              <div>
                <label className="label">Supervisor email</label>
                <input
                  type="email"
                  autoComplete="off"
                  className="input"
                  placeholder="supervisor@example.com"
                  {...register('email', { required: 'Email required', pattern: { value: /\S+@\S+\.\S+/, message: 'Invalid email' } })}
                />
                {errors.email && <p className="mt-1 text-xs text-brand-600">{errors.email.message}</p>}
              </div>

              <div>
                <label className="label">Password</label>
                <div className="relative">
                  <input
                    type={showPass ? 'text' : 'password'}
                    autoComplete="off"
                    className="input pr-10"
                    placeholder="••••••••••••"
                    {...register('password', { required: 'Password required' })}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass((v) => !v)}
                    className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600"
                  >
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && <p className="mt-1 text-xs text-brand-600">{errors.password.message}</p>}
              </div>

              <div>
                <label className="label">Authenticator code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  className="input text-center font-mono tracking-[0.4em] text-lg"
                  placeholder="000000"
                  {...register('totpCode', {
                    required: 'Code required',
                    pattern: { value: /^\d{6}$/, message: '6 digits required' },
                  })}
                />
                {errors.totpCode && <p className="mt-1 text-xs text-brand-600">{errors.totpCode.message}</p>}
              </div>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={loading} className="btn-primary flex-1">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
              {loading ? 'Authorizing…' : 'Authorize Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
