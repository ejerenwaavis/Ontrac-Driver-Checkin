import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Loader2, KeyRound, ShieldCheck, User, AlertTriangle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth.js';
import api from '../services/api.js';
import toast from 'react-hot-toast';

const roleBadge = { admin: 'badge-admin', supervisor: 'badge-supervisor', clerk: 'badge-clerk' };

export default function Settings() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm();

  const changePassword = useMutation({
    mutationFn: (data) => api.post('/auth/change-password', data),
    onSuccess: () => {
      toast.success('Password changed successfully');
      reset();
      if (user?.forcePasswordChange) {
        const updated = { ...user, forcePasswordChange: false };
        setUser(updated);
        navigate('/scanner', { replace: true });
      }
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to change password'),
  });

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto space-y-6">
      {user?.forcePasswordChange && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Password change required</p>
            <p className="text-xs text-amber-700 mt-0.5">Your administrator has reset your password. Please set a new password below to continue.</p>
          </div>
        </div>
      )}
      <div>
        <h1 className="text-xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-0.5">Account preferences and security</p>
      </div>

      {/* Profile Card */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <User className="w-4 h-4 text-gray-400" />
          Profile
        </h2>
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-brand-100 flex items-center justify-center text-brand-700 text-xl font-bold flex-shrink-0">
            {user?.name?.[0]?.toUpperCase()}
          </div>
          <div>
            <p className="text-base font-bold text-gray-900">{user?.name}</p>
            <p className="text-sm text-gray-500">{user?.email}</p>
            <span className={`${roleBadge[user?.role] || 'badge-clerk'} mt-1.5`}>{user?.role}</span>
          </div>
        </div>
      </div>

      {/* MFA Status */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-gray-400" />
          Two-Factor Authentication
        </h2>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-700 font-medium">Authenticator App</p>
            <p className="text-xs text-gray-500 mt-0.5">Google Authenticator or Authy</p>
          </div>
          <span className={user?.mfaEnabled ? 'badge-active' : 'badge-inactive'}>
            {user?.mfaEnabled ? 'Enabled' : 'Not set up'}
          </span>
        </div>
        {user?.mfaEnabled && (
          <p className="text-xs text-gray-400 mt-3 pt-3 border-t border-surface-border">
            MFA is active. If you need to reset your authenticator, contact your Administrator.
          </p>
        )}
      </div>

      {/* Change Password */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4 flex items-center gap-2">
          <KeyRound className="w-4 h-4 text-gray-400" />
          Change Password
        </h2>
        <form onSubmit={handleSubmit(changePassword.mutate)} className="space-y-4">
          <div>
            <label className="label">Current password</label>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                className="input pr-10"
                autoComplete="current-password"
                placeholder="••••••••••••"
                {...register('currentPassword', { required: 'Required' })}
              />
              <button type="button" onClick={() => setShowCurrent((v) => !v)}
                className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600">
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.currentPassword && <p className="mt-1 text-xs text-brand-600">{errors.currentPassword.message}</p>}
          </div>

          <div>
            <label className="label">New password <span className="text-gray-400 font-normal text-xs">(min 12 chars)</span></label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                className="input pr-10"
                autoComplete="new-password"
                placeholder="••••••••••••"
                {...register('newPassword', {
                  required: 'Required',
                  minLength: { value: 12, message: 'Min 12 characters' },
                })}
              />
              <button type="button" onClick={() => setShowNew((v) => !v)}
                className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600">
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.newPassword && <p className="mt-1 text-xs text-brand-600">{errors.newPassword.message}</p>}
          </div>

          <button type="submit" disabled={changePassword.isPending} className="btn-primary">
            {changePassword.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            {changePassword.isPending ? 'Saving…' : 'Change password'}
          </button>
        </form>
      </div>
    </div>
  );
}
