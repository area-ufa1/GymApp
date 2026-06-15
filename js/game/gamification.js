// Ядро геймификации: XP, уровни, титулы, серии, квесты, боссы, ачивки.
import { epley1RM, round1, sessionTonnage, ratio } from '../lib/calc.js';
import { LIFTS, tierIndexFor, tierName, STRENGTH_LADDER } from '../data/strengthLevels.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { weekOrdinal, weekKey, todayISO } from '../models.js';
import { nutritionStats, computeTargets, dayTotals, dayInNorm } from '../lib/nutrition.js';

const LIFT_IDS = ['squat', 'bench', 'deadlift'];

// ---- Уровни (RPG) ----
// Суммарный XP для достижения уровня L: 50 * L * (L-1). До след. уровня: 100*L.
export function levelForXp(xp) {
  let L = 1;
  while (50 * (L + 1) * L <= xp) L++;
  return L;
}
export function xpFloor(level) { return 50 * level * (level - 1); }
export function xpForLevel(level) { return xpFloor(level + 1) - xpFloor(level); } // = 100*level
export function levelProgress(xp) {
  const L = levelForXp(xp);
  const base = xpFloor(L);
  const need = xpForLevel(L);
  return { level: L, inLevel: xp - base, need, pct: Math.min(100, Math.round(((xp - base) / need) * 100)) };
}

// ---- Агрегированная статистика по всему состоянию ----
export function aggregate(state) {
  const oneRm = { squat: 0, bench: 0, deadlift: 0 };
  const running = { squat: 0, bench: 0, deadlift: 0 };
  let prCount = 0;
  const log = [...(state.strength.log || [])].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  for (const entry of log) {
    for (const id of LIFT_IDS) {
      const s = entry[id];
      if (s && s.w) {
        const rm = epley1RM(s.w, s.reps);
        if (rm > running[id] + 1e-9) {
          if (running[id] > 0) prCount++;
          running[id] = rm;
        }
      }
    }
  }
  for (const id of LIFT_IDS) oneRm[id] = round1(running[id]);

  const ms = [...(state.measurements || [])].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  const last = ms[ms.length - 1] || {};
  let shouldersMax = 0, ratioMax = 0;
  for (const m of ms) {
    if (m.shoulders > shouldersMax) shouldersMax = m.shoulders;
    const r = ratio(m.shoulders, m.waist);
    if (r > ratioMax) ratioMax = r;
  }

  const tiers = {};
  let minTier = 99;
  for (const id of LIFT_IDS) {
    const t = Math.max(0, tierIndexFor(id, oneRm[id]));
    tiers[id] = t;
    if (t < minTier) minTier = t;
  }
  if (minTier === 99) minTier = 0;

  let tonnage = 0;
  for (const s of state.sessions || []) tonnage += sessionTonnage(s);

  const nut = nutritionStats(state);

  const xp = state.game.totalXp || 0;
  const lp = levelProgress(xp);

  // Эффективная текущая серия (рвётся, если пропущена неделя).
  const cw = weekOrdinal(new Date());
  let currentStreak = state.game.currentStreak || 0;
  if (state.game.lastStreakWeek == null || cw - state.game.lastStreakWeek > 1) currentStreak = 0;

  return {
    oneRm,
    shoulders: shouldersMax,
    shouldersNow: last.shoulders || 0,
    ratio: ratioMax,
    ratioNow: ratio(last.shoulders, last.waist),
    sessions: (state.sessions || []).length,
    tonnage: Math.round(tonnage),
    prCount,
    tiers,
    minTier,
    level: lp.level,
    levelProgress: lp,
    currentStreak,
    longestStreak: state.game.longestStreak || 0,
    measurementsCount: ms.length,
    nutritionHitDays: nut.hitDays,
    nutritionLoggedDays: nut.loggedDays,
  };
}

// Начисляет XP за сегодняшний «день в норме» (один раз за дату). Возвращает событие или null.
export function registerNutritionDay(state) {
  const today = todayISO();
  state.game.nutritionXpDates = state.game.nutritionXpDates || [];
  if (state.game.nutritionXpDates.includes(today)) return null;
  const target = computeTargets(state);
  if (!dayInNorm(dayTotals(state, today), target)) return null;
  state.game.nutritionXpDates.push(today);
  const xp = awardXp(state, 60, 'День по КБЖУ в норме');
  return { xp };
}

// ---- Титул по силе (синхронно с тирами) ----
export function strengthTitle(stats) {
  const idxs = LIFT_IDS.map(id => stats.tiers[id]);
  const avg = Math.floor(idxs.reduce((a, b) => a + b, 0) / idxs.length);
  const name = tierName(avg);
  return { name, emoji: rankEmoji(name), idx: avg };
}
export function rankEmoji(name) {
  if (name.startsWith('Старт')) return '🥉';
  if (name.startsWith('Базовый')) return '🥈';
  if (name.startsWith('Средний')) return '🥇';
  if (name.startsWith('Продвин')) return '💠';
  if (name.startsWith('Элита')) return '👑';
  return '🎖️';
}

// ---- XP ----
export function awardXp(state, amount, reason) {
  amount = Math.round(amount);
  state.game.totalXp = (state.game.totalXp || 0) + amount;
  state.game.xpLog = state.game.xpLog || [];
  state.game.xpLog.push({ dateISO: todayISO(), amount, reason });
  const newLevel = levelForXp(state.game.totalXp);
  const leveledUp = newLevel > (state.game.level || 1);
  state.game.level = newLevel;
  return { amount, leveledUp, newLevel };
}

// ---- Серия по неделям ----
function registerWorkoutWeek(state) {
  const cw = weekOrdinal(new Date());
  const last = state.game.lastStreakWeek;
  if (last == null) state.game.currentStreak = 1;
  else if (cw === last) { /* та же неделя — серия не меняется */ }
  else if (cw - last === 1) state.game.currentStreak = (state.game.currentStreak || 0) + 1;
  else state.game.currentStreak = 1;
  state.game.lastStreakWeek = cw;
  state.game.longestStreak = Math.max(state.game.longestStreak || 0, state.game.currentStreak);
}

// ---- Сравнение подходов с прошлой сессией того же дня ----
export function previousSessionForDay(state, dayId, beforeId = null) {
  const list = (state.sessions || [])
    .map((s, i) => ({ s, i }))
    .filter(o => o.s.dayId === dayId && o.s.id !== beforeId)
    // по дате убыв., при равенстве — по порядку добавления (поздняя запись = «предыдущая»)
    .sort((a, b) => b.s.dateISO.localeCompare(a.s.dateISO) || b.i - a.i);
  return list[0] ? list[0].s : null;
}

// Цвет подхода vs тот же подход в прошлой сессии: 'green' | 'yellow' | 'red' | null.
export function compareSet(prevSession, exerciseId, setIdx, set) {
  if (!prevSession) return null;
  const pe = (prevSession.entries || []).find(e => e.exerciseId === exerciseId);
  if (!pe) return null;
  const ps = pe.sets[setIdx];
  if (!ps || !ps.w || !set || !set.w) return null;
  const a = epley1RM(set.w, set.reps);
  const b = epley1RM(ps.w, ps.reps);
  if (a > b + 0.5) return 'green';
  if (a < b - 0.5) return 'red';
  return 'yellow';
}

// ---- Завершение тренировки: пишет сессию, начисляет XP, обновляет серию ----
export function finalizeWorkout(state, session) {
  const prev = previousSessionForDay(state, session.dayId);
  let completedSets = 0, greenSets = 0;
  for (const e of session.entries) {
    e.sets.forEach((s, i) => {
      if (s && s.w && s.reps) {
        completedSets++;
        if (compareSet(prev, e.exerciseId, i, s) === 'green') greenSets++;
      }
    });
  }
  const xpAmount = 50 + completedSets * 8 + greenSets * 20;
  session.xp = xpAmount;
  state.sessions.push(session);
  registerWorkoutWeek(state);
  const xpRes = awardXp(state, xpAmount, 'Тренировка завершена');
  return { completedSets, greenSets, xp: xpRes, breakdown: { base: 50, perSet: completedSets * 8, green: greenSets * 20 } };
}

// ---- Боссы-рубежи ----
export function bosses(state, stats) {
  const goal = state.settings.goalRatio || 1.6;
  return [
    { icon: '👑', name: `Эстетика: Плечи/Талия ${goal}`, cur: stats.ratioNow || stats.ratio, target: goal, unit: '', big: true },
    { icon: '🦵', name: 'Присед 130 кг', cur: stats.oneRm.squat, target: 130, unit: 'кг' },
    { icon: '🏋️', name: 'Жим лёжа 90 кг', cur: stats.oneRm.bench, target: 90, unit: 'кг' },
    { icon: '🪝', name: 'Становая 140 кг', cur: stats.oneRm.deadlift, target: 140, unit: 'кг' },
    { icon: '💪', name: 'Плечи 113 см', cur: stats.shouldersNow || stats.shoulders, target: 113, unit: 'см' },
  ].map(b => ({ ...b, pct: Math.min(100, Math.round(((b.cur || 0) / b.target) * 100)) }));
}

// ---- Недельные квесты ----
const QUEST_DEFS = [
  { id: 'sessions3', icon: '📅', text: '3 тренировки за неделю', target: 3, xp: 120,
    progress: (state) => sessionsThisWeek(state) },
  { id: 'all4', icon: '🗓️', text: 'Закрыть все дни плана за неделю', target: (state) => Math.max(1, (state.plan.days || []).length), xp: 200,
    progress: (state) => distinctDaysThisWeek(state) },
  { id: 'log', icon: '📏', text: 'Занести замер или силовой', target: 1, xp: 80,
    progress: (state) => loggedThisWeek(state) },
  { id: 'nutrition', icon: '🍎', text: 'Попади в норму КБЖУ 3 дня', target: 3, xp: 150,
    progress: (state) => nutritionDaysInNormThisWeek(state) },
];

function nutritionDaysInNormThisWeek(state) {
  const wk = thisWeekKey();
  const target = computeTargets(state);
  const dates = [...new Set((state.nutritionLog || []).map(e => e.dateISO))];
  return dates.filter(d => weekKey(new Date(d)) === wk && dayInNorm(dayTotals(state, d), target)).length;
}

function thisWeekKey() { return weekKey(new Date()); }
function sessionsThisWeek(state) {
  return (state.sessions || []).filter(s => weekKey(new Date(s.dateISO)) === thisWeekKey()).length;
}
function distinctDaysThisWeek(state) {
  const set = new Set((state.sessions || [])
    .filter(s => weekKey(new Date(s.dateISO)) === thisWeekKey())
    .map(s => s.dayId));
  return set.size;
}
function loggedThisWeek(state) {
  const wk = thisWeekKey();
  const s = (state.strength.log || []).some(e => !e.seed && weekKey(new Date(e.dateISO)) === wk);
  const m = (state.measurements || []).some(e => !e.seed && weekKey(new Date(e.dateISO)) === wk);
  return (s || m) ? 1 : 0;
}

export function ensureQuests(state) {
  const wk = thisWeekKey();
  if (!state.game.quests || state.game.quests.weekKey !== wk) {
    state.game.quests = { weekKey: wk, done: [] };
  }
  if (!state.game.quests.done) state.game.quests.done = [];
}

export function getQuests(state) {
  ensureQuests(state);
  return QUEST_DEFS.map(q => {
    const target = typeof q.target === 'function' ? q.target(state) : q.target;
    const progress = Math.min(target, q.progress(state));
    return { ...q, target, progress, complete: progress >= target, claimed: state.game.quests.done.includes(q.id) };
  });
}

// Начисляет XP за выполненные, но ещё не зачтённые квесты. Возвращает список новых.
export function claimQuests(state) {
  ensureQuests(state);
  const newly = [];
  for (const q of getQuests(state)) {
    if (q.complete && !q.claimed) {
      state.game.quests.done.push(q.id);
      awardXp(state, q.xp, `Квест: ${q.text}`);
      newly.push(q);
    }
  }
  return newly;
}

// ---- Ачивки ----
export function checkAchievements(state, stats) {
  const newly = [];
  for (const a of ACHIEVEMENTS) {
    if (!state.game.unlocked.includes(a.id) && a.check(stats)) {
      state.game.unlocked.push(a.id);
      awardXp(state, a.group === 'goal' ? 300 : 100, `Ачивка: ${a.title}`);
      newly.push(a);
    }
  }
  return newly;
}

// Полный пересчёт после любого изменения данных. Возвращает события для тостов.
export function recompute(state) {
  const stats = aggregate(state);
  const newQuests = claimQuests(state);
  const newAch = checkAchievements(state, aggregate(state)); // повторно — XP квестов мог поднять уровень
  return { stats: aggregate(state), newQuests, newAchievements: newAch };
}
