// Чистые расчётные функции (без побочных эффектов).

// 1ПМ по формуле Эпли: 1RM = w * (1 + reps/30). Для reps=1 → w.
export function epley1RM(w, reps) {
  if (!w || !reps || reps < 1) return 0;
  if (reps === 1) return w;
  return w * (1 + reps / 30);
}

export function round1(x) {
  return Math.round(x * 10) / 10;
}

// Парсинг строки «вес×повт» (60×8, 60x8, 60*8, 60 8). Возвращает {w, reps} или null.
export function parseSet(str) {
  if (typeof str !== 'string') return null;
  const m = str.trim().replace(',', '.').match(/^(\d+(?:\.\d+)?)\s*[x×*\s]\s*(\d+)$/i);
  if (!m) return null;
  const w = parseFloat(m[1]);
  const reps = parseInt(m[2], 10);
  if (!(w >= 0) || !(reps >= 1)) return null;
  return { w, reps };
}

export function formatSet(s) {
  if (!s || s.w == null || s.reps == null) return '';
  return `${s.w}×${s.reps}`;
}

// Тоннаж одного подхода / сессии = сумма (вес × повторы).
export function setTonnage(s) {
  return (s && s.w && s.reps) ? s.w * s.reps : 0;
}

export function sessionTonnage(session) {
  let t = 0;
  for (const e of session.entries || []) {
    for (const s of e.sets || []) t += setTonnage(s);
  }
  return t;
}

export function ratio(shoulders, waist) {
  if (!shoulders || !waist) return 0;
  return shoulders / waist;
}

// Линейный прогноз даты достижения целевого значения по серии точек {dateISO, value}.
// Возвращает Date или null (мало данных / нет роста в нужную сторону).
export function forecastDate(points, target) {
  const pts = (points || []).filter(p => p.value != null).map(p => ({
    t: new Date(p.dateISO).getTime(),
    v: p.value,
  })).sort((a, b) => a.t - b.t);
  if (pts.length < 2) return null;

  // Линейная регрессия v = a*t + b (t в днях от первой точки).
  const day = 86400000;
  const t0 = pts[0].t;
  const xs = pts.map(p => (p.t - t0) / day);
  const ys = pts.map(p => p.v);
  const n = xs.length;
  const sx = xs.reduce((a, b) => a + b, 0);
  const sy = ys.reduce((a, b) => a + b, 0);
  const sxx = xs.reduce((a, b) => a + b * b, 0);
  const sxy = xs.reduce((a, b, i) => a + b * ys[i], 0);
  const denom = n * sxx - sx * sx;
  if (denom === 0) return null;
  const a = (n * sxy - sx * sy) / denom; // наклон (ед./день)
  const b = (sy - a * sx) / n;
  const last = pts[pts.length - 1];
  if (last.v >= target) return new Date(last.t); // уже достигнуто
  if (a <= 0) return null; // нет роста
  const daysToTarget = (target - b) / a;
  return new Date(t0 + daysToTarget * day);
}

export function fmtDate(d) {
  if (!d) return '—';
  const dt = (d instanceof Date) ? d : new Date(d);
  return dt.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function fmtNum(x, digits = 1) {
  if (x == null || isNaN(x)) return '—';
  const r = Number(x);
  return Number.isInteger(r) ? String(r) : r.toFixed(digits);
}
