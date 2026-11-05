import { useState } from 'react';
import { Alert, Anchor, Button, Group, Paper, SimpleGrid, Stack, Text, Timeline, Title } from '@mantine/core';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ConfirmModal } from '../components/ConfirmModal';
import { Loadable } from '../components/Loadable';
import { StatusActionModal } from '../components/StatusActionModal';
import { StatusBadge } from '../components/StatusBadge';
import { TaskFormModal } from '../components/TaskFormModal';
import { deleteTask, getTask, listHistory, listTransitions } from '../lib/api';
import { useProfile } from '../lib/auth';
import { notifyError, notifyOk, useLoad } from '../lib/hooks';
import { actionColor, actionLabel, fmtDate, STATUS_LABEL } from '../lib/labels';
import type { Transition } from '../lib/types';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text>{children}</Text>
    </div>
  );
}

export function TaskPage() {
  const { id = '' } = useParams();
  const profile = useProfile();
  const isManager = profile.role === 'manager';
  const navigate = useNavigate();

  const task = useLoad(() => getTask(id), [id]);
  const history = useLoad(() => listHistory(id), [id]);
  const transitions = useLoad(listTransitions, []);

  const [action, setAction] = useState<Transition | null>(null);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);

  function reloadAll() {
    task.reload();
    history.reload();
  }

  async function remove(objectId: string) {
    setBusy(true);
    try {
      await deleteTask(id);
      notifyOk('Задача удалена');
      navigate(`/objects/${objectId}`);
    } catch (e) {
      notifyError(e);
      setBusy(false);
    }
  }

  return (
    <>
      <Loadable {...task}>
        {(t) => {
          // Показываем только те действия, которые доступны ЭТОМУ пользователю в ЭТОМ статусе.
          // Список переходов приходит из базы (таблица task_transitions), а не зашит в код;
          // настоящую проверку при нажатии всё равно делает база.
          const available = (transitions.data ?? []).filter(
            (tr) =>
              tr.from_status === t.status &&
              (tr.actor_role === 'manager'
                ? isManager
                : profile.role === 'executor' && t.assignee_id === profile.id),
          );

          return (
            <>
              <Anchor component={Link} to={`/objects/${t.object_id}`} size="sm">
                ← {t.object?.name ?? 'К объекту'}
              </Anchor>

              <Group justify="space-between" align="flex-start" mt="xs" mb="md">
                <Group gap="sm" align="center">
                  <Title order={2}>{t.title}</Title>
                  <StatusBadge status={t.status} />
                </Group>
                {isManager && (
                  <Group gap="xs">
                    <Button variant="default" onClick={() => setEditing(true)}>
                      Редактировать
                    </Button>
                    <Button variant="subtle" color="red" onClick={() => setDeleting(true)}>
                      Удалить
                    </Button>
                  </Group>
                )}
              </Group>

              <Paper withBorder p="md" mb="md">
                <Stack gap="md">
                  <Field label="Описание">{t.description.trim() === '' ? '—' : t.description}</Field>
                  <SimpleGrid cols={{ base: 1, sm: 2 }}>
                    <Field label="Объект">
                      {t.object ? (
                        <Anchor component={Link} to={`/objects/${t.object.id}`}>
                          {t.object.name}
                        </Anchor>
                      ) : (
                        '—'
                      )}
                    </Field>
                    <Field label="Адрес объекта">{t.object?.address ?? '—'}</Field>
                    <Field label="Исполнитель">{t.assignee?.full_name ?? '—'}</Field>
                    <Field label="Автор">{t.author?.full_name ?? '—'}</Field>
                    <Field label="Создана">{fmtDate(t.created_at)}</Field>
                  </SimpleGrid>
                </Stack>
              </Paper>

              <Paper withBorder p="md" mb="md">
                <Title order={5} mb="sm">
                  Действия
                </Title>
                {transitions.error ? (
                  <Alert color="red">{transitions.error}</Alert>
                ) : available.length === 0 ? (
                  <Text c="dimmed" size="sm">
                    В статусе «{STATUS_LABEL[t.status]}» для вас нет доступных действий.
                  </Text>
                ) : (
                  <Group>
                    {available.map((tr) => (
                      <Button key={tr.to_status} color={actionColor(tr.to_status)} onClick={() => setAction(tr)}>
                        {actionLabel(tr)}
                      </Button>
                    ))}
                  </Group>
                )}
              </Paper>

              <Title order={4} mb="sm">
                История
              </Title>
              <Loadable {...history}>
                {(items) => (
                  <Timeline active={items.length - 1} bulletSize={16} lineWidth={2}>
                    {items.map((h) => (
                      <Timeline.Item
                        key={h.id}
                        title={
                          h.from_status === null
                            ? `Создана (${STATUS_LABEL[h.to_status]})`
                            : `${STATUS_LABEL[h.from_status]} → ${STATUS_LABEL[h.to_status]}`
                        }
                      >
                        <Text size="sm" c="dimmed">
                          {h.changer?.full_name ?? 'Неизвестный пользователь'} · {fmtDate(h.created_at)}
                        </Text>
                        {h.comment && (
                          <Text size="sm" mt={4} style={{ whiteSpace: 'pre-wrap' }}>
                            «{h.comment}»
                          </Text>
                        )}
                      </Timeline.Item>
                    ))}
                  </Timeline>
                )}
              </Loadable>

              {action && (
                <StatusActionModal task={t} transition={action} onClose={() => setAction(null)} onDone={reloadAll} />
              )}
              {editing && <TaskFormModal task={t} onClose={() => setEditing(false)} onSaved={reloadAll} />}
              {deleting && (
                <ConfirmModal
                  title="Удалить задачу?"
                  text={`Задача «${t.title}» будет удалена вместе с историей. Это нельзя отменить.`}
                  loading={busy}
                  onConfirm={() => remove(t.object_id)}
                  onClose={() => setDeleting(false)}
                />
              )}
            </>
          );
        }}
      </Loadable>

      {!task.loading && !task.error && task.data === null && (
        <Alert color="gray" title="Задача не найдена">
          Такой задачи нет, или она вам не доступна.
        </Alert>
      )}
    </>
  );
}
