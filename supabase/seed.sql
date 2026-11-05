-- =====================================================================
-- Тестовые данные: профили, 3 объекта, задачи в разных статусах.
--
-- ПЕРЕД запуском создайте трёх пользователей вручную:
--   Supabase → Authentication → Users → Add user → Create new user
--   (поставьте «Auto Confirm User»):
--     manager@example.com     — постановщик
--     executor1@example.com   — исполнитель
--     executor2@example.com   — исполнитель
--
-- Задачи проходят свои статусы через настоящую функцию change_task_status
-- «от имени» нужных пользователей, поэтому история получается честной.
-- Скрипт можно запускать повторно: если объекты уже есть, он ничего не делает.
-- =====================================================================
do $$
declare
  v_m  uuid;  -- постановщик
  v_e1 uuid;  -- исполнитель 1
  v_e2 uuid;  -- исполнитель 2
  o1 uuid; o2 uuid; o3 uuid;
  t  uuid;
begin
  select id into v_m  from auth.users where email = 'manager@example.com';
  select id into v_e1 from auth.users where email = 'executor1@example.com';
  select id into v_e2 from auth.users where email = 'executor2@example.com';

  if v_m is null or v_e1 is null or v_e2 is null then
    raise exception 'Сначала создайте пользователей manager@example.com, executor1@example.com и executor2@example.com (Authentication → Users)';
  end if;

  if exists (select 1 from public.objects) then
    raise notice 'Тестовые данные уже загружены, пропускаю';
    return;
  end if;

  insert into public.profiles (id, full_name, role) values
    (v_m,  'Анна Кузнецова',  'manager'),
    (v_e1, 'Пётр Смирнов',    'executor'),
    (v_e2, 'Дмитрий Орлов',   'executor')
  on conflict (id) do nothing;

  -- Дальше «входим» как нужный пользователь: auth.uid() берётся из этой настройки,
  -- точно так же, как из токена при обычном запросе.

  -- ---- Постановщик создаёт объекты и задачи ----
  perform set_config('request.jwt.claims', json_build_object('sub', v_m)::text, true);

  insert into public.objects (name, address) values
    ('ЖК «Северный», корпус 2', 'г. Минск, пр-т Победителей, 100') returning id into o1;
  insert into public.objects (name, address) values
    ('Складской комплекс «Логистик-Парк»', 'Минская обл., Логойский тракт, 15 км') returning id into o2;
  insert into public.objects (name, address) values
    ('Офисный центр «Нива»', 'г. Гродно, ул. Советская, 12') returning id into o3;

  -- Задача 1: пройдёт весь путь до «Принята»
  insert into public.tasks (title, description, object_id, assignee_id) values
    ('Залить фундамент секции Б', 'Бетон М300, контроль влажности, акт приёмки.', o1, v_e1) returning id into t;
  perform set_config('request.jwt.claims', json_build_object('sub', v_e1)::text, true);
  perform public.change_task_status(t, 'in_progress');
  perform public.change_task_status(t, 'in_review', 'Залито, фото в общем чате');
  perform set_config('request.jwt.claims', json_build_object('sub', v_m)::text, true);
  perform public.change_task_status(t, 'accepted');

  -- Задача 2: вернули на доработку
  insert into public.tasks (title, description, object_id, assignee_id) values
    ('Проверить армирование перекрытия 3 этажа', 'Сверить с проектом, шаг арматуры 200 мм.', o1, v_e1) returning id into t;
  perform set_config('request.jwt.claims', json_build_object('sub', v_e1)::text, true);
  perform public.change_task_status(t, 'in_progress');
  perform public.change_task_status(t, 'in_review');
  perform set_config('request.jwt.claims', json_build_object('sub', v_m)::text, true);
  perform public.change_task_status(t, 'needs_rework', 'Нет фото узлов крепления, приложите и отправьте снова');

  -- Задача 3: новая, у второго исполнителя на том же объекте
  insert into public.tasks (title, description, object_id, assignee_id) values
    ('Заказать бетон М300 на следующую неделю', 'Объём 45 м³, поставка со вторника.', o1, v_e2);

  -- Задача 4: в работе
  insert into public.tasks (title, description, object_id, assignee_id) values
    ('Монтаж ворот №3', 'Секционные ворота 4×4 м, установка привода.', o2, v_e2) returning id into t;
  perform set_config('request.jwt.claims', json_build_object('sub', v_e2)::text, true);
  perform public.change_task_status(t, 'in_progress');

  -- Задача 5: на проверке
  perform set_config('request.jwt.claims', json_build_object('sub', v_m)::text, true);
  insert into public.tasks (title, description, object_id, assignee_id) values
    ('Составить акт скрытых работ', 'По фундаменту и гидроизоляции.', o2, v_e2) returning id into t;
  perform set_config('request.jwt.claims', json_build_object('sub', v_e2)::text, true);
  perform public.change_task_status(t, 'in_progress');
  perform public.change_task_status(t, 'in_review', 'Акт готов, жду проверки');

  -- Задача 6: новая
  perform set_config('request.jwt.claims', json_build_object('sub', v_m)::text, true);
  insert into public.tasks (title, description, object_id, assignee_id) values
    ('Согласовать смету по электрике', 'Три коммерческих предложения, выбрать подрядчика.', o3, v_e1);

  -- Задача 7: в работе
  insert into public.tasks (title, description, object_id, assignee_id) values
    ('Замеры кровли', 'Площадь, уклоны, состояние парапета.', o3, v_e1) returning id into t;
  perform set_config('request.jwt.claims', json_build_object('sub', v_e1)::text, true);
  perform public.change_task_status(t, 'in_progress');
end;
$$;
