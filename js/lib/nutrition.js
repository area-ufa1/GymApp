// Расчёт нормы КБЖУ (Mifflin-St Jeor) и агрегаты по дневнику питания. Чистые функции.
import { todayISO } from '../models.js';

export const ACTIVITY_LEVELS = [
  { value: 1.2, label: 'Минимум (сидячий)' },
  { value: 1.375, label: 'Лёгкая (1–3 трен./нед)' },
  { value: 1.55, label: 'Средняя (3–5 трен./нед)' },
  { value: 1.725, label: 'Высокая (6–7 трен./нед)' },
];

export function bodyweightOf(state) {
  const log = [...(state.weightLog || [])].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  return (log.length ? log[log.length - 1].weight : null) || state.settings.bodyweight || 70;
}

// Целевые КБЖУ. Если задан ручной override — возвращаем его.
export function computeTargets(state) {
  const n = state.settings.nutrition || {};
  if (n.manual && n.manual.kcal) {
    const m = n.manual;
    return { kcal: m.kcal, protein: m.protein || 0, fat: m.fat || 0, carbs: m.carbs || 0, source: 'manual' };
  }
  const weight = bodyweightOf(state);
  const bmr = 10 * weight + 6.25 * (n.height || 175) - 5 * (n.age || 25) + (n.sex === 'female' ? -161 : 5);
  const tdee = bmr * (n.activity || 1.55);
  const adj = n.goalMode === 'surplus' ? Math.abs(n.surplusKcal || 250)
    : n.goalMode === 'cut' ? -Math.abs(n.surplusKcal || 250) : 0;
  const kcal = Math.round((tdee + adj) / 10) * 10;
  const protein = Math.round(weight * (n.proteinPerKg || 1.8));
  const fat = Math.round((kcal * 0.25) / 9);
  const carbs = Math.max(0, Math.round((kcal - protein * 4 - fat * 9) / 4));
  return { kcal, protein, fat, carbs, source: 'auto', tdee: Math.round(tdee), bmr: Math.round(bmr) };
}

export function dayTotals(state, dateISO) {
  const t = { kcal: 0, protein: 0, fat: 0, carbs: 0 };
  for (const e of state.nutritionLog || []) {
    if (e.dateISO === dateISO) {
      t.kcal += e.kcal || 0; t.protein += e.protein || 0; t.fat += e.fat || 0; t.carbs += e.carbs || 0;
    }
  }
  t.kcal = Math.round(t.kcal); t.protein = Math.round(t.protein); t.fat = Math.round(t.fat); t.carbs = Math.round(t.carbs);
  return t;
}

// День «в норме»: ккал в коридоре ±12% и белок ≥ 90% цели.
export function dayInNorm(totals, target) {
  if (!totals.kcal) return false;
  const kcalOk = Math.abs(totals.kcal - target.kcal) <= target.kcal * 0.12;
  const proteinOk = totals.protein >= target.protein * 0.9;
  return kcalOk && proteinOk;
}

// Перечень дат с записями.
export function loggedDates(state) {
  return [...new Set((state.nutritionLog || []).map(e => e.dateISO))].sort();
}

export function nutritionStats(state) {
  const target = computeTargets(state);
  const dates = loggedDates(state);
  let hitDays = 0;
  for (const d of dates) if (dayInNorm(dayTotals(state, d), target)) hitDays++;
  const today = todayISO();
  return { target, hitDays, loggedDays: dates.length, today: dayTotals(state, today), todayInNorm: dayInNorm(dayTotals(state, today), target) };
}

// Макросы записи из продукта (per100) и граммов.
export function macrosFromFood(food, grams) {
  const k = grams / 100;
  return {
    kcal: Math.round(food.per100.kcal * k),
    protein: Math.round(food.per100.protein * k * 10) / 10,
    fat: Math.round(food.per100.fat * k * 10) / 10,
    carbs: Math.round(food.per100.carbs * k * 10) / 10,
  };
}
