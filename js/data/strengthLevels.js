// Лестница уровней силы (кг) — из листа «Уровни силы».
// Порядок столбцов: [присед, жим лёжа, становая].

export const LIFTS = [
  { id: 'squat', name: 'Присед', icon: '🦵' },
  { id: 'bench', name: 'Жим лёжа', icon: '🏋️' },
  { id: 'deadlift', name: 'Становая', icon: '🪝' },
];

export const STRENGTH_LADDER = [
  { name: 'Старт 1', squat: 50, bench: 34, deadlift: 68 },
  { name: 'Старт 2', squat: 61.7, bench: 39.7, deadlift: 78.7 },
  { name: 'Старт 3', squat: 73.3, bench: 45.3, deadlift: 89.3 },
  { name: 'Базовый 1', squat: 85, bench: 51, deadlift: 100 },
  { name: 'Базовый 2', squat: 90, bench: 56.7, deadlift: 106 },
  { name: 'Базовый 3', squat: 95, bench: 62.3, deadlift: 112 },
  { name: 'Средний 1', squat: 100, bench: 68, deadlift: 118 },
  { name: 'Средний 2', squat: 111.7, bench: 78.7, deadlift: 129.3 },
  { name: 'Средний 3', squat: 123.3, bench: 89.3, deadlift: 140.7 },
  { name: 'Продвин. 1', squat: 135, bench: 100, deadlift: 152 },
  { name: 'Продвин. 2', squat: 146.7, bench: 111.7, deadlift: 163.3 },
  { name: 'Продвин. 3', squat: 158.3, bench: 123.3, deadlift: 174.7 },
  { name: 'Элита', squat: 170, bench: 135, deadlift: 186 },
];

// Тир по конкретному 1ПМ для движения. Возвращает индекс достигнутого уровня
// (0..n-1) или -1, если ниже «Старт 1».
export function tierIndexFor(liftId, oneRm) {
  let idx = -1;
  for (let i = 0; i < STRENGTH_LADDER.length; i++) {
    if (oneRm >= STRENGTH_LADDER[i][liftId]) idx = i;
  }
  return idx;
}

export function tierName(idx) {
  if (idx < 0) return 'Старт';
  return STRENGTH_LADDER[idx].name;
}

// Сколько кг до следующего подуровня по движению.
export function kgToNextTier(liftId, oneRm) {
  const idx = tierIndexFor(liftId, oneRm);
  const next = STRENGTH_LADDER[idx + 1];
  if (!next) return 0;
  return Math.round((next[liftId] - oneRm) * 10) / 10;
}
