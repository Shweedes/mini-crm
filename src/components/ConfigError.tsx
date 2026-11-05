import { Alert, Container } from '@mantine/core';

// Показывается, если при сборке не заданы переменные окружения Supabase.
export function ConfigError() {
  return (
    <Container size="xs" py="xl">
      <Alert color="red" title="Не настроено подключение к Supabase">
        Задайте переменные VITE_SUPABASE_URL и VITE_SUPABASE_PUBLISHABLE_KEY (см. README, файл .env.example) и
        пересоберите приложение.
      </Alert>
    </Container>
  );
}
