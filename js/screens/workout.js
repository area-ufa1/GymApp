import { el, section, toast, celebrate, modal } from '../lib/dom.js';
import { getState, save } from '../store.js';
import { uid, todayISO } from '../models.js';
import { formatSet } from '../lib/calc.js';
import { finalizeWorkout, recompute, previousSessionForDay, compareSet } from '../game/gamification.js';

let active = null;      // активная сессия в памяти
let restTimer = null;   // {endTs, intervalId}

function startActive(state, dayId) {
  const day = state.plan.days.find(d => d.id === dayId);
  if (!day) return null;
  const prev = previousSessionForDay(state, dayId);
  active = {
    id: uid('ses'),
    dayId,
    dateISO: todayISO(),
    startTs: Date.now(),
    entries: day.exercises.map(ex => {
      const pe = prev && (prev.entries || []).find(e => e.exerciseId === ex.id);
      return {
        exerciseId: ex.id,
        sets: Array.from({ length: ex.sets }, (_, i) => {
          const ps = pe && pe.sets[i];
          return { w: ps ? ps.w : null, reps: ps ? ps.reps : null };
        }),
      };
    }),
  };
  return active;
}

export function render(root, ctx) {
  const state = getState();
  const dayId = ctx.param;

  // Выбор дня, если не передан / сессия не активна.
  if (!dayId) {
    root.append(section('Выбери день', state.plan.days.map(d => el('button', {
      class: 'day-pick', onClick: () => ctx.navigate(`workout/${d.id}`),
    }, [
      el('div', { class: 'day-pick-name', text: d.name }),
      el('div', { class: 'day-pick-focus', text: d.focus }),
      el('div', { class: 'day-pick-meta', text: `${d.exercises.length} упр.` }),
    ]))));
    return;
  }

  if (!active || active.dayId !== dayId) startActive(state, dayId);
  const day = state.plan.days.find(d => d.id === dayId);
  if (!day) { ctx.navigate('workout'); return; }
  const prev = previousSessionForDay(state, dayId);

  const header = el('div', { class: 'wk-header' }, [
    el('div', {}, [
      el('div', { class: 'wk-day', text: day.name }),
      el('div', { class: 'wk-focus', text: day.focus }),
    ]),
    el('div', { class: 'wk-timer', id: 'rest-box' }, [
      el('button', { class: 'btn btn-ghost', text: '⏱ Отдых 90с', onClick: () => startRest(90) }),
    ]),
  ]);

  const list = el('div', { class: 'wk-list' }, day.exercises.map((ex, exIdx) => {
    const entry = active.entries[exIdx];
    return el('div', { class: 'wk-ex' }, [
      el('div', { class: 'wk-ex-head' }, [
        el('div', { class: 'wk-ex-name', text: ex.name }),
        el('div', { class: 'wk-ex-target', text: `${ex.sets}×${ex.repsMin}–${ex.repsMax}` }),
      ]),
      el('div', { class: 'sets' }, entry.sets.map((set, setIdx) =>
        setRow(ex, entry, set, setIdx, prev))),
    ]);
  }));

  const finishBtn = el('button', { class: 'btn btn-primary btn-block', text: '✅ Завершить тренировку', onClick: () => finish(ctx) });

  root.append(header, list, el('div', { class: 'wk-finish' }, [finishBtn]));
}

function setRow(ex, entry, set, setIdx, prev) {
  const ps = prev && (prev.entries.find(e => e.exerciseId === ex.id) || {}).sets?.[setIdx];
  const row = el('div', { class: 'set-row' });

  const wIn = el('input', {
    type: 'number', inputmode: 'decimal', class: 'set-input', placeholder: 'кг',
    value: set.w != null ? set.w : '',
  });
  const rIn = el('input', {
    type: 'number', inputmode: 'numeric', class: 'set-input', placeholder: 'повт',
    value: set.reps != null ? set.reps : '',
  });
  const dot = el('span', { class: 'cmp-dot' });

  function update() {
    set.w = wIn.value === '' ? null : parseFloat(wIn.value.replace(',', '.'));
    set.reps = rIn.value === '' ? null : parseInt(rIn.value, 10);
    const c = compareSet(prev, ex.id, setIdx, set);
    dot.className = 'cmp-dot' + (c ? ' cmp-' + c : '');
    dot.textContent = c === 'green' ? '🟢' : c === 'yellow' ? '🟡' : c === 'red' ? '🔴' : '';
  }
  wIn.addEventListener('input', update);
  rIn.addEventListener('input', update);
  update();

  row.append(
    el('span', { class: 'set-idx', text: `П${setIdx + 1}` }),
    wIn,
    el('span', { class: 'set-x', text: '×' }),
    rIn,
    dot,
    el('span', { class: 'set-prev', text: ps ? `было ${formatSet(ps)}` : '' }),
  );
  return row;
}

function startRest(sec) {
  stopRest();
  const box = document.getElementById('rest-box');
  if (!box) return;
  const endTs = Date.now() + sec * 1000;
  const tick = () => {
    const left = Math.max(0, Math.round((endTs - Date.now()) / 1000));
    box.innerHTML = '';
    box.append(
      el('div', { class: 'rest-count' + (left === 0 ? ' rest-done' : ''), text: left === 0 ? 'Готов!' : `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}` }),
      el('button', { class: 'btn btn-ghost', text: left === 0 ? 'OK' : '✕', onClick: stopRest }),
    );
    if (left === 0) { stopRest(); setTimeout(resetRestBtn, 1500); }
  };
  tick();
  restTimer = { endTs, intervalId: setInterval(tick, 250) };
}
function stopRest() { if (restTimer) { clearInterval(restTimer.intervalId); restTimer = null; } resetRestBtn(); }
function resetRestBtn() {
  const box = document.getElementById('rest-box');
  if (box) { box.innerHTML = ''; box.append(el('button', { class: 'btn btn-ghost', text: '⏱ Отдых 90с', onClick: () => startRest(90) })); }
}

function finish(ctx) {
  const state = getState();
  // Чистим пустые подходы.
  const session = {
    id: active.id, dayId: active.dayId, dateISO: active.dateISO,
    durationSec: Math.round((Date.now() - active.startTs) / 1000),
    entries: active.entries.map(e => ({ exerciseId: e.exerciseId, sets: e.sets.filter(s => s.w && s.reps) })).filter(e => e.sets.length),
    xp: 0,
  };
  const completed = session.entries.reduce((n, e) => n + e.sets.length, 0);
  if (completed === 0) {
    toast('Заполни хотя бы один подход 💪', 'warn');
    return;
  }
  const res = finalizeWorkout(state, session);
  const events = recompute(state);
  save();
  stopRest();
  active = null;

  toast(`+${res.xp.amount} XP · подходов: ${res.completedSets}${res.greenSets ? ` · 🟢 ${res.greenSets}` : ''}`, 'success');
  const queue = [];
  if (res.xp.leveledUp) queue.push(['⭐', `Уровень ${res.xp.newLevel}!`, 'Новый уровень достигнут']);
  for (const a of events.newAchievements) queue.push([a.icon, a.title, 'Ачивка разблокирована']);
  for (const q of events.newQuests) queue.push(['🎯', 'Квест выполнен', `${q.text} (+${q.xp} XP)`]);
  playQueue(queue);

  ctx.navigate('home');
}

function playQueue(queue) {
  if (!queue.length) return;
  let i = 0;
  const next = () => { if (i < queue.length) { const [e, t, s] = queue[i++]; celebrate(e, t, s); setTimeout(next, 2300); } };
  next();
}
