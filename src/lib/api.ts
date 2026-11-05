// Все обращения к Supabase собраны здесь, чтобы экраны не знали про SQL и RLS.
// Что пользователю можно, а что нельзя, решает база; здесь мы лишь аккуратно
// превращаем её ответы в понятные ошибки.
import { supabase } from './supabase';
import type {
  ConstructionObject,
  HistoryItem,
  ObjectWithCount,
  Profile,
  TaskInput,
  TaskStatus,
  TaskWithRefs,
  Transition,
} from './types';

interface DbError {
  message: string;
  code?: string;
}

function toError(e: DbError): Error {
  // Наши собственные сообщения из функции change_task_status написаны по-русски.
  if (/[А-Яа-яЁё]/.test(e.message)) return new Error(e.message);
  if (e.code === '42501') return new Error('Недостаточно прав для этого действия');
  return new Error(e.message);
}

function unwrap<T>(res: { data: unknown; error: DbError | null }): T {
  if (res.error) throw toError(res.error);
  return res.data as T;
}

const TASK_SELECT = `
  id, title, description, object_id, assignee_id, author_id, status, created_at,
  object:objects(id, name, address),
  assignee:profiles!tasks_assignee_id_fkey(id, full_name),
  author:profiles!tasks_author_id_fkey(id, full_name)
`;

// ---------- объекты ----------

export async function listObjects(): Promise<ObjectWithCount[]> {
  const res = await supabase
    .from('objects')
    .select('id, name, address, created_at, tasks(count)')
    .order('name');
  return unwrap<ObjectWithCount[]>(res);
}

export async function getObject(id: string): Promise<ConstructionObject | null> {
  const res = await supabase.from('objects').select('id, name, address, created_at').eq('id', id).maybeSingle();
  return unwrap<ConstructionObject | null>(res);
}

export async function saveObject(input: { name: string; address: string }, id?: string): Promise<void> {
  if (id) {
    const res = await supabase.from('objects').update(input).eq('id', id).select('id');
    if (unwrap<unknown[]>(res).length === 0) throw new Error('Не удалось сохранить: объект недоступен');
  } else {
    unwrap(await supabase.from('objects').insert(input));
  }
}

export async function deleteObject(id: string): Promise<void> {
  const res = await supabase.from('objects').delete().eq('id', id).select('id');
  if (unwrap<unknown[]>(res).length === 0) throw new Error('Не удалось удалить: объект недоступен');
}

// ---------- задачи ----------

export async function listTasksByObject(objectId: string): Promise<TaskWithRefs[]> {
  const res = await supabase
    .from('tasks')
    .select(TASK_SELECT)
    .eq('object_id', objectId)
    .order('created_at', { ascending: false });
  return unwrap<TaskWithRefs[]>(res);
}

export async function listMyTasks(userId: string): Promise<TaskWithRefs[]> {
  // Фильтр по assignee_id тут для читаемости: чужих задач исполнитель не получил бы и без него.
  const res = await supabase
    .from('tasks')
    .select(TASK_SELECT)
    .eq('assignee_id', userId)
    .order('created_at', { ascending: false });
  return unwrap<TaskWithRefs[]>(res);
}

export async function getTask(id: string): Promise<TaskWithRefs | null> {
  const res = await supabase.from('tasks').select(TASK_SELECT).eq('id', id).maybeSingle();
  return unwrap<TaskWithRefs | null>(res);
}

export async function createTask(input: TaskInput): Promise<void> {
  // author_id, status и created_at не передаём: их ставит база (и клиент не имеет права их задавать).
  unwrap(await supabase.from('tasks').insert(input));
}

export async function updateTask(id: string, input: TaskInput): Promise<void> {
  const res = await supabase.from('tasks').update(input).eq('id', id).select('id');
  if (unwrap<unknown[]>(res).length === 0) throw new Error('Не удалось сохранить: задача недоступна');
}

export async function deleteTask(id: string): Promise<void> {
  const res = await supabase.from('tasks').delete().eq('id', id).select('id');
  if (unwrap<unknown[]>(res).length === 0) throw new Error('Не удалось удалить: задача недоступна');
}

// Единственный способ сменить статус: все проверки выполняет функция в базе.
export async function changeTaskStatus(taskId: string, status: TaskStatus, comment: string): Promise<void> {
  unwrap(
    await supabase.rpc('change_task_status', {
      p_task_id: taskId,
      p_new_status: status,
      p_comment: comment.trim() === '' ? null : comment,
    }),
  );
}

export async function listHistory(taskId: string): Promise<HistoryItem[]> {
  const res = await supabase
    .from('task_history')
    .select('id, from_status, to_status, comment, created_at, changed_by, changer:profiles!task_history_changed_by_fkey(full_name)')
    .eq('task_id', taskId)
    .order('id');
  return unwrap<HistoryItem[]>(res);
}

export async function listTransitions(): Promise<Transition[]> {
  const res = await supabase.from('task_transitions').select('from_status, to_status, actor_role, comment_required');
  return unwrap<Transition[]>(res);
}

// ---------- пользователи ----------

export async function listExecutors(): Promise<Profile[]> {
  const res = await supabase.from('profiles').select('id, full_name, role').eq('role', 'executor').order('full_name');
  return unwrap<Profile[]>(res);
}
