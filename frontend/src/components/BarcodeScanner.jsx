import { useState, useCallback } from 'react';
import { ScanBarcode, Camera, Keyboard, AlertCircle } from 'lucide-react';
import { Scanner } from '@yudiel/react-qr-scanner';
import useWedgeScanner from '../hooks/useBarcodeInput.js';

/**
 * BarcodeScanner — unified camera + keyboard-wedge barcode input.
 *
 * Props:
 *   onScan(code: string, source?: 'scan' | 'manual') — called with barcode and source
 *   disabled: boolean    — pauses all input
 */
export default function BarcodeScanner({ onScan, disabled = false }) {
  const [mode, setMode] = useState('wedge'); // 'wedge' | 'camera'
  const [cameraError, setCameraError] = useState(null);
  const [manualInput, setManualInput] = useState('');

  const handleScan = useCallback(
    (code, source = 'scan') => {
      if (disabled || !code?.trim()) return;
      onScan(code.trim().toUpperCase(), source);
    },
    [disabled, onScan]
  );

  // Keyboard wedge hook — active only in wedge mode
  useWedgeScanner(handleScan, mode === 'wedge' && !disabled);

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (manualInput.trim()) {
      handleScan(manualInput.trim(), 'manual');
      setManualInput('');
    }
  };

  const handleCameraScan = (result) => {
    if (!result) return;

    if (Array.isArray(result) && result[0]?.rawValue) {
      handleScan(result[0].rawValue);
      return;
    }

    if (result?.rawValue) {
      handleScan(result.rawValue);
      return;
    }

    if (typeof result === 'string') {
      handleScan(result);
    }
  };

  const handleCameraError = (error) => {
    console.error('Camera scan error:', error);
    setCameraError('Camera error. Try switching to manual entry.');
  };

  return (
    <div className="space-y-4">
      {/* Mode Toggle */}
      <div className="flex rounded-xl border border-surface-border bg-surface-muted p-1 gap-1">
        <button
          onClick={() => { setMode('wedge'); setCameraError(null); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-medium transition-all duration-150 ${
            mode === 'wedge' ? 'bg-white text-brand-700 shadow-sm border border-surface-border' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Keyboard className="w-4 h-4" />
          <span className="hidden sm:inline">Scanner / Manual</span>
          <span className="sm:hidden">Manual</span>
        </button>
        <button
          onClick={() => { setMode('camera'); setCameraError(null); }}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-sm font-medium transition-all duration-150 ${
            mode === 'camera' ? 'bg-white text-brand-700 shadow-sm border border-surface-border' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Camera className="w-4 h-4" />
          Camera
        </button>
      </div>

      {/* Wedge / Manual mode */}
      {mode === 'wedge' && (
        <div className="space-y-3">
          <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-xl border border-blue-100">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
              <ScanBarcode className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-blue-900">Bluetooth Scanner Ready</p>
              <p className="text-xs text-blue-700 mt-0.5">Point scanner at driver barcode. Input auto-detected.</p>
            </div>
          </div>

          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <input
              type="text"
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value.toUpperCase())}
              disabled={disabled}
              placeholder="Driver number (type or scan)"
              className="input flex-1 font-mono uppercase tracking-wider"
              autoFocus
              autoComplete="off"
              spellCheck={false}
            />
            <button
              type="submit"
              disabled={disabled || !manualInput.trim()}
              className="btn-primary px-5 flex-shrink-0"
            >
              Check In
            </button>
          </form>
        </div>
      )}

      {/* Camera mode */}
      {mode === 'camera' && (
        <div className="space-y-3">
          {cameraError ? (
            <div className="flex items-start gap-3 p-4 bg-red-50 rounded-xl border border-red-100">
              <AlertCircle className="w-5 h-5 text-brand-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-brand-800">Camera unavailable</p>
                <p className="text-xs text-brand-700 mt-0.5">{cameraError}</p>
                <button
                  onClick={() => { setCameraError(null); setMode('wedge'); }}
                  className="text-xs text-brand-600 underline mt-1"
                >
                  Switch to manual entry
                </button>
              </div>
            </div>
          ) : (
            <div className="relative overflow-hidden rounded-xl border-2 border-brand-600 bg-black aspect-square max-h-[360px] w-full">
              <Scanner
                onScan={handleCameraScan}
                onError={handleCameraError}
                paused={disabled}
                constraints={{
                  facingMode: 'environment',
                }}
                styles={{
                  container: {
                    width: '100%',
                    height: '100%',
                    background: 'black',
                  },
                }}
              />
              {/* Scan guide overlay */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div className="w-48 h-48 border-2 border-white/70 rounded-lg relative">
                  <span className="absolute -top-1 -left-1 w-5 h-5 border-t-2 border-l-2 border-brand-400 rounded-tl" />
                  <span className="absolute -top-1 -right-1 w-5 h-5 border-t-2 border-r-2 border-brand-400 rounded-tr" />
                  <span className="absolute -bottom-1 -left-1 w-5 h-5 border-b-2 border-l-2 border-brand-400 rounded-bl" />
                  <span className="absolute -bottom-1 -right-1 w-5 h-5 border-b-2 border-r-2 border-brand-400 rounded-br" />
                </div>
              </div>
              <p className="absolute bottom-3 left-0 right-0 text-center text-xs text-white/80 font-medium">
                Align barcode within the frame
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
