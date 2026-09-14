import { el, section, toast, celebrate, modal } from '../lib/dom.js';
import { getState, save } from '../store.js';
import { uid, todayISO } from '../models.js';
import { formatSet, fmtDate, epley1RM } from '../lib/calc.js';
import { lineChart } from '../lib/chart.js';
import { finalizeWorkout, recompute, previousSessionForDay, compareSet } from '../game/gamification.js';
import { suggestProgression, exerciseHistory } from '../lib/analytics.js';
import { restEndCue, tick } from '../lib/effects.js';
import { comebackState, comebackNote, adjustSets, adjustSuggestion, daysBetween, weeksNom } from '../lib/comeback.js';

let restTimer = null;   // {endTs, intervalId}
let saveTimer = null;

// Незавершённая тренировка живёт в state.activeWorkout, поэтому переживает перезагрузку.
const STALE_DAYS = 2;

function persist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; save(); }, 400);
}
function persistNow() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  save();
}

// --- Старт тренировки -------------------------------------------------------

function visibleExercises(day, variant) {
  return (day.exercises || []).filter(ex => variant === 'short' ? !ex.isAccessory : true);
}

function makeEntry(ex, prev, cb) {
  const pe = prev && (prev.entries || []).find(e => e.exerciseId === ex.id);
  const raw = suggestProgression(ex, pe);
  const sug = cb ? adjustSuggestion(raw, cb.weightFactor) : raw;
  const nSets = cb ? adjustSets(ex.sets, cb.setsFactor) : ex.sets;
  return {
    exerciseId: ex.id,
    suggestion: sug,
    // Планка для оценки подхода в режиме возвращения (1ПМ скорректированной цели).
    targetRm: (cb && cb.reduced && sug) ? epley1RM(sug.w, sug.reps) : null,
    sets: Array.from({ length: nSets }, () => ({
      w: sug ? sug.w : null,
      reps: sug ? sug.reps : null,
      done: false,
    })),
  };
}

function startActive(state, day, variant) {
  const prev = previousSessionForDay(state, day.id);
  const cb = comebackState(state);
  const aw = {
    id: uid('ses'),
    dayId: day.id,
    dateISO: todayISO(),
    startTs: Date.now(),
    variant: variant === 'short' ? 'short' : 'full',
    comeback: cb ? {
      weeks: cb.weeks, stage: cb.stage, reduced: cb.reduced,
      setsFactor: cb.setsFactor, weightFactor: cb.weightFactor,
    } : null,
    entries: day.exercises.map(ex => makeEntry(ex, prev, cb)),
  };
  state.activeWorkout = aw;
  persistNow();
  return aw;
}

// Подходы/упражнения в выбранной версии — для превью на экране старта.
function previewCounts(state, day, variant) {
  const cb = comebackState(state);
  const list = visibleExercises(day, variant);
  const sets = list.reduce((n, ex) => n + (cb ? adjustSets(ex.sets, cb.setsFactor) : ex.sets), 0);
  return { exercises: list.length, sets };
}

function startScreen(root, state, day, ctx) {
  const cb = comebackState(state);
  const accessories = (day.exercises || []).filter(ex => ex.isAccessory).length;
  const preferShort = !!(cb && cb.reduced);
  let variant = preferShort ? 'short' : 'full';

  const options = [
    { key: 'full', title: 'Полная', desc: 'Все упражнения дня' },
    { key: 'short', title: 'Короткая', desc: accessories ? 'Без дополнительных упражнений' : 'В этом дне нет дополнительных упражнений' },
  ];

  const cards = options.map(o => {
    const c = previewCounts(state, day, o.key);
    const node = el('button', {
      class: 'variant-card' + (variant === o.key ? ' on' : ''),
      onClick: () => {
        variant = o.key;
        for (const n of cards) n.classList.toggle('on', n.dataset.key === variant);
      },
      dataset: { key: o.key },
    }, [
      el('div', { class: 'variant-top' }, [
        el('span', { class: 'variant-title', text: o.title }),
        preferShort && o.key === 'short' ? el('span', { class: 'variant-tag', text: 'рекомендуется' }) : null,
      ]),
      el('div', { class: 'variant-desc', text: o.desc }),
      el('div', { class: 'variant-meta', text: `${c.exercises} упр. · ${c.sets} подходов` }),
    ]);
    return node;
  });

  const body = [
    cb ? el('div', { class: 'wk-banner' + (cb.reduced ? '' : ' soft'), text: comebackNote(cb) }) : null,
    preferShort ? el('div', { class: 'muted small', text:
      `Причина: последняя тренировка была ${fmtDate(cb.lastSessionISO)} — перерыв ${cb.weeks} ${weeksNom(cb.weeks)}.` }) : null,
    el('div', { class: 'variant-list' }, cards),
    el('button', {
      class: 'btn btn-primary btn-block', text: '▶ Начать тренировку',
      onClick: () => { startActive(state, day, variant); ctx.rerender(); },
    }),
    el('p', { class: 'muted small', text: 'Версию можно переключить прямо во время тренировки — записанные подходы сохранятся.' }),
  ];

  root.append(section(`${day.name} · ${day.focus}`, body));

  const other = state.activeWorkout;
  if (other && other.dayId !== day.id) {
    const otherDay = state.plan.days.find(d => d.id === other.dayId);
    root.append(section('Незавершённая тренировка', [
      el('p', { class: 'muted', text: `${otherDay ? otherDay.name : 'Тренировка'} от ${fmtDate(other.dateISO)} не завершена.` }),
      el('div', { class: 'data-btns' }, [
        el('button', { class: 'btn btn-ghost', text: '↩ Продолжить', onClick: () => ctx.navigate(`workout/${other.dayId}`) }),
        el('button', { class: 'btn btn-danger', text: '🗑 Выбросить', onClick: () => { discardActive(); ctx.rerender(); } }),
      ]),
    ]));
  }
}

export function discardActive() {
  const state = getState();
  state.activeWorkout = null;
  persistNow();
}

// Предложение продолжить/выбросить зависшую тренировку (старше двух дней).
export function promptStaleWorkout(ctx) {
  const state = getState();
  const aw = state.activeWorkout;
  if (!aw || !aw.dateISO) return false;
  const age = daysBetween(aw.dateISO, todayISO());
  if (age <= STALE_DAYS) return false;

  const day = state.plan.days.find(d => d.id === aw.dayId);
  const doneSets = (aw.entries || []).reduce((n, e) => n + (e.sets || []).filter(s => s.done && s.w && s.reps).length, 0);
  const body = el('div', {}, [
    el('p', { text: `${day ? day.name : 'Тренировка'} от ${fmtDate(aw.dateISO)} осталась незавершённой (${age} дн. назад).` }),
    el('p', { class: 'muted small', text: doneSets ? `Отмечено выполненных подходов: ${doneSets}.` : 'Выполненных подходов нет.' }),
    el('p', { class: 'muted small', text: 'Если продолжить, тренировка станет сегодняшней со старыми целями. Выбросить — начать заново с актуальными.' }),
  ]);
  const close = modal('Незавершённая тренировка', body, [
    el('button', { class: 'btn btn-ghost', text: '↩ Продолжить', onClick: () => {
      aw.dateISO = todayISO(); // иначе тренировка запишется задним числом и будет спрашивать снова
      persistNow();
      close();
      ctx.navigate(`workout/${aw.dayId}`);
    } }),
    el('button', { class: 'btn btn-danger', text: '🗑 Выбросить', onClick: () => { discardActive(); close(); ctx.rerender(); } }),
  ]);
  return true;
}

// --- Экран ------------------------------------------------------------------

export function render(root, ctx) {
  const state = getState();
  const dayId = ctx.param;

  if (!dayId) {
    const aw = state.activeWorkout;
    if (aw) {
      const d = state.plan.days.find(x => x.id === aw.dayId);
      root.append(section('Незавершённая тренировка', [
        el('div', { class: 'today' }, [
          el('div', {}, [
            el('div', { class: 'today-name', text: d ? d.name : 'Тренировка' }),
            el('div', { class: 'today-focus', text: `от ${fmtDate(aw.dateISO)} · ${aw.variant === 'short' ? 'короткая' : 'полная'} версия` }),
          ]),
          el('button', { class: 'btn btn-primary', text: '↩ Продолжить', onClick: () => ctx.navigate(`workout/${aw.dayId}`) }),
        ]),
        el('button', { class: 'btn btn-danger btn-sm', text: '🗑 Выбросить', onClick: () => { discardActive(); ctx.rerender(); } }),
      ]));
    }
    root.append(section('Выбери день', state.plan.days.map(d => {
      const acc = (d.exercises || []).filter(e => e.isAccessory).length;
      return el('button', {
        class: 'day-pick', onClick: () => ctx.navigate(`workout/${d.id}`),
      }, [
        el('div', { class: 'day-pick-name', text: d.name }),
        el('div', { class: 'day-pick-focus', text: d.focus }),
        el('div', { class: 'day-pick-meta', text: `${d.exercises.length} упр.${acc ? ` · ${d.exercises.length - acc} в короткой` : ''}` }),
      ]);
    })));
    return;
  }

  const day = state.plan.days.find(d => d.id === dayId);
  if (!day) { ctx.navigate('workout'); return; }

  const aw = state.activeWorkout;
  if (!aw || aw.dayId !== dayId) { startScreen(root, state, day, ctx); return; }

  renderActive(root, state, day, aw, ctx);
}

function renderActive(root, state, day, aw, ctx) {
  const prev = previousSessionForDay(state, day.id);
  const restSec = state.settings.defaultRestSec || 90;
  const exercises = visibleExercises(day, aw.variant);

  const header = el('div', { class: 'wk-header' }, [
    el('div', {}, [
      el('div', { class: 'wk-day', text: day.name }),
      el('div', { class: 'wk-focus', text: day.focus }),
    ]),
    el('div', { class: 'wk-timer', id: 'rest-box' }, [
      el('button', { class: 'btn btn-ghost', text: `⏱ ${restSec}с`, onClick: () => startRest(restSec) }),
    ]),
  ]);

  const banner = aw.comeback
    ? el('div', { class: 'wk-banner' + (aw.comeback.reduced ? '' : ' soft'), text: comebackNote(aw.comeback) })
    : null;

  const switcher = el('div', { class: 'wk-variant' }, [
    el('span', { class: 'muted small', text: 'Версия:' }),
    ...['full', 'short'].map(v => el('button', {
      class: 'variant-chip' + (aw.variant === v ? ' on' : ''),
      text: v === 'full' ? 'Полная' : 'Короткая',
      onClick: () => { if (aw.variant !== v) { aw.variant = v; persistNow(); ctx.rerender(); } },
    })),
  ]);

  const hint = el('div', { class: 'wk-hint muted small', text: 'Отмечай выполненные подходы кнопкой ✓ — только они засчитываются.' });

  const list = el('div', { class: 'wk-list' }, exercises.map(ex => {
    let entry = aw.entries.find(e => e.exerciseId === ex.id);
    if (!entry) { // упражнение добавили в план уже после старта
      entry = makeEntry(ex, prev, aw.comeback && aw.comeback.reduced ? aw.comeback : null);
      aw.entries.push(entry);
      persist();
    }
    const sug = entry.suggestion;
    return el('div', { class: 'wk-ex' }, [
      el('div', { class: 'wk-ex-head' }, [
        el('button', { class: 'wk-ex-name link', text: ex.name + (ex.isAccessory ? ' ·доп ›' : ' ›'), onClick: () => openHistory(state, ex) }),
        el('div', { class: 'wk-ex-target', text: `${entry.sets.length}×${ex.repsMin}–${ex.repsMax}` }),
      ]),
      sug ? el('div', { class: 'wk-suggest', html: targetHtml(sug) }) : null,
      el('div', { class: 'sets' }, entry.sets.map((set, setIdx) =>
        setRow(ex, entry, set, setIdx, prev, restSec))),
    ]);
  }));

  const finishBtn = el('button', { class: 'btn btn-primary btn-block', text: '✅ Завершить тренировку', onClick: () => finish(ctx) });
  const dropBtn = el('button', { class: 'btn btn-ghost btn-sm', text: '🗑 Отменить тренировку', onClick: () => {
    if (confirm('Выбросить эту тренировку вместе с отмеченными подходами?')) { discardActive(); stopRest(); ctx.navigate('home'); }
  } });

  root.append(header, banner, switcher, hint, list, el('div', { class: 'wk-finish' }, [finishBtn, dropBtn]));
}

function targetHtml(sug) {
  const eased = sug.eased
    ? ` <span class="target-was">вместо ${sug.fullW} кг</span>`
    : ` (было ${formatSet(sug.from)})`;
  return sug.kind === 'weight'
    ? `🎯 цель: <b>${sug.w} кг</b> × ${sug.reps}${eased}`
    : `🎯 цель: ${sug.w} кг × <b>${sug.reps}</b> повт${eased}`;
}

function setRow(ex, entry, set, setIdx, prev, restSec) {
  const ps = prev && (prev.entries.find(e => e.exerciseId === ex.id) || {}).sets?.[setIdx];
  const row = el('div', { class: 'set-row' + (set.done ? ' set-done' : '') });

  const wIn = el('input', { type: 'number', inputmode: 'decimal', class: 'set-input', placeholder: 'кг', value: set.w != null ? set.w : '' });
  const rIn = el('input', { type: 'number', inputmode: 'numeric', class: 'set-input', placeholder: 'повт', value: set.reps != null ? set.reps : '' });
  const dot = el('span', { class: 'cmp-dot' });

  function refreshDot() {
    const c = compareSet(prev, ex.id, setIdx, set, entry.targetRm);
    dot.className = 'cmp-dot' + (c ? ' cmp-' + c : '');
    dot.textContent = c === 'green' ? '🟢' : c === 'yellow' ? '🟡' : c === 'red' ? '🔴' : '';
  }
  function update() {
    set.w = wIn.value === '' ? null : parseFloat(wIn.value.replace(',', '.'));
    set.reps = rIn.value === '' ? null : parseInt(rIn.value, 10);
    refreshDot();
    persist();
  }
  wIn.addEventListener('input', update);
  rIn.addEventListener('input', update);
  refreshDot();

  const doneBtn = el('button', { class: 'set-done-btn' + (set.done ? ' on' : ''), text: set.done ? '✓' : '○' });
  doneBtn.addEventListener('click', () => {
    set.done = !set.done;
    doneBtn.className = 'set-done-btn' + (set.done ? ' on' : '');
    row.classList.toggle('set-done', set.done);
    persistNow();
    if (set.done) {
      tick();
      if (set.w && set.reps) startRest(restSec); // авто-старт отдыха
    }
  });

  row.append(
    el('span', { class: 'set-idx', text: `П${setIdx + 1}` }),
    wIn, el('span', { class: 'set-x', text: '×' }), rIn,
    dot,
    el('span', { class: 'set-prev', text: ps ? `было ${formatSet(ps)}` : '' }),
    doneBtn,
  );
  return row;
}

function openHistory(state, ex) {
  const hist = exerciseHistory(state, ex.id);
  const body = el('div', {}, [
    hist.length
      ? lineChart(hist.map(h => ({ dateISO: h.dateISO, value: h.oneRm })), { empty: 'Нет данных' })
      : el('p', { class: 'muted', text: 'Ещё нет завершённых подходов по этому упражнению.' }),
    el('div', { class: 'ex-hist-list' }, hist.slice().reverse().slice(0, 12).map(h => el('div', { class: 'hist-row' }, [
      el('div', { class: 'hist-date', text: fmtDate(h.dateISO) }),
      el('div', { class: 'hist-meta', html: `${h.maxW} кг · 1ПМ <b>${h.oneRm}</b> · объём ${Math.round(h.volume)} кг` }),
    ]))),
  ]);
  modal(ex.name, body);
}

function startRest(sec) {
  stopRest();
  if (!document.getElementById('rest-box')) return;
  const endTs = Date.now() + sec * 1000;
  const tickFn = () => {
    const box = document.getElementById('rest-box');
    if (!box) { if (restTimer) { clearInterval(restTimer.intervalId); restTimer = null; } return; } // ушли с экрана
    const left = Math.max(0, Math.round((endTs - Date.now()) / 1000));
    box.innerHTML = '';
    box.append(
      el('div', { class: 'rest-count' + (left === 0 ? ' rest-done' : ''), text: left === 0 ? 'Готов!' : `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}` }),
      el('button', { class: 'btn btn-ghost', text: left === 0 ? 'OK' : '✕', onClick: stopRest }),
    );
    if (left === 0) { restEndCue(); stopRest(); setTimeout(resetRestBtn, 1500); }
  };
  tickFn();
  restTimer = { endTs, intervalId: setInterval(tickFn, 250) };
}
function stopRest() { if (restTimer) { clearInterval(restTimer.intervalId); restTimer = null; } resetRestBtn(); }
function resetRestBtn() {
  const box = document.getElementById('rest-box');
  if (!box) return;
  const sec = (getState().settings.defaultRestSec) || 90;
  box.innerHTML = '';
  box.append(el('button', { class: 'btn btn-ghost', text: `⏱ ${sec}с`, onClick: () => startRest(sec) }));
}

function finish(ctx) {
  const state = getState();
  const aw = state.activeWorkout;
  if (!aw) { ctx.navigate('workout'); return; }
  const session = {
    id: aw.id, dayId: aw.dayId, dateISO: aw.dateISO,
    durationSec: Math.round((Date.now() - aw.startTs) / 1000),
    entries: aw.entries.map(e => ({
      exerciseId: e.exerciseId,
      sets: e.sets.filter(s => s.done && s.w && s.reps).map(s => ({ w: s.w, reps: s.reps })),
    })).filter(e => e.sets.length),
    xp: 0,
  };
  if (aw.comeback) session.comeback = { ...aw.comeback };
  const completed = session.entries.reduce((n, e) => n + e.sets.length, 0);
  if (completed === 0) { toast('Отметь выполненные подходы кнопкой ✓', 'warn'); return; }

  // Планки для оценки подходов — те же, что показывались на экране.
  const targetRms = {};
  for (const e of aw.entries) if (e.targetRm) targetRms[e.exerciseId] = e.targetRm;

  const res = finalizeWorkout(state, session, targetRms);
  const events = recompute(state);
  state.activeWorkout = null;
  persistNow();
  stopRest();

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
