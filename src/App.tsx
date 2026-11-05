import { Alert } from '@mantine/core';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { RequireAuth } from './components/Layout';
import { AuthProvider, useProfile } from './lib/auth';
import { LoginPage } from './pages/LoginPage';
import { MyTasksPage } from './pages/MyTasksPage';
import { ObjectPage } from './pages/ObjectPage';
import { ObjectsPage } from './pages/ObjectsPage';
import { TaskPage } from './pages/TaskPage';
import type { Role } from './lib/types';

// Стартовая страница зависит от роли: исполнителю сразу его задачи.
function Home() {
  const { role } = useProfile();
  return <Navigate to={role === 'executor' ? '/my-tasks' : '/objects'} replace />;
}

// Экран только для одной роли (в интерфейсе; настоящие права всё равно в базе).
function OnlyFor({ role, children }: { role: Role; children: React.ReactNode }) {
  const profile = useProfile();
  return profile.role === role ? <>{children}</> : <Navigate to="/" replace />;
}

// HashRouter: адреса вида /#/tasks/…; так прямые ссылки и обновление страницы работают
// на любом статическом хостинге (в том числе GitHub Pages) без настроек сервера.
export function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<RequireAuth />}>
            <Route index element={<Home />} />
            <Route path="objects" element={<ObjectsPage />} />
            <Route path="objects/:id" element={<ObjectPage />} />
            <Route path="tasks/:id" element={<TaskPage />} />
            <Route
              path="my-tasks"
              element={
                <OnlyFor role="executor">
                  <MyTasksPage />
                </OnlyFor>
              }
            />
            <Route
              path="*"
              element={
                <Alert color="gray" title="Страница не найдена">
                  Проверьте адрес или вернитесь на главную.
                </Alert>
              }
            />
          </Route>
        </Routes>
      </AuthProvider>
    </HashRouter>
  );
}
