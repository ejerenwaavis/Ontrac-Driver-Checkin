import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Upload, ToggleLeft, ToggleRight, Filter, Loader2, FileSpreadsheet, AlertCircle, CheckCircle, ChevronLeft, ChevronRight, RefreshCcw, AlertTriangle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth.js';
import api from '../services/api.js';
import toast from 'react-hot-toast';
import { format } from 'date-fns';

export default function Drivers() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileRef = useRef(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [strictReplace, setStrictReplace] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null); // { dropCount, dropPercent, previousTotal, newTotal, pendingFile }

  const { data, isLoading } = useQuery({
    queryKey: ['drivers', page, search, statusFilter],
    queryFn: () =>
      api.get('/drivers', { params: { page, limit: 50, search: search || undefined, status: statusFilter || undefined } })
        .then((r) => r.data),
    keepPreviousData: true,
  });

  const toggleStatus = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/drivers/${id}/status`, { status }),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      toast.success(`Driver ${vars.status === 'active' ? 'activated' : 'deactivated'}`);
    },
    onError: () => toast.error('Failed to update driver status'),
  });

  const handleUpload = async (e, pendingFile = null, confirmedDrop = false) => {
    const file = pendingFile || e?.target?.files?.[0];
    if (!file) return;
    if (fileRef.current) fileRef.current.value = '';

    setUploading(true);
    setUploadResult(null);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('strictReplace', String(strictReplace));
    if (confirmedDrop) fd.append('confirmDrop', 'true');

    try {
      const res = await api.post('/drivers/upload', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (res.data.needsConfirmation) {
        setConfirmDialog({ ...res.data, pendingFile: file });
        setUploading(false);
        return;
      }

      setUploadResult(res.data);
      queryClient.invalidateQueries({ queryKey: ['drivers'] });
      const inactivated = res.data.autoInactivated || 0;
      toast.success(`Upload complete: ${res.data.inserted} added, ${res.data.updated} updated${inactivated ? `, ${inactivated} auto-inactivated` : ''}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleConfirmDrop = () => {
    const file = confirmDialog.pendingFile;
    setConfirmDialog(null);
    handleUpload(null, file, true);
  };

  const drivers = data?.drivers || [];
  const pagination = data?.pagination;

  return (
    <div className="px-4 py-6 max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Drivers</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {pagination?.total != null ? `${pagination.total} drivers total` : ''}
          </p>
        </div>
        {user?.role === 'admin' && (
          <div className="flex items-center gap-2 flex-wrap">
            {/* Mode toggle */}
            <div className="flex items-center rounded-lg border border-surface-border bg-surface-muted p-0.5 text-xs">
              <button
                onClick={() => setStrictReplace(false)}
                className={`px-3 py-1.5 rounded-md font-medium transition-all ${
                  !strictReplace ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                Additive
              </button>
              <button
                onClick={() => setStrictReplace(true)}
                className={`px-3 py-1.5 rounded-md font-medium transition-all flex items-center gap-1 ${
                  strictReplace ? 'bg-white text-brand-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <RefreshCcw className="w-3 h-3" />
                Daily Roster
              </button>
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="btn-primary"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {uploading ? 'Uploading…' : 'Upload Excel'}
            </button>
          </div>
        )}
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleUpload} />
      </div>

      {/* Drop confirmation dialog */}
      {confirmDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-fade-in">
          <div className="bg-white rounded-2xl shadow-modal p-6 max-w-sm w-full mx-4 animate-slide-up">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">Large roster change detected</h3>
                <p className="text-xs text-gray-500 mt-1">
                  This upload would auto-inactivate approximately{' '}
                  <strong>{confirmDialog.dropCount}</strong> drivers
                  ({confirmDialog.dropPercent}% drop from {confirmDialog.previousTotal} to {confirmDialog.newTotal} active).
                </p>
              </div>
            </div>
            <p className="text-xs text-gray-500 mb-5">
              In <strong>Daily Roster</strong> mode, any driver currently active but absent from this file will be marked inactive.
              Confirm only if this reflects your intended HR roster update.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDialog(null)} className="btn-secondary flex-1 text-sm">
                Cancel
              </button>
              <button onClick={handleConfirmDrop} className="btn-danger flex-1 text-sm">
                Confirm Upload
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload result banner */}
      {uploadResult && (
        <div className="card p-4 border-l-4 border-l-green-500 animate-slide-up">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-900">Upload complete</p>
              <p className="text-xs text-gray-600 mt-1">
                {uploadResult.inserted} inserted · {uploadResult.updated} updated
                {uploadResult.autoInactivated > 0 && (
                  <span className="text-amber-700"> · {uploadResult.autoInactivated} auto-inactivated</span>
                )}
                {' · '}{uploadResult.skipped} skipped of {uploadResult.total} rows
              </p>
              {uploadResult.mode === 'strict_replace' && (
                <p className="text-xs text-brand-600 mt-1 font-medium">Daily Roster mode — missing drivers were marked inactive</p>
              )}
              {uploadResult.errors?.length > 0 && (
                <details className="mt-2">
                  <summary className="text-xs text-brand-600 cursor-pointer">{uploadResult.errors.length} row errors — click to expand</summary>
                  <ul className="mt-2 space-y-1">
                    {uploadResult.errors.map((e, i) => (
                      <li key={i} className="text-xs text-gray-500">Row {e.row}: {e.error}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
            <button onClick={() => setUploadResult(null)} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search driver number or name…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="input pl-9"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="input pl-9 pr-8 appearance-none cursor-pointer"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-7 h-7 text-brand-600 animate-spin" />
          </div>
        ) : drivers.length === 0 ? (
          <div className="text-center py-16">
            <FileSpreadsheet className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400">No drivers found</p>
            {user?.role === 'admin' && (
              <p className="text-xs text-gray-300 mt-1">Upload an Excel file to get started</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-surface-border">
              <thead>
                <tr className="bg-surface-soft">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Driver #</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Provider (RSP)</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                  {user?.role === 'admin' && (
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border bg-white">
                {drivers.map((driver) => (
                  <tr key={driver._id} className="hover:bg-surface-soft/50 transition-colors">
                    <td className="px-4 py-3">
                      <code className="text-xs font-mono font-semibold text-gray-700">{driver.driverNumber}</code>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-gray-900">{driver.name}</p>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <p className="text-sm text-gray-500 truncate max-w-[200px]">{driver.regionalServiceProvider || '—'}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className={driver.status === 'active' ? 'badge-active' : 'badge-inactive'}>
                        {driver.status}
                      </span>
                    </td>
                    {user?.role === 'admin' && (
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => toggleStatus.mutate({ id: driver._id, status: driver.status === 'active' ? 'inactive' : 'active' })}
                          disabled={toggleStatus.isPending}
                          className="inline-flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 px-2 py-1 rounded hover:bg-surface-muted transition-colors"
                        >
                          {driver.status === 'active'
                            ? <><ToggleRight className="w-4 h-4 text-green-600" /> Deactivate</>
                            : <><ToggleLeft className="w-4 h-4 text-gray-400" /> Activate</>}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-surface-border bg-surface-soft">
            <p className="text-xs text-gray-500">
              Showing {(page - 1) * 50 + 1}–{Math.min(page * 50, pagination.total)} of {pagination.total}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded hover:bg-surface-border disabled:opacity-40"
              >
                <ChevronLeft className="w-4 h-4 text-gray-600" />
              </button>
              <span className="text-xs text-gray-600 px-2">{page} / {pagination.pages}</span>
              <button
                onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))}
                disabled={page === pagination.pages}
                className="p-1.5 rounded hover:bg-surface-border disabled:opacity-40"
              >
                <ChevronRight className="w-4 h-4 text-gray-600" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
