// Локальные напоминания о тренировке через Notification API.
// Ограничение: без бэкенда уведомление планируется, пока приложение открыто/в фоне,
// и показывается при заходе, если день пропущен. Это не серверные push.
import { getState } from '../store.js';

let timerId = null;

export function notifySupported() {
  return typeof Notification !== 'undefined';
}

export async function requestReminderPermission() {
  if (!notifySupported()) return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  try { return await Notification.requestPermission(); } catch { return 'denied'; }
}

function workedOutToday(state) {
  const today = new Date().toISOString().slice(0, 10);
  return (state.sessions || []).some(s => s.dateISO === today);
}

function showNotification() {
  if (notifySupported() && Notification.permission === 'granted') {
    new Notification('💪 GymQuest', { body: 'Пора на тренировку! Не теряй серию 🔥', icon: './icons/icon-192.png' });
  }
}

// Планирует следующее напоминание на сегодня/завтра по времени из настроек.
export function scheduleReminder() {
  if (timerId) { clearTimeout(timerId); timerId = null; }
  const state = getState();
  const r = state.settings.reminders || {};
  if (!r.enabled || !notifySupported() || Notification.permission !== 'granted') return;

  const [h, m] = (r.time || '18:00').split(':').map(Number);
  const now = new Date();
  const next = new Date();
  next.setHours(h, m, 0, 0);

  // Если время уже прошло и сегодня не было тренировки — напомнить сразу.
  if (next <= now) {
    if (!workedOutToday(state)) showNotification();
    next.setDate(next.getDate() + 1);
  }
  const delay = Math.min(next - now, 2 ** 31 - 1);
  timerId = setTimeout(() => {
    if (!workedOutToday(getState())) showNotification();
    scheduleReminder();
  }, delay);
}
