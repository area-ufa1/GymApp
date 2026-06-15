// Мини-хелперы для DOM, тостов и модалок (без зависимостей).

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null || c === false) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

// Полоса прогресса.
export function bar(pct, opts = {}) {
  const fill = el('div', { class: 'bar-fill', style: `width:${Math.max(0, Math.min(100, pct))}%` });
  if (opts.gold) fill.classList.add('gold');
  return el('div', { class: 'bar' }, [fill]);
}

// Тост-уведомление (всплывает снизу).
let toastHost = null;
export function toast(text, type = 'info', timeout = 2600) {
  if (!toastHost) {
    toastHost = el('div', { class: 'toast-host' });
    document.body.appendChild(toastHost);
  }
  const t = el('div', { class: `toast toast-${type}`, html: text });
  toastHost.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, timeout);
}

// Очередь празднований (level up / ачивки) — крупный оверлей.
export function celebrate(emoji, title, sub) {
  const card = el('div', { class: 'celebrate' }, [
    el('div', { class: 'celebrate-emoji', text: emoji }),
    el('div', { class: 'celebrate-title', text: title }),
    sub ? el('div', { class: 'celebrate-sub', text: sub }) : null,
  ]);
  const overlay = el('div', { class: 'overlay celebrate-overlay', onClick: () => overlay.remove() }, [card]);
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));
  setTimeout(() => { overlay.classList.remove('show'); setTimeout(() => overlay.remove(), 300); }, 2200);
}

// Модальное окно с произвольным содержимым. Возвращает функцию закрытия.
export function modal(title, contentNode, actions = []) {
  const box = el('div', { class: 'modal' }, [
    el('div', { class: 'modal-head' }, [
      el('h3', { text: title }),
      el('button', { class: 'icon-btn', text: '✕', onClick: () => close() }),
    ]),
    el('div', { class: 'modal-body' }, [contentNode]),
    actions.length ? el('div', { class: 'modal-actions' }, actions) : null,
  ]);
  const overlay = el('div', { class: 'overlay modal-overlay' }, [box]);
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('show'));
  function close() { overlay.classList.remove('show'); setTimeout(() => overlay.remove(), 250); }
  return close;
}

export function section(title, children, extra = null) {
  return el('section', { class: 'card' }, [
    el('div', { class: 'card-head' }, [el('h2', { text: title }), extra].filter(Boolean)),
    ...[].concat(children),
  ]);
}

export function stat(label, value, sub) {
  return el('div', { class: 'stat' }, [
    el('div', { class: 'stat-value', html: value }),
    el('div', { class: 'stat-label', text: label }),
    sub ? el('div', { class: 'stat-sub', text: sub }) : null,
  ]);
}
