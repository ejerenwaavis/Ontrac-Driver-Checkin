import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Users, CheckCircle, RefreshCw, ShieldAlert, TrendingUp } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import api from '../services/api.js';

const StatCard = ({ icon: Icon, label, value, color = 'brand' }) => {
  const colors = {
    brand:  { bg: 'bg-brand-50',  icon: 'text-brand-600',  val: 'text-brand-700' },
    green:  { bg: 'bg-green-50',  icon: 'text-green-600',  val: 'text-green-700' },
    amber:  { bg: 'bg-amber-50',  icon: 'text-amber-600',  val: 'text-amber-700' },
    purple: { bg: 'bg-purple-50', icon: 'text-purple-600', val: 'text-purple-700' },
  };
  const c = colors[color] || colors.brand;
  return (
    <div className="card p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl ${c.bg} flex items-center justify-center flex-shrink-0`}>
        <Icon className={`w-6 h-6 ${c.icon}`} />
      </div>
      <div>
        <p className="text-2xl font-extrabold text-gray-900">{value ?? '—'}</p>
        <p className="text-xs text-gray-500 font-medium mt-0.5">{label}</p>
      </div>
    </div>
  );
};

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload?.length) {
    return (
      <div className="bg-white border border-surface-border rounded-lg px-3 py-2 shadow-card text-xs">
        <p className="font-semibold text-gray-700">{label}</p>
        <p className="text-brand-600 font-bold mt-0.5">{payload[0].value} admissions</p>
      </div>
    );
  }
  return null;
};

export default function Dashboard() {
  const { data, isLoading } = useQuery({
    queryKey: ['admissionStats'],
    queryFn: () => api.get('/admissions/stats').then((r) => r.data.stats),
    refetchInterval: 30_000,
  });

  const stats = data?.today;
  const hourly = data?.hourly || [];
  const recent = data?.recent || [];

  const peak = Math.max(...hourly.map((h) => h.count), 1);

  return (
    <div className="px-4 py-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-0.5">Today's admission overview · {format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Users}      label="Total Admissions Today" value={stats?.total}      color="green"  />
        <StatCard icon={RefreshCw}  label="Re-Entries Today"       value={stats?.reEntries}  color="amber"  />
        <StatCard icon={ShieldAlert} label="Supervisor Overrides"  value={stats?.overrides}  color="purple" />
        <StatCard icon={TrendingUp} label="First Time Today"       value={stats ? stats.total - stats.reEntries : null} color="brand" />
      </div>

      {/* Hourly chart */}
      <div className="card p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Admissions by Hour</h2>
        {isLoading ? (
          <div className="h-48 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-brand-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={hourly} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={3} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                {hourly.map((entry) => (
                  <Cell
                    key={entry.hour}
                    fill={entry.count === peak ? '#CC0000' : '#fca5a5'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Recent admissions */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-surface-border">
          <h2 className="text-sm font-semibold text-gray-700">Recent Admissions</h2>
        </div>
        <div className="divide-y divide-surface-border">
          {recent.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-8">No admissions recorded yet today</p>
          )}
          {recent.map((a) => (
            <div key={a._id} className="flex items-center gap-3 px-5 py-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                a.method === 'supervisor_override' ? 'bg-purple-100 text-purple-700'
                  : a.entrySequence > 1 ? 'bg-amber-100 text-amber-700'
                  : 'bg-green-100 text-green-700'
              }`}>
                {a.entrySequence > 1 ? 'R' : a.method === 'supervisor_override' ? 'O' : '✓'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">{a.driverName}</p>
                <p className="text-xs text-gray-500 font-mono">{a.driverNumber}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">{format(new Date(a.admittedAt), 'h:mm a')}</p>
                {a.regionalServiceProvider && (
                  <p className="text-xs text-gray-400 truncate max-w-[120px]">{a.regionalServiceProvider}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
