// Акцентный цвет интерфейса. Меняет CSS-переменные --pri/--pri2.
import { getState } from '../store.js';

export const ACCENTS = [
  { id: 'violet', name: 'Фиолетовый', pri: '#6c5ce7', pri2: '#8f7bff' },
  { id: 'blue', name: 'Синий', pri: '#3b82f6', pri2: '#60a5fa' },
  { id: 'teal', name: 'Бирюзовый', pri: '#0ea5a4', pri2: '#22d3ee' },
  { id: 'green', name: 'Зелёный', pri: '#16a34a', pri2: '#22c55e' },
  { id: 'orange', name: 'Оранжевый', pri: '#f97316', pri2: '#fb923c' },
  { id: 'pink', name: 'Розовый', pri: '#ec4899', pri2: '#f472b6' },
  { id: 'red', name: 'Красный', pri: '#ef4444', pri2: '#f87171' },
];

export function applyAccent(state = getState()) {
  const id = (state.settings && state.settings.accentId) || 'violet';
  const a = ACCENTS.find(x => x.id === id) || ACCENTS[0];
  const root = document.documentElement;
  root.style.setProperty('--pri', a.pri);
  root.style.setProperty('--pri2', a.pri2);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', a.pri);
}
