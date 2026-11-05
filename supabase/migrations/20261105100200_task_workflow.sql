-- =====================================================================
-- 3. Цикл статусов: правила переходов, история, функция смены статуса
-- =====================================================================

-- Таблица 2.3 из ТЗ. Создание задачи («— → Новая») здесь не нужно,
-- его делает постановщик через INSERT (см. политику tasks_insert).
insert into public.task_transitions (from_status, to_status, actor_role, comment_required) values
  ('new',          'in_progress',  'executor', false),
  ('in_progress',  'in_review',    'executor', false),
  ('in_review',    'accepted',     'manager',  false),
  ('in_review',    'needs_rework', 'manager',  true),   -- комментарий обязателен
  ('needs_rework', 'in_progress',  'executor', false);

-- ---------------------------------------------------------------------
-- Исполнителем можно назначить только пользователя с ролью executor.
-- ---------------------------------------------------------------------
create or replace function public.tasks_check_assignee()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.profiles
    where id = new.assignee_id and role = 'executor'
  ) then
    raise exception 'Исполнителем можно назначить только пользователя с ролью «исполнитель»'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger tasks_check_assignee
  before insert or update of assignee_id on public.tasks
  for each row execute function public.tasks_check_assignee();

-- ---------------------------------------------------------------------
-- Создание задачи сразу попадает в историю: «— → Новая», автор — постановщик.
-- ---------------------------------------------------------------------
create or replace function public.tasks_log_creation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.task_history (task_id, from_status, to_status, changed_by)
  values (new.id, null, new.status, new.author_id);
  return new;
end;
$$;

create trigger tasks_log_creation
  after insert on public.tasks
  for each row execute function public.tasks_log_creation();

-- Триггерные функции вызывает только сама база, клиентам они не нужны.
revoke all on function public.tasks_check_assignee() from public, anon, authenticated;
revoke all on function public.tasks_log_creation()   from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- change_task_status — ЕДИНСТВЕННЫЙ способ сменить статус.
-- Фронтенд вызывает её через supabase.rpc('change_task_status', {...}).
-- Все проверки здесь, в базе, поэтому ручной запрос в обход интерфейса
-- получит тот же отказ.
--
-- security definer: функция работает с правами владельца и может писать
-- в tasks.status и task_history, куда у клиента прав нет. Именно поэтому она
-- САМА проверяет, кто её вызвал (auth.uid()), а не доверяет аргументам.
-- ---------------------------------------------------------------------
create or replace function public.change_task_status(
  p_task_id    uuid,
  p_new_status public.task_status,
  p_comment    text default null
)
returns public.tasks
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := auth.uid();
  v_role    public.user_role;
  v_task    public.tasks;
  v_rule    public.task_transitions;
  v_old     public.task_status;
  -- btrim() без второго аргумента срезает только пробелы, поэтому перечисляем
  -- ещё табуляцию и переводы строки: комментарий из одних пробельных символов
  -- считается пустым.
  v_comment text := nullif(btrim(p_comment, E' \t\r\n'), '');
begin
  -- 1. Кто вызывает. Без входа или без профиля — отказ.
  if v_uid is null then
    raise exception 'Требуется вход в систему' using errcode = '28000';
  end if;

  select role into v_role from public.profiles where id = v_uid;
  if v_role is null then
    raise exception 'Профиль пользователя не найден' using errcode = '42501';
  end if;

  -- 2. Задача. for update блокирует строку, чтобы два одновременных запроса
  -- не провели два перехода подряд из одного статуса.
  -- Исполнитель чужой задачи получает то же «не найдена», что и при
  -- несуществующем id: наличие чужих задач не раскрываем.
  select * into v_task from public.tasks where id = p_task_id for update;
  if not found or (v_role = 'executor' and v_task.assignee_id <> v_uid) then
    raise exception 'Задача не найдена' using errcode = 'P0002';
  end if;

  -- 3. Есть ли такой переход вообще.
  select * into v_rule
  from public.task_transitions
  where from_status = v_task.status and to_status = p_new_status;

  if not found then
    raise exception 'Переход из «%» в «%» запрещён', v_task.status, p_new_status
      using errcode = '22023';
  end if;

  -- 4. Имеет ли право на него эта роль. Для исполнителя «назначенный»
  -- уже проверено в шаге 2.
  if v_rule.actor_role <> v_role then
    raise exception 'Недостаточно прав для этого перехода' using errcode = '42501';
  end if;

  -- 5. Комментарий, если обязателен (пробелы не считаются).
  if v_rule.comment_required and v_comment is null then
    raise exception 'Для этого перехода нужен комментарий' using errcode = '22023';
  end if;

  -- 6. Меняем статус и пишем историю в одной транзакции.
  v_old := v_task.status;

  update public.tasks set status = p_new_status
  where id = p_task_id
  returning * into v_task;

  insert into public.task_history (task_id, from_status, to_status, changed_by, comment)
  values (p_task_id, v_old, p_new_status, v_uid, v_comment);

  return v_task;
end;
$$;

revoke all on function public.change_task_status(uuid, public.task_status, text) from public, anon;
grant execute on function public.change_task_status(uuid, public.task_status, text) to authenticated;
