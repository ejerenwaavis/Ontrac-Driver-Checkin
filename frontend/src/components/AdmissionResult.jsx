import { useEffect } from 'react';
import { CheckCircle, RefreshCw, AlertTriangle, XCircle, ShieldAlert, Clock } from 'lucide-react';
import { format } from 'date-fns';

const CONFIG = {
  ADMITTED: {
    bg: 'bg-green-50',
    border: 'border-green-300',
    headerBg: 'bg-green-500',
    icon: CheckCircle,
    iconColor: 'text-white',
    title: 'ADMITTED',
    titleColor: 'text-white',
  },
  RE_ENTRY: {
    bg: 'bg-amber-50',
    border: 'border-amber-300',
    headerBg: 'bg-amber-500',
    icon: RefreshCw,
    iconColor: 'text-white',
    title: 'RE-ENTRY',
    titleColor: 'text-white',
  },
  INACTIVE: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    headerBg: 'bg-brand-600',
    icon: AlertTriangle,
    iconColor: 'text-white',
    title: 'INACTIVE',
    titleColor: 'text-white',
  },
  NOT_FOUND: {
    bg: 'bg-gray-50',
    border: 'border-gray-300',
    headerBg: 'bg-gray-700',
    icon: XCircle,
    iconColor: 'text-white',
    title: 'NOT FOUND',
    titleColor: 'text-white',
  },
  OVERRIDE_ADMITTED: {
    bg: 'bg-purple-50',
    border: 'border-purple-300',
    headerBg: 'bg-purple-600',
    icon: ShieldAlert,
    iconColor: 'text-white',
    title: 'OVERRIDE ADMITTED',
    titleColor: 'text-white',
  },
};

/**
 * AdmissionResult — animated status card shown after a scan.
 *
 * Props:
 *   result: object (API response from /scan or /override)
 *   onDismiss: () => void
 *   autoResetMs: number (default 5000)
 */
export default function AdmissionResult({ result, onDismiss, autoResetMs = 5000 }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, autoResetMs);
    return () => clearTimeout(timer);
  }, [result, onDismiss, autoResetMs]);

  if (!result) return null;

  const cfg = CONFIG[result.result] || CONFIG.NOT_FOUND;
  const Icon = cfg.icon;

  return (
    <div className={`rounded-2xl border-2 ${cfg.border} ${cfg.bg} overflow-hidden shadow-card-hover animate-bounce-once`}>
      {/* Header band */}
      <div className={`${cfg.headerBg} px-5 py-4 flex items-center gap-3`}>
        <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
          <Icon className={`w-7 h-7 ${cfg.iconColor}`} strokeWidth={2.5} />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-lg font-extrabold tracking-wide ${cfg.titleColor}`}>{cfg.title}</p>
          {result.entrySequence > 1 && (
            <p className="text-white/80 text-xs font-medium">Entry #{result.entrySequence} today</p>
          )}
        </div>
        {/* Progress bar — auto-dismiss countdown */}
        <div className="w-10 h-10 relative flex-shrink-0">
          <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
            <circle
              cx="18" cy="18" r="15.9" fill="none"
              stroke="rgba(255,255,255,0.9)" strokeWidth="3"
              strokeDasharray="100"
              strokeDashoffset="0"
              style={{
                animation: `stroke-countdown ${autoResetMs}ms linear forwards`,
              }}
            />
          </svg>
          <Clock className="absolute inset-0 m-auto w-4 h-4 text-white/80" />
        </div>
      </div>

      {/* Details */}
      <div className="px-5 py-4 space-y-2">
        {result.driverName && result.driverName !== 'Unknown' && (
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-medium text-gray-500 w-20 flex-shrink-0">Driver</span>
            <span className="text-base font-bold text-gray-900">{result.driverName}</span>
          </div>
        )}
        <div className="flex items-baseline gap-2">
          <span className="text-xs font-medium text-gray-500 w-20 flex-shrink-0">Number</span>
          <span className="text-sm font-mono font-semibold text-gray-700">{result.driverNumber}</span>
        </div>
        {result.regionalServiceProvider && (
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-medium text-gray-500 w-20 flex-shrink-0">Provider</span>
            <span className="text-sm text-gray-700">{result.regionalServiceProvider}</span>
          </div>
        )}
        {result.admittedAt && (
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-medium text-gray-500 w-20 flex-shrink-0">Time</span>
            <span className="text-sm text-gray-700">{format(new Date(result.admittedAt), 'h:mm:ss a')}</span>
          </div>
        )}
        {result.supervisorName && (
          <div className="flex items-baseline gap-2">
            <span className="text-xs font-medium text-gray-500 w-20 flex-shrink-0">Approved by</span>
            <span className="text-sm text-gray-700">{result.supervisorName}</span>
          </div>
        )}

        {result.message && (
          <p className="text-sm text-gray-600 mt-1 pt-2 border-t border-surface-border">{result.message}</p>
        )}
      </div>

      {/* Dismiss button */}
      <div className="px-5 pb-4">
        <button onClick={onDismiss} className="btn-secondary w-full text-xs">
          Dismiss & Scan Next
        </button>
      </div>

      <style>{`
        @keyframes stroke-countdown {
          from { stroke-dashoffset: 0; }
          to   { stroke-dashoffset: 100; }
        }
      `}</style>
    </div>
  );
}
