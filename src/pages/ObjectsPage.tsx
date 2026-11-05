import { useState } from 'react';
import { Anchor, Button, Group, Paper, Table, Text, Title } from '@mantine/core';
import { Link } from 'react-router-dom';
import { Loadable } from '../components/Loadable';
import { ObjectFormModal } from '../components/ObjectFormModal';
import { listObjects } from '../lib/api';
import { useProfile } from '../lib/auth';
import { useLoad } from '../lib/hooks';

export function ObjectsPage() {
  const profile = useProfile();
  const isManager = profile.role === 'manager';
  const objects = useLoad(listObjects, []);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={2}>Объекты</Title>
        {isManager && <Button onClick={() => setCreating(true)}>Добавить объект</Button>}
      </Group>

      <Loadable {...objects}>
        {(rows) =>
          rows.length === 0 ? (
            <Text c="dimmed">
              {isManager ? 'Объектов пока нет. Добавьте первый.' : 'У вас пока нет задач, поэтому нет и объектов.'}
            </Text>
          ) : (
            <Paper withBorder>
              <Table.ScrollContainer minWidth={480}>
                <Table highlightOnHover verticalSpacing="sm">
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Название</Table.Th>
                      <Table.Th>Адрес</Table.Th>
                      <Table.Th ta="right">{isManager ? 'Задач' : 'Ваших задач'}</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {rows.map((o) => (
                      <Table.Tr key={o.id}>
                        <Table.Td>
                          <Anchor component={Link} to={`/objects/${o.id}`} fw={500}>
                            {o.name}
                          </Anchor>
                        </Table.Td>
                        <Table.Td>{o.address}</Table.Td>
                        <Table.Td ta="right">{o.tasks[0]?.count ?? 0}</Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </Paper>
          )
        }
      </Loadable>

      {creating && <ObjectFormModal onClose={() => setCreating(false)} onSaved={objects.reload} />}
    </>
  );
}
