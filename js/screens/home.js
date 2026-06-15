import { el, section, bar, stat } from '../lib/dom.js';
import { getState } from '../store.js';
import { aggregate, strengthTitle, getQuests, bosses } from '../game/gamification.js';

export function nextDay(state) {
  const days = state.plan.days;
  if (!days.length) return null;
  const last = [...(state.sessions || [])].sort((a, b) => b.dateISO.localeCompare(a.dateISO) || b.id.localeCompare(a.id))[0];
  if (!last) return days[0];
  const idx = days.findIndex(d => d.id === last.dayId);
  return days[(idx + 1) % days.length];
}

export function render(root, ctx) {
  const state = getState();
  const stats = aggregate(state);
  const title = strengthTitle(stats);
  const lp = stats.levelProgress;

  // --- Шапка героя ---
  const hero = el('section', { class: 'card hero' }, [
    el('div', { class: 'hero-top' }, [
      el('div', { class: 'rank-badge', text: title.emoji }),
      el('div', { class: 'hero-titles' }, [
        el('div', { class: 'hero-rank', text: title.name }),
        el('div', { class: 'hero-level', html: `Уровень <b>${stats.level}</b>` }),
      ]),
      el('div', { class: 'streak-chip', html: `🔥 <b>${stats.currentStreak}</b><span>нед.</span>` }),
    ]),
    el('div', { class: 'xp-row' }, [
      bar(lp.pct),
      el('div', { class: 'xp-text', text: `${lp.inLevel} / ${lp.need} XP до ур. ${stats.level + 1}` }),
    ]),
    el('div', { class: 'hero-stats' }, [
      stat('Тренировок', stats.sessions),
      stat('Тоннаж', `${(stats.tonnage / 1000).toFixed(1)}т`),
      stat('Рекордов', stats.prCount),
    ]),
  ]);

  // --- Тренировка дня ---
  const day = nextDay(state);
  const todayCard = section('Тренировка дня', [
    day ? el('div', { class: 'today' }, [
      el('div', {}, [
        el('div', { class: 'today-name', text: day.name }),
        el('div', { class: 'today-focus', text: day.focus }),
      ]),
      el('button', { class: 'btn btn-primary', text: '▶ Начать', onClick: () => ctx.navigate(`workout/${day.id}`) }),
    ]) : el('p', { class: 'muted', text: 'Добавь день в плане.' }),
  ]);

  // --- Квесты недели ---
  const quests = getQuests(state);
  const questCard = section('Квесты недели', quests.map(q => el('div', { class: `quest ${q.claimed ? 'done' : ''}` }, [
    el('div', { class: 'quest-icon', text: q.claimed ? '✅' : q.icon }),
    el('div', { class: 'quest-main' }, [
      el('div', { class: 'quest-text', text: q.text }),
      bar(Math.round((q.progress / q.target) * 100)),
    ]),
    el('div', { class: 'quest-xp', text: `+${q.xp}` }),
    el('div', { class: 'quest-prog', text: `${q.progress}/${q.target}` }),
  ])));

  // --- Боссы ---
  const bossList = bosses(state, stats);
  const bossCard = section('Боссы-рубежи', bossList.map(b => el('div', { class: `boss ${b.big ? 'boss-big' : ''} ${b.pct >= 100 ? 'beaten' : ''}` }, [
    el('div', { class: 'boss-icon', text: b.pct >= 100 ? '🏆' : b.icon }),
    el('div', { class: 'boss-main' }, [
      el('div', { class: 'boss-name', text: b.name }),
      bar(b.pct, { gold: b.big }),
    ]),
    el('div', { class: 'boss-val', text: `${fmt(b.cur)} / ${b.target}${b.unit}` }),
  ])));

  root.append(hero, todayCard, questCard, bossCard);
}

function fmt(x) {
  if (x == null) return '—';
  return Number.isInteger(x) ? String(x) : (Math.round(x * 100) / 100).toString();
}
