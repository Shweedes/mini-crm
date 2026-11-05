import type { Role, TaskStatus, Transition } from './types';

export const STATUS_LABEL: Record<TaskStatus, string> = {
  new: 'Новая',
  in_progress: 'В работе',
  in_review: 'На проверке',
  accepted: 'Принята',
  needs_rework: 'На доработке',
};

export const STATUS_COLOR: Record<TaskStatus, string> = {
  new: 'gray',
  in_progress: 'blue',
  in_review: 'violet',
  accepted: 'green',
  needs_rework: 'orange',
};

export const STATUS_ORDER: TaskStatus[] = ['new', 'in_progress', 'in_review', 'needs_rework', 'accepted'];

export const ROLE_LABEL: Record<Role, string> = {
  manager: 'Постановщик',
  executor: 'Исполнитель',
};

// Подписи кнопок для каждого перехода.
const ACTION_LABEL: Record<string, string> = {
  'new>in_progress': 'Взять в работу',
  'in_progress>in_review': 'Отправить на проверку',
  'in_review>accepted': 'Принять',
  'in_review>needs_rework': 'Вернуть на доработку',
  'needs_rework>in_progress': 'Вернуться к работе',
};

export function actionLabel(t: Pick<Transition, 'from_status' | 'to_status'>): string {
  return ACTION_LABEL[`${t.from_status}>${t.to_status}`] ?? STATUS_LABEL[t.to_status];
}

export function actionColor(to: TaskStatus): string {
  if (to === 'accepted') return 'green';
  if (to === 'needs_rework') return 'orange';
  return 'blue';
}

const dateFmt = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'short', timeStyle: 'short' });

export function fmtDate(iso: string): string {
  return dateFmt.format(new Date(iso));
}
