// Проверка защиты на ЖИВОЙ базе: скрипт ходит в Supabase напрямую, в обход интерфейса,
// под тремя тестовыми пользователями и пытается сделать то, что делать нельзя.
// Каждая такая попытка обязана быть отклонена базой.
//
// Запуск (из корня репозитория, Node 20+):
//   MANAGER_PASSWORD='...' EXECUTOR1_PASSWORD='...' EXECUTOR2_PASSWORD='...' \
//   node --env-file=.env.local scripts/verify-live.mjs
//
// Данные не портятся: единственная запись, которую скрипт делает, это временная задача
// для проверки «разрешённого» пути; в конце она удаляется.
import { createClient } from '@supabase/supabase-js';

const { VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: key } = process.env;
const need = ['MANAGER_PASSWORD', 'EXECUTOR1_PASSWORD', 'EXECUTOR2_PASSWORD'];
if (!url || !key || need.some((n) => !process.env[n])) {
  console.error('Нужны VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY (из .env.local) и пароли:', need.join(', '));
  process.exit(2);
}

const client = () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
async function login(email, password) {
  const c = client();
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Не удалось войти как ${email}: ${error.message}`);
  return { c, id: data.user.id };
}

let failed = 0;
const lines = [];
function check(name, passed, detail = '') {
  if (!passed) failed++;
  lines.push(`${passed ? '✔' : '✘'} ${name}${detail ? `  [${detail}]` : ''}`);
}
const msg = (res) => res.error?.message ?? '';
// «Отклонено»: либо ошибка, либо операция не затронула ни одной строки.
const rejected = (res) => Boolean(res.error) || (Array.isArray(res.data) && res.data.length === 0);

const anon = client();
const m = await login('manager@example.com', process.env.MANAGER_PASSWORD);
const e1 = await login('executor1@example.com', process.env.EXECUTOR1_PASSWORD);
const e2 = await login('executor2@example.com', process.env.EXECUTOR2_PASSWORD);

// Данные для проверок берём от имени постановщика, он видит всё.
const all = (await m.c.from('tasks').select('id, title, status, assignee_id')).data ?? [];
const of = (u, status) => all.find((t) => t.assignee_id === u.id && (!status || t.status === status));
const e1Task = of(e1, 'new') ?? of(e1);
const e2Task = of(e2, 'in_review') ?? of(e2);
if (!e1Task || !e2Task) throw new Error('Не найдены тестовые задачи: сначала загрузите seed.sql');

// ---------- без входа ----------
check('anon: список задач недоступен', rejected(await anon.from('tasks').select('*')), 'нет прав на таблицу');
check('anon: список профилей недоступен', rejected(await anon.from('profiles').select('*')));
check('anon: смена статуса недоступна', rejected(await anon.rpc('change_task_status', { p_task_id: e1Task.id, p_new_status: 'in_progress' })));
const su = await anon.auth.signUp({ email: 'intruder@example.com', password: 'Intruder-12345!' });
check('открытая регистрация отключена', Boolean(su.error) || !su.data.session, su.error?.message ?? 'сессия не выдана');

// ---------- исполнитель 1 ----------
const mine = (await e1.c.from('tasks').select('id, assignee_id')).data ?? [];
check('исполнитель видит только свои задачи', mine.length > 0 && mine.every((t) => t.assignee_id === e1.id), `${mine.length} шт.`);
check('чужую задачу не получить даже по id', rejected(await e1.c.from('tasks').select('*').eq('id', e2Task.id)));
check('чужую историю не получить', rejected(await e1.c.from('task_history').select('*').eq('task_id', e2Task.id)));
const seenProfiles = (await e1.c.from('profiles').select('role')).data ?? [];
check('других исполнителей в профилях не видно', seenProfiles.filter((p) => p.role === 'executor').length === 1);
check('нельзя изменить даже свою задачу', rejected(await e1.c.from('tasks').update({ title: 'взлом' }).eq('id', e1Task.id).select()));
check('нельзя поставить статус напрямую', rejected(await e1.c.from('tasks').update({ status: 'accepted' }).eq('id', e1Task.id).select()));
check('нельзя создать задачу', rejected(await e1.c.from('tasks').insert({ title: 'x', object_id: e1Task.id, assignee_id: e1.id }).select()));
check('нельзя удалить задачу', rejected(await e1.c.from('tasks').delete().eq('id', e1Task.id).select()));
check('нельзя создать объект', rejected(await e1.c.from('objects').insert({ name: 'x', address: 'y' }).select()));
check('нельзя повысить себя до постановщика', rejected(await e1.c.from('profiles').update({ role: 'manager' }).eq('id', e1.id).select()));
check('нельзя писать в историю', rejected(await e1.c.from('task_history').insert({ task_id: e1Task.id, to_status: 'accepted', changed_by: e1.id }).select()));
check('нельзя менять историю', rejected(await e1.c.from('task_history').update({ comment: 'подделка' }).eq('task_id', e1Task.id).select()));
check('нельзя удалять историю', rejected(await e1.c.from('task_history').delete().eq('task_id', e1Task.id).select()));
check('нельзя сменить статус чужой задачи', /не найдена/.test(msg(await e1.c.rpc('change_task_status', { p_task_id: e2Task.id, p_new_status: 'in_review' }))), 'отвечает «не найдена»');
check('нельзя пропустить статус (из «Новая» сразу «Принята»)',
  /запрещён/.test(msg(await e1.c.rpc('change_task_status', { p_task_id: e1Task.id, p_new_status: 'accepted' }))));
check('исполнитель не может принять задачу', Boolean((await e2.c.rpc('change_task_status', { p_task_id: e2Task.id, p_new_status: 'accepted' })).error));

// ---------- постановщик ----------
check('постановщик не может поставить статус напрямую', rejected(await m.c.from('tasks').update({ status: 'accepted' }).eq('id', e1Task.id).select()));
check('постановщик не может подделать автора', rejected(await m.c.from('tasks').update({ author_id: e1.id }).eq('id', e1Task.id).select()));
check('постановщик не может писать в историю', rejected(await m.c.from('task_history').insert({ task_id: e1Task.id, to_status: 'accepted', changed_by: m.id }).select()));
check('постановщик не может менять историю', rejected(await m.c.from('task_history').update({ comment: 'подделка' }).eq('task_id', e1Task.id).select()));
check('постановщик не может удалять историю', rejected(await m.c.from('task_history').delete().eq('task_id', e1Task.id).select()));
check('постановщик не может сделать шаг исполнителя', /прав/.test(msg(await m.c.rpc('change_task_status', { p_task_id: e1Task.id, p_new_status: 'in_progress' }))));
if (e2Task.status === 'in_review') {
  check('доработка без комментария не проходит', /комментарий/.test(msg(await m.c.rpc('change_task_status', { p_task_id: e2Task.id, p_new_status: 'needs_rework', p_comment: '   ' }))));
}

// ---------- разрешённый путь на временной задаче ----------
const obj = (await m.c.from('objects').select('id').limit(1)).data?.[0];
const created = await m.c.from('tasks').insert({ title: 'verify-live (временная)', object_id: obj.id, assignee_id: e1.id }).select().single();
check('постановщик создаёт задачу: статус «Новая», автор — он', !created.error && created.data.status === 'new' && created.data.author_id === m.id);
if (!created.error) {
  const id = created.data.id;
  const step = async (who, status, comment) => (await who.c.rpc('change_task_status', { p_task_id: id, p_new_status: status, p_comment: comment ?? null })).error;
  const errs = [
    await step(e1, 'in_progress'), await step(e1, 'in_review', 'готово'),
    await step(m, 'needs_rework', 'нужны фото'), await step(e1, 'in_progress'),
    await step(e1, 'in_review'), await step(m, 'accepted'),
  ];
  check('полный цикл «Новая → … → Принята» проходит', errs.every((e) => !e), errs.map((e) => e?.message).filter(Boolean).join('; '));
  const hist = (await e1.c.from('task_history').select('from_status, to_status').eq('task_id', id).order('id')).data ?? [];
  check('история записала все 7 событий и видна исполнителю', hist.length === 7, `${hist.length} записей`);
  await m.c.from('tasks').delete().eq('id', id); // уборка: история уходит каскадом
  const left = (await m.c.from('tasks').select('id').eq('id', id)).data ?? [];
  check('временная задача удалена', left.length === 0);
}

console.log(lines.join('\n'));
console.log(failed === 0 ? `\nВсе проверки пройдены (${lines.length}).` : `\nПРОВАЛЕНО: ${failed} из ${lines.length}.`);
process.exit(failed === 0 ? 0 : 1);
