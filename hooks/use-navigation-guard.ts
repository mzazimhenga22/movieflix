import { useCallback, useEffect, useRef } from 'react';

type Options = {
  cooldownMs?: number;
};

export function useNavigationGuard(options?: Options) {
  const cooldownMs = options?.cooldownMs ?? 900;
  const inFlightRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    inFlightRef.current = false;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const deferNav = useCallback(
    (action: () => void) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }

      requestAnimationFrame(() => {
        try {
          action();
        } finally {
          timerRef.current = setTimeout(() => {
            inFlightRef.current = false;
            timerRef.current = null;
          }, cooldownMs);
        }
      });
    },
    [cooldownMs],
  );

  useEffect(() => reset, [reset]);

  return { deferNav, reset, inFlightRef };
}
