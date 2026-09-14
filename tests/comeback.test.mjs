// Проверка режима возвращения и короткой версии тренировки (node --test).
// Модули приложения чистые (без DOM), кроме store.js — ему подставляем localStorage.
import test from 'node:test';
import assert from 'node:assert/strict';

const mem = new Map();
globalThis.localStorage = {
  getItem: k => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: k => mem.delete(k),
};

const { comebackState, tierForWeeks, weeksBetween, adjustSets, adjustSuggestion, comebackNote } =
  await import('../js/lib/comeback.js');
const { suggestProgression } = await import('../js/lib/analytics.js');
const { compareSet, previousSessionForDay } = await import('../js/game/gamification.js');
const { epley1RM } = await import('../js/lib/calc.js');
const { defaultState, importJSON } = await import('../js/store.js');

const TODAY = '2026-09-14';

// Состояние «как в бэкапе»: последние завершённые сессии — 17, 19, 21 и 22 июня 2026.
function backupState() {
  const st = defaultState();
  const d1 = st.plan.days[0];
  const dates = ['2026-06-17', '2026-06-19', '2026-06-21', '2026-06-22'];
  st.sessions = dates.map((dateISO, i) => ({
    id: `s${i}`, dayId: st.plan.days[i % 4].id, dateISO,
    entries: [], xp: 0,
  }));
  // Последняя сессия дня 1 — 22 июня, с рабочими подходами.
  const last = st.sessions[st.sessions.length - 1];
  last.dayId = d1.id;
  last.entries = d1.exercises.map(ex => ({
    exerciseId: ex.id,
    sets: Array.from({ length: ex.sets }, () => ({ w: 20, reps: ex.repsMax })),
  }));
  return st;
}

test('простой считается от последней завершённой сессии', () => {
  assert.equal(weeksBetween('2026-06-22', TODAY), 12);
  const cb = comebackState(backupState(), TODAY);
  assert.equal(cb.weeks, 12);
  assert.equal(cb.stage, 0);
  assert.equal(cb.lastSessionISO, '2026-06-22');
  assert.equal(cb.setsFactor, 0.5);
  assert.equal(cb.weightFactor, 0.75);
});

test('activeWorkout не влияет на расчёт простоя', () => {
  const st = backupState();
  st.activeWorkout = { id: 'a', dayId: st.plan.days[0].id, dateISO: '2026-07-20', entries: [] };
  assert.equal(comebackState(st, TODAY).weeks, 12);
});

test('таблица деградации по времени простоя', () => {
  assert.equal(tierForWeeks(0), null);
  assert.deepEqual(pick(tierForWeeks(1)), { setsFactor: 0.75, weightFactor: 1 });
  assert.deepEqual(pick(tierForWeeks(2)), { setsFactor: 0.67, weightFactor: 0.9 });
  assert.deepEqual(pick(tierForWeeks(6)), { setsFactor: 0.67, weightFactor: 0.9 });
  assert.deepEqual(pick(tierForWeeks(7)), { setsFactor: 0.5, weightFactor: 0.75 });
});
function pick(t) { return { setsFactor: t.setsFactor, weightFactor: t.weightFactor }; }

test('подходы округляются вниз, минимум 2 и не выше плана', () => {
  assert.equal(adjustSets(4, 0.5), 2);
  assert.equal(adjustSets(3, 0.5), 2);
  assert.equal(adjustSets(3, 0.67), 2);
  assert.equal(adjustSets(4, 0.75), 3);
  assert.equal(adjustSets(1, 0.5), 1);   // план из одного подхода не растёт
  assert.equal(adjustSets(4, 1), 4);
});

test('день 1 в короткой версии: 4 упражнения по 2 подхода вместо 6 и 21', () => {
  const st = backupState();
  const day = st.plan.days[0];
  const cb = comebackState(st, TODAY);

  assert.equal(day.exercises.length, 6);
  assert.equal(day.exercises.reduce((n, e) => n + e.sets, 0), 21);

  const short = day.exercises.filter(e => !e.isAccessory);
  assert.equal(short.length, 4);
  assert.deepEqual(short.map(e => adjustSets(e.sets, cb.setsFactor)), [2, 2, 2, 2]);
  assert.equal(short.reduce((n, e) => n + adjustSets(e.sets, cb.setsFactor), 0), 8);

  const hidden = day.exercises.filter(e => e.isAccessory).map(e => e.name);
  assert.deepEqual(hidden, ['Пуловер (гантель / блок)', 'Махи в наклоне (задние дельты)']);
});

test('цель жима гантелей сидя: ≈16 кг вместо 21.25 кг', () => {
  const st = backupState();
  const day = st.plan.days[0];
  const ex = day.exercises[0];
  assert.equal(ex.name, 'Жим гантелей сидя');

  const prev = previousSessionForDay(st, day.id);
  const pe = prev.entries.find(e => e.exerciseId === ex.id);
  const full = suggestProgression(ex, pe);
  assert.equal(full.w, 21.25);

  const cb = comebackState(st, TODAY);
  const eased = adjustSuggestion(full, cb.weightFactor);
  assert.equal(eased.w, 16);
  assert.equal(eased.fullW, 21.25);
  assert.equal(eased.reps, full.reps); // повторы не трогаем
});

test('выполнение сниженных целей не даёт красных кружков', () => {
  const st = backupState();
  const day = st.plan.days[0];
  const ex = day.exercises[0];
  const prev = previousSessionForDay(st, day.id);
  const cb = comebackState(st, TODAY);
  const eased = adjustSuggestion(suggestProgression(ex, prev.entries.find(e => e.exerciseId === ex.id)), cb.weightFactor);
  const targetRm = epley1RM(eased.w, eased.reps);

  for (let i = 0; i < 2; i++) {
    const hit = compareSet(prev, ex.id, i, { w: eased.w, reps: eased.reps }, targetRm);
    assert.notEqual(hit, 'red', 'цель режима возвращения не должна гореть красным');
    assert.equal(compareSet(prev, ex.id, i, { w: eased.w, reps: eased.reps + 2 }, targetRm), 'green');
  }
  // Без режима возвращения тот же подход горел бы красным (сравнение с рекордом).
  assert.equal(compareSet(prev, ex.id, 0, { w: eased.w, reps: eased.reps }), 'red');
});

test('планка не может стать строже обычной: при слабом прошлом сравниваем с ним', () => {
  const prev = { entries: [{ exerciseId: 'ex1', sets: [{ w: 10, reps: 10 }] }] };
  // Скорректированная цель выше прошлого результата — берём меньшее (прошлый подход).
  assert.equal(compareSet(prev, 'ex1', 0, { w: 12, reps: 10 }, epley1RM(20, 10)), 'green');
});

test('плавный выход за три тренировки', () => {
  const st = backupState();
  const d1 = st.plan.days[0].id;
  const add = dateISO => st.sessions.push({ id: 'r' + st.sessions.length, dayId: d1, dateISO, entries: [], xp: 0 });

  add('2026-09-14'); // 1-я тренировка возвращения выполнена
  let cb = comebackState(st, TODAY);
  assert.equal(cb.stage, 1);
  assert.equal(cb.weeks, 12);
  assert.equal(cb.setsFactor, 0.75);     // половина отката от 0.5
  assert.equal(cb.weightFactor, 0.875);  // половина отката от 0.75
  assert.equal(cb.reduced, true);

  add('2026-09-16'); // 2-я
  cb = comebackState(st, '2026-09-16');
  assert.equal(cb.stage, 2);
  assert.equal(cb.setsFactor, 1);
  assert.equal(cb.weightFactor, 1);
  assert.equal(cb.reduced, false);       // третья — полный объём и веса

  add('2026-09-18'); // 3-я
  assert.equal(comebackState(st, '2026-09-18'), null);
});

test('простой меньше недели режим не включает', () => {
  const st = defaultState();
  st.sessions = [{ id: 's', dayId: st.plan.days[0].id, dateISO: '2026-09-09', entries: [] }];
  assert.equal(comebackState(st, '2026-09-14'), null); // 5 дней
  st.sessions[0].dateISO = '2026-09-07';
  assert.equal(comebackState(st, '2026-09-14').weeks, 1);
});

test('текст плашки', () => {
  const cb = comebackState(backupState(), TODAY);
  assert.match(comebackNote(cb), /Возвращение после 12 недель: объём и веса снижены/);
});

test('старый бэкап без isAccessory читается и получает дефолты дня 1', () => {
  const old = defaultState();
  for (const d of old.plan.days) for (const ex of d.exercises) delete ex.isAccessory;
  delete old.activeWorkout;
  old.plan.days[1].exercises[0].isAccessory = false; // явное значение не затирается
  const st = importJSON(JSON.stringify(old));
  const d1 = st.plan.days[0];
  assert.deepEqual(d1.exercises.map(e => !!e.isAccessory), [false, false, true, false, false, true]);
  assert.equal(st.plan.days[1].exercises[0].isAccessory, false);
  assert.equal(st.activeWorkout, null);
  // День 4 пользователь размечает сам — «Пуловер» там остаётся основным.
  assert.equal(st.plan.days[3].exercises.every(e => e.isAccessory === false), true);
});

test('склонение «недель» в обоих падежах', async () => {
  const { weeksGen, weeksNom } = await import('../js/lib/comeback.js');
  assert.deepEqual([1, 2, 5, 11, 12, 21, 22].map(weeksGen),
    ['недели', 'недель', 'недель', 'недель', 'недель', 'недели', 'недель']);
  assert.deepEqual([1, 2, 5, 11, 12, 21, 22].map(weeksNom),
    ['неделя', 'недели', 'недель', 'недель', 'недель', 'неделя', 'недели']);
});
