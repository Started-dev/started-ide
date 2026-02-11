import { useState, useEffect, useRef, useCallback } from 'react';

interface HesitationState {
  show: boolean;
  message: string;
}

export function useHesitationDetection(
  lastRunFailed: boolean,
  diffDirty: boolean,
  filesChangedCount: number,
  timeoutMs: number = 30000,
) {
  const [state, setState] = useState<HesitationState>({ show: false, message: '' });
  const dismissCountRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setState({ show: false, message: '' });

    if (dismissCountRef.current >= 2) return;
    if (!lastRunFailed && !diffDirty) return;

    timerRef.current = setTimeout(() => {
      if (dismissCountRef.current >= 2) return;
      const msg = lastRunFailed
        ? 'Tests failed. Want me to fix this?'
        : `You changed ${filesChangedCount} file${filesChangedCount !== 1 ? 's' : ''}. Run tests?`;
      setState({ show: true, message: msg });
    }, timeoutMs);
  }, [lastRunFailed, diffDirty, filesChangedCount, timeoutMs]);

  useEffect(() => {
    resetTimer();
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [resetTimer]);

  const dismiss = useCallback(() => {
    dismissCountRef.current++;
    setState({ show: false, message: '' });
  }, []);

  const recordActivity = useCallback(() => {
    resetTimer();
  }, [resetTimer]);

  return { ...state, dismiss, recordActivity };
}
