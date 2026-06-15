// Единое хранилище состояния поверх localStorage.
import { STORAGE_KEY, GOAL_RATIO, uid, todayISO } from './models.js';
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
    version: 1,
    settings: { bodyweight: SEED_MEASUREMENT.weight, goalRatio: GOAL_RATIO },
    plan: buildPlan(),
    sessions: [],
    strength: {
      // лог силовых: каждая запись — лучший подход по движению на дату
      log: [{ dateISO: today, ...SEED_STRENGTH }],
    },
    measurements: [{ dateISO: today, ...SEED_MEASUREMENT }],
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
  } catch (e) {
    console.error('Ошибка сохранения', e);
  }
}

// Точка для будущих миграций версий.
function migrate(s) {
  const def = defaultState();
  return { ...def, ...s, game: { ...def.game, ...(s.game || {}) }, settings: { ...def.settings, ...(s.settings || {}) } };
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
