import { useEffect } from 'react';
import { UserCircle, CheckCircle, ShieldAlert, XCircle, AlertTriangle, Clock } from 'lucide-react';

const CONFIG = {
  FOUND: {
    bg: 'bg-blue-50',
    border: 'border-blue-300',
    headerBg: 'bg-blue-600',
    title: 'READY TO ADMIT',
    showAdmit: true,
  },
  INACTIVE: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    headerBg: 'bg-brand-600',
    title: 'INACTIVE DRIVER',
    showAdmit: false,
  },
  NOT_FOUND: {
    bg: 'bg-gray-50',
    border: 'border-gray-300',
    headerBg: 'bg-gray-700',
    title: 'NOT FOUND',
    showAdmit: false,
  },
};

/**
 * DriverPreview — shown after a lookup scan, before the clerk admits the driver.
 *
 * Props:
 *   result: object from POST /admissions/lookup
 *   onAdmit: () => void   — only called when clerk explicitly clicks Admit
 *   onOverride: () => void
 *   onDismiss: () => void — auto-timer fires this (NOT onAdmit)
 *   autoResetMs: number (default 15000)
 */
export default function DriverPreview({ result, onAdmit, onOverride, onDismiss, autoResetMs = 15000 }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, autoResetMs);
    return () => clearTimeout(timer);
  }, [result, onDismiss, autoResetMs]);

  if (!result) return null;

  const cfg = CONFIG[result.result] || CONFIG.NOT_FOUND;

  return (
    <div className={`rounded-2xl border-2 ${cfg.border} ${cfg.bg} overflow-hidden shadow-card-hover animate-bounce-once`}>
      {/* Header band */}
      <div className={`${cfg.headerBg} px-5 py-4 flex items-center gap-3`}>
        <div className="flex-1 min-w-0">
          <p className="text-lg font-extrabold tracking-wide text-white">{cfg.title}</p>
          {result.driverName && (
            <p className="text-white/80 text-sm font-medium truncate">{result.driverName}</p>
          )}
        </div>
        {/* 15s countdown ring */}
        <div className="w-10 h-10 relative flex-shrink-0">
          <svg className="w-10 h-10 -rotate-90" viewBox="0 0 36 36">
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="3" />
            <circle
              cx="18" cy="18" r="15.9" fill="none"
              stroke="rgba(255,255,255,0.9)" strokeWidth="3"
              strokeDasharray="100"
              strokeDashoffset="0"
              style={{ animation: `stroke-countdown ${autoResetMs}ms linear forwards` }}
            />
          </svg>
          <Clock className="absolute inset-0 m-auto w-4 h-4 text-white/80" />
        </div>
      </div>

      {/* Photo */}
      <div className="flex justify-center pt-5 px-5">
        {result.photoUrl ? (
          <img
            src={result.photoUrl}
            alt={result.driverName || 'Driver photo'}
            className="w-48 h-48 rounded-full object-cover border-4 border-white shadow-md"
          />
        ) : (
          <div className="w-48 h-48 rounded-full bg-gray-200 border-4 border-white shadow-md flex items-center justify-center">
            <UserCircle className="w-28 h-28 text-gray-400" strokeWidth={1} />
          </div>
        )}
      </div>

      {/* Driver details */}
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
        {result.message && (
          <p className="text-sm text-gray-600 mt-1 pt-2 border-t border-surface-border">{result.message}</p>
        )}
      </div>

      {/* Action buttons */}
      <div className="px-5 pb-5 space-y-2">
        {cfg.showAdmit && (
          <button
            onClick={onAdmit}
            className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white font-semibold py-3 px-4 rounded-xl transition-colors shadow-sm text-base"
          >
            <CheckCircle className="w-5 h-5" />
            Admit Driver
          </button>
        )}
        {result.requiresOverride && (
          <button
            onClick={onOverride}
            className="w-full flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white font-semibold py-3 px-4 rounded-xl transition-colors shadow-sm text-base"
          >
            <ShieldAlert className="w-5 h-5" />
            Request Supervisor Override
          </button>
        )}
        <button onClick={onDismiss} className="btn-secondary w-full text-xs">
          Dismiss
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
