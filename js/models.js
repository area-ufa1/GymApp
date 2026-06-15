// Общие константы и хелперы для модели данных.

export const STORAGE_KEY = 'gymapp.state.v1';
export const GOAL_RATIO = 1.6;

export const MUSCLE_GROUPS = ['Грудь', 'Спина', 'Плечи', 'Ноги', 'Руки', 'Пресс', 'Прочее'];

// Определение группы мышц по названию упражнения (для своих/старых упражнений).
export function inferMuscle(name = '') {
  const n = name.toLowerCase();
  if (/присед|выпад|жим ног|икр|румын|ягод|бедр|гакк|сгибан.*ног|разгибан.*ног/.test(n)) return 'Ноги';
  if (/пресс|скручив|планк|кор\b/.test(n)) return 'Пресс';
  if (/бицепс|трицепс|предплеч|сгибан.*рук|разгибан.*рук|молот/.test(n)) return 'Руки';
  if (/сведен|разведен.*груд|жим.*(наклон|груд|брус|горизонт|лёж|лежа)|брус/.test(n)) return 'Грудь';
  if (/тяг|подтягив|пуловер|блок|становая|шраг/.test(n)) return 'Спина';
  if (/жим гантел.*сид|армейск|махи|дельт|плеч|жим стоя/.test(n)) return 'Плечи';
  return 'Прочее';
}

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

// Ключ ISO-недели вида «2026-W24» — для weekly-streak и квестов.
export function weekKey(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7; // Пн=0
  d.setUTCDate(d.getUTCDate() - dayNum + 3); // ближайший четверг
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(
    ((d - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7
  );
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// Номер недели как монотонное число (для сравнения «соседние недели»).
export function weekOrdinal(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - dayNum); // понедельник недели
  return Math.floor(d.getTime() / (7 * 86400000));
}
