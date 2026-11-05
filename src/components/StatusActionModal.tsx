import { useState, type FormEvent } from 'react';
import { Button, Group, Modal, Stack, Text, Textarea } from '@mantine/core';
import { changeTaskStatus } from '../lib/api';
import { notifyError, notifyOk } from '../lib/hooks';
import { actionLabel, STATUS_LABEL } from '../lib/labels';
import type { TaskWithRefs, Transition } from '../lib/types';

// Подтверждение смены статуса с комментарием.
// Если переход требует комментарий, кнопка неактивна, пока он не введён.
// Это только удобство: окончательно комментарий проверяет база.
export function StatusActionModal({
  task,
  transition,
  onClose,
  onDone,
}: {
  task: TaskWithRefs;
  transition: Transition;
  onClose: () => void;
  onDone: () => void;
}) {
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const required = transition.comment_required;
  const valid = !required || comment.trim() !== '';

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    try {
      await changeTaskStatus(task.id, transition.to_status, comment);
      notifyOk(`Статус изменён: ${STATUS_LABEL[transition.to_status]}`);
      onDone();
      onClose();
    } catch (err) {
      notifyError(err);
      setSaving(false);
    }
  }

  return (
    <Modal opened onClose={onClose} title={actionLabel(transition)}>
      <form onSubmit={submit}>
        <Stack>
          <Text size="sm" c="dimmed">
            {STATUS_LABEL[transition.from_status]} → {STATUS_LABEL[transition.to_status]}
          </Text>
          <Textarea
            label={required ? 'Комментарий (обязателен)' : 'Комментарий (необязательно)'}
            required={required}
            autosize
            minRows={3}
            maxLength={2000}
            value={comment}
            onChange={(e) => setComment(e.currentTarget.value)}
            data-autofocus
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose} disabled={saving}>
              Отмена
            </Button>
            <Button type="submit" loading={saving} disabled={!valid}>
              {actionLabel(transition)}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
