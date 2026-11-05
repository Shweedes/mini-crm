// Проверка безопасности и логики статусов на реальном Postgres (PGlite).
// Каждый тест «входит» как нужный пользователь (роль authenticated + id в JWT)
// и пробует сделать то, что мог бы сделать злоумышленник через API в обход
// интерфейса. Каждый тест работает в транзакции, которая откатывается.
//
// Запуск: cd db-tests && npm install && npm test
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';

const here = new URL('.', import.meta.url);
const read = (rel) => readFileSync(new URL(rel, here), 'utf8');

const db = new PGlite();

// m — постановщик, e1/e2 — исполнители, m2 — второй постановщик,
// orphan — пользователь Auth без профиля (роли нет).
const EMAILS = {
  m: 'manager@example.com',
  e1: 'executor1@example.com',
  e2: 'executor2@example.com',
  m2: 'manager2@example.com',
  orphan: 'orphan@example.com',
};
const ids = {};
const uid = (k) => ids[k];

before(async () => {
  await db.exec(read('bootstrap.sql'));
  for (const [k, email] of Object.entries(EMAILS)) {
    const { rows } = await db.query('insert into auth.users (email) values ($1) returning id', [email]);
    ids[k] = rows[0].id;
  }
  const dir = new URL('../supabase/migrations/', here);
  for (const f of readdirSync(dir).sort()) await db.exec(readFileSync(new URL(f, dir), 'utf8'));
  await db.exec(readFileSync(new URL('../supabase/seed.sql', here), 'utf8'));
  await db.query(`insert into public.profiles (id, full_name, role) values ($1, 'Второй постановщик', 'manager')`, [uid('m2')]);
});

// Транзакция «от имени» пользователя. user: ключ из EMAILS или 'anon'.
// as(k) переключает пользователя внутри транзакции, как другой запрос с другим токеном.
async function session(user, fn) {
  await db.exec('begin');
  try {
    await db.exec(`set local role ${user === 'anon' ? 'anon' : 'authenticated'}`);
    const as = (k) => db.query(`select set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: uid(k), role: 'authenticated' })]);
    if (user !== 'anon') await as(user);
    const out = await fn({ q: (sql, p) => db.query(sql, p), as });
    await db.exec('rollback');
    return out;
  } catch (e) {
    await db.exec('rollback');
    throw e;
  }
}
const run = (user, sql, params) => session(user, ({ q }) => q(sql, params));
const fails = (user, sql, params, re) => assert.rejects(run(user, sql, params), re);

const sys = async (sql, p) => (await db.query(sql, p)).rows; // от имени владельца базы, мимо RLS
const taskId = async (title) => (await sys('select id from public.tasks where title = $1', [title]))[0].id;
const T = {
  accepted: 'Залить фундамент секции Б',            // e1
  rework: 'Проверить армирование перекрытия 3 этажа', // e1
  e2new: 'Заказать бетон М300 на следующую неделю',   // e2
  e2work: 'Монтаж ворот №3',                          // e2
  e2review: 'Составить акт скрытых работ',            // e2
  e1new: 'Согласовать смету по электрике',            // e1
  e1work: 'Замеры кровли',                            // e1
};
const changeStatus = (q, id, status, comment = null) =>
  q('select public.change_task_status($1::uuid, $2::public.task_status, $3::text) as t', [id, status, comment]);

describe('seed.sql', () => {
  test('загрузил 3 объекта, 7 задач и честную историю', async () => {
    assert.equal((await sys('select count(*)::int n from public.objects'))[0].n, 3);
    assert.equal((await sys('select count(*)::int n from public.tasks'))[0].n, 7);
    const h = await sys(`select from_status, to_status from public.task_history where task_id = $1 order by id`, [await taskId(T.accepted)]);
    assert.deepEqual(h.map((r) => `${r.from_status}>${r.to_status}`),
      ['null>new', 'new>in_progress', 'in_progress>in_review', 'in_review>accepted']);
  });
});

describe('чтение: исполнитель видит только своё', () => {
  test('задачи: e1 — 4 своих, e2 — 3 своих, постановщик — все 7', async () => {
    const e1 = (await run('e1', 'select assignee_id from public.tasks')).rows;
    assert.equal(e1.length, 4);
    assert.ok(e1.every((r) => r.assignee_id === uid('e1')));
    const e2 = (await run('e2', 'select assignee_id from public.tasks')).rows;
    assert.equal(e2.length, 3);
    assert.ok(e2.every((r) => r.assignee_id === uid('e2')));
    assert.equal((await run('m', 'select 1 from public.tasks')).rows.length, 7);
  });

  test('чужую задачу не получить даже по точному id', async () => {
    const id = await taskId(T.e2work);
    assert.equal((await run('e1', 'select * from public.tasks where id = $1', [id])).rows.length, 0);
  });

  test('объекты: исполнитель видит только те, где у него есть задачи', async () => {
    const names = async (k) => (await run(k, 'select name from public.objects order by name')).rows.map((r) => r.name);
    assert.deepEqual(await names('e1'), ['ЖК «Северный», корпус 2', 'Офисный центр «Нива»']);
    assert.deepEqual(await names('e2'), ['ЖК «Северный», корпус 2', 'Складской комплекс «Логистик-Парк»']);
    assert.equal((await names('m')).length, 3);
  });

  test('на общем объекте исполнитель видит в задачах только свои', async () => {
    const r = await run('e2', `select t.title from public.tasks t join public.objects o on o.id = t.object_id where o.name like 'ЖК%'`);
    assert.deepEqual(r.rows.map((x) => x.title), [T.e2new]);
  });

  test('история: только по своим задачам', async () => {
    const own = new Set((await run('e1', 'select id from public.tasks')).rows.map((r) => r.id));
    const hist = (await run('e1', 'select task_id from public.task_history')).rows;
    assert.ok(hist.length > 0);
    assert.ok(hist.every((r) => own.has(r.task_id)));
    const foreign = await taskId(T.e2review);
    assert.equal((await run('e1', 'select 1 from public.task_history where task_id = $1', [foreign])).rows.length, 0);
  });

  test('профили: исполнитель видит себя и постановщиков, но не других исполнителей', async () => {
    const r = (await run('e1', 'select full_name, role from public.profiles')).rows;
    assert.deepEqual(r.map((x) => x.role).sort(), ['executor', 'manager', 'manager']);
    assert.ok(!r.some((x) => x.full_name === 'Дмитрий Орлов'));
    assert.equal((await run('m', 'select 1 from public.profiles')).rows.length, 4);
  });

  test('без входа (anon) нет доступа ни к одной таблице', async () => {
    for (const t of ['profiles', 'objects', 'tasks', 'task_history', 'task_transitions']) {
      await fails('anon', `select * from public.${t}`, [], /permission denied/);
    }
  });

  test('пользователь без профиля не видит ничего и ничего не может', async () => {
    assert.equal((await run('orphan', 'select 1 from public.tasks')).rows.length, 0);
    assert.equal((await run('orphan', 'select 1 from public.objects')).rows.length, 0);
    await fails('orphan', `insert into public.objects (name, address) values ('x','y')`, [], /row-level security/);
    await assert.rejects(session('orphan', ({ q }) => changeStatus(q, null, 'in_progress')), /не найден|Профиль/);
  });
});

describe('запись в обход интерфейса', () => {
  test('исполнитель не может создать задачу', async () => {
    await fails('e1',
      `insert into public.tasks (title, object_id, assignee_id) values ('x', (select id from public.objects limit 1), $1)`,
      [uid('e1')], /row-level security/);
  });

  test('исполнитель не может изменить свою задачу (0 строк)', async () => {
    const r = await run('e1', `update public.tasks set title = 'взлом' where id = $1`, [await taskId(T.e1work)]);
    assert.equal(r.affectedRows, 0);
  });

  test('исполнитель не может поставить статус напрямую', async () => {
    await fails('e1', `update public.tasks set status = 'accepted' where id = $1`, [await taskId(T.e1work)], /permission denied/);
  });

  test('даже постановщик не может поставить статус напрямую', async () => {
    await fails('m', `update public.tasks set status = 'accepted' where id = $1`, [await taskId(T.e1work)], /permission denied/);
  });

  test('постановщик не может подделать автора и дату', async () => {
    const id = await taskId(T.e1work);
    await fails('m', `update public.tasks set author_id = $2 where id = $1`, [id, uid('e1')], /permission denied/);
    await fails('m', `update public.tasks set created_at = now() where id = $1`, [id], /permission denied/);
  });

  test('исполнитель не может удалить ни задачу, ни объект (0 строк)', async () => {
    assert.equal((await run('e1', 'delete from public.tasks where id = $1', [await taskId(T.e1work)])).affectedRows, 0);
    assert.equal((await run('e1', 'delete from public.objects')).affectedRows, 0);
  });

  test('исполнитель не может создать или изменить объект', async () => {
    await fails('e1', `insert into public.objects (name, address) values ('x','y')`, [], /row-level security/);
    assert.equal((await run('e1', `update public.objects set name = 'взлом'`)).affectedRows, 0);
  });

  test('исполнитель не может повысить себя до постановщика', async () => {
    await fails('e1', `update public.profiles set role = 'manager' where id = $1`, [uid('e1')], /permission denied/);
    await fails('e1', `insert into public.profiles (id, full_name, role) values (gen_random_uuid(), 'x', 'manager')`, [], /permission denied/);
  });

  test('постановщик создаёт задачу: статус «Новая», автор — он сам, в истории есть создание', async () => {
    const r = await session('m', async ({ q }) => {
      const t = (await q(
        `insert into public.tasks (title, object_id, assignee_id) values ('новая', (select id from public.objects limit 1), $1) returning *`,
        [uid('e1')])).rows[0];
      const h = (await q('select from_status, to_status, changed_by from public.task_history where task_id = $1', [t.id])).rows;
      return { t, h };
    });
    assert.equal(r.t.status, 'new');
    assert.equal(r.t.author_id, uid('m'));
    assert.deepEqual(r.h, [{ from_status: null, to_status: 'new', changed_by: uid('m') }]);
  });

  test('при создании нельзя задать статус или чужого автора', async () => {
    const base = `insert into public.tasks (title, object_id, assignee_id, %COL%) values ('x', (select id from public.objects limit 1), $1, %VAL%)`;
    await fails('m', base.replace('%COL%', 'status').replace('%VAL%', `'accepted'`), [uid('e1')], /permission denied/);
    await fails('m', base.replace('%COL%', 'author_id').replace('%VAL%', `'${uid('m2')}'`), [uid('e1')], /permission denied/);
  });

  test('исполнителем нельзя назначить постановщика', async () => {
    await fails('m',
      `insert into public.tasks (title, object_id, assignee_id) values ('x', (select id from public.objects limit 1), $1)`,
      [uid('m2')], /только пользователя с ролью/);
    await fails('m', `update public.tasks set assignee_id = $2 where id = $1`, [await taskId(T.e1work), uid('m2')], /только пользователя с ролью/);
  });

  test('смена исполнителя: прежний исполнитель теряет доступ, новый получает', async () => {
    const id = await taskId(T.e1work);
    await session('m', async ({ q, as }) => {
      assert.equal((await q('update public.tasks set assignee_id = $2 where id = $1', [id, uid('e2')])).affectedRows, 1);
      await as('e1');
      assert.equal((await q('select 1 from public.tasks where id = $1', [id])).rows.length, 0);
      assert.equal((await q('select 1 from public.task_history where task_id = $1', [id])).rows.length, 0);
      await as('e2');
      assert.equal((await q('select 1 from public.tasks where id = $1', [id])).rows.length, 1);
    });
  });

  test('справочник переходов читается, но не меняется', async () => {
    assert.equal((await run('e1', 'select 1 from public.task_transitions')).rows.length, 5);
    await fails('e1', `insert into public.task_transitions values ('new','accepted','executor',false)`, [], /permission denied/);
    await fails('m', `update public.task_transitions set actor_role = 'executor'`, [], /permission denied/);
    await fails('m', `delete from public.task_transitions`, [], /permission denied/);
  });
});

describe('история нельзя подделать, изменить или удалить', () => {
  const id = () => taskId(T.e1work);

  test('исполнитель: INSERT / UPDATE / DELETE запрещены', async () => {
    await fails('e1', `insert into public.task_history (task_id, from_status, to_status, changed_by) values ($1,'new','accepted',$2)`, [await id(), uid('e1')], /permission denied/);
    await fails('e1', `update public.task_history set comment = 'подделка'`, [], /permission denied/);
    await fails('e1', `delete from public.task_history`, [], /permission denied/);
  });

  test('постановщик: INSERT / UPDATE / DELETE тоже запрещены', async () => {
    await fails('m', `insert into public.task_history (task_id, from_status, to_status, changed_by) values ($1,'new','accepted',$2)`, [await id(), uid('m')], /permission denied/);
    await fails('m', `update public.task_history set to_status = 'accepted'`, [], /permission denied/);
    await fails('m', `delete from public.task_history`, [], /permission denied/);
    await fails('m', `truncate public.task_history`, [], /permission denied/);
  });

  test('автора записи подделать нельзя: в функции нет параметра «кто», он берётся из токена', async () => {
    const tid = await taskId(T.e1new);
    const h = await session('e1', async ({ q }) => {
      await changeStatus(q, tid, 'in_progress');
      return (await q(`select changed_by from public.task_history where task_id = $1 order by id desc limit 1`, [tid])).rows[0];
    });
    assert.equal(h.changed_by, uid('e1'));
  });

  test('при удалении задачи постановщиком история уходит только каскадом', async () => {
    const tid = await id();
    const n = await session('m', async ({ q }) => {
      assert.ok((await q('select 1 from public.task_history where task_id = $1', [tid])).rows.length > 0);
      await q('delete from public.tasks where id = $1', [tid]);
      return (await q('select 1 from public.task_history where task_id = $1', [tid])).rows.length;
    });
    assert.equal(n, 0);
  });
});

describe('цикл статусов', () => {
  test('полный путь с доработкой и принятием другим постановщиком; история верна', async () => {
    const h = await session('m', async ({ q, as }) => {
      const t = (await q(
        `insert into public.tasks (title, object_id, assignee_id) values ('путь', (select id from public.objects limit 1), $1) returning id`,
        [uid('e1')])).rows[0].id;
      await as('e1');  await changeStatus(q, t, 'in_progress');
      await changeStatus(q, t, 'in_review', 'сделал');
      await as('m');   await changeStatus(q, t, 'needs_rework', 'нет фото');
      await as('e1');  await changeStatus(q, t, 'in_progress');
      await changeStatus(q, t, 'in_review');
      await as('m2');  await changeStatus(q, t, 'accepted');   // принять может любой постановщик
      await as('e1');  // исполнитель видит историю своей задачи
      return (await q('select from_status, to_status, changed_by, comment from public.task_history where task_id = $1 order by id', [t])).rows;
    });
    assert.deepEqual(h, [
      { from_status: null,           to_status: 'new',          changed_by: uid('m'),  comment: null },
      { from_status: 'new',          to_status: 'in_progress',  changed_by: uid('e1'), comment: null },
      { from_status: 'in_progress',  to_status: 'in_review',    changed_by: uid('e1'), comment: 'сделал' },
      { from_status: 'in_review',    to_status: 'needs_rework', changed_by: uid('m'),  comment: 'нет фото' },
      { from_status: 'needs_rework', to_status: 'in_progress',  changed_by: uid('e1'), comment: null },
      { from_status: 'in_progress',  to_status: 'in_review',    changed_by: uid('e1'), comment: null },
      { from_status: 'in_review',    to_status: 'accepted',     changed_by: uid('m2'), comment: null },
    ]);
  });

  // Главная проверка: ВСЕ 5×5 пар статусов × 3 актора (постановщик, назначенный
  // исполнитель, чужой исполнитель). Разрешены ровно 5 комбинаций из таблицы 2.3 ТЗ.
  test('матрица: разрешены ровно переходы из ТЗ, остальные 70 из 75 комбинаций запрещены', async () => {
    const STATUSES = ['new', 'in_progress', 'in_review', 'accepted', 'needs_rework'];
    const ALLOWED = new Set([
      'new>in_progress>e1', 'in_progress>in_review>e1', 'in_review>accepted>m',
      'in_review>needs_rework>m', 'needs_rework>in_progress>e1',
    ]);
    const PATH = {
      new: [],
      in_progress: [['e1', 'in_progress']],
      in_review: [['e1', 'in_progress'], ['e1', 'in_review']],
      needs_rework: [['e1', 'in_progress'], ['e1', 'in_review'], ['m', 'needs_rework', 'доработать']],
      accepted: [['e1', 'in_progress'], ['e1', 'in_review'], ['m', 'accepted']],
    };
    const mismatches = [];
    let allowedCount = 0;
    for (const from of STATUSES) for (const to of STATUSES) for (const actor of ['m', 'e1', 'e2']) {
      const expectOk = ALLOWED.has(`${from}>${to}>${actor}`);
      let ok = true;
      try {
        await session('m', async ({ q, as }) => {
          const t = (await q(
            `insert into public.tasks (title, object_id, assignee_id) values ('matrix', (select id from public.objects limit 1), $1) returning id`,
            [uid('e1')])).rows[0].id;
          for (const [who, st, c] of PATH[from]) { await as(who); await changeStatus(q, t, st, c ?? null); }
          await as(actor);
          await changeStatus(q, t, to, 'комментарий');
        });
      } catch { ok = false; }
      if (ok) allowedCount++;
      if (ok !== expectOk) mismatches.push(`${from} → ${to} by ${actor}: ожидали ${expectOk ? 'разрешён' : 'запрещён'}`);
    }
    assert.deepEqual(mismatches, []);
    assert.equal(allowedCount, 5);
  });

  test('отказ не меняет ни статус, ни историю', async () => {
    await session('m', async ({ q, as }) => {
      const t = (await q(
        `insert into public.tasks (title, object_id, assignee_id) values ('x', (select id from public.objects limit 1), $1) returning id`,
        [uid('e1')])).rows[0].id;
      await as('e1');
      await q('savepoint s1');
      await assert.rejects(changeStatus(q, t, 'accepted'), /запрещён/);
      await q('rollback to savepoint s1');
      assert.equal((await q('select status from public.tasks where id = $1', [t])).rows[0].status, 'new');
      assert.equal((await q('select 1 from public.task_history where task_id = $1', [t])).rows.length, 1);
    });
  });

  test('«На доработку» требует комментарий; пробелы и пустота не считаются', async () => {
    for (const bad of [null, '', '   ', '\n\t']) {
      await assert.rejects(session('m', async ({ q, as }) => {
        const t = (await q(
          `insert into public.tasks (title, object_id, assignee_id) values ('x', (select id from public.objects limit 1), $1) returning id`,
          [uid('e1')])).rows[0].id;
        await as('e1'); await changeStatus(q, t, 'in_progress'); await changeStatus(q, t, 'in_review');
        await as('m'); await changeStatus(q, t, 'needs_rework', bad);
      }), /нужен комментарий/);
    }
  });

  test('чужая и несуществующая задача дают одинаковый ответ «не найдена»', async () => {
    // id берём ДО сессии: внутри неё запросы идут с правами пользователя и чужой задачи не видят
    const foreign = await taskId(T.e2new);
    await assert.rejects(session('e1', ({ q }) => changeStatus(q, null, 'in_progress')), /Задача не найдена/);
    await assert.rejects(session('e1', ({ q }) => changeStatus(q, foreign, 'in_progress')), /Задача не найдена/);
    await assert.rejects(session('e1', ({ q }) => changeStatus(q, '00000000-0000-0000-0000-000000000000', 'in_progress')), /Задача не найдена/);
  });

  test('без входа функцию вызвать нельзя', async () => {
    const tid = await taskId(T.e2new);
    await assert.rejects(session('anon', ({ q }) => changeStatus(q, tid, 'in_progress')), /permission denied for function change_task_status/);
  });
});

describe('права на уровне базы', () => {
  test('RLS включён на всех таблицах', async () => {
    const r = await sys(`select relname, relrowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' order by relname`);
    assert.equal(r.length, 5);
    assert.ok(r.every((x) => x.relrowsecurity), JSON.stringify(r));
  });

  test('anon не имеет прав ни на таблицы, ни на функции', async () => {
    const r = await sys(`select
      has_table_privilege('anon', 'public.tasks', 'select') a,
      has_table_privilege('anon', 'public.task_history', 'select') b,
      has_function_privilege('anon', 'public.change_task_status(uuid, public.task_status, text)', 'execute') c,
      has_function_privilege('anon', 'public.is_manager()', 'execute') d`);
    assert.deepEqual(r[0], { a: false, b: false, c: false, d: false });
  });

  test('триггерные функции недоступны клиентам', async () => {
    const r = await sys(`select
      has_function_privilege('authenticated', 'public.tasks_log_creation()', 'execute') a,
      has_function_privilege('authenticated', 'public.tasks_check_assignee()', 'execute') b`);
    assert.deepEqual(r[0], { a: false, b: false });
  });

  test('на колонки status / author_id / created_at у клиентов нет права записи', async () => {
    const r = await sys(`select
      has_column_privilege('authenticated', 'public.tasks', 'status', 'update') s_u,
      has_column_privilege('authenticated', 'public.tasks', 'status', 'insert') s_i,
      has_column_privilege('authenticated', 'public.tasks', 'author_id', 'update') a_u,
      has_column_privilege('authenticated', 'public.tasks', 'title', 'update') t_u`);
    assert.deepEqual(r[0], { s_u: false, s_i: false, a_u: false, t_u: true });
  });
});
