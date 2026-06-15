// Лёгкий SVG line-chart без внешних зависимостей (офлайн-friendly).
// series: [{ dateISO, value }], отсортированные или нет — отсортируем сами.

const NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

export function lineChart(series, opts = {}) {
  const W = opts.width || 320;
  const H = opts.height || 160;
  const pad = { l: 34, r: 10, t: 12, b: 22 };
  const wrap = document.createElement('div');
  wrap.className = 'chart-wrap';

  const pts = (series || [])
    .filter(p => p.value != null && !isNaN(p.value))
    .map(p => ({ t: new Date(p.dateISO).getTime(), v: +p.value }))
    .sort((a, b) => a.t - b.t);

  if (pts.length === 0) {
    wrap.appendChild(emptyNote(opts.empty || 'Нет данных'));
    return wrap;
  }

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', preserveAspectRatio: 'none' });
  const xs = pts.map(p => p.t);
  const ys = pts.map(p => p.v);
  let minY = Math.min(...ys), maxY = Math.max(...ys);
  if (opts.target != null) { minY = Math.min(minY, opts.target); maxY = Math.max(maxY, opts.target); }
  if (minY === maxY) { minY -= 1; maxY += 1; }
  const padY = (maxY - minY) * 0.1; minY -= padY; maxY += padY;
  const minX = Math.min(...xs), maxX = Math.max(...xs);

  const px = t => pad.l + (maxX === minX ? 0.5 : (t - minX) / (maxX - minX)) * (W - pad.l - pad.r);
  const py = v => pad.t + (1 - (v - minY) / (maxY - minY)) * (H - pad.t - pad.b);

  // Сетка + подписи Y (3 линии).
  for (let i = 0; i <= 2; i++) {
    const v = minY + (i / 2) * (maxY - minY);
    const y = py(v);
    svg.appendChild(svgEl('line', { x1: pad.l, y1: y, x2: W - pad.r, y2: y, class: 'grid' }));
    const lbl = svgEl('text', { x: 2, y: y + 3, class: 'axis' });
    lbl.textContent = (Math.round(v * 100) / 100).toString();
    svg.appendChild(lbl);
  }

  // Целевая линия.
  if (opts.target != null) {
    const y = py(opts.target);
    svg.appendChild(svgEl('line', { x1: pad.l, y1: y, x2: W - pad.r, y2: y, class: 'target-line' }));
  }

  // Линия данных.
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${px(p.t).toFixed(1)},${py(p.v).toFixed(1)}`).join(' ');
  // Заливка под линией.
  const area = `${d} L${px(pts[pts.length - 1].t).toFixed(1)},${py(minY).toFixed(1)} L${px(pts[0].t).toFixed(1)},${py(minY).toFixed(1)} Z`;
  svg.appendChild(svgEl('path', { d: area, class: 'area' }));
  svg.appendChild(svgEl('path', { d, class: 'line' }));

  for (const p of pts) svg.appendChild(svgEl('circle', { cx: px(p.t), cy: py(p.v), r: 2.5, class: 'dot' }));

  wrap.appendChild(svg);
  return wrap;
}

// Простой столбчатый график (для частоты тренировок по неделям).
export function barChart(series, opts = {}) {
  const W = opts.width || 320, H = opts.height || 140;
  const pad = { l: 24, r: 8, t: 10, b: 20 };
  const wrap = document.createElement('div');
  wrap.className = 'chart-wrap';
  const data = series || [];
  if (!data.length) { wrap.appendChild(emptyNote(opts.empty || 'Нет данных')); return wrap; }
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart' });
  const maxV = Math.max(1, ...data.map(d => d.value));
  const bw = (W - pad.l - pad.r) / data.length;
  data.forEach((d, i) => {
    const h = (d.value / maxV) * (H - pad.t - pad.b);
    const x = pad.l + i * bw + bw * 0.15;
    const y = H - pad.b - h;
    svg.appendChild(svgEl('rect', { x, y, width: bw * 0.7, height: Math.max(0, h), rx: 2, class: 'bar-rect' }));
    if (d.label) {
      const lbl = svgEl('text', { x: x + bw * 0.35, y: H - pad.b + 12, class: 'axis', 'text-anchor': 'middle' });
      lbl.textContent = d.label;
      svg.appendChild(lbl);
    }
  });
  wrap.appendChild(svg);
  return wrap;
}

function emptyNote(text) {
  const n = document.createElement('div');
  n.className = 'chart-empty';
  n.textContent = text;
  return n;
}
