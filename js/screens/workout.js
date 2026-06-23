import { el, section, toast, celebrate, modal, floatXp, bar } from '../lib/dom.js';
import { getState, save } from '../store.js';
import { uid, todayISO } from '../models.js';
import { formatSet, fmtDate, epley1RM, round1 } from '../lib/calc.js';
import { lineChart } from '../lib/chart.js';
import { finalizeWorkout, recompute, previousSessionForDay, compareSet, setXpBreakdown, awardXp, levelProgress } from '../game/gamification.js';
import { suggestProgression, exerciseHistory, restForExercise } from '../lib/analytics.js';
import { restEndCue, tick, confetti, fanfare } from '../lib/effects.js';

let active = null;      // ссылка на state.activeWorkout (он же — источник истины)
let restTimer = null;   // {endTs, intervalId}
let saveTimer = null;   // дебаунс сохранения при вводе

function persist() { clearTimeout(saveTimer); saveTimer = setTimeout(() => save(), 400); }
function persistNow() { clearTimeout(saveTimer); save(); }

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
      const sug = suggestProgression(ex, pe);
      return {
        exerciseId: ex.id,
        suggestion: sug,
        sets: Array.from({ length: ex.sets }, () => ({
          w: sug ? sug.w : null,
          reps: sug ? sug.reps : null,
          done: false,
        })),
      };
    }),
  };
  state.activeWorkout = active; // персистим незавершённую тренировку
  save();
  return active;
}

// Восстановленная тренировка валидна, только если совпадает набор упражнений дня.
function matchesDay(aw, day) {
  return aw && Array.isArray(aw.entries) && aw.entries.length === day.exercises.length &&
    aw.entries.every((e, i) => e.exerciseId === day.exercises[i].id);
}

export function render(root, ctx) {
  const state = getState();
  const dayId = ctx.param;

  if (!dayId) {
    root.append(section('Выбери день', state.plan.days.map(d => {
      const inProgress = state.activeWorkout && state.activeWorkout.dayId === d.id;
      return el('button', { class: 'day-pick' + (inProgress ? ' day-pick-active' : ''), onClick: () => ctx.navigate(`workout/${d.id}`) }, [
        el('div', { class: 'day-pick-name', text: d.name }),
        el('div', { class: 'day-pick-focus', text: d.focus }),
        el('div', { class: 'day-pick-meta', text: inProgress ? '↩ продолжить тренировку' : `${d.exercises.length} упр.` }),
      ]);
    })));
    return;
  }

  const day = state.plan.days.find(d => d.id === dayId);
  if (!day) { ctx.navigate('workout'); return; }

  // Восстанавливаем незавершённую тренировку этого дня либо начинаем новую.
  active = state.activeWorkout;
  if (!matchesDay(active, day) || active.dayId !== dayId) startActive(state, dayId);

  const prev = previousSessionForDay(state, dayId);
  const restSec = state.settings.defaultRestSec || 90;

  const header = el('div', { class: 'wk-header' }, [
    el('div', {}, [
      el('div', { class: 'wk-day', text: day.name }),
      el('div', { class: 'wk-focus', text: day.focus }),
    ]),
    el('div', { class: 'wk-timer', id: 'rest-box' }, [
      el('button', { class: 'btn btn-ghost', text: `⏱ ${restSec}с`, onClick: () => startRest(restSec) }),
    ]),
  ]);

  const hud = el('div', { class: 'wk-hud', id: 'wk-hud' });
  renderHud(hud, state);

  const hint = el('div', { class: 'wk-hint muted small', text: 'Отмечай выполненные подходы кнопкой ✓ — XP начисляется сразу.' });

  const list = el('div', { class: 'wk-list' }, day.exercises.map((ex, exIdx) => {
    const entry = active.entries[exIdx];
    const sug = entry.suggestion;
    const exRest = restForExercise(ex);
    return el('div', { class: 'wk-ex' }, [
      el('div', { class: 'wk-ex-head' }, [
        el('button', { class: 'wk-ex-name link', text: ex.name + ' ›', onClick: () => openHistory(state, ex) }),
        el('div', { class: 'wk-ex-target', text: `${ex.sets}×${ex.repsMin}–${ex.repsMax} · ⏱ ${fmtRest(exRest)}` }),
      ]),
      sug ? el('div', { class: 'wk-suggest', html: sug.kind === 'weight'
        ? `🎯 цель: <b>${sug.w} кг</b> × ${sug.reps} (вес +, было ${formatSet(sug.from)})`
        : `🎯 цель: ${sug.w} кг × <b>${sug.reps}</b> повт (было ${formatSet(sug.from)})` }) : null,
      el('div', { class: 'sets' }, entry.sets.map((set, setIdx) =>
        setRow(ex, entry, set, setIdx, prev, exRest))),
    ]);
  }));

  const finishBtn = el('button', { class: 'btn btn-primary btn-block', text: '✅ Завершить тренировку', onClick: () => finish(ctx) });

  root.append(header, hud, hint, list, el('div', { class: 'wk-finish' }, [finishBtn]));
}

function fmtRest(sec) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Сумма XP, начисленного за подходы текущей тренировки.
function sessionXp(aw) {
  let t = 0;
  for (const e of (aw && aw.entries) || []) for (const s of e.sets) t += s.xpAwarded || 0;
  return t;
}

// Лучший est-1ПМ по упражнению (история + уже отмеченные подходы текущей тренировки).
function bestOneRm(state, aw, exerciseId, excludeSet) {
  let best = 0;
  for (const h of exerciseHistory(state, exerciseId)) best = Math.max(best, h.oneRm);
  const e = (aw.entries || []).find(x => x.exerciseId === exerciseId);
  if (e) for (const s of e.sets) {
    if (s !== excludeSet && s.done && s.w && s.reps) best = Math.max(best, epley1RM(s.w, s.reps));
  }
  return best;
}

function renderHud(hud, state) {
  const sx = sessionXp(state.activeWorkout);
  const lp = levelProgress(state.game.totalXp);
  hud.innerHTML = '';
  hud.append(
    el('div', { class: 'hud-top' }, [
      el('span', { class: 'hud-session', html: `Сессия: <b>+${sx}</b> XP` }),
      el('span', { class: 'hud-level', text: `Ур. ${lp.level}` }),
    ]),
    bar(lp.pct),
  );
}
function updateHud(state) {
  const hud = document.getElementById('wk-hud');
  if (hud) renderHud(hud, state);
}

function setRow(ex, entry, set, setIdx, prev, restSec) {
  const ps = prev && (prev.entries.find(e => e.exerciseId === ex.id) || {}).sets?.[setIdx];
  const row = el('div', { class: 'set-row' + (set.done ? ' set-done' : '') });

  const wIn = el('input', { type: 'number', inputmode: 'decimal', class: 'set-input', placeholder: 'кг', value: set.w != null ? set.w : '' });
  const rIn = el('input', { type: 'number', inputmode: 'numeric', class: 'set-input', placeholder: 'повт', value: set.reps != null ? set.reps : '' });
  const dot = el('span', { class: 'cmp-dot' });

  function refreshDot() {
    const c = compareSet(prev, ex.id, setIdx, set);
    dot.className = 'cmp-dot' + (c ? ' cmp-' + c : '');
    dot.textContent = c === 'green' ? '🟢' : c === 'yellow' ? '🟡' : c === 'red' ? '🔴' : '';
  }
  function update() {
    set.w = wIn.value === '' ? null : parseFloat(wIn.value.replace(',', '.'));
    set.reps = rIn.value === '' ? null : parseInt(rIn.value, 10);
    refreshDot();
    persist(); // сохраняем введённое (дебаунс), чтобы не потерять при выгрузке страницы
  }
  wIn.addEventListener('input', update);
  rIn.addEventListener('input', update);
  refreshDot();

  const doneBtn = el('button', { class: 'set-done-btn' + (set.done ? ' on' : ''), text: set.done ? '✓' : '○' });
  doneBtn.addEventListener('click', () => {
    const state = getState();
    if (!set.done) {
      // Отметить выполненным — только с весом и повторами.
      if (!(set.w && set.reps)) { toast('Введите вес и повторы', 'warn'); return; }
      set.done = true;
      doneBtn.className = 'set-done-btn on';
      row.classList.add('set-done');

      const isGreen = compareSet(prev, ex.id, setIdx, set) === 'green';
      const isPr = epley1RM(set.w, set.reps) > bestOneRm(state, active, ex.id, set) + 0.5;
      const bd = setXpBreakdown(set, { isGreen, isPr });
      set.xpAwarded = bd.total;
      const res = awardXp(state, bd.total, 'Подход');
      floatXp(doneBtn, `+${bd.total} XP`, 'pos');
      if (isPr) toast(`🏆 Рекорд в «${ex.name}»!`, 'success');
      tick();
      startRest(restSec);
      updateHud(state);
      persistNow();
      if (res.leveledUp) celebrate('⭐', `Уровень ${res.newLevel}!`, 'Новый уровень достигнут');
    } else {
      // Снять отметку — откатить начисленный за подход XP.
      set.done = false;
      doneBtn.className = 'set-done-btn';
      row.classList.remove('set-done');
      if (set.xpAwarded) {
        awardXp(state, -set.xpAwarded, 'Откат подхода');
        floatXp(doneBtn, `−${set.xpAwarded} XP`, 'neg');
        set.xpAwarded = 0;
        updateHud(state);
      }
      persistNow();
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
  const aw = state.activeWorkout || active;
  if (!aw) { ctx.navigate('workout'); return; }
  const day = state.plan.days.find(d => d.id === aw.dayId);
  const prev = previousSessionForDay(state, aw.dayId);

  // Сводка по выполненным подходам (рекорды считаем относительно истории до этой тренировки).
  let completedSets = 0, greenCount = 0, tonnage = 0;
  const prs = [];
  for (const e of aw.entries) {
    let pre = 0;
    for (const h of exerciseHistory(state, e.exerciseId)) pre = Math.max(pre, h.oneRm);
    let sessionBest = 0;
    e.sets.forEach((s, i) => {
      if (s.done && s.w && s.reps) {
        completedSets++; tonnage += s.w * s.reps;
        if (compareSet(prev, e.exerciseId, i, s) === 'green') greenCount++;
        sessionBest = Math.max(sessionBest, epley1RM(s.w, s.reps));
      }
    });
    if (sessionBest > pre + 0.5) {
      const ex = (day.exercises || []).find(x => x.id === e.exerciseId);
      prs.push({ name: ex ? ex.name : 'Упражнение', oneRm: round1(sessionBest) });
    }
  }
  if (completedSets === 0) { toast('Отметь выполненные подходы кнопкой ✓', 'warn'); return; }

  const setXpTotal = sessionXp(aw);
  const session = {
    id: aw.id, dayId: aw.dayId, dateISO: aw.dateISO,
    durationSec: Math.round((Date.now() - aw.startTs) / 1000),
    entries: aw.entries.map(e => ({ exerciseId: e.exerciseId, sets: e.sets.filter(s => s.done && s.w && s.reps).map(s => ({ w: s.w, reps: s.reps })) })).filter(e => e.sets.length),
    xp: 0,
  };
  const res = finalizeWorkout(state, session, setXpTotal);
  const events = recompute(state);
  state.activeWorkout = null; // тренировка завершена — убираем черновик
  active = null;
  persistNow();
  stopRest();

  ctx.navigate('home'); // под итоговым экраном будет главная
  showSummary({
    dayName: day ? day.name : 'Тренировка',
    totalXp: setXpTotal + res.completionXp,
    setXpTotal, completionXp: res.completionXp,
    completedSets, greenCount, tonnage: Math.round(tonnage), prs,
    leveledUp: res.xp.leveledUp, newLevel: res.xp.newLevel,
    achievements: events.newAchievements, quests: events.newQuests,
  });
}

function showSummary(s) {
  const lines = [];
  lines.push(el('div', { class: 'sum-xp', html: `+${s.totalXp} <span>XP</span>` }));
  lines.push(el('div', { class: 'sum-grid' }, [
    el('div', { class: 'sum-cell' }, [el('b', { text: String(s.completedSets) }), el('span', { text: 'подходов' })]),
    el('div', { class: 'sum-cell' }, [el('b', { text: `${s.tonnage}` }), el('span', { text: 'кг объём' })]),
    el('div', { class: 'sum-cell' }, [el('b', { text: `🟢 ${s.greenCount}` }), el('span', { text: 'прогресс' })]),
  ]));
  if (s.prs.length) lines.push(el('div', { class: 'sum-prs' }, [
    el('div', { class: 'sum-sub', text: '🏆 Личные рекорды' }),
    ...s.prs.map(p => el('div', { class: 'sum-pr', html: `${p.name} — <b>${p.oneRm} кг</b>` })),
  ]));
  lines.push(el('div', { class: 'sum-break muted small', text: `За подходы +${s.setXpTotal} · за завершение +${s.completionXp}` }));
  if (s.leveledUp) lines.push(el('div', { class: 'sum-event', text: `⭐ Новый уровень ${s.newLevel}!` }));
  for (const a of s.achievements) lines.push(el('div', { class: 'sum-event', text: `${a.icon} Ачивка: ${a.title}` }));
  for (const q of s.quests) lines.push(el('div', { class: 'sum-event', text: `🎯 Квест: ${q.text} (+${q.xp} XP)` }));

  const close = modal(`Готово — ${s.dayName}`, el('div', { class: 'sum-body' }, lines), [
    el('button', { class: 'btn btn-primary', text: 'Отлично!', onClick: () => close() }),
  ]);
  confetti();
  fanfare();
}
