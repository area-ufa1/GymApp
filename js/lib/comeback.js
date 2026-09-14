// Режим возвращения после перерыва.
// Если человек долго не тренировался, цели на подход (число подходов и вес)
// временно снижаются, а затем за три тренировки плавно возвращаются к обычным.
// Важно: рекорды (strength.log) и игровой прогресс не меняются — снижается
// только цель, показываемая на конкретной тренировке.

import { todayISO } from '../models.js';

// Сколько тренировок держится режим (1-я — по таблице, 2-я — половина отката, 3-я — полный объём).
export const COMEBACK_WORKOUTS = 3;

const DAY_MS = 86400000;

function ts(dateISO) {
  return Date.parse(`${String(dateISO).slice(0, 10)}T00:00:00Z`);
}

export function daysBetween(fromISO, toISO) {
  const a = ts(fromISO), b = ts(toISO);
  if (!isFinite(a) || !isFinite(b)) return 0;
  return Math.floor((b - a) / DAY_MS);
}

// Полных недель простоя между двумя датами (отрицательные значения → 0).
export function weeksBetween(fromISO, toISO) {
  return Math.max(0, Math.floor(daysBetween(fromISO, toISO) / 7));
}

// Таблица деградации целей по длительности простоя.
// Возвращает null, если простоя фактически нет (меньше недели).
export function tierForWeeks(weeks) {
  if (!(weeks >= 1)) return null;
  if (weeks < 2) return { setsFactor: 0.75, weightFactor: 1, label: '1–2 недели' };
  if (weeks <= 6) return { setsFactor: 0.67, weightFactor: 0.9, label: '2–6 недель' };
  return { setsFactor: 0.5, weightFactor: 0.75, label: 'более 6 недель' };
}

// Доля отката, которая ещё действует на N-й тренировке режима.
export function easeForStage(stage) {
  if (stage <= 0) return 1;     // первая тренировка — по таблице
  if (stage === 1) return 0.5;  // вторая — половина отката
  return 0;                     // третья — полный объём и веса
}

// Даты завершённых сессий (activeWorkout не учитывается) по возрастанию.
function completedDates(state) {
  return (state.sessions || [])
    .map(s => s && s.dateISO)
    .filter(Boolean)
    .map(d => String(d).slice(0, 10))
    .sort((a, b) => a.localeCompare(b));
}

// Текущее состояние режима возвращения или null.
// {weeks, stage, tier, setsFactor, weightFactor, reduced, lastSessionISO, workoutsLeft}
export function comebackState(state, today = todayISO()) {
  const dates = completedDates(state);
  if (!dates.length) return null;

  // 1) Простой прямо сейчас: от последней завершённой сессии до сегодня.
  const lastISO = dates[dates.length - 1];
  const gapNow = weeksBetween(lastISO, today);
  if (gapNow >= 1) return build(gapNow, 0, lastISO);

  // 2) Иначе — возможно, режим уже идёт: ищем последний разрыв в истории
  //    и считаем, сколько тренировок сделано после него.
  for (let i = dates.length - 1; i > 0; i--) {
    const gap = weeksBetween(dates[i - 1], dates[i]);
    if (gap >= 1) {
      const done = dates.length - i; // сессии, начиная с возвращающей
      if (done >= COMEBACK_WORKOUTS) return null;
      return build(gap, done, dates[i - 1]);
    }
  }
  return null;
}

function build(weeks, stage, lastSessionISO) {
  const tier = tierForWeeks(weeks);
  if (!tier) return null;
  const ease = easeForStage(stage);
  const setsFactor = 1 - (1 - tier.setsFactor) * ease;
  const weightFactor = 1 - (1 - tier.weightFactor) * ease;
  return {
    weeks,
    stage,
    tier,
    setsFactor,
    weightFactor,
    reduced: setsFactor < 1 || weightFactor < 1,
    lastSessionISO,
    workoutsLeft: Math.max(0, COMEBACK_WORKOUTS - stage),
  };
}

// Сколько подходов делать вместо планового числа (вниз, минимум 2).
export function adjustSets(planSets, setsFactor) {
  const n = Math.max(1, Math.round(planSets || 1));
  if (!(setsFactor < 1)) return n;
  return Math.min(n, Math.max(2, Math.floor(n * setsFactor)));
}

// Снижение веса цели. Округление до 0.25 кг — как в обычной прогрессии.
export function adjustWeight(w, weightFactor) {
  if (!(w > 0) || !(weightFactor < 1)) return w;
  return Math.round(w * weightFactor * 4) / 4;
}

// Скорректированная цель по упражнению (подсказка прогрессии с уменьшенным весом).
export function adjustSuggestion(sug, weightFactor) {
  if (!sug) return null;
  if (!(weightFactor < 1)) return sug;
  return { ...sug, w: adjustWeight(sug.w, weightFactor), fullW: sug.w, eased: true };
}

// Текст плашки в шапке тренировки.
export function comebackNote(cb) {
  if (!cb) return null;
  const n = cb.weeks;
  const head = `Возвращение после ${n} ${weeksGen(n)}`;
  if (!cb.reduced) return `${head}: последняя тренировка режима — полный объём и веса.`;
  const tail = cb.stage === 0 ? '' : ' (плавный выход: половина отката)';
  return `${head}: объём и веса снижены${tail}.`;
}

// «после 1 недели» / «после 5 недель» — родительный падеж.
export function weeksGen(n) {
  return Math.abs(n) % 10 === 1 && Math.abs(n) % 100 !== 11 ? 'недели' : 'недель';
}

// «1 неделя» / «3 недели» / «12 недель» — именительный падеж.
export function weeksNom(n) {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a >= 11 && a <= 14) return 'недель';
  if (b === 1) return 'неделя';
  if (b >= 2 && b <= 4) return 'недели';
  return 'недель';
}
