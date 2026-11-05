import { Button, Group, Modal, Text } from '@mantine/core';

export function ConfirmModal({
  title,
  text,
  confirmLabel = 'Удалить',
  loading,
  onConfirm,
  onClose,
}: {
  title: string;
  text: string;
  confirmLabel?: string;
  loading: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal opened onClose={onClose} title={title}>
      <Text size="sm">{text}</Text>
      <Group justify="flex-end" mt="lg">
        <Button variant="default" onClick={onClose} disabled={loading}>
          Отмена
        </Button>
        <Button color="red" onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </Group>
    </Modal>
  );
}
