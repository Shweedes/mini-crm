import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createTheme, MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';

const theme = createTheme({});

async function start() {
  const configured = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY);
  // Приложение подключаем лениво и только если переменные заданы: модуль supabase без них падает
  // при импорте. Вместо белого экрана показываем понятное сообщение.
  const Content = configured
    ? (await import('./App')).App
    : (await import('./components/ConfigError')).ConfigError;

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <MantineProvider theme={theme} defaultColorScheme="light">
        <Notifications position="top-right" />
        <Content />
      </MantineProvider>
    </StrictMode>,
  );
}

void start();
