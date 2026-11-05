import { useCallback, useEffect, useState } from 'react';
import { notifications } from '@mantine/notifications';

interface LoadState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

// Простая загрузка данных: перезагружается при смене deps и по вызову reload().
// При перезагрузке старые данные остаются на экране, пока приходят новые.
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<LoadState<T>>({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    fn()
      .then((data) => alive && setState({ data, error: null, loading: false }))
      .catch((e: Error) => alive && setState({ data: null, error: e.message, loading: false }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

export function notifyError(e: unknown): void {
  notifications.show({
    color: 'red',
    title: 'Не получилось',
    message: e instanceof Error ? e.message : String(e),
  });
}

export function notifyOk(message: string): void {
  notifications.show({ color: 'green', message });
}
