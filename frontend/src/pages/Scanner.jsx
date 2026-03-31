import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ScanBarcode, Wifi } from 'lucide-react';
import BarcodeScanner from '../components/BarcodeScanner.jsx';
import DriverPreview from '../components/DriverPreview.jsx';
import AdmissionResult from '../components/AdmissionResult.jsx';
import OverrideModal from '../components/OverrideModal.jsx';
import api from '../services/api.js';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

// phase: 'idle' | 'preview' | 'admitted'

export default function Scanner() {
  const [phase, setPhase] = useState('idle');
  const [previewData, setPreviewData] = useState(null);
  const [admissionData, setAdmissionData] = useState(null);
  const [overrideTarget, setOverrideTarget] = useState(null);

  // ── Step 1: lookup (no DB write) ───────────────────────────────────────────
  const lookupMutation = useMutation({
    mutationFn: ({ driverNumber }) =>
      api.post('/admissions/lookup', { driverNumber }).then((r) => r.data),
    onSuccess: (data) => {
      setPreviewData(data);
      setPhase('preview');
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Scan failed. Please try again.');
    },
  });

  // ── Step 2: admit (records admission) ─────────────────────────────────────
  const admitMutation = useMutation({
    mutationFn: ({ driverNumber }) =>
      api.post('/admissions/scan', { driverNumber, source: 'scan' }).then((r) => r.data),
    onSuccess: (data) => {
      setPreviewData(null);
      setAdmissionData(data);
      setPhase('admitted');
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Admission failed. Please try again.');
    },
  });

  const handleScan = useCallback(
    (code) => {
      if (lookupMutation.isPending || admitMutation.isPending) return;
      setPhase('idle');
      setPreviewData(null);
      setAdmissionData(null);
      setOverrideTarget(null);
      lookupMutation.mutate({ driverNumber: code });
    },
    [lookupMutation, admitMutation]
  );

  const handleAdmit = useCallback(() => {
    if (!previewData) return;
    admitMutation.mutate({ driverNumber: previewData.driverNumber });
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
    setAdmissionData(overrideResult);
    setPhase('admitted');
  }, []);

  const handleDismiss = useCallback(() => {
    setPhase('idle');
    setPreviewData(null);
    setAdmissionData(null);
    setOverrideTarget(null);
  }, []);

  const isProcessing = lookupMutation.isPending || admitMutation.isPending;

  return (
    <div className="max-w-lg mx-auto px-4 py-6 space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Driver Check-In</h1>
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

      {/* Scanner — disabled while a result is on screen or processing */}
      <div className={`card p-4 transition-opacity duration-150 ${
        isProcessing || phase !== 'idle' ? 'opacity-60 pointer-events-none' : ''
      }`}>
        <BarcodeScanner onScan={handleScan} disabled={isProcessing || phase !== 'idle'} />
      </div>

      {/* Step 1 — Preview card: face verify then Admit / Override */}
      {phase === 'preview' && previewData && (
        <DriverPreview
          result={previewData}
          onAdmit={handleAdmit}
          onOverride={handleOverrideOpen}
          onDismiss={handleDismiss}
          autoResetMs={15000}
        />
      )}

      {/* Step 2 — Admission result card */}
      {phase === 'admitted' && admissionData && (
        <AdmissionResult
          result={admissionData}
          onDismiss={handleDismiss}
          autoResetMs={15000}
        />
      )}

      {/* Hint when idle */}
      {phase === 'idle' && !isProcessing && (
        <div className="text-center py-6">
          <ScanBarcode className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-400">Scan or enter a driver number above</p>
          <p className="text-xs text-gray-300 mt-1">Results auto-clear after 15 seconds</p>
        </div>
      )}

      {/* Override Modal */}
      {overrideTarget && (
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
