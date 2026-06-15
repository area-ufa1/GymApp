// Определения ачивок. check(ctx) — чистый предикат по агрегированной статистике.
// group: 'goal' — исходные 11 целей из таблицы; 'game' — игровые достижения.

export const ACHIEVEMENTS = [
  // --- Исходные 11 целей (привязаны к числам из таблицы) ---
  { id: 'sq120', group: 'goal', icon: '🦵', title: 'Присед 120 кг', desc: '1ПМ приседа ≥ 120 кг', check: c => c.oneRm.squat >= 120 },
  { id: 'sq130', group: 'goal', icon: '🦵', title: 'Присед 130 кг', desc: '1ПМ приседа ≥ 130 кг', check: c => c.oneRm.squat >= 130 },
  { id: 'bp80', group: 'goal', icon: '🏋️', title: 'Жим лёжа 80 кг', desc: '1ПМ жима ≥ 80 кг', check: c => c.oneRm.bench >= 80 },
  { id: 'bp90', group: 'goal', icon: '🏋️', title: 'Жим лёжа 90 кг', desc: '1ПМ жима ≥ 90 кг', check: c => c.oneRm.bench >= 90 },
  { id: 'dl130', group: 'goal', icon: '🪝', title: 'Становая 130 кг', desc: '1ПМ становой ≥ 130 кг', check: c => c.oneRm.deadlift >= 130 },
  { id: 'dl140', group: 'goal', icon: '🪝', title: 'Становая 140 кг', desc: '1ПМ становой ≥ 140 кг', check: c => c.oneRm.deadlift >= 140 },
  { id: 'sh110', group: 'goal', icon: '💪', title: 'Плечи 110 см', desc: 'Обхват плеч ≥ 110 см', check: c => c.shoulders >= 110 },
  { id: 'sh113', group: 'goal', icon: '💪', title: 'Плечи 113 см', desc: 'Обхват плеч ≥ 113 см', check: c => c.shoulders >= 113 },
  { id: 'r145', group: 'goal', icon: '📐', title: 'Плечи/Талия 1.45', desc: 'Соотношение ≥ 1.45', check: c => c.ratio >= 1.45 },
  { id: 'r150', group: 'goal', icon: '📐', title: 'Плечи/Талия 1.50', desc: 'Соотношение ≥ 1.50', check: c => c.ratio >= 1.5 },
  { id: 'r160', group: 'goal', icon: '👑', title: 'Плечи/Талия 1.60 — ЦЕЛЬ', desc: 'Главная цель достигнута!', check: c => c.ratio >= 1.6 },

  // --- Игровые достижения ---
  { id: 'first', group: 'game', icon: '🎉', title: 'Первый шаг', desc: 'Завершить первую тренировку', check: c => c.sessions >= 1 },
  { id: 's10', group: 'game', icon: '🔟', title: '10 тренировок', desc: 'Завершить 10 тренировок', check: c => c.sessions >= 10 },
  { id: 's50', group: 'game', icon: '🏅', title: '50 тренировок', desc: 'Завершить 50 тренировок', check: c => c.sessions >= 50 },
  { id: 's100', group: 'game', icon: '💯', title: '100 тренировок', desc: 'Завершить 100 тренировок', check: c => c.sessions >= 100 },
  { id: 'streak4', group: 'game', icon: '🔥', title: 'Месяц в строю', desc: 'Серия 4 недели подряд', check: c => c.longestStreak >= 4 },
  { id: 'streak12', group: 'game', icon: '🔥', title: 'Несгибаемый', desc: 'Серия 12 недель подряд', check: c => c.longestStreak >= 12 },
  { id: 'pr5', group: 'game', icon: '📈', title: 'Рекордсмен', desc: '5 новых личных рекордов 1ПМ', check: c => c.prCount >= 5 },
  { id: 'ton10', group: 'game', icon: '🐘', title: 'Слон (10 т)', desc: 'Поднять суммарно 10 000 кг', check: c => c.tonnage >= 10000 },
  { id: 'ton100', group: 'game', icon: '🦏', title: 'Носорог (100 т)', desc: 'Поднять суммарно 100 000 кг', check: c => c.tonnage >= 100000 },
  { id: 'tier_mid', group: 'game', icon: '⚔️', title: 'Средний уровень', desc: 'Все три движения — тир «Средний»+', check: c => c.minTier >= 6 },
  { id: 'tier_adv', group: 'game', icon: '🛡️', title: 'Продвинутый', desc: 'Все три движения — тир «Продвинутый»+', check: c => c.minTier >= 9 },
  { id: 'lvl10', group: 'game', icon: '⭐', title: 'Уровень 10', desc: 'Достичь 10-го уровня', check: c => c.level >= 10 },
];
