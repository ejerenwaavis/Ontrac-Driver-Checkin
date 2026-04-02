import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, ClipboardList, Loader2, ChevronLeft, ChevronRight, ShieldAlert, RefreshCw, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import api from '../services/api.js';

const methodBadge = {
  scan: { label: 'Scan', cls: 'badge-active' },
  manual: { label: 'Manual', cls: 'badge-clerk' },
  supervisor_override: { label: 'Override', cls: 'badge-admin' },
};

const formatDwell = (minutes) => {
  if (minutes == null || Number.isNaN(Number(minutes))) {
    return '—';
  }

  const totalMinutes = Number(minutes);
  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }

  const rounded = Math.round(totalMinutes);
  const hours = Math.floor(rounded / 60);
  const rem = rounded % 60;
  return rem > 0 ? `${hours}h ${rem}m` : `${hours}h`;
};

export default function Admissions() {
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['admissions', page, search, dateFilter, statusFilter],
    queryFn: () =>
      api.get('/admissions', {
        params: {
          page,
          limit: 50,
          driverNumber: search.toUpperCase() || undefined,
          date: dateFilter || undefined,
          status: statusFilter || undefined,
        },
      }).then((r) => r.data),
    keepPreviousData: true,
  });

  const admissions = data?.admissions || [];
  const pagination = data?.pagination;

  return (
    <div className="px-4 py-6 max-w-5xl mx-auto space-y-5">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Admission and Exit Log</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {pagination?.total != null ? `${pagination.total} records` : 'Full history'}
        </p>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search driver number…"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="input pl-9 uppercase font-mono"
          />
        </div>
        <input
          type="date"
          value={dateFilter}
          onChange={(e) => { setDateFilter(e.target.value); setPage(1); }}
          className="input w-auto"
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="input w-auto"
        >
          <option value="">All cycles</option>
          <option value="open">Open cycles</option>
          <option value="closed">Completed cycles</option>
        </select>
        {(search || dateFilter || statusFilter) && (
          <button
            onClick={() => { setSearch(''); setDateFilter(''); setStatusFilter(''); setPage(1); }}
            className="btn-secondary px-3"
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-7 h-7 text-brand-600 animate-spin" />
          </div>
        ) : admissions.length === 0 ? (
          <div className="text-center py-16">
            <ClipboardList className="w-12 h-12 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400">No admissions found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-surface-border">
              <thead>
                <tr className="bg-surface-soft">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Driver</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden sm:table-cell">Provider</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Check In</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">Check Out</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden lg:table-cell">Duration</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Entry</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Method</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider hidden md:table-cell">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border bg-white">
                {admissions.map((a) => {
                  const badge = methodBadge[a.method] || methodBadge.scan;
                  return (
                    <tr key={a._id} className="hover:bg-surface-soft/50 transition-colors text-sm">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-gray-900">{a.driverName}</p>
                        <code className="text-xs text-gray-500 font-mono">{a.driverNumber}</code>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <p className="text-gray-500 text-xs truncate max-w-[160px]">{a.regionalServiceProvider || '—'}</p>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <p className="text-gray-700">{format(new Date(a.admittedAt), 'h:mm a')}</p>
                        <p className="text-xs text-gray-400">{format(new Date(a.admittedAt), 'MMM d, yyyy')}</p>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap hidden md:table-cell">
                        {a.checkedOutAt ? (
                          <>
                            <p className="text-gray-700">{format(new Date(a.checkedOutAt), 'h:mm a')}</p>
                            <p className="text-xs text-gray-400">{format(new Date(a.checkedOutAt), 'MMM d, yyyy')}</p>
                          </>
                        ) : (
                          <span className="badge-clerk">Still inside</span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell text-gray-600 text-xs">
                        {formatDwell(a.dwellMinutes)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          {a.entrySequence === 1
                            ? <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                            : <RefreshCw className="w-3.5 h-3.5 text-amber-500" />}
                          <span className="text-xs text-gray-600">#{a.entrySequence}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={badge.cls}>{badge.label}</span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell">
                        <p className="text-xs text-gray-500">{a.admittedBy?.name || '—'}</p>
                        {a.checkedOutBy?.name && (
                          <p className="text-xs text-blue-600">Out: {a.checkedOutBy.name}</p>
                        )}
                        {a.method === 'supervisor_override' && a.supervisorId?.name && (
                          <p className="text-xs text-purple-600 flex items-center gap-0.5">
                            <ShieldAlert className="w-3 h-3" />{a.supervisorId.name}
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {pagination && pagination.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-surface-border bg-surface-soft">
            <p className="text-xs text-gray-500">
              Showing {(page - 1) * 50 + 1}–{Math.min(page * 50, pagination.total)} of {pagination.total}
            </p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="p-1.5 rounded hover:bg-surface-border disabled:opacity-40">
                <ChevronLeft className="w-4 h-4 text-gray-600" />
              </button>
              <span className="text-xs text-gray-600 px-2">{page} / {pagination.pages}</span>
              <button onClick={() => setPage((p) => Math.min(pagination.pages, p + 1))} disabled={page === pagination.pages} className="p-1.5 rounded hover:bg-surface-border disabled:opacity-40">
                <ChevronRight className="w-4 h-4 text-gray-600" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
