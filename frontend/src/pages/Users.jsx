import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import {
  UserPlus, Users, Loader2, X, Eye, EyeOff,
  UserCheck, UserX, Pencil, ShieldOff
} from 'lucide-react';
import api from '../services/api.js';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

const roleBadge = {
  admin: 'badge-admin',
  supervisor: 'badge-supervisor',
  clerk: 'badge-clerk',
};

function UserModal({ editUser, onClose, onSaved }) {
  const [showPass, setShowPass] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm({
    defaultValues: editUser ? { name: editUser.name, role: editUser.role } : { role: 'clerk' },
  });

  const mutation = useMutation({
    mutationFn: (data) =>
      editUser
        ? api.patch(`/users/${editUser._id}`, data)
        : api.post('/users', data),
    onSuccess: () => {
      toast.success(editUser ? 'User updated' : 'User created — they will set up MFA on first login');
      onSaved();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to save user'),
  });

  const resetMfa = useMutation({
    mutationFn: () => api.patch(`/users/${editUser._id}/reset-mfa`),
    onSuccess: () => {
      toast.success('2FA reset. User must set it up again on next login');
      onSaved();
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to reset 2FA'),
  });

  const handleResetMfa = () => {
    if (!editUser) return;
    const confirmed = window.confirm(`Reset 2FA for ${editUser.name}? They will be signed out and must set up MFA again on next login.`);
    if (!confirmed) return;
    resetMfa.mutate();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-modal animate-slide-up">
        <div className="flex items-center justify-between px-5 py-4 border-b border-surface-border">
          <h2 className="text-base font-bold text-gray-900">{editUser ? 'Edit User' : 'Create User'}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-muted text-gray-500"><X className="w-4 h-4" /></button>
        </div>
        <form onSubmit={handleSubmit(mutation.mutate)} className="p-5 space-y-4">
          <div>
            <label className="label">Full name</label>
            <input type="text" className="input" placeholder="Jane Smith"
              {...register('name', { required: 'Name required', minLength: { value: 2, message: 'Min 2 chars' } })} />
            {errors.name && <p className="mt-1 text-xs text-brand-600">{errors.name.message}</p>}
          </div>
          {!editUser && (
            <>
              <div>
                <label className="label">Email</label>
                <input type="email" className="input" placeholder="user@example.com"
                  {...register('email', { required: 'Email required', pattern: { value: /\S+@\S+\.\S+/, message: 'Invalid email' } })} />
                {errors.email && <p className="mt-1 text-xs text-brand-600">{errors.email.message}</p>}
              </div>
              <div>
                <label className="label">Password <span className="text-gray-400 font-normal text-xs">(min 12 chars)</span></label>
                <div className="relative">
                  <input type={showPass ? 'text' : 'password'} className="input pr-10" placeholder="••••••••••••"
                    {...register('password', { required: 'Password required', minLength: { value: 12, message: 'Min 12 characters' } })} />
                  <button type="button" onClick={() => setShowPass((v) => !v)}
                    className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {errors.password && <p className="mt-1 text-xs text-brand-600">{errors.password.message}</p>}
              </div>
            </>
          )}
          <div>
            <label className="label">Role</label>
            <select className="input" {...register('role', { required: true })}>
              <option value="clerk">Clerk / Floorman</option>
              <option value="supervisor">Supervisor</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {editUser && (
            <div className="rounded-xl border border-surface-border bg-surface-soft p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-gray-700 uppercase tracking-wider">Two-Factor Authentication</p>
                  <p className="text-xs text-gray-500 mt-0.5">Use this when a user loses their authenticator app.</p>
                </div>
                <span className={editUser.mfaEnabled ? 'badge-active' : 'badge-inactive'}>
                  {editUser.mfaEnabled ? 'Enabled' : 'Pending'}
                </span>
              </div>
              <button
                type="button"
                onClick={handleResetMfa}
                disabled={resetMfa.isPending || !editUser.mfaEnabled}
                className="btn-danger mt-3 w-full"
              >
                {resetMfa.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldOff className="w-4 h-4" />}
                {resetMfa.isPending ? 'Resetting…' : 'Reset 2FA'}
              </button>
            </div>
          )}
          <div className="flex gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="btn-primary flex-1">
              {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              {editUser ? 'Save changes' : 'Create user'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then((r) => r.data),
  });

  const deactivate = useMutation({
    mutationFn: (id) => api.patch(`/users/${id}/deactivate`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['users'] }); toast.success('User deactivated'); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const activate = useMutation({
    mutationFn: (id) => api.patch(`/users/${id}/activate`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['users'] }); toast.success('User reactivated'); },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed'),
  });

  const users = data?.users || [];

  const handleModalClose = () => { setShowModal(false); setEditUser(null); };
  const handleSaved = () => { handleModalClose(); queryClient.invalidateQueries({ queryKey: ['users'] }); };

  return (
    <div className="px-4 py-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Users</h1>
          <p className="text-sm text-gray-500 mt-0.5">{users.length} user accounts</p>
        </div>
        <button onClick={() => { setEditUser(null); setShowModal(true); }} className="btn-primary">
          <UserPlus className="w-4 h-4" />
          Add User
        </button>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-7 h-7 text-brand-600 animate-spin" /></div>
        ) : users.length === 0 ? (
          <div className="text-center py-16">
            <Users className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400">No users yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-surface-border">
              <thead>
                <tr className="bg-surface-soft">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">User</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">MFA</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Last Login</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border bg-white">
                {users.map((u) => (
                  <tr key={u._id} className="hover:bg-surface-soft/50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-brand-100 flex items-center justify-center text-brand-700 text-xs font-bold flex-shrink-0">
                          {u.name?.[0]?.toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{u.name}</p>
                          <p className="text-xs text-gray-500">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={roleBadge[u.role] || 'badge-clerk'}>{u.role}</span>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className={u.mfaEnabled ? 'badge-active' : 'badge-inactive'}>
                        {u.mfaEnabled ? 'Enabled' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <p className="text-xs text-gray-500">{u.lastLogin ? format(new Date(u.lastLogin), 'MMM d, yyyy h:mm a') : 'Never'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={u.isActive ? 'badge-active' : 'badge-inactive'}>
                        {u.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => { setEditUser(u); setShowModal(true); }}
                          className="p-1.5 rounded hover:bg-surface-muted text-gray-400 hover:text-gray-700"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {u.isActive ? (
                          <button
                            onClick={() => deactivate.mutate(u._id)}
                            disabled={deactivate.isPending}
                            className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-brand-600"
                            title="Deactivate"
                          >
                            <UserX className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <button
                            onClick={() => activate.mutate(u._id)}
                            disabled={activate.isPending}
                            className="p-1.5 rounded hover:bg-green-50 text-gray-400 hover:text-green-600"
                            title="Reactivate"
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <UserModal editUser={editUser} onClose={handleModalClose} onSaved={handleSaved} />
      )}
    </div>
  );
}
