import { el, section, bar, toast, modal } from '../lib/dom.js';
import { getState, save, exportJSON, importJSON, resetAll } from '../store.js';
import { uid, MUSCLE_GROUPS, inferMuscle } from '../models.js';
import { aggregate, strengthTitle, recompute } from '../game/gamification.js';
import { ACHIEVEMENTS } from '../data/achievements.js';
import { STRENGTH_LADDER } from '../data/strengthLevels.js';
import { records } from '../lib/analytics.js';
import { fmtDate } from '../lib/calc.js';
import { fanfare } from '../lib/effects.js';
import { requestReminderPermission, scheduleReminder, notifySupported } from '../lib/reminders.js';

const TON_MILESTONES = [
  { t: 1000, icon: '🏋️', name: '1 тонна' },
  { t: 10000, icon: '🐘', name: '10 т — слон' },
  { t: 50000, icon: '🚌', name: '50 т — автобус' },
  { t: 100000, icon: '🦏', name: '100 т — носорог' },
  { t: 500000, icon: '🐋', name: '500 т — кит' },
];

export function render(root, ctx) {
  const state = getState();
  const stats = aggregate(state);
  const title = strengthTitle(stats);

  // --- Карточка персонажа ---
  const goal = state.settings.goalRatio || 1.6;
  const strengthPct = Math.round(((title.idx + 1) / STRENGTH_LADDER.length) * 100);
  const aesthPct = Math.max(0, Math.min(100, Math.round(((stats.ratioNow || stats.ratio) - 1.0) / (goal - 1.0) * 100)));
  const volPct = Math.min(100, Math.round((stats.tonnage / 100000) * 100));
  const consPct = Math.min(100, Math.round((stats.longestStreak / 12) * 100));
  const charStats = [
    { icon: '⚔️', name: 'Сила', pct: strengthPct, val: title.name },
    { icon: '📐', name: 'Эстетика', pct: aesthPct, val: (stats.ratioNow || stats.ratio).toFixed(2) },
    { icon: '🏋️', name: 'Объём', pct: volPct, val: `${(stats.tonnage / 1000).toFixed(1)} т` },
    { icon: '🔥', name: 'Постоянство', pct: consPct, val: `${stats.currentStreak} нед.` },
  ];
  root.append(section('Карточка персонажа', [
    el('div', { class: 'char-head' }, [
      el('div', { class: 'rank-badge big', text: title.emoji }),
      el('div', {}, [
        el('div', { class: 'char-title', text: title.name }),
        el('div', { class: 'muted', text: `Уровень ${stats.level} · ${state.game.totalXp} XP` }),
      ]),
    ]),
    el('div', { class: 'char-stats' }, charStats.map(s => el('div', { class: 'char-stat' }, [
      el('div', { class: 'char-stat-top' }, [
        el('span', { text: `${s.icon} ${s.name}` }),
        el('span', { class: 'char-stat-val', text: s.val }),
      ]),
      bar(s.pct),
    ]))),
  ]));

  // --- Ачивки ---
  const unlocked = new Set(state.game.unlocked);
  const grid = ACHIEVEMENTS.map(a => el('div', {
    class: `ach ${unlocked.has(a.id) ? 'ach-on' : 'ach-off'}`, title: a.desc,
  }, [
    el('div', { class: 'ach-icon', text: a.icon }),
    el('div', { class: 'ach-title', text: a.title }),
    el('div', { class: 'ach-desc', text: a.desc }),
  ]));
  root.append(section(`Достижения (${unlocked.size}/${ACHIEVEMENTS.length})`, [el('div', { class: 'ach-grid' }, grid)]));

  // --- Тоннаж-вехи ---
  root.append(section('Тоннаж-вехи', TON_MILESTONES.map(m => {
    const pct = Math.min(100, Math.round((stats.tonnage / m.t) * 100));
    return el('div', { class: `boss ${pct >= 100 ? 'beaten' : ''}` }, [
      el('div', { class: 'boss-icon', text: m.icon }),
      el('div', { class: 'boss-main' }, [el('div', { class: 'boss-name', text: m.name }), bar(pct)]),
      el('div', { class: 'boss-val', text: `${(stats.tonnage / 1000).toFixed(1)}/${m.t / 1000}т` }),
    ]);
  })));

  // --- Зал славы рекордов ---
  const recs = records(state).slice(0, 12);
  root.append(section('🏆 Зал славы рекордов', recs.length ? recs.map(r => el('div', { class: 'rec-row' }, [
    el('div', { class: 'rec-main' }, [
      el('div', { class: 'rec-name', text: r.name }),
      el('div', { class: 'rec-muscle', text: r.muscle }),
    ]),
    el('div', { class: 'rec-vals', html: `${r.maxW} кг · 1ПМ <b>${r.oneRm}</b>` }),
  ])) : [el('p', { class: 'muted', text: 'Рекорды появятся после первых тренировок.' })]));

  // --- Фото-прогресс ---
  const photos = state.game.photos || [];
  const fileIn = el('input', { type: 'file', accept: 'image/*', class: 'hidden-file' });
  fileIn.addEventListener('change', () => handlePhoto(fileIn, ctx));
  root.append(section('Фото-прогресс', [
    el('div', { class: 'photo-grid' }, photos.length ? photos.slice().reverse().map((p, i) =>
      el('div', { class: 'photo-cell' }, [
        el('img', { src: p.data, alt: p.dateISO }),
        el('div', { class: 'photo-date', text: p.dateISO }),
        el('button', { class: 'photo-del', text: '✕', onClick: () => { state.game.photos.splice(photos.length - 1 - i, 1); save(); ctx.rerender(); } }),
      ])) : [el('p', { class: 'muted', text: 'Добавь фото, чтобы отслеживать визуальный прогресс.' })]),
    el('button', { class: 'btn btn-ghost btn-block', text: '📷 Добавить фото', onClick: () => fileIn.click() }),
    fileIn,
  ]));

  // --- Настройки ---
  root.append(settingsSection(state, ctx));

  // --- Редактор плана ---
  root.append(planEditor(state, ctx));

  // --- Данные ---
  root.append(section('Данные', [
    el('div', { class: 'data-btns' }, [
      el('button', { class: 'btn btn-ghost', text: '⬇ Экспорт', onClick: exportData }),
      el('button', { class: 'btn btn-ghost', text: '⬆ Импорт', onClick: () => importData(ctx) }),
      el('button', { class: 'btn btn-danger', text: '🗑 Сброс', onClick: () => {
        if (confirm('Удалить все данные и начать заново?')) { resetAll(); toast('Данные сброшены', 'info'); ctx.rerender(); }
      } }),
    ]),
    el('p', { class: 'muted small', text: 'Данные хранятся только в этом браузере. Делай экспорт для бэкапа и переноса на другое устройство.' }),
  ]));
}

function toggleRow(label, checked, onChange) {
  const input = el('input', { type: 'checkbox' });
  input.checked = !!checked;
  input.addEventListener('change', () => onChange(input.checked));
  return el('label', { class: 'toggle-row' }, [
    el('span', { text: label }),
    el('span', { class: 'switch' }, [input, el('span', { class: 'slider' })]),
  ]);
}

function settingsSection(state, ctx) {
  const s = state.settings;
  const restSel = el('select', { class: 'set-input wide' }, [60, 90, 120, 150, 180].map(v =>
    el('option', { value: v, text: `${v} сек`, selected: (s.defaultRestSec || 90) === v })));
  restSel.addEventListener('change', () => { s.defaultRestSec = +restSel.value; save(); });

  const timeIn = el('input', { type: 'time', class: 'set-input', value: (s.reminders && s.reminders.time) || '18:00' });
  timeIn.addEventListener('change', () => { s.reminders.time = timeIn.value; save(); scheduleReminder(); });

  return section('Настройки', [
    toggleRow('🔊 Звук', s.sound !== false, v => { s.sound = v; save(); }),
    toggleRow('📳 Вибрация', s.haptics !== false, v => { s.haptics = v; save(); }),
    el('label', { class: 'toggle-row' }, [el('span', { text: '⏱ Отдых по умолчанию' }), restSel]),
    toggleRow('🔔 Напоминания о тренировке', !!(s.reminders && s.reminders.enabled), async v => {
      if (v) {
        const perm = await requestReminderPermission();
        if (perm !== 'granted') { toast(notifySupported() ? 'Разрешите уведомления в браузере' : 'Уведомления не поддерживаются', 'warn'); ctx.rerender(); return; }
      }
      s.reminders.enabled = v; save(); scheduleReminder();
    }),
    (s.reminders && s.reminders.enabled) ? el('label', { class: 'toggle-row' }, [el('span', { text: 'Время напоминания' }), timeIn]) : null,
    el('button', { class: 'btn btn-ghost btn-block', text: '✨ Проверить эффекты', onClick: () => fanfare() }),
    el('p', { class: 'muted small', text: 'Напоминания работают локально (без сервера): уведомление приходит, если приложение открыто/в фоне, либо при заходе после пропуска.' }),
  ]);
}

function planEditor(state, ctx) {
  const days = state.plan.days.map(day => {
    const exItems = day.exercises.map(ex => el('div', { class: 'pe-ex' }, [
      el('span', { class: 'pe-ex-name', text: ex.name }),
      el('span', { class: 'pe-ex-meta', text: `${ex.sets}×${ex.repsMin}–${ex.repsMax}` }),
      el('button', { class: 'icon-btn', text: '✎', onClick: () => editExercise(state, day, ex, ctx) }),
      el('button', { class: 'icon-btn', text: '✕', onClick: () => { day.exercises = day.exercises.filter(e => e !== ex); save(); ctx.rerender(); } }),
    ]));
    return el('details', { class: 'pe-day' }, [
      el('summary', {}, [el('b', { text: day.name }), el('span', { class: 'muted', text: ` · ${day.focus}` })]),
      ...exItems,
      el('button', { class: 'btn btn-ghost btn-sm', text: '+ Упражнение', onClick: () => editExercise(state, day, null, ctx) }),
      el('div', { class: 'pe-day-actions' }, [
        el('button', { class: 'btn btn-ghost btn-sm', text: '✎ День', onClick: () => editDay(state, day, ctx) }),
        el('button', { class: 'btn btn-danger btn-sm', text: '✕ Удалить день', onClick: () => { if (confirm('Удалить день?')) { state.plan.days = state.plan.days.filter(d => d !== day); save(); ctx.rerender(); } } }),
      ]),
    ]);
  });
  return section('Редактор плана', [
    ...days,
    el('button', { class: 'btn btn-ghost btn-block', text: '+ Добавить день', onClick: () => {
      state.plan.days.push({ id: uid('d'), name: `День ${state.plan.days.length + 1}`, focus: '', exercises: [] });
      save(); ctx.rerender();
    } }),
  ]);
}

function editExercise(state, day, ex, ctx) {
  const name = el('input', { type: 'text', class: 'set-input wide', value: ex ? ex.name : '', placeholder: 'Название упражнения' });
  const sets = el('input', { type: 'number', class: 'set-input', value: ex ? ex.sets : 3 });
  const rmin = el('input', { type: 'number', class: 'set-input', value: ex ? ex.repsMin : 8 });
  const rmax = el('input', { type: 'number', class: 'set-input', value: ex ? ex.repsMax : 12 });
  const muscle = el('select', { class: 'set-input wide' }, MUSCLE_GROUPS.map(g =>
    el('option', { value: g, text: g, selected: (ex ? (ex.muscle || inferMuscle(ex.name)) : 'Прочее') === g })));
  const body = el('div', { class: 'edit-form' }, [
    el('label', { text: 'Упражнение' }), name,
    el('label', { text: 'Группа мышц' }), muscle,
    el('div', { class: 'edit-row3' }, [
      el('label', {}, [el('span', { text: 'Подходы' }), sets]),
      el('label', {}, [el('span', { text: 'Повт. от' }), rmin]),
      el('label', {}, [el('span', { text: 'Повт. до' }), rmax]),
    ]),
  ]);
  const close = modal(ex ? 'Изменить упражнение' : 'Новое упражнение', body, [
    el('button', { class: 'btn btn-primary', text: 'Сохранить', onClick: () => {
      if (!name.value.trim()) { toast('Введите название', 'warn'); return; }
      const data = { name: name.value.trim(), muscle: muscle.value, sets: +sets.value || 1, repsMin: +rmin.value || 1, repsMax: +rmax.value || 1 };
      if (ex) Object.assign(ex, data); else day.exercises.push({ id: uid('ex'), ...data });
      save(); close(); ctx.rerender();
    } }),
  ]);
}

function editDay(state, day, ctx) {
  const name = el('input', { type: 'text', class: 'set-input wide', value: day.name });
  const focus = el('input', { type: 'text', class: 'set-input wide', value: day.focus });
  const body = el('div', { class: 'edit-form' }, [el('label', { text: 'Название' }), name, el('label', { text: 'Фокус' }), focus]);
  const close = modal('Изменить день', body, [
    el('button', { class: 'btn btn-primary', text: 'Сохранить', onClick: () => { day.name = name.value.trim() || day.name; day.focus = focus.value.trim(); save(); close(); ctx.rerender(); } }),
  ]);
}

function handlePhoto(fileIn, ctx) {
  const file = fileIn.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      // Сжимаем до ширины 600px, чтобы не раздувать localStorage.
      const scale = Math.min(1, 600 / img.width);
      const c = document.createElement('canvas');
      c.width = img.width * scale; c.height = img.height * scale;
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      const data = c.toDataURL('image/jpeg', 0.7);
      const state = getState();
      state.game.photos = state.game.photos || [];
      state.game.photos.push({ dateISO: new Date().toISOString().slice(0, 10), data });
      if (save()) {
        toast('Фото добавлено 📷', 'success');
      } else {
        state.game.photos.pop(); // откат, чтобы не зависло несохранённым
        save();
        toast('Не хватило места в хранилище для фото', 'warn');
      }
      ctx.rerender();
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
}

function exportData() {
  const blob = new Blob([exportJSON()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `gymapp-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Экспортировано ⬇', 'success');
}

function importData(ctx) {
  const ta = el('textarea', { class: 'import-area', placeholder: 'Вставь JSON бэкапа сюда' });
  const close = modal('Импорт данных', el('div', {}, [ta]), [
    el('button', { class: 'btn btn-primary', text: 'Загрузить', onClick: () => {
      try { importJSON(ta.value); recompute(getState()); save(); toast('Импортировано ⬆', 'success'); close(); ctx.rerender(); }
      catch (e) { toast('Неверный JSON', 'warn'); }
    } }),
  ]);
}
