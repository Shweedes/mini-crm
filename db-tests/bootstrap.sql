-- Имитация того, что Supabase создаёт в базе сам: роли API, схема auth,
-- auth.users и auth.uid(). Нужна только для локальных тестов.
-- (в самом Supabase этот файл НЕ применяется)

create role anon          nologin;
create role authenticated nologin;
create role service_role  nologin bypassrls;

create schema auth;
create table auth.users (
  id    uuid primary key default gen_random_uuid(),
  email text unique
);

-- auth.uid() в Supabase читает id пользователя из JWT, который PostgREST
-- кладёт в настройку request.jwt.claims. Здесь она ставится тестом.
create function auth.uid() returns uuid
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth   to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- Это поведение Supabase при включённой галочке «Automatically expose new tables»:
-- новые таблицы и функции сразу доступны ролям API. Наши миграции должны
-- закрыть лишнее сами, поэтому проверяем их в «худших» условиях.
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
