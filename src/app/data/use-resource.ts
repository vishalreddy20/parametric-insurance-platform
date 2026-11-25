import { useCallback, useEffect, useState } from 'react';
import { DataError } from './provider';

export function readableError(error: unknown) {
  return error instanceof DataError ? error.message : 'The request could not be completed. Try again.';
}

export function useResource<T>(load: () => Promise<T>, onExpired: () => void, refreshMs?: number) {
  const [value, setValue] = useState<T | undefined>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      try {
        const result = await load();
        if (!live) return;
        setValue(result);
        setError('');
      } catch (error) {
        if (!live) return;
        if (error instanceof DataError && error.code === 'ERR_SESSION_EXPIRED') {
          onExpired();
          return;
        }
        setError(readableError(error));
      } finally {
        if (live) {
          setLoading(false);
          if (refreshMs) timer = setTimeout(() => { void run(); }, refreshMs);
        }
      }
    };
    setLoading(true);
    void run();
    return () => { live = false; if (timer) clearTimeout(timer); };
  }, [load, onExpired, refreshMs, revision]);

  return { value, error, loading, refresh };
}
