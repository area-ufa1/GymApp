import { el, section, bar, toast, celebrate, celebrateQueue, modal, undoToast } from '../lib/dom.js';
import { getState, save } from '../store.js';
import { uid, todayISO } from '../models.js';
import { barChart } from '../lib/chart.js';
import { computeTargets, dayTotals, macrosFromFood, ACTIVITY_LEVELS, bodyweightOf } from '../lib/nutrition.js';
import { recompute, reconcileNutritionDay } from '../game/gamification.js';

const MACROS = [
  { key: 'kcal', label: 'Ккал', unit: '', color: 'kcal' },
  { key: 'protein', label: 'Белок', unit: 'г', color: 'prot' },
  { key: 'fat', label: 'Жиры', unit: 'г', color: 'fat' },
  { key: 'carbs', label: 'Углеводы', unit: 'г', color: 'carb' },
];

export function render(root, ctx) {
  const state = getState();
  const target = computeTargets(state);
  const today = todayISO();
  const totals = dayTotals(state, today);

  // --- Сводка дня (кольца/бары) ---
  root.append(section('Сегодня', [
    el('div', { class: 'macro-grid' }, MACROS.map(m => {
      const cur = totals[m.key];
      const tgt = target[m.key];
      const pct = tgt ? Math.round((cur / tgt) * 100) : 0;
      const over = m.key === 'kcal' && pct > 112;
      const under = m.key === 'kcal' && pct < 88 && cur > 0;
      return el('div', { class: 'macro-card' }, [
        el('div', { class: 'macro-top' }, [
          el('span', { class: 'macro-label', text: m.label }),
          el('span', { class: `macro-val ${over ? 'over' : under ? 'under' : ''}`, html: `<b>${cur}</b> / ${tgt}${m.unit}` }),
        ]),
        el('div', { class: `bar bar-${m.color}` }, [el('div', { class: 'bar-fill', style: `width:${Math.min(100, pct)}%` })]),
      ]);
    })),
    el('div', { class: 'macro-note muted small', text: target.source === 'manual'
      ? 'Норма задана вручную.'
      : `Норма: TDEE ${target.tdee} ккал ${state.settings.nutrition.goalMode === 'surplus' ? '+ профицит' : state.settings.nutrition.goalMode === 'cut' ? '− дефицит' : ''} → ${target.kcal} ккал.` }),
    el('button', { class: 'btn btn-primary btn-block', text: '➕ Добавить приём пищи', onClick: () => addMealModal(state, ctx) }),
  ]));

  // --- Приёмы за сегодня ---
  const meals = (state.nutritionLog || []).filter(e => e.dateISO === today);
  root.append(section('Приёмы за сегодня', meals.length ? meals.map(e => el('div', { class: 'meal-row' }, [
    el('div', { class: 'meal-main' }, [
      el('div', { class: 'meal-name', text: e.name }),
      el('div', { class: 'meal-macros', text: `${e.grams ? e.grams + ' г · ' : ''}Б ${e.protein} · Ж ${e.fat} · У ${e.carbs}` }),
    ]),
    el('div', { class: 'meal-kcal', html: `<b>${e.kcal}</b> ккал` }),
    el('button', { class: 'icon-btn', text: '✕', onClick: () => {
      const idx = state.nutritionLog.indexOf(e);
      state.nutritionLog.splice(idx, 1); afterChange(state, ctx);
      undoToast(`Удалено: ${e.name}`, () => { state.nutritionLog.splice(idx, 0, e); afterChange(state, ctx); });
    } }),
  ])) : [el('p', { class: 'muted', text: 'Пока ничего не добавлено сегодня.' })]));

  // --- График калорий за неделю ---
  root.append(section('Калории за 7 дней', [weeklyKcalChart(state, target)]));

  // --- Мои продукты ---
  const foods = state.foods || [];
  root.append(section('Мои продукты (на 100 г)', [
    ...(foods.length ? foods.map(f => el('div', { class: 'food-row' }, [
      el('div', { class: 'food-main' }, [
        el('div', { class: 'food-name', text: f.name }),
        el('div', { class: 'food-macros', text: `${f.per100.kcal} ккал · Б ${f.per100.protein} · Ж ${f.per100.fat} · У ${f.per100.carbs}` }),
      ]),
      el('button', { class: 'icon-btn', text: '✎', onClick: () => foodModal(state, ctx, f) }),
      el('button', { class: 'icon-btn', text: '✕', onClick: () => {
        const idx = state.foods.indexOf(f);
        state.foods.splice(idx, 1); save(); ctx.rerender();
        undoToast(`Продукт «${f.name}» удалён`, () => { state.foods.splice(idx, 0, f); save(); ctx.rerender(); });
      } }),
    ])) : [el('p', { class: 'muted', text: 'Добавь часто используемые продукты для быстрого ввода.' })]),
    el('button', { class: 'btn btn-ghost btn-block', text: '+ Добавить продукт', onClick: () => foodModal(state, ctx, null) }),
  ]));

  // --- Настройка нормы ---
  root.append(targetSetup(state, ctx, target));
}

function weeklyKcalChart(state, target) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    days.push({ label: ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'][(d.getDay() + 6) % 7], value: dayTotals(state, iso).kcal });
  }
  if (days.every(d => d.value === 0)) return el('p', { class: 'muted', text: 'Нет данных за неделю.' });
  return el('div', {}, [barChart(days, {}), el('div', { class: 'muted small', text: `Цель: ${target.kcal} ккал/день` })]);
}

function addMealModal(state, ctx) {
  const foods = state.foods || [];
  let mode = foods.length ? 'food' : 'manual';

  const body = el('div', { class: 'meal-form' });
  function rebuild() {
    body.innerHTML = '';
    const seg = el('div', { class: 'segmented' }, [
      el('button', { class: 'seg' + (mode === 'food' ? ' on' : ''), text: 'Из продуктов', onClick: () => { mode = 'food'; rebuild(); } }),
      el('button', { class: 'seg' + (mode === 'manual' ? ' on' : ''), text: 'Разовый ввод', onClick: () => { mode = 'manual'; rebuild(); } }),
    ]);
    body.append(seg);

    if (mode === 'food') {
      if (!foods.length) { body.append(el('p', { class: 'muted', text: 'Сначала добавь продукты ниже.' })); return; }
      const sel = el('select', { class: 'set-input wide' }, foods.map(f => el('option', { value: f.id, text: f.name })));
      const grams = el('input', { type: 'number', inputmode: 'decimal', class: 'set-input', placeholder: 'граммы', value: 100 });
      const preview = el('div', { class: 'macro-note muted small' });
      function upd() {
        const f = foods.find(x => x.id === sel.value);
        const g = parseFloat((grams.value || '').replace(',', '.')) || 0;
        if (f && g) { const mm = macrosFromFood(f, g); preview.textContent = `${mm.kcal} ккал · Б ${mm.protein} · Ж ${mm.fat} · У ${mm.carbs}`; }
        else preview.textContent = '';
      }
      sel.addEventListener('change', upd); grams.addEventListener('input', upd); upd();
      body.append(el('label', { class: 'edit-lbl', text: 'Продукт' }), sel,
        el('label', { class: 'edit-lbl', text: 'Граммы' }), grams, preview,
        el('button', { class: 'btn btn-primary btn-block', text: 'Добавить', onClick: () => {
          const f = foods.find(x => x.id === sel.value);
          const g = parseFloat((grams.value || '').replace(',', '.')) || 0;
          if (!f || !g) { toast('Укажи продукт и граммы', 'warn'); return; }
          addEntry(state, ctx, close, { name: f.name, grams: g, ...macrosFromFood(f, g) });
        } }));
    } else {
      const name = el('input', { type: 'text', class: 'set-input wide', placeholder: 'Название' });
      const k = el('input', { type: 'number', inputmode: 'decimal', class: 'set-input', placeholder: 'ккал' });
      const p = el('input', { type: 'number', inputmode: 'decimal', class: 'set-input', placeholder: 'белок' });
      const f = el('input', { type: 'number', inputmode: 'decimal', class: 'set-input', placeholder: 'жиры' });
      const c = el('input', { type: 'number', inputmode: 'decimal', class: 'set-input', placeholder: 'углев' });
      body.append(el('label', { class: 'edit-lbl', text: 'Название' }), name,
        el('div', { class: 'edit-row4' }, [k, p, f, c]),
        el('button', { class: 'btn btn-primary btn-block', text: 'Добавить', onClick: () => {
          if (!name.value.trim() || !(parseFloat(k.value) >= 0)) { toast('Укажи название и ккал', 'warn'); return; }
          addEntry(state, ctx, close, {
            name: name.value.trim(), grams: null,
            kcal: Math.round(num(k)), protein: num(p), fat: num(f), carbs: num(c),
          });
        } }));
    }
  }
  rebuild();
  const close = modal('Добавить приём пищи', body);
}

function num(input) { return parseFloat((input.value || '').replace(',', '.')) || 0; }

function addEntry(state, ctx, close, data) {
  state.nutritionLog.push({ id: uid('meal'), dateISO: todayISO(), ...data });
  close();
  afterChange(state, ctx);
}

// Пересчёт геймификации после любого изменения дневника (добавление/удаление).
function afterChange(state, ctx) {
  const beforeLevel = state.game.level;
  const nutriEvent = reconcileNutritionDay(state);
  const events = recompute(state);
  save();

  const cel = [];
  if (state.game.level > beforeLevel) cel.push(['⭐', `Уровень ${state.game.level}!`, 'Новый уровень достигнут']);
  if (nutriEvent && nutriEvent.type === 'award') cel.push(['🥗', 'День по плану!', 'КБЖУ в норме (+60 XP)']);
  for (const a of events.newAchievements) cel.push([a.icon, a.title, 'Ачивка разблокирована']);
  for (const q of events.newQuests) cel.push(['🎯', 'Квест выполнен', `${q.text} (+${q.xp} XP)`]);
  celebrateQueue(cel);

  if (nutriEvent && nutriEvent.type === 'revoke') toast('Запись изменена: день вышел из нормы, −60 XP', 'warn');
  ctx.rerender();
}

function foodModal(state, ctx, food) {
  const name = el('input', { type: 'text', class: 'set-input wide', value: food ? food.name : '', placeholder: 'Название' });
  const k = el('input', { type: 'number', class: 'set-input', value: food ? food.per100.kcal : '', placeholder: 'ккал' });
  const p = el('input', { type: 'number', class: 'set-input', value: food ? food.per100.protein : '', placeholder: 'белок' });
  const f = el('input', { type: 'number', class: 'set-input', value: food ? food.per100.fat : '', placeholder: 'жиры' });
  const c = el('input', { type: 'number', class: 'set-input', value: food ? food.per100.carbs : '', placeholder: 'углев' });
  const body = el('div', { class: 'meal-form' }, [
    el('label', { class: 'edit-lbl', text: 'Название' }), name,
    el('label', { class: 'edit-lbl', text: 'На 100 г: ккал / белок / жиры / углеводы' }),
    el('div', { class: 'edit-row4' }, [k, p, f, c]),
  ]);
  const close = modal(food ? 'Изменить продукт' : 'Новый продукт', body, [
    el('button', { class: 'btn btn-primary', text: 'Сохранить', onClick: () => {
      if (!name.value.trim() || !(parseFloat(k.value) >= 0)) { toast('Укажи название и ккал', 'warn'); return; }
      const per100 = { kcal: Math.round(num(k)), protein: num(p), fat: num(f), carbs: num(c) };
      if (food) { food.name = name.value.trim(); food.per100 = per100; }
      else state.foods.push({ id: uid('food'), name: name.value.trim(), per100 });
      save(); close(); ctx.rerender();
    } }),
  ]);
}

function targetSetup(state, ctx, target) {
  const n = state.settings.nutrition;
  const manualOn = !!(n.manual && n.manual.kcal);

  const sexSel = el('select', { class: 'set-input' }, [['male', 'М'], ['female', 'Ж']].map(([v, t]) => el('option', { value: v, text: t, selected: n.sex === v })));
  const height = el('input', { type: 'number', class: 'set-input', value: n.height });
  const age = el('input', { type: 'number', class: 'set-input', value: n.age });
  const act = el('select', { class: 'set-input wide' }, ACTIVITY_LEVELS.map(a => el('option', { value: a.value, text: a.label, selected: n.activity === a.value })));
  const goal = el('select', { class: 'set-input wide' }, [['surplus', 'Набор массы (профицит)'], ['maintain', 'Поддержание'], ['cut', 'Сушка (дефицит)']].map(([v, t]) => el('option', { value: v, text: t, selected: n.goalMode === v })));
  const surplus = el('input', { type: 'number', class: 'set-input', value: n.surplusKcal });
  const ppk = el('input', { type: 'number', step: '0.1', class: 'set-input', value: n.proteinPerKg });

  function apply() {
    n.sex = sexSel.value; n.height = +height.value || n.height; n.age = +age.value || n.age;
    n.activity = +act.value; n.goalMode = goal.value; n.surplusKcal = +surplus.value || 0; n.proteinPerKg = +ppk.value || 1.8;
    save(); ctx.rerender();
  }
  [sexSel, act, goal].forEach(e => e.addEventListener('change', apply));
  [height, age, surplus, ppk].forEach(e => e.addEventListener('change', apply));

  const autoBlock = el('div', { class: 'edit-form' }, [
    el('div', { class: 'edit-row3' }, [
      el('label', {}, [el('span', { text: 'Пол' }), sexSel]),
      el('label', {}, [el('span', { text: 'Рост, см' }), height]),
      el('label', {}, [el('span', { text: 'Возраст' }), age]),
    ]),
    el('label', { class: 'edit-lbl', text: 'Активность' }), act,
    el('label', { class: 'edit-lbl', text: 'Цель' }), goal,
    el('div', { class: 'edit-row2' }, [
      el('label', {}, [el('span', { text: 'Профицит/дефицит, ккал' }), surplus]),
      el('label', {}, [el('span', { text: 'Белок, г/кг' }), ppk]),
    ]),
    el('div', { class: 'target-preview', html: `Вес ${bodyweightOf(state)} кг → <b>${target.kcal} ккал</b> · Б ${target.protein} · Ж ${target.fat} · У ${target.carbs}` }),
  ]);

  // Ручное переопределение.
  const mk = el('input', { type: 'number', class: 'set-input', value: manualOn ? n.manual.kcal : '', placeholder: 'ккал' });
  const mp = el('input', { type: 'number', class: 'set-input', value: manualOn ? n.manual.protein : '', placeholder: 'белок' });
  const mf = el('input', { type: 'number', class: 'set-input', value: manualOn ? n.manual.fat : '', placeholder: 'жиры' });
  const mc = el('input', { type: 'number', class: 'set-input', value: manualOn ? n.manual.carbs : '', placeholder: 'углев' });
  const manualToggle = el('input', { type: 'checkbox' });
  manualToggle.checked = manualOn;
  manualToggle.addEventListener('change', () => {
    if (!manualToggle.checked) { n.manual = null; save(); ctx.rerender(); }
    else { n.manual = { kcal: Math.round(num(mk)) || target.kcal, protein: num(mp) || target.protein, fat: num(mf) || target.fat, carbs: num(mc) || target.carbs }; save(); ctx.rerender(); }
  });
  const manualSave = el('button', { class: 'btn btn-ghost btn-block', text: 'Сохранить ручную норму', onClick: () => {
    n.manual = { kcal: Math.round(num(mk)), protein: num(mp), fat: num(mf), carbs: num(mc) };
    if (!n.manual.kcal) { toast('Укажи хотя бы ккал', 'warn'); return; }
    save(); toast('Норма сохранена', 'success'); ctx.rerender();
  } });

  return el('details', { class: 'card nutri-setup' }, [
    el('summary', {}, [el('b', { text: 'Настройка нормы' }), el('span', { class: 'muted', text: target.source === 'manual' ? ' · вручную' : ' · авто' })]),
    el('label', { class: 'toggle-row' }, [el('span', { text: 'Задать норму вручную' }), el('span', { class: 'switch' }, [manualToggle, el('span', { class: 'slider' })])]),
    manualOn
      ? el('div', { class: 'edit-form' }, [el('div', { class: 'edit-row4' }, [mk, mp, mf, mc]), manualSave])
      : autoBlock,
  ]);
}
