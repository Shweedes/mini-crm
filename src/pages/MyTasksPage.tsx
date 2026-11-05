import { useState } from 'react';
import { Anchor, Group, Paper, SegmentedControl, Table, Text, Title } from '@mantine/core';
import { Link } from 'react-router-dom';
import { Loadable } from '../components/Loadable';
import { StatusBadge } from '../components/StatusBadge';
import { listMyTasks } from '../lib/api';
import { useProfile } from '../lib/auth';
import { useLoad } from '../lib/hooks';
import { fmtDate, STATUS_LABEL, STATUS_ORDER } from '../lib/labels';
import type { TaskStatus } from '../lib/types';

export function MyTasksPage() {
  const profile = useProfile();
  const tasks = useLoad(() => listMyTasks(profile.id), [profile.id]);
  const [filter, setFilter] = useState<'all' | TaskStatus>('all');

  return (
    <>
      <Group justify="space-between" mb="md" wrap="wrap">
        <Title order={2}>Мои задачи</Title>
        <SegmentedControl
          size="xs"
          value={filter}
          onChange={(v) => setFilter(v as 'all' | TaskStatus)}
          data={[{ value: 'all', label: 'Все' }, ...STATUS_ORDER.map((s) => ({ value: s, label: STATUS_LABEL[s] }))]}
        />
      </Group>

      <Loadable {...tasks}>
        {(all) => {
          const rows = filter === 'all' ? all : all.filter((t) => t.status === filter);
          return rows.length === 0 ? (
            <Text c="dimmed">{all.length === 0 ? 'Вам пока не назначено задач.' : 'Нет задач с таким статусом.'}</Text>
          ) : (
            <Paper withBorder>
              <Table.ScrollContainer minWidth={560}>
                <Table highlightOnHover verticalSpacing="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Задача</Table.Th>
                      <Table.Th>Объект</Table.Th>
                      <Table.Th>Статус</Table.Th>
                      <Table.Th>Создана</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {rows.map((t) => (
                      <Table.Tr key={t.id}>
                        <Table.Td>
                          <Anchor component={Link} to={`/tasks/${t.id}`} fw={500}>
                            {t.title}
                          </Anchor>
                        </Table.Td>
                        <Table.Td>
                          {t.object ? (
                            <Anchor component={Link} to={`/objects/${t.object.id}`}>
                              {t.object.name}
                            </Anchor>
                          ) : (
                            '—'
                          )}
                        </Table.Td>
                        <Table.Td>
                          <StatusBadge status={t.status} />
                        </Table.Td>
                        <Table.Td>{fmtDate(t.created_at)}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </Paper>
          );
        }}
      </Loadable>
    </>
  );
}
