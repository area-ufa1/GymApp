import { el, section, toast } from '../lib/dom.js';
import { getState, save } from '../store.js';
import { todayISO, weekKey } from '../models.js';
import { lineChart, barChart } from '../lib/chart.js';
import { epley1RM, ratio, round1, sessionTonnage, forecastDate, fmtDate, fmtNum } from '../lib/calc.js';
import { recompute, aggregate } from '../game/gamification.js';

const FIELDS = [
  { id: 'weight', label: 'Вес, кг' },
  { id: 'waist', label: 'Талия, см' },
  { id: 'chest', label: 'Грудь, см' },
  { id: 'shoulders', label: 'Плечи, см' },
  { id: 'hips', label: 'Бёдра, см' },
];

export function render(root, ctx) {
  const state = getState();
  const stats = aggregate(state);

  // --- Цель 1.60 + прогноз ---
  const ms = [...state.measurements].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const ratioPts = ms.map(m => ({ dateISO: m.dateISO, value: round1Ratio(ratio(m.shoulders, m.waist)) }));
  const goal = state.settings.goalRatio || 1.6;
  const fc = forecastDate(ratioPts, goal);
  const nowRatio = stats.ratioNow || stats.ratio;

  root.append(section('🎯 Цель: Плечи / Талия', [
    el('div', { class: 'goal-row' }, [
      el('div', { class: 'goal-now', html: `<b>${fmtNum(nowRatio, 2)}</b> <span>сейчас</span>` }),
      el('div', { class: 'goal-arrow', text: '→' }),
      el('div', { class: 'goal-target', html: `<b>${goal}</b> <span>цель</span>` }),
    ]),
    lineChart(ratioPts, { target: goal, empty: 'Внеси замеры ниже' }),
    el('div', { class: 'forecast', html: fc ? (nowRatio >= goal ? '👑 Цель достигнута!' : `📅 Прогноз достижения: <b>${fmtDate(fc)}</b> (по текущему темпу)`) : 'Нужно ≥2 замера для прогноза' }),
  ]));

  // --- Сумма 1ПМ во времени ---
  root.append(section('Сила (сумма 1ПМ)', [lineChart(strengthSeries(state), { empty: 'Вноси силовые на вкладке «Сила»' })]));

  // --- Тоннаж и частота по неделям ---
  const weekly = weeklyAgg(state);
  root.append(section('Тоннаж по неделям (т)', [barChart(weekly.map(w => ({ label: w.short, value: Math.round(w.tonnage / 100) / 10 })), { empty: 'Нет тренировок' })]));
  root.append(section('Частота (тренировок/нед.)', [barChart(weekly.map(w => ({ label: w.short, value: w.count })), { empty: 'Нет тренировок' })]));

  // --- Ввод замеров ---
  const inputs = {};
  const last = ms[ms.length - 1] || {};
  const form = el('div', { class: 'measure-form' }, FIELDS.map(f => {
    inputs[f.id] = el('input', { type: 'number', inputmode: 'decimal', class: 'set-input', placeholder: last[f.id] != null ? String(last[f.id]) : '' });
    return el('label', { class: 'measure-field' }, [el('span', { text: f.label }), inputs[f.id]]);
  }));
  const addBtn = el('button', { class: 'btn btn-primary btn-block', text: 'Сохранить замер', onClick: () => {
    const entry = { dateISO: todayISO() };
    let any = false;
    for (const f of FIELDS) { const v = inputs[f.id].value; if (v !== '') { entry[f.id] = parseFloat(v.replace(',', '.')); any = true; } else if (last[f.id] != null) { entry[f.id] = last[f.id]; } }
    if (!any) { toast('Заполни хотя бы одно поле', 'warn'); return; }
    state.measurements.push(entry);
    const events = recompute(state);
    save();
    toast('Замер сохранён 📏', 'success');
    events.newAchievements.forEach(a => toast(`${a.icon} ${a.title}`, 'success'));
    ctx.rerender();
  } });
  root.append(section('Новый замер тела', [form, addBtn]));

  // --- История тренировок ---
  const hist = [...state.sessions].sort((a, b) => b.dateISO.localeCompare(a.dateISO) || b.id.localeCompare(a.id)).slice(0, 30);
  root.append(section('История тренировок', hist.length ? hist.map(s => {
    const day = state.plan.days.find(d => d.id === s.dayId);
    const sets = (s.entries || []).reduce((n, e) => n + e.sets.length, 0);
    return el('div', { class: 'hist-row' }, [
      el('div', {}, [
        el('div', { class: 'hist-day', text: day ? day.name : 'Тренировка' }),
        el('div', { class: 'hist-date', text: fmtDate(s.dateISO) }),
      ]),
      el('div', { class: 'hist-meta', html: `${sets} подх. · ${Math.round(sessionTonnage(s))} кг · <b>+${s.xp || 0}</b> XP` }),
    ]);
  }) : [el('p', { class: 'muted', text: 'Пока нет завершённых тренировок.' })]));
}

function round1Ratio(r) { return Math.round(r * 1000) / 1000; }

function strengthSeries(state) {
  const log = [...(state.strength.log || [])].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const running = { squat: 0, bench: 0, deadlift: 0 };
  const byDate = new Map();
  for (const e of log) {
    for (const id of ['squat', 'bench', 'deadlift']) {
      if (e[id] && e[id].w) running[id] = Math.max(running[id], epley1RM(e[id].w, e[id].reps));
    }
    byDate.set(e.dateISO, round1(running.squat + running.bench + running.deadlift));
  }
  return [...byDate.entries()].map(([dateISO, value]) => ({ dateISO, value }));
}

function weeklyAgg(state) {
  const map = new Map();
  for (const s of state.sessions || []) {
    const wk = weekKey(new Date(s.dateISO));
    const cur = map.get(wk) || { count: 0, tonnage: 0, wk };
    cur.count++; cur.tonnage += sessionTonnage(s);
    map.set(wk, cur);
  }
  return [...map.values()].sort((a, b) => a.wk.localeCompare(b.wk)).slice(-8)
    .map(w => ({ ...w, short: w.wk.split('-W')[1] ? 'н' + w.wk.split('-W')[1] : w.wk }));
}
