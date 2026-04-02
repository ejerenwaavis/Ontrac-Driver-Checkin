import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  BarChart,
  Bar,
} from 'recharts';
import {
  BarChart3,
  Clock3,
  LogIn,
  LogOut,
  RefreshCw,
  ShieldAlert,
  Loader2,
  Timer,
} from 'lucide-react';
import { format, parseISO, subDays } from 'date-fns';
import api from '../services/api.js';

const toDateInput = (date) => format(date, 'yyyy-MM-dd');

const NumberCard = ({ icon: Icon, label, value, tone = 'brand' }) => {
  const toneMap = {
    brand: 'bg-brand-50 text-brand-700',
    green: 'bg-green-50 text-green-700',
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
    purple: 'bg-purple-50 text-purple-700',
    slate: 'bg-slate-50 text-slate-700',
  };

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
          <p className="text-2xl font-extrabold text-gray-900 mt-1">{value}</p>
        </div>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${toneMap[tone] || toneMap.brand}`}>
          <Icon className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
};

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="bg-white border border-surface-border rounded-lg px-3 py-2 shadow-card text-xs">
      <p className="font-semibold text-gray-800">{label}</p>
      {payload.map((item) => (
        <p key={item.name} className="mt-0.5" style={{ color: item.color }}>
          {item.name}: {item.value}
        </p>
      ))}
    </div>
  );
};

const formatDwell = (minutes) => {
  if (minutes == null || Number.isNaN(Number(minutes))) {
    return '—';
  }

  const total = Number(minutes);
  if (total < 60) {
    return `${total} min`;
  }

  const rounded = Math.round(total);
  const hours = Math.floor(rounded / 60);
  const rem = rounded % 60;
  return rem > 0 ? `${hours}h ${rem}m` : `${hours}h`;
};

export default function Analytics() {
  const [startDate, setStartDate] = useState(toDateInput(subDays(new Date(), 13)));
  const [endDate, setEndDate] = useState(toDateInput(new Date()));

  const { data, isLoading, isFetching, isError, error } = useQuery({
    queryKey: ['admissionAnalytics', startDate, endDate],
    queryFn: () =>
      api
        .get('/admissions/analytics', {
          params: { startDate, endDate },
        })
        .then((r) => r.data.analytics),
    staleTime: 60_000,
  });

  const summary = data?.summary;

  const trendData = useMemo(
    () =>
      (data?.trends || []).map((row) => ({
        ...row,
        label: format(parseISO(row.date), 'MMM d'),
      })),
    [data]
  );

  const hourlyData = useMemo(() => {
    const checkoutMap = new Map((data?.hourly?.checkOuts || []).map((h) => [h.hour, h.count]));
    return (data?.hourly?.checkIns || []).map((h) => ({
      label: h.label,
      hour: h.hour,
      checkIns: h.count,
      checkOuts: checkoutMap.get(h.hour) || 0,
    }));
  }, [data]);

  const providerChartData = useMemo(
    () =>
      (data?.providerBreakdown || []).slice(0, 8).map((p) => ({
        provider: p.provider.length > 18 ? `${p.provider.slice(0, 18)}...` : p.provider,
        checkIns: p.checkIns,
      })),
    [data]
  );

  const setQuickRange = (days) => {
    setEndDate(toDateInput(new Date()));
    setStartDate(toDateInput(subDays(new Date(), days - 1)));
  };

  return (
    <div className="px-4 py-6 max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Operations Analytics</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Throughput, cycle completion, dwell time, and provider performance
          </p>
        </div>
        {isFetching && (
          <div className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            Refreshing
          </div>
        )}
      </div>

      <div className="card p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="text-xs text-gray-500 font-medium">Start date</label>
          <input
            type="date"
            className="input mt-1"
            value={startDate}
            max={endDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 font-medium">End date</label>
          <input
            type="date"
            className="input mt-1"
            value={endDate}
            min={startDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-secondary px-3" onClick={() => setQuickRange(7)}>7D</button>
          <button type="button" className="btn-secondary px-3" onClick={() => setQuickRange(30)}>30D</button>
          <button type="button" className="btn-secondary px-3" onClick={() => setQuickRange(90)}>90D</button>
        </div>
      </div>

      {isLoading ? (
        <div className="card p-10 flex items-center justify-center">
          <Loader2 className="w-7 h-7 text-brand-600 animate-spin" />
        </div>
      ) : isError ? (
        <div className="card p-6 border border-red-200 bg-red-50">
          <p className="text-sm font-semibold text-brand-700">Unable to load analytics</p>
          <p className="text-xs text-brand-600 mt-1">{error?.response?.data?.message || 'Please try again.'}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <NumberCard icon={LogIn} label="Check-Ins" value={summary?.checkIns ?? 0} tone="green" />
            <NumberCard icon={LogOut} label="Completed Cycles" value={summary?.completedCycles ?? 0} tone="blue" />
            <NumberCard
              icon={RefreshCw}
              label="Completion Rate"
              value={`${summary?.completionRate ?? 0}%`}
              tone="brand"
            />
            <NumberCard icon={Clock3} label="Open Cycles" value={summary?.openCycles ?? 0} tone="amber" />
            <NumberCard icon={Timer} label="Avg Dwell Time" value={formatDwell(summary?.avgDwellMinutes)} tone="slate" />
            <NumberCard icon={ShieldAlert} label="Overrides" value={summary?.overrides ?? 0} tone="purple" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">Daily Throughput Trend</h2>
              <ResponsiveContainer width="100%" height={250}>
                <LineChart data={trendData} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eceff4" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend />
                  <Line type="monotone" dataKey="checkIns" name="Check-Ins" stroke="#16a34a" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="checkOuts" name="Check-Outs" stroke="#2563eb" strokeWidth={2.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="card p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">Hourly Flow Pattern</h2>
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={hourlyData} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eceff4" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={2} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend />
                  <Bar dataKey="checkIns" name="Check-Ins" fill="#4ade80" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="checkOuts" name="Check-Outs" fill="#60a5fa" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <div className="card p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">Top Providers by Volume</h2>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={providerChartData} layout="vertical" margin={{ top: 0, right: 8, left: 40, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#eceff4" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="provider" tick={{ fontSize: 11 }} width={130} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="checkIns" name="Check-Ins" fill="#f97316" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card overflow-hidden">
              <div className="px-5 py-4 border-b border-surface-border">
                <h2 className="text-sm font-semibold text-gray-700">Provider Efficiency Breakdown</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-surface-border">
                  <thead className="bg-surface-soft">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Provider</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Volume</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Completion</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Avg Dwell</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-border bg-white text-sm">
                    {(data?.providerBreakdown || []).map((row) => (
                      <tr key={row.provider} className="hover:bg-surface-soft/50">
                        <td className="px-4 py-3 text-gray-800 font-medium">{row.provider}</td>
                        <td className="px-4 py-3 text-gray-700">{row.checkIns}</td>
                        <td className="px-4 py-3 text-gray-700">{row.completionRate}%</td>
                        <td className="px-4 py-3 text-gray-700">{formatDwell(row.avgDwellMinutes)}</td>
                      </tr>
                    ))}
                    {(data?.providerBreakdown || []).length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">
                          No provider data in the selected range
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="card p-4 text-xs text-gray-500 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-gray-400" />
            Use this page to spot exit bottlenecks (high open cycles), provider imbalances, and dwell-time spikes by date or shift hour.
          </div>
        </>
      )}
    </div>
  );
}
