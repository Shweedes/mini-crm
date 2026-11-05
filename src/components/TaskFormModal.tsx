import { useState, type FormEvent } from 'react';
import { Alert, Button, Group, Loader, Modal, Select, Stack, Textarea, TextInput } from '@mantine/core';
import { createTask, listExecutors, listObjects, updateTask } from '../lib/api';
import { notifyError, notifyOk, useLoad } from '../lib/hooks';
import type { TaskWithRefs } from '../lib/types';

// Создание и редактирование задачи. Доступно постановщику.
// task — редактируем существующую; objectId — создаём новую на этом объекте.
export function TaskFormModal({
  task,
  objectId,
  onClose,
  onSaved,
}: {
  task?: TaskWithRefs;
  objectId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const executors = useLoad(listExecutors, []);
  const objects = useLoad(listObjects, []);

  const [title, setTitle] = useState(task?.title ?? '');
  const [description, setDescription] = useState(task?.description ?? '');
  const [object, setObject] = useState<string | null>(task?.object_id ?? objectId ?? null);
  const [assignee, setAssignee] = useState<string | null>(task?.assignee_id ?? null);
  const [saving, setSaving] = useState(false);

  const valid = title.trim() !== '' && object !== null && assignee !== null;
  const loadError = executors.error ?? objects.error;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    const input = { title: title.trim(), description: description.trim(), object_id: object, assignee_id: assignee };
    try {
      if (task) await updateTask(task.id, input);
      else await createTask(input);
      notifyOk(task ? 'Задача сохранена' : 'Задача создана');
      onSaved();
      onClose();
    } catch (err) {
      notifyError(err);
      setSaving(false);
    }
  }

  return (
    <Modal opened onClose={onClose} title={task ? 'Редактирование задачи' : 'Новая задача'} size="lg">
      {loadError ? (
        <Alert color="red">{loadError}</Alert>
      ) : executors.data === null || objects.data === null ? (
        <Loader />
      ) : (
        <form onSubmit={submit}>
          <Stack>
            <TextInput label="Название" required value={title} onChange={(e) => setTitle(e.currentTarget.value)} data-autofocus />
            <Textarea
              label="Описание"
              autosize
              minRows={3}
              value={description}
              onChange={(e) => setDescription(e.currentTarget.value)}
            />
            <Select
              label="Объект"
              required
              data={objects.data.map((o) => ({ value: o.id, label: o.name }))}
              value={object}
              onChange={setObject}
              allowDeselect={false}
            />
            <Select
              label="Исполнитель"
              required
              placeholder="Выберите исполнителя"
              data={executors.data.map((p) => ({ value: p.id, label: p.full_name }))}
              value={assignee}
              onChange={setAssignee}
              allowDeselect={false}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={onClose} disabled={saving}>
                Отмена
              </Button>
              <Button type="submit" loading={saving} disabled={!valid}>
                Сохранить
              </Button>
            </Group>
          </Stack>
        </form>
      )}
    </Modal>
  );
}
