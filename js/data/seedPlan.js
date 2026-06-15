// Стартовый план тренировок — взят 1:1 из таблицы пользователя.
// Полностью редактируется внутри приложения (экран «Профиль» → редактор плана).

export const SEED_PLAN = {
  name: 'Сплит 4 дня — масса/эстетика',
  days: [
    {
      id: 'd1',
      name: 'День 1',
      focus: 'Плечи + Спина (ширина)',
      exercises: [
        { name: 'Жим гантелей сидя', sets: 4, repsMin: 6, repsMax: 10, muscle: 'Плечи' },
        { name: 'Подтягивания широким хватом / тяга верхнего блока', sets: 4, repsMin: 8, repsMax: 12, muscle: 'Спина' },
        { name: 'Пуловер (гантель / блок)', sets: 3, repsMin: 10, repsMax: 15, muscle: 'Спина' },
        { name: 'Махи гантелями в стороны', sets: 4, repsMin: 12, repsMax: 20, muscle: 'Плечи' },
        { name: 'Тяга в наклоне', sets: 3, repsMin: 8, repsMax: 12, muscle: 'Спина' },
        { name: 'Махи в наклоне (задние дельты)', sets: 3, repsMin: 15, repsMax: 20, muscle: 'Плечи' },
      ],
    },
    {
      id: 'd2',
      name: 'День 2',
      focus: 'Ноги',
      exercises: [
        { name: 'Присед со штангой', sets: 4, repsMin: 5, repsMax: 8, muscle: 'Ноги' },
        { name: 'Румынская тяга', sets: 3, repsMin: 8, repsMax: 10, muscle: 'Ноги' },
        { name: 'Выпады / жим ногами', sets: 3, repsMin: 10, repsMax: 12, muscle: 'Ноги' },
        { name: 'Икры', sets: 4, repsMin: 12, repsMax: 15, muscle: 'Ноги' },
      ],
    },
    {
      id: 'd3',
      name: 'День 3',
      focus: 'Грудь (верх) + Плечи + Руки',
      exercises: [
        { name: 'Жим гантелей на наклонной (~30°)', sets: 4, repsMin: 6, repsMax: 10, muscle: 'Грудь' },
        { name: 'Армейский жим стоя', sets: 4, repsMin: 6, repsMax: 10, muscle: 'Плечи' },
        { name: 'Горизонтальный жим / брусья', sets: 3, repsMin: 8, repsMax: 10, muscle: 'Грудь' },
        { name: 'Сведения на блоке снизу вверх', sets: 3, repsMin: 12, repsMax: 15, muscle: 'Грудь' },
        { name: 'Махи гантелями в стороны', sets: 4, repsMin: 15, repsMax: 20, muscle: 'Плечи' },
        { name: 'Подъём гантелей на бицепс поочерёдно', sets: 3, repsMin: 10, repsMax: 12, muscle: 'Руки' },
        { name: 'Предплечья на блоке: флексоры → экстензоры', sets: 3, repsMin: 12, repsMax: 15, muscle: 'Руки' },
      ],
    },
    {
      id: 'd4',
      name: 'День 4',
      focus: 'Спина + Задние дельты + Трицепс',
      exercises: [
        { name: 'Становая / тяга в наклоне', sets: 4, repsMin: 5, repsMax: 8, muscle: 'Спина' },
        { name: 'Тяга верхнего блока широким хватом', sets: 4, repsMin: 10, repsMax: 12, muscle: 'Спина' },
        { name: 'Пуловер (гантель / блок)', sets: 3, repsMin: 10, repsMax: 15, muscle: 'Спина' },
        { name: 'Тяга горизонтального блока', sets: 3, repsMin: 10, repsMax: 12, muscle: 'Спина' },
        { name: 'Махи гантелями в стороны', sets: 4, repsMin: 15, repsMax: 20, muscle: 'Плечи' },
        { name: 'Трицепс на нижнем блоке спиной к тренажёру', sets: 3, repsMin: 10, repsMax: 15, muscle: 'Руки' },
      ],
    },
  ],
};

// Стартовые силовые (из листа «Сила и 1ПМ»), формат «вес×повт».
export const SEED_STRENGTH = {
  squat: { w: 115, reps: 1 },
  bench: { w: 72.5, reps: 1 },
  deadlift: { w: 117.5, reps: 1 },
};

// Стартовые замеры (из листа «Замеры тела»).
export const SEED_MEASUREMENT = {
  weight: 67.7,
  waist: 78,
  chest: 92,
  shoulders: 108,
  hips: 91,
};
