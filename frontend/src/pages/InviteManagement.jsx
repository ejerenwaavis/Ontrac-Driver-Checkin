import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link2, Plus, Copy, Trash2, Check, X, RefreshCw, Loader2 } from 'lucide-react';
import { format, isAfter } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../services/api.js';

function statusBadge(invite) {
  const expired = !isAfter(new Date(invite.expiresAt), new Date());
  if (!invite.active) return <span className="badge bg-gray-100 text-gray-600">Revoked</span>;
  if (expired) return <span className="badge bg-amber-100 text-amber-700">Expired</span>;
  return <span className="badge bg-green-100 text-green-700">Active</span>;
}

function typeBadge(type) {
  return type === 'reregister'
    ? <span className="badge bg-purple-100 text-purple-700">Re-register</span>
    : <span className="badge bg-blue-100 text-blue-700">Team</span>;
}

export default function InviteManagement() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [copiedId, setCopiedId] = useState(null);

  // Form state
  const [formType, setFormType] = useState('team');
  const [teamName, setTeamName] = useState('');
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [lockedDriverNumber, setLockedDriverNumber] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['invites'],
    queryFn: () => api.get('/invite').then((r) => r.data.invites),
  });

  const createMutation = useMutation({
    mutationFn: (body) => api.post('/invite', body).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invites'] });
      toast.success('Invite created');
      setShowForm(false);
      setTeamName('');
      setExpiresInDays(30);
      setLockedDriverNumber('');
      setFormType('team');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to create invite'),
  });

  const revokeMutation = useMutation({
    mutationFn: (id) => api.delete(`/invite/${id}`).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invites'] });
      toast.success('Invite revoked');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to revoke invite'),
  });

  const handleCreate = (e) => {
    e.preventDefault();
    if (!teamName.trim()) return toast.error('Team name is required');
    if (formType === 'reregister' && !lockedDriverNumber.trim()) return toast.error('Driver number required for re-register invite');
    createMutation.mutate({
      type: formType,
      teamName: teamName.trim(),
      expiresInDays: Number(expiresInDays),
      lockedDriverNumber: formType === 'reregister' ? lockedDriverNumber.trim().toUpperCase() : undefined,
    });
  };

  const handleCopy = (invite) => {
    const link = `${window.location.origin}/join/${invite.token}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedId(invite._id);
      toast.success('Link copied to clipboard');
      setTimeout(() => setCopiedId(null), 2000);
    });
  };

  const invites = data || [];

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Photo Invites</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage registration links for driver photos</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="btn-primary flex items-center gap-2">
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? 'Cancel' : 'New Invite'}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <form onSubmit={handleCreate} className="card p-5 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">Create Invite Link</h2>

          {/* Type toggle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Invite Type</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setFormType('team')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  formType === 'team' ? 'bg-brand-600 text-white border-brand-600' : 'bg-white text-gray-600 border-surface-border hover:bg-surface-muted'
                }`}
              >
                Team Link
              </button>
              <button
                type="button"
                onClick={() => setFormType('reregister')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  formType === 'reregister' ? 'bg-purple-600 text-white border-purple-600' : 'bg-white text-gray-600 border-surface-border hover:bg-surface-muted'
                }`}
              >
                Re-register (single-use)
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              {formType === 'team'
                ? 'Any driver on the team can use this link for their first-time photo registration.'
                : 'Locked to one specific driver. Expires after one use. Use this to allow a photo update.'}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Team / Label Name</label>
            <input
              type="text"
              value={teamName}
              onChange={(e) => setTeamName(e.target.value)}
              placeholder="e.g. North Region Team A"
              className="input-field w-full"
              required
            />
          </div>

          {formType === 'reregister' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Driver Number</label>
              <input
                type="text"
                value={lockedDriverNumber}
                onChange={(e) => setLockedDriverNumber(e.target.value.toUpperCase())}
                placeholder="e.g. D12345"
                className="input-field w-full font-mono"
                autoCapitalize="characters"
                autoCorrect="off"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Expires In (days)</label>
            <input
              type="number"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value)}
              min={1}
              max={365}
              className="input-field w-32"
            />
          </div>

          <button type="submit" disabled={createMutation.isPending} className="btn-primary flex items-center gap-2">
            {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Create Invite
          </button>
        </form>
      )}

      {/* Table */}
      {isLoading ? (
        <div className="text-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-brand-600 mx-auto mb-2" />
          <p className="text-sm text-gray-400">Loading invites…</p>
        </div>
      ) : invites.length === 0 ? (
        <div className="text-center py-12">
          <Link2 className="w-10 h-10 text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-400">No invite links yet. Create one above.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border bg-surface-soft">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Team / Label</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden sm:table-cell">Created By</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide hidden md:table-cell">Expires</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Uses</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {invites.map((inv) => (
                  <tr key={inv._id} className="hover:bg-surface-soft transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {inv.teamName}
                      {inv.lockedDriverNumber && (
                        <span className="block text-xs font-mono text-gray-500">{inv.lockedDriverNumber}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">{typeBadge(inv.type)}</td>
                    <td className="px-4 py-3 text-gray-600 hidden sm:table-cell">{inv.createdByName}</td>
                    <td className="px-4 py-3 text-gray-600 hidden md:table-cell">
                      {format(new Date(inv.expiresAt), 'MMM d, yyyy')}
                    </td>
                    <td className="px-4 py-3 text-center text-gray-700 font-medium">{inv.timesUsed}</td>
                    <td className="px-4 py-3">{statusBadge(inv)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 justify-end">
                        <button
                          onClick={() => handleCopy(inv)}
                          title="Copy link"
                          className="p-1.5 rounded-lg text-gray-400 hover:text-brand-600 hover:bg-brand-50 transition-colors"
                        >
                          {copiedId === inv._id ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                        </button>
                        {inv.active && (
                          <button
                            onClick={() => revokeMutation.mutate(inv._id)}
                            disabled={revokeMutation.isPending}
                            title="Revoke"
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
