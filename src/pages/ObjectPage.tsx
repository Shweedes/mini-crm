import { useState } from 'react';
import { Alert, Anchor, Button, Group, Paper, Table, Text, Title } from '@mantine/core';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ConfirmModal } from '../components/ConfirmModal';
import { Loadable } from '../components/Loadable';
import { ObjectFormModal } from '../components/ObjectFormModal';
import { StatusBadge } from '../components/StatusBadge';
import { TaskFormModal } from '../components/TaskFormModal';
import { deleteObject, getObject, listTasksByObject } from '../lib/api';
import { useProfile } from '../lib/auth';
import { notifyError, notifyOk, useLoad } from '../lib/hooks';
import { fmtDate } from '../lib/labels';

export function ObjectPage() {
  const { id = '' } = useParams();
  const profile = useProfile();
  const isManager = profile.role === 'manager';
  const navigate = useNavigate();

  const object = useLoad(() => getObject(id), [id]);
  const tasks = useLoad(() => listTasksByObject(id), [id]);

  const [editing, setEditing] = useState(false);
  const [creatingTask, setCreatingTask] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      await deleteObject(id);
      notifyOk('Объект удалён вместе с его задачами');
      navigate('/objects');
    } catch (e) {
      notifyError(e);
      setBusy(false);
    }
  }

  return (
    <>
      <Anchor component={Link} to="/objects" size="sm">
        ← Все объекты
      </Anchor>

      <Loadable {...object}>
        {(o) => (
          <>
            <Group justify="space-between" align="flex-start" mt="xs" mb="md">
              <div>
                <Title order={2}>{o.name}</Title>
                <Text c="dimmed">{o.address}</Text>
              </div>
              {isManager && (
                <Group gap="xs">
                  <Button onClick={() => setCreatingTask(true)}>Новая задача</Button>
                  <Button variant="default" onClick={() => setEditing(true)}>
                    Редактировать
                  </Button>
                  <Button variant="subtle" color="red" onClick={() => setDeleting(true)}>
                    Удалить
                  </Button>
                </Group>
              )}
            </Group>

            <Title order={4} mb="xs">
              Задачи
            </Title>
            {!isManager && (
              <Text size="sm" c="dimmed" mb="xs">
                Показаны только ваши задачи по этому объекту.
              </Text>
            )}
            <Loadable {...tasks}>
              {(rows) =>
                rows.length === 0 ? (
                  <Text c="dimmed">Задач по этому объекту пока нет.</Text>
                ) : (
                  <Paper withBorder>
                    <Table.ScrollContainer minWidth={560}>
                      <Table highlightOnHover verticalSpacing="sm">
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>Задача</Table.Th>
                            <Table.Th>Исполнитель</Table.Th>
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
                              <Table.Td>{t.assignee?.full_name ?? '—'}</Table.Td>
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
                )
              }
            </Loadable>

            {editing && <ObjectFormModal object={o} onClose={() => setEditing(false)} onSaved={object.reload} />}
            {creatingTask && (
              <TaskFormModal objectId={o.id} onClose={() => setCreatingTask(false)} onSaved={tasks.reload} />
            )}
            {deleting && (
              <ConfirmModal
                title="Удалить объект?"
                text={`Объект «${o.name}» будет удалён вместе со всеми его задачами и их историей. Это нельзя отменить.`}
                loading={busy}
                onConfirm={remove}
                onClose={() => setDeleting(false)}
              />
            )}
          </>
        )}
      </Loadable>

      {!object.loading && !object.error && object.data === null && (
        <Alert color="gray" mt="md" title="Объект не найден">
          Такого объекта нет, или у вас нет к нему доступа.
        </Alert>
      )}
    </>
  );
}
