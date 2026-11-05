// Типы данных. Совпадают со структурой таблиц из supabase/migrations.

export type Role = 'manager' | 'executor';

export type TaskStatus = 'new' | 'in_progress' | 'in_review' | 'accepted' | 'needs_rework';

export interface Profile {
  id: string;
  full_name: string;
  role: Role;
}

export interface ConstructionObject {
  id: string;
  name: string;
  address: string;
  created_at: string;
}

export interface ObjectWithCount extends ConstructionObject {
  tasks: { count: number }[];
}

export interface Task {
  id: string;
  title: string;
  description: string;
  object_id: string;
  assignee_id: string;
  author_id: string;
  status: TaskStatus;
  created_at: string;
}

// Задача вместе со связанными записями (имя исполнителя, название объекта).
// Связанная запись может оказаться null, если RLS её не показывает.
export interface TaskWithRefs extends Task {
  object: { id: string; name: string; address: string } | null;
  assignee: { id: string; full_name: string } | null;
  author: { id: string; full_name: string } | null;
}

export interface HistoryItem {
  id: number;
  from_status: TaskStatus | null;
  to_status: TaskStatus;
  comment: string | null;
  created_at: string;
  changed_by: string;
  changer: { full_name: string } | null;
}

// Строка справочника task_transitions: кто и куда может перевести задачу.
export interface Transition {
  from_status: TaskStatus;
  to_status: TaskStatus;
  actor_role: Role;
  comment_required: boolean;
}

export interface TaskInput {
  title: string;
  description: string;
  object_id: string;
  assignee_id: string;
}
