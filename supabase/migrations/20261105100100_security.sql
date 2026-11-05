-- =====================================================================
-- 2. Безопасность: права на таблицы и политики RLS
--
-- Два независимых слоя:
--   1) GRANT — какие таблицы и КОЛОНКИ роль authenticated вообще может трогать;
--   2) RLS-политики — какие СТРОКИ она при этом видит и меняет.
-- Роль anon (запрос без входа) не получает ничего.
-- =====================================================================

-- Вспомогательная функция для политик: «текущий пользователь — постановщик?».
-- security definer: читает profiles с правами владельца, иначе политика
-- на profiles зациклилась бы сама на себя.
-- search_path = '' — защита от подмены объектов, все имена пишем с схемой.
create or replace function public.is_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'manager'
  );
$$;

revoke all on function public.is_manager() from public, anon;
grant execute on function public.is_manager() to authenticated;

-- RLS включаем на всех таблицах. Таблица с включённым RLS и без политик
-- для операции — это «запрещено».
alter table public.profiles         enable row level security;
alter table public.objects          enable row level security;
alter table public.tasks            enable row level security;
alter table public.task_transitions enable row level security;
alter table public.task_history     enable row level security;

-- Сначала забираем всё, потом выдаём только нужное.
revoke all on public.profiles, public.objects, public.tasks,
              public.task_transitions, public.task_history
  from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- profiles: читать можно, менять через API нельзя (в том числе свою роль).
-- Профили создаёт администратор в базе (seed.sql / SQL Editor).
-- ---------------------------------------------------------------------
grant select on public.profiles to authenticated;

create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = (select auth.uid())      -- свой профиль
    or role = 'manager'           -- постановщиков видят все (кто поставил / принял задачу)
    or public.is_manager()        -- постановщик видит всех, чтобы назначать исполнителей
  );

-- ---------------------------------------------------------------------
-- objects: постановщик — полный доступ; исполнитель — только чтение
-- объектов, в которых у него есть задачи.
-- ---------------------------------------------------------------------
grant select on public.objects to authenticated;
grant insert (name, address) on public.objects to authenticated;
grant update (name, address) on public.objects to authenticated;
grant delete on public.objects to authenticated;

create policy objects_select_manager on public.objects
  for select to authenticated
  using (public.is_manager());

create policy objects_select_executor on public.objects
  for select to authenticated
  using (exists (
    select 1 from public.tasks t
    where t.object_id = objects.id and t.assignee_id = (select auth.uid())
  ));

create policy objects_insert on public.objects
  for insert to authenticated
  with check (public.is_manager());

create policy objects_update on public.objects
  for update to authenticated
  using (public.is_manager())
  with check (public.is_manager());

create policy objects_delete on public.objects
  for delete to authenticated
  using (public.is_manager());

-- ---------------------------------------------------------------------
-- tasks
--  * читать: постановщик — все, исполнитель — только назначенные ему;
--  * создавать/удалять/редактировать поля: только постановщик;
--  * СТАТУС напрямую менять не может НИКТО: на колонку status нет права
--    UPDATE/INSERT, статус меняется только функцией change_task_status().
--    Так же закрыты author_id и created_at.
-- ---------------------------------------------------------------------
grant select on public.tasks to authenticated;
grant insert (title, description, object_id, assignee_id) on public.tasks to authenticated;
grant update (title, description, object_id, assignee_id) on public.tasks to authenticated;
grant delete on public.tasks to authenticated;

create policy tasks_select on public.tasks
  for select to authenticated
  using (public.is_manager() or assignee_id = (select auth.uid()));

create policy tasks_insert on public.tasks
  for insert to authenticated
  with check (
    public.is_manager()
    and author_id = (select auth.uid())
    and status = 'new'
  );

create policy tasks_update on public.tasks
  for update to authenticated
  using (public.is_manager())
  with check (public.is_manager());

create policy tasks_delete on public.tasks
  for delete to authenticated
  using (public.is_manager());

-- ---------------------------------------------------------------------
-- task_transitions: справочник, только чтение (интерфейс по нему решает,
-- какие кнопки показывать). Изменить его через API нельзя.
-- ---------------------------------------------------------------------
grant select on public.task_transitions to authenticated;

create policy task_transitions_select on public.task_transitions
  for select to authenticated
  using (true);

-- ---------------------------------------------------------------------
-- task_history: ТОЛЬКО чтение. Нет ни прав, ни политик на INSERT, UPDATE,
-- DELETE — для всех ролей, включая постановщика. Записи добавляют функции
-- базы (security definer), удаляются они только каскадом вместе с задачей.
-- ---------------------------------------------------------------------
grant select on public.task_history to authenticated;

create policy task_history_select on public.task_history
  for select to authenticated
  using (
    public.is_manager()
    or exists (
      select 1 from public.tasks t
      where t.id = task_history.task_id and t.assignee_id = (select auth.uid())
    )
  );
