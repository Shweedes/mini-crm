import { Alert, Center, Loader } from '@mantine/core';
import type { ReactNode } from 'react';

// Общая «обёртка» экрана: пока данных нет — крутилка, при ошибке — сообщение.
export function Loadable<T>({
  data,
  loading,
  error,
  children,
}: {
  data: T | null;
  loading: boolean;
  error: string | null;
  children: (data: T) => ReactNode;
}) {
  if (error) {
    return (
      <Alert color="red" title="Не удалось загрузить данные">
        {error}
      </Alert>
    );
  }
  if (data === null) {
    return loading ? (
      <Center py="xl">
        <Loader />
      </Center>
    ) : null;
  }
  return <>{children(data)}</>;
}
