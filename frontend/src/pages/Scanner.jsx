import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ScanBarcode, Wifi, LogIn, LogOut } from 'lucide-react';
import BarcodeScanner from '../components/BarcodeScanner.jsx';
import DriverPreview from '../components/DriverPreview.jsx';
import AdmissionResult from '../components/AdmissionResult.jsx';
import OverrideModal from '../components/OverrideModal.jsx';
import api from '../services/api.js';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

// phase: 'idle' | 'preview' | 'result'
// mode: 'checkin' | 'checkout'

export default function Scanner() {
  const [mode, setMode] = useState('checkin');
  const [phase, setPhase] = useState('idle');
  const [previewData, setPreviewData] = useState(null);
  const [resultData, setResultData] = useState(null);
  const [overrideTarget, setOverrideTarget] = useState(null);

  const clearScreen = useCallback(() => {
    setPhase('idle');
    setPreviewData(null);
    setResultData(null);
    setOverrideTarget(null);
  }, []);

  // ── Step 1: lookup (no DB write) ───────────────────────────────────────────
  const lookupMutation = useMutation({
    mutationFn: ({ driverNumber }) =>
      api.post('/admissions/lookup', { driverNumber }).then((r) => r.data),
    onSuccess: (data, variables) => {
      setPreviewData({
        ...data,
        source: variables.source || 'scan',
      });
      setPhase('preview');
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Scan failed. Please try again.');
    },
  });

  // ── Step 2: admit (records check-in) ───────────────────────────────────────
  const admitMutation = useMutation({
    mutationFn: ({ driverNumber, source }) =>
      api.post('/admissions/scan', { driverNumber, source }).then((r) => r.data),
    onSuccess: (data) => {
      setPreviewData(null);
      setResultData(data);
      setPhase('result');
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Admission failed. Please try again.');
    },
  });

  // ── Checkout flow (records check-out) ──────────────────────────────────────
  const checkoutMutation = useMutation({
    mutationFn: ({ driverNumber, source }) =>
      api.post('/admissions/checkout', { driverNumber, source }).then((r) => r.data),
    onSuccess: (data) => {
      setResultData(data);
      setPhase('result');
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Checkout failed. Please try again.');
    },
  });

  const handleScan = useCallback(
    (code, source = 'scan') => {
      if (lookupMutation.isPending || admitMutation.isPending || checkoutMutation.isPending) return;

      clearScreen();

      if (mode === 'checkout') {
        checkoutMutation.mutate({ driverNumber: code, source });
        return;
      }

      lookupMutation.mutate({ driverNumber: code, source });
    },
    [lookupMutation, admitMutation, checkoutMutation, mode, clearScreen]
  );

  const handleAdmit = useCallback(() => {
    if (!previewData) return;
    admitMutation.mutate({
      driverNumber: previewData.driverNumber,
      source: previewData.source || 'scan',
    });
  }, [previewData, admitMutation]);

  const handleOverrideOpen = useCallback(() => {
    if (!previewData) return;
    setOverrideTarget({
      driverNumber: previewData.driverNumber,
      driverName: previewData.driverName,
      reason: previewData.result,
    });
  }, [previewData]);

  const handleOverrideSuccess = useCallback((overrideResult) => {
    setOverrideTarget(null);
    setPreviewData(null);
    setResultData(overrideResult);
    setPhase('result');
  }, []);

  const handleDismiss = useCallback(() => clearScreen(), [clearScreen]);

  const handleModeSwitch = useCallback((nextMode) => {
    setMode(nextMode);
    clearScreen();
  }, [clearScreen]);

  const isProcessing = lookupMutation.isPending || admitMutation.isPending || checkoutMutation.isPending;
  const scannerLocked = isProcessing || phase !== 'idle';

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {mode === 'checkin' ? 'Driver Check-In' : 'Driver Check-Out'}
          </h1>
          <p className="text-sm text-gray-500 flex items-center gap-1.5 mt-0.5">
            <Wifi className="w-3.5 h-3.5" />
            {format(new Date(), 'EEEE, MMMM d · h:mm a')}
          </p>
        </div>
        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
          isProcessing ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'
        }`}>
          <span className={`w-2 h-2 rounded-full ${isProcessing ? 'bg-amber-500 animate-pulse' : 'bg-green-500'}`} />
          {isProcessing ? 'Processing…' : 'Ready'}
        </div>
      </div>

      {/* Flow mode switch */}
      <div className="card p-1.5 grid grid-cols-2 gap-1">
        <button
          type="button"
          onClick={() => handleModeSwitch('checkin')}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
            mode === 'checkin'
              ? 'bg-green-600 text-white'
              : 'text-gray-600 hover:bg-surface-muted'
          }`}
        >
          <LogIn className="w-4 h-4" />
          Check In
        </button>
        <button
          type="button"
          onClick={() => handleModeSwitch('checkout')}
          className={`flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
            mode === 'checkout'
              ? 'bg-blue-600 text-white'
              : 'text-gray-600 hover:bg-surface-muted'
          }`}
        >
          <LogOut className="w-4 h-4" />
          Check Out
        </button>
      </div>

      {/* Scanner — disabled while a result is on screen or processing */}
      <div className={`card p-4 transition-opacity duration-150 ${
        scannerLocked ? 'opacity-60 pointer-events-none' : ''
      }`}>
        <BarcodeScanner onScan={handleScan} disabled={scannerLocked} />
      </div>

      {/* Step 1 — Preview card: face verify then Admit / Override */}
      {mode === 'checkin' && phase === 'preview' && previewData && (
        <DriverPreview
          result={previewData}
          onAdmit={handleAdmit}
          onOverride={handleOverrideOpen}
          onDismiss={handleDismiss}
          autoResetMs={15000}
        />
      )}

      {/* Step 2 — Check-in / Check-out result card */}
      {phase === 'result' && resultData && (
        <AdmissionResult
          result={resultData}
          onDismiss={handleDismiss}
          autoResetMs={15000}
        />
      )}

      {/* Hint when idle */}
      {phase === 'idle' && !isProcessing && (
        <div className="text-center py-6">
          <ScanBarcode className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-400">
            {mode === 'checkin'
              ? 'Scan or enter a driver number to check in'
              : 'Scan or enter a driver number to check out'}
          </p>
          <p className="text-xs text-gray-300 mt-1">Results auto-clear after 15 seconds</p>
        </div>
      )}

      {/* Override Modal */}
      {mode === 'checkin' && overrideTarget && (
        <OverrideModal
          driverNumber={overrideTarget.driverNumber}
          driverName={overrideTarget.driverName}
          reason={overrideTarget.reason}
          onSuccess={handleOverrideSuccess}
          onClose={() => setOverrideTarget(null)}
        />
      )}
    </div>
  );
}
