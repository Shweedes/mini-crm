# Мини-CRM «Объекты и задачи»

Небольшая CRM для строительной компании: постановщик ставит задачи по объектам (стройкам), исполнители берут их в работу и отправляют на проверку, каждая смена статуса сохраняется в историю.

**Стек:** React 19 + TypeScript + Vite, Mantine (UI), React Router, Supabase (Postgres + Auth), деплой на GitHub Pages.

**Ключевая идея:** все правила доступа и переходов статусов живут в базе (RLS-политики, права на колонки, функция `change_task_status`), а не в интерфейсе. Интерфейс только показывает то, что база разрешает. Подробнее: [объяснение для руководителя](docs/explanation-for-manager.md) и [решения и допущения](docs/decisions-and-assumptions.md).

## Как запустить

### 1. База (Supabase)

1. Создайте проект на [supabase.com](https://supabase.com) (бесплатного тарифа достаточно).
2. **Authentication → Sign In / Providers**: выключите **Allow new users to sign up**.
3. **SQL Editor**: по очереди выполните файлы из `supabase/migrations/` (по имени, от меньшего к большему). Либо через [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started): `supabase link` и `supabase db push`.
4. **Authentication → Users → Add user → Create new user** (с галочкой *Auto Confirm User*) создайте три учётные записи:
   `manager@example.com` (постановщик), `executor1@example.com` и `executor2@example.com` (исполнители).
5. **SQL Editor**: выполните `supabase/seed.sql`. Он создаст профили с ролями, 3 объекта и 7 задач в разных статусах. Скрипт безопасно запускать повторно.

### 2. Фронтенд локально

```bash
cp .env.example .env.local   # впишите Project URL и publishable key (Project Settings → API Keys)
npm install
npm run dev                  # http://localhost:5173
```

Во фронтенд попадают **только** `VITE_SUPABASE_URL` и публичный `VITE_SUPABASE_PUBLISHABLE_KEY`. Секретный ключ (`sb_secret_…` / `service_role`) нигде не используется.

### 3. Деплой (GitHub Pages)

Сайт собирается и публикуется автоматически при каждом пуше в `main` (workflow `.github/workflows/deploy.yml`). Один раз включите: репозиторий → **Settings → Pages → Build and deployment → Source: GitHub Actions**. После пуша ход сборки виден на вкладке **Actions**, а сайт будет доступен по адресу `https://<логин>.github.io/<репозиторий>/`.

Публичные `VITE_SUPABASE_URL` и `VITE_SUPABASE_PUBLISHABLE_KEY` заданы в workflow, для другого проекта Supabase замените их там. Маршрутизация сделана через `HashRouter` (адреса вида `/#/tasks/…`), поэтому прямые ссылки и обновление страницы работают на любом статическом хостинге (Netlify, Vercel, Cloudflare Pages) без настроек сервера.

Бесплатный проект Supabase засыпает через 7 дней без активности. Если приложение не отвечает, нажмите *Restore project* в панели Supabase.

## Тесты и проверка защиты

```bash
npm run test:db       # 36 тестов базы на локальном Postgres (PGlite), облако не нужно
npm run build         # проверка типов + сборка
```

Проверка **живой** базы напрямую, в обход интерфейса (скрипт пытается сделать всё запрещённое под тремя тестовыми пользователями и временно создаёт одну задачу, которую в конце удаляет):

```bash
MANAGER_PASSWORD='…' EXECUTOR1_PASSWORD='…' EXECUTOR2_PASSWORD='…' \
  node --env-file=.env.local scripts/verify-live.mjs
```

## Структура

```
supabase/migrations/   схема, права и RLS, цикл статусов (SQL, по порядку)
supabase/seed.sql      тестовые данные
db-tests/              автотесты базы: роли, RLS, все 75 комбинаций переходов
scripts/verify-live.mjs  проверка защиты на живой базе
src/lib/               клиент Supabase, API-слой, авторизация, типы
src/pages/, components/  экраны и формы
docs/                  объяснение для руководителя, решения и допущения
```

## Как устроена защита

| Что | Как закрыто |
|---|---|
| Чужие задачи, объекты, история | RLS-политики: исполнитель видит только строки, связанные с его задачами |
| Запись в таблицы | Права выданы по колонкам: на `tasks.status`, `author_id`, `created_at` нет права записи ни у кого |
| Смена статуса | Только функция `change_task_status`: проверяет роль, назначенного исполнителя, допустимый переход (таблица `task_transitions`) и обязательный комментарий |
| История | Для клиентов только чтение; записи добавляет сама функция |
| Регистрация | Отключена; профиль с ролью создаёт администратор |
| Секреты | Во фронтенде только publishable key |
