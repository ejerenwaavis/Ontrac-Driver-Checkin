import { useEffect, useRef, useCallback } from 'react';

/**
 * Detects Bluetooth/USB keyboard-wedge barcode scanner input.
 *
 * Wedge scanners emulate a keyboard: they type the barcode characters
 * very fast (< ~50ms between keystrokes) then send Enter.
 * This hook detects that pattern vs normal human typing.
 *
 * @param {(code: string) => void} onScan - called with the decoded barcode string
 * @param {boolean} enabled - pause listening when false (e.g., when camera mode is active)
 */
const useWedgeScanner = (onScan, enabled = true) => {
  const bufferRef = useRef('');
  const lastKeyTimeRef = useRef(0);
  const THRESHOLD_MS = 50; // characters faster than this indicate a scanner

  const handleKeyDown = useCallback(
    (e) => {
      if (!enabled) return;

      // Ignore if user is typing in an input that isn't the scanner target
      const tag = e.target?.tagName?.toLowerCase();
      const isEditable = e.target?.isContentEditable;
      if ((tag === 'input' || tag === 'textarea' || isEditable) &&
          !e.target?.dataset?.scannerTarget) {
        return;
      }

      const now = Date.now();
      const delta = now - lastKeyTimeRef.current;
      lastKeyTimeRef.current = now;

      if (e.key === 'Enter') {
        const code = bufferRef.current.trim();
        if (code.length > 0) {
          onScan(code);
        }
        bufferRef.current = '';
        return;
      }

      // If gap too large, reset buffer (user resumed normal typing between scans)
      if (delta > 200 && bufferRef.current.length > 0) {
        bufferRef.current = '';
      }

      if (e.key.length === 1) {
        bufferRef.current += e.key;
      }
    },
    [onScan, enabled]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
};

export default useWedgeScanner;
