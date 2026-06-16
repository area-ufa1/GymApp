// Единое хранилище состояния поверх localStorage.
import { STORAGE_KEY, GOAL_RATIO, uid, todayISO, inferMuscle, weekKey } from './models.js';
import { SEED_PLAN, SEED_STRENGTH, SEED_MEASUREMENT } from './data/seedPlan.js';

function buildPlan() {
  return {
    name: SEED_PLAN.name,
    days: SEED_PLAN.days.map(d => ({
      id: d.id,
      name: d.name,
      focus: d.focus,
      exercises: d.exercises.map(e => ({ id: uid('ex'), ...e })),
    })),
  };
}

export function defaultState() {
  const today = todayISO();
  return {
    version: 2,
    settings: {
      bodyweight: SEED_MEASUREMENT.weight,
      goalRatio: GOAL_RATIO,
      sound: true,
      haptics: true,
      defaultRestSec: 90,
      reminders: { enabled: false, time: '18:00' },
      nutrition: {
        sex: 'male', height: 175, age: 25, activity: 1.55,
        goalMode: 'surplus', surplusKcal: 250, proteinPerKg: 1.8,
        manual: null, // {kcal, protein, fat, carbs} — ручное переопределение нормы
      },
    },
    plan: buildPlan(),
    sessions: [],
    strength: {
      // лог силовых: каждая запись — лучший подход по движению на дату.
      // seed:true — стартовые значения, не считаются «действием этой недели» для квестов.
      log: [{ dateISO: today, seed: true, ...SEED_STRENGTH }],
    },
    measurements: [{ dateISO: today, seed: true, ...SEED_MEASUREMENT }],
    weightLog: [{ dateISO: today, seed: true, weight: SEED_MEASUREMENT.weight }],
    foods: [],          // свои продукты: {id, name, per100:{kcal,protein,fat,carbs}}
    nutritionLog: [],   // приёмы: {id, dateISO, name, grams, kcal, protein, fat, carbs}
    game: {
      totalXp: 0,
      level: 1,
      currentStreak: 0,
      longestStreak: 0,
      lastStreakWeek: null,
      prCount: 0,
      unlocked: [],
      quests: { weekKey: null, items: [] },
      photos: [],
      xpLog: [], // [{dateISO, amount, reason}]
      nutritionXpDates: [], // даты, за которые уже начислен XP «день в норме»
    },
  };
}

let state = null;

export function getState() {
  if (!state) load();
  return state;
}

export function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    state = raw ? migrate(JSON.parse(raw)) : defaultState();
  } catch (e) {
    console.error('Не удалось прочитать сохранение, создаю новое', e);
    state = defaultState();
  }
  return state;
}

export function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (e) {
    console.error('Ошибка сохранения', e);
    return false;
  }
}

// Точка для будущих миграций версий.
function migrate(s) {
  const def = defaultState();
  const merged = {
    ...def, ...s,
    game: { ...def.game, ...(s.game || {}) },
    settings: {
      ...def.settings, ...(s.settings || {}),
      reminders: { ...def.settings.reminders, ...((s.settings || {}).reminders || {}) },
      nutrition: { ...def.settings.nutrition, ...((s.settings || {}).nutrition || {}) },
    },
  };
  if (!Array.isArray(merged.weightLog)) merged.weightLog = def.weightLog;
  if (!Array.isArray(merged.foods)) merged.foods = [];
  if (!Array.isArray(merged.nutritionLog)) merged.nutritionLog = [];
  if (!Array.isArray(merged.game.nutritionXpDates)) merged.game.nutritionXpDates = [];
  // Проставляем группу мышц упражнениям, где её ещё нет.
  if (merged.plan && Array.isArray(merged.plan.days)) {
    for (const d of merged.plan.days) {
      for (const ex of d.exercises || []) {
        if (!ex.muscle) ex.muscle = inferMuscle(ex.name);
      }
    }
  }

  // v1 → v2: разово снять ошибочно начисленные стартовые XP за квест «Занеси замер/
  // силовой», который раньше автозачитывался по seed-данным (баг стартовых 80 XP).
  if ((s.version || 1) < 2) {
    const wk = weekKey(new Date());
    const q = merged.game.quests;
    if (q && q.weekKey === wk && Array.isArray(q.done) && q.done.includes('log')) {
      const realLog =
        (merged.strength.log || []).some(e => !e.seed && weekKey(new Date(e.dateISO)) === wk) ||
        (merged.measurements || []).some(e => !e.seed && weekKey(new Date(e.dateISO)) === wk);
      if (!realLog) {
        q.done = q.done.filter(id => id !== 'log');
        merged.game.totalXp = Math.max(0, (merged.game.totalXp || 0) - 80);
        const idx = (merged.game.xpLog || []).findIndex(e => e.reason && e.reason.includes('Занести замер'));
        if (idx >= 0) merged.game.xpLog.splice(idx, 1);
      }
    }
    // Пересчёт уровня по скорректированному XP (та же формула, что в gamification).
    let L = 1;
    while (50 * (L + 1) * L <= (merged.game.totalXp || 0)) L++;
    merged.game.level = L;
  }
  merged.version = 2;
  return merged;
}

export function resetAll() {
  state = defaultState();
  save();
}

export function exportJSON() {
  return JSON.stringify(getState(), null, 2);
}

export function importJSON(text) {
  const parsed = JSON.parse(text);
  state = migrate(parsed);
  save();
  return state;
}
