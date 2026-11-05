import { Alert, Badge, Button, Center, Container, Group, Loader, Text, Title } from '@mantine/core';
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ROLE_LABEL } from '../lib/labels';

// Обёртка для всех экранов, кроме входа: проверяет вход и рисует шапку.
export function RequireAuth() {
  const { loading, session, profile, profileError, signOut } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    );
  }
  if (!session) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  if (!profile) {
    return (
      <Container size="xs" py="xl">
        <Alert color="orange" title="Профиль не настроен">
          {profileError ?? 'Для вашей учётной записи не создан профиль с ролью. Обратитесь к администратору.'}
          <Group mt="md">
            <Button variant="default" onClick={() => void signOut()}>
              Выйти
            </Button>
          </Group>
        </Alert>
      </Container>
    );
  }

  return <Shell />;
}

function Shell() {
  const { profile, signOut } = useAuth();
  const { pathname } = useLocation();
  if (!profile) return null;

  const links = [
    { to: '/objects', label: 'Объекты', active: pathname.startsWith('/objects') },
    ...(profile.role === 'executor'
      ? [{ to: '/my-tasks', label: 'Мои задачи', active: pathname.startsWith('/my-tasks') }]
      : []),
  ];

  return (
    <>
      <header style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
        <Container size="lg" py="sm">
          <Group justify="space-between" wrap="wrap" gap="sm">
            <Group gap="lg">
              <Title order={4}>Объекты и задачи</Title>
              <Group gap={4}>
                {links.map((l) => (
                  <Button key={l.to} component={Link} to={l.to} variant={l.active ? 'light' : 'subtle'} size="compact-md">
                    {l.label}
                  </Button>
                ))}
              </Group>
            </Group>
            <Group gap="sm">
              <Text size="sm">{profile.full_name}</Text>
              <Badge variant="outline" color={profile.role === 'manager' ? 'grape' : 'teal'}>
                {ROLE_LABEL[profile.role]}
              </Badge>
              <Button variant="default" size="compact-md" onClick={() => void signOut()}>
                Выйти
              </Button>
            </Group>
          </Group>
        </Container>
      </header>
      <Container size="lg" py="lg">
        <Outlet />
      </Container>
    </>
  );
}
