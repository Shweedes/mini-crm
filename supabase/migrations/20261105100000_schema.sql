-- =====================================================================
-- 1. Схема: роли, статусы, таблицы
-- Здесь только структура данных. Права доступа (RLS) — в следующей миграции.
-- =====================================================================

-- Две роли и пять статусов задачи.
-- В базе хранятся английские коды, русские названия подставляет интерфейс.
create type public.user_role as enum ('manager', 'executor');   -- постановщик, исполнитель
create type public.task_status as enum (
  'new',           -- Новая
  'in_progress',   -- В работе
  'in_review',     -- На проверке
  'accepted',      -- Принята
  'needs_rework'   -- На доработке
);

-- Профиль пользователя: к учётной записи Supabase Auth (auth.users)
-- добавляем имя и роль. Роль нельзя поменять через API (см. миграцию 2).
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  full_name  text not null check (length(btrim(full_name)) > 0),
  role       public.user_role not null,
  created_at timestamptz not null default now()
);

-- Объект — это стройка.
create table public.objects (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) > 0),
  address    text not null check (length(btrim(address)) > 0),
  created_at timestamptz not null default now()
);

-- Задача по объекту.
-- author_id по умолчанию = текущий пользователь (auth.uid()), поэтому клиент
-- не передаёт автора сам и не может подставить чужого.
create table public.tasks (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(btrim(title)) > 0),
  description text not null default '',
  object_id   uuid not null references public.objects (id) on delete cascade,
  assignee_id uuid not null references public.profiles (id),
  author_id   uuid not null default auth.uid() references public.profiles (id),
  status      public.task_status not null default 'new',
  created_at  timestamptz not null default now()
);
create index tasks_object_id_idx   on public.tasks (object_id);
create index tasks_assignee_id_idx on public.tasks (assignee_id);

-- Справочник разрешённых переходов статусов. Это таблица 2.3 из ТЗ «как есть»:
-- кто (actor_role) может перевести задачу из from_status в to_status
-- и обязателен ли комментарий. Всё, чего здесь нет, запрещено.
-- Данные заполняются в миграции 3, клиентам таблица доступна только на чтение.
create table public.task_transitions (
  from_status      public.task_status not null,
  to_status        public.task_status not null,
  actor_role       public.user_role   not null,
  comment_required boolean            not null default false,
  primary key (from_status, to_status)
);

-- История смен статуса. Только добавление: клиентам запись закрыта полностью,
-- строки появляются исключительно из функций базы (см. миграцию 3).
-- from_status = null означает создание задачи («— → Новая»).
create table public.task_history (
  id          bigint generated always as identity primary key,
  task_id     uuid not null references public.tasks (id) on delete cascade,
  from_status public.task_status,
  to_status   public.task_status not null,
  changed_by  uuid not null references public.profiles (id),
  comment     text check (comment is null or length(comment) <= 2000),
  -- clock_timestamp(), а не now(): внутри одной транзакции события
  -- получают разное время и сортируются в правильном порядке.
  created_at  timestamptz not null default clock_timestamp()
);
create index task_history_task_id_idx on public.task_history (task_id, id);
