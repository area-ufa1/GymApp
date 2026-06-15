import { el, section, toast, celebrate } from '../lib/dom.js';
import { getState, save } from '../store.js';
import { todayISO } from '../models.js';
import { parseSet, epley1RM, round1 } from '../lib/calc.js';
import { LIFTS, STRENGTH_LADDER, tierIndexFor, tierName, kgToNextTier } from '../data/strengthLevels.js';
import { aggregate, awardXp, recompute, strengthTitle } from '../game/gamification.js';

export function render(root, ctx) {
  const state = getState();
  const stats = aggregate(state);
  const title = strengthTitle(stats);

  root.append(section('Силовой титул', [
    el('div', { class: 'title-banner' }, [
      el('div', { class: 'rank-badge big', text: title.emoji }),
      el('div', {}, [
        el('div', { class: 'title-name', text: title.name }),
        el('div', { class: 'muted', text: 'Средний тир по трём базовым движениям' }),
      ]),
    ]),
  ]));

  // Ввод 1ПМ по каждому движению.
  root.append(section('Лучший подход → 1ПМ (Эпли)', LIFTS.map(lift => {
    const rm = stats.oneRm[lift.id];
    const toNext = kgToNextTier(lift.id, rm);
    const tIdx = tierIndexFor(lift.id, rm);
    const input = el('input', { type: 'text', class: 'set-input wide', placeholder: 'напр. 100×5' });
    const addBtn = el('button', {
      class: 'btn btn-primary', text: 'Внести',
      onClick: () => addRecord(ctx, lift.id, input.value),
    });
    return el('div', { class: 'lift-row' }, [
      el('div', { class: 'lift-head' }, [
        el('span', { class: 'lift-name', text: `${lift.icon} ${lift.name}` }),
        el('span', { class: 'lift-rm', html: `1ПМ <b>${rm || '—'}</b> кг` }),
      ]),
      el('div', { class: 'lift-meta', text: tIdx >= 0 ? `Тир: ${tierName(tIdx)} · до следующего ${toNext} кг` : 'Тир: ниже «Старт 1»' }),
      el('div', { class: 'lift-input' }, [input, addBtn]),
    ]);
  })));

  // Лестница уровней.
  const cur = {};
  for (const l of LIFTS) cur[l.id] = tierIndexFor(l.id, stats.oneRm[l.id]);
  const rows = [el('div', { class: 'ladder-row ladder-head' }, [
    el('span', { text: 'Уровень' }),
    ...LIFTS.map(l => el('span', { text: l.icon })),
  ])];
  STRENGTH_LADDER.forEach((lvl, i) => {
    rows.push(el('div', { class: 'ladder-row' }, [
      el('span', { class: 'ladder-name', text: lvl.name }),
      ...LIFTS.map(l => el('span', { class: 'ladder-cell' + (cur[l.id] === i ? ' cur' : (cur[l.id] > i ? ' passed' : '')), text: lvl[l.id] })),
    ]));
  });
  root.append(section('Лестница уровней силы (кг)', [el('div', { class: 'ladder' }, rows),
    el('p', { class: 'muted small', text: 'Зелёным — твой текущий тир по каждому движению. Стандарты ориентировочные.' })]));
}

function addRecord(ctx, liftId, raw) {
  const parsed = parseSet(raw);
  if (!parsed) { toast('Формат: «вес×повт», напр. 100×5', 'warn'); return; }
  const state = getState();
  const before = aggregate(state).oneRm[liftId];
  state.strength.log.push({ dateISO: todayISO(), [liftId]: parsed });
  const rm = round1(epley1RM(parsed.w, parsed.reps));
  const isPR = rm > before + 1e-9;
  if (isPR) awardXp(state, 40, 'Новый личный рекорд 1ПМ');
  const events = recompute(state);
  save();

  if (isPR) {
    toast(`🎉 Новый рекорд! 1ПМ ${rm} кг (+40 XP)`, 'success');
  } else {
    toast(`Записано: 1ПМ ${rm} кг`, 'info');
  }
  const queue = [];
  for (const a of events.newAchievements) queue.push([a.icon, a.title, 'Ачивка разблокирована']);
  playQueue(queue);
  ctx.rerender();
}

function playQueue(queue) {
  let i = 0;
  const next = () => { if (i < queue.length) { const [e, t, s] = queue[i++]; celebrate(e, t, s); setTimeout(next, 2300); } };
  next();
}
