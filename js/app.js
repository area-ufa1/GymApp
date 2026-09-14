import { clear } from './lib/dom.js';
import { load, getState, save } from './store.js';
import { recompute } from './game/gamification.js';
import { scheduleReminder } from './lib/reminders.js';
import * as home from './screens/home.js';
import * as workout from './screens/workout.js';
import * as nutrition from './screens/nutrition.js';
import * as strength from './screens/strength.js';
import * as progress from './screens/progress.js';
import * as profile from './screens/profile.js';

const SCREENS = {
  home: { mod: home, icon: '🏠', label: 'Главная' },
  workout: { mod: workout, icon: '🏋️', label: 'Трен.' },
  nutrition: { mod: nutrition, icon: '🍎', label: 'Питание' },
  strength: { mod: strength, icon: '💪', label: 'Сила' },
  progress: { mod: progress, icon: '📈', label: 'Прогресс' },
  profile: { mod: profile, icon: '🎮', label: 'Профиль' },
};

const main = document.getElementById('main');
const navHost = document.getElementById('nav');

function parseHash() {
  const raw = (location.hash || '#home').slice(1);
  const [route, param] = raw.split('/');
  return { route: SCREENS[route] ? route : 'home', param };
}

function navigate(to) {
  location.hash = '#' + to;
}

function rerender() {
  const { route, param } = parseHash();
  clear(main);
  main.scrollTop = 0;
  window.scrollTo(0, 0);
  const ctx = { navigate, rerender, param };
  SCREENS[route].mod.render(main, ctx);
  renderNav(route);
}

function renderNav(active) {
  clear(navHost);
  for (const [key, s] of Object.entries(SCREENS)) {
    const btn = document.createElement('button');
    btn.className = 'nav-btn' + (key === active ? ' active' : '');
    btn.innerHTML = `<span class="nav-icon">${s.icon}</span><span class="nav-label">${s.label}</span>`;
    btn.addEventListener('click', () => navigate(key));
    navHost.appendChild(btn);
  }
}

window.addEventListener('hashchange', rerender);

function init() {
  load();
  recompute(getState()); // выдать ачивки/квесты, накопившиеся между сессиями
  save();
  if (!location.hash) location.hash = '#home';
  rerender();
  // Зависшая тренировка (старше двух дней) — предложить продолжить или выбросить.
  workout.promptStaleWorkout({ navigate, rerender, param: undefined });
  scheduleReminder();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./service-worker.js').catch(e => console.warn('SW не зарегистрирован', e));
    });
  }
}

init();
