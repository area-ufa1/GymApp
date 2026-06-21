// Аналитика поверх состояния: история упражнений, прогрессия, объём по мышцам,
// календарь-теплокарта, рекорды. Чистые функции.
import { epley1RM, round1, setTonnage } from './calc.js';
import { inferMuscle } from '../models.js';

// Рекомендуемый отдых для упражнения (сек). Ручной override ex.restSec, иначе
// по нижней границе диапазона повторов: тяжёлая база — дольше, многоповторка — меньше.
export function restForExercise(ex) {
  if (ex && ex.restSec != null && ex.restSec !== '') return Math.max(10, +ex.restSec);
  const r = (ex && (ex.repsMin || ex.repsMax)) || 10;
  if (r <= 6) return 180;
  if (r <= 12) return 120;
  return 60;
}

// Карта exerciseId -> {name, muscle} по текущему плану.
export function exerciseIndex(state) {
  const map = new Map();
  for (const d of state.plan.days) {
    for (const ex of d.exercises) {
      map.set(ex.id, { name: ex.name, muscle: ex.muscle || inferMuscle(ex.name), day: d.name });
    }
  }
  return map;
}

// Лучший подход (по est-1RM) в наборе подходов.
function bestSet(sets) {
  let best = null, bestRm = -1;
  for (const s of sets || []) {
    if (s && s.w && s.reps) {
      const rm = epley1RM(s.w, s.reps);
      if (rm > bestRm) { bestRm = rm; best = s; }
    }
  }
  return best;
}

// История по упражнению: точки est-1RM, max-вес и объём по сессиям.
export function exerciseHistory(state, exerciseId) {
  const out = [];
  const sessions = [...state.sessions].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
  for (const s of sessions) {
    const e = (s.entries || []).find(x => x.exerciseId === exerciseId);
    if (!e || !e.sets.length) continue;
    const bs = bestSet(e.sets);
    if (!bs) continue;
    const maxW = Math.max(...e.sets.map(x => x.w || 0));
    const vol = e.sets.reduce((n, x) => n + setTonnage(x), 0);
    out.push({ dateISO: s.dateISO, oneRm: round1(epley1RM(bs.w, bs.reps)), maxW, volume: vol, best: bs });
  }
  return out;
}

// Подсказка прогрессии на следующую тренировку по прошлому лучшему подходу.
export function suggestProgression(exercise, prevEntry) {
  if (!prevEntry) return null;
  const bs = bestSet(prevEntry.sets);
  if (!bs) return null;
  // Достиг верха диапазона повторов -> добавляем вес и возвращаемся к низу диапазона.
  if (bs.reps >= exercise.repsMax) {
    const inc = bs.w >= 40 ? 2.5 : 1.25;
    const w = Math.round((bs.w + inc) * 4) / 4;
    return { w, reps: exercise.repsMin, kind: 'weight', from: bs };
  }
  // Иначе тот же вес, цель +1 повтор (в пределах диапазона).
  return { w: bs.w, reps: Math.min(bs.reps + 1, exercise.repsMax), kind: 'reps', from: bs };
}

// Недельный объём (число рабочих подходов) по группам мышц за последние `days` дней.
export function muscleVolume(state, days = 7) {
  const idx = exerciseIndex(state);
  const since = Date.now() - days * 86400000;
  const map = new Map();
  for (const s of state.sessions || []) {
    if (new Date(s.dateISO).getTime() < since) continue;
    for (const e of s.entries || []) {
      const info = idx.get(e.exerciseId);
      const muscle = info ? info.muscle : 'Прочее';
      const cur = map.get(muscle) || { muscle, sets: 0, tonnage: 0 };
      cur.sets += e.sets.length;
      cur.tonnage += e.sets.reduce((n, x) => n + setTonnage(x), 0);
      map.set(muscle, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.sets - a.sets);
}

// Данные для календаря-теплокарты: последние `weeks` недель по дням (Пн..Вс).
export function heatmapData(state, weeks = 14) {
  const byDay = new Map();
  for (const s of state.sessions || []) {
    const key = s.dateISO;
    const cur = byDay.get(key) || { sets: 0, tonnage: 0 };
    for (const e of s.entries || []) { cur.sets += e.sets.length; cur.tonnage += e.sets.reduce((n, x) => n + setTonnage(x), 0); }
    byDay.set(key, cur);
  }
  const today = new Date();
  const dow = (today.getDay() + 6) % 7; // Пн=0
  const end = new Date(today); end.setDate(end.getDate() + (6 - dow)); // воскресенье текущей недели
  const cols = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const col = [];
    for (let d = 0; d < 7; d++) {
      const date = new Date(end);
      date.setDate(end.getDate() - w * 7 - (6 - d));
      const iso = date.toISOString().slice(0, 10);
      const info = byDay.get(iso);
      col.push({ iso, future: date > today, level: info ? Math.min(4, Math.ceil(info.sets / 6)) : 0, sets: info ? info.sets : 0 });
    }
    cols.push(col);
  }
  return cols;
}

// Зал славы: лучший max-вес и est-1RM по каждому упражнению, где есть данные.
export function records(state) {
  const idx = exerciseIndex(state);
  const map = new Map();
  for (const s of state.sessions || []) {
    for (const e of s.entries || []) {
      const info = idx.get(e.exerciseId);
      if (!info) continue;
      const cur = map.get(e.exerciseId) || { name: info.name, muscle: info.muscle, maxW: 0, oneRm: 0, dateW: null, date1: null };
      for (const st of e.sets) {
        if (!st.w || !st.reps) continue;
        if (st.w > cur.maxW) { cur.maxW = st.w; cur.dateW = s.dateISO; }
        const rm = epley1RM(st.w, st.reps);
        if (rm > cur.oneRm) { cur.oneRm = round1(rm); cur.date1 = s.dateISO; }
      }
      map.set(e.exerciseId, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.oneRm - a.oneRm);
}
