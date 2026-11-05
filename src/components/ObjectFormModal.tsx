import { useState, type FormEvent } from 'react';
import { Button, Group, Modal, Stack, TextInput } from '@mantine/core';
import { saveObject } from '../lib/api';
import { notifyError, notifyOk } from '../lib/hooks';
import type { ConstructionObject } from '../lib/types';

// Создание и редактирование объекта (стройки). Доступно постановщику.
export function ObjectFormModal({
  object,
  onClose,
  onSaved,
}: {
  object?: ConstructionObject;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(object?.name ?? '');
  const [address, setAddress] = useState(object?.address ?? '');
  const [saving, setSaving] = useState(false);

  const valid = name.trim() !== '' && address.trim() !== '';

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    try {
      await saveObject({ name: name.trim(), address: address.trim() }, object?.id);
      notifyOk(object ? 'Объект сохранён' : 'Объект создан');
      onSaved();
      onClose();
    } catch (err) {
      notifyError(err);
      setSaving(false);
    }
  }

  return (
    <Modal opened onClose={onClose} title={object ? 'Редактирование объекта' : 'Новый объект'}>
      <form onSubmit={submit}>
        <Stack>
          <TextInput label="Название" required value={name} onChange={(e) => setName(e.currentTarget.value)} data-autofocus />
          <TextInput label="Адрес" required value={address} onChange={(e) => setAddress(e.currentTarget.value)} />
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
    </Modal>
  );
}
