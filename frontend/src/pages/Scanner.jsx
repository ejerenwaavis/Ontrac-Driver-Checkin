import { useState, useCallback } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ScanBarcode, Wifi } from 'lucide-react';
import BarcodeScanner from '../components/BarcodeScanner.jsx';
import AdmissionResult from '../components/AdmissionResult.jsx';
import OverrideModal from '../components/OverrideModal.jsx';
import api from '../services/api.js';
import { format } from 'date-fns';
import toast from 'react-hot-toast';

export default function Scanner() {
  const [result, setResult] = useState(null);
  const [overrideTarget, setOverrideTarget] = useState(null); // { driverNumber, driverName, reason }

  const scanMutation = useMutation({
    mutationFn: ({ driverNumber, source }) => api.post('/admissions/scan', { driverNumber, source }).then((r) => r.data),
    onSuccess: (data) => {
      setResult(data);
      if (data.requiresOverride) {
        // Keep result visible but also offer override after a moment
      }
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Scan failed. Please try again.');
    },
  });

  const handleScan = useCallback(
    (code, source = 'scan') => {
      if (scanMutation.isPending) return;
      setResult(null);
      setOverrideTarget(null);
      scanMutation.mutate({ driverNumber: code, source });
    },
    [scanMutation]
  );

  const handleDismiss = useCallback(() => {
    setResult(null);
    setOverrideTarget(null);
  }, []);

  const handleOverrideOpen = () => {
    if (!result) return;
    setOverrideTarget({
      driverNumber: result.driverNumber,
      driverName: result.driverName,
      reason: result.result,
    });
  };

  const handleOverrideSuccess = (overrideResult) => {
    setOverrideTarget(null);
    setResult(overrideResult);
  };

  const isProcessing = scanMutation.isPending;

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

      {/* Scanner component */}
      <div className={`card p-4 transition-opacity duration-150 ${isProcessing ? 'opacity-60 pointer-events-none' : ''}`}>
        <BarcodeScanner onScan={handleScan} disabled={isProcessing || !!result} />
      </div>

      {/* Result card */}
      {result && (
        <AdmissionResult
          result={result}
          onDismiss={handleDismiss}
          autoResetMs={5000}
        />
      )}

      {/* Override button — shown when result requires supervisor */}
      {result?.requiresOverride && !overrideTarget && (
        <button
          onClick={handleOverrideOpen}
          className="btn-danger w-full"
        >
          <ScanBarcode className="w-4 h-4" />
          Request Supervisor Override
        </button>
      )}

      {/* Hint when no result yet */}
      {!result && !isProcessing && (
        <div className="text-center py-6">
          <ScanBarcode className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-sm text-gray-400">Scan or enter a driver number above</p>
          <p className="text-xs text-gray-300 mt-1">Results auto-clear after 5 seconds</p>
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
