// Мини-хелперы для DOM, тостов и модалок.
import { confetti, fanfare } from './effects.js';

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
  confetti();
  fanfare();
  setTimeout(() => { overlay.classList.remove('show'); setTimeout(() => overlay.remove(), 300); }, 2200);
}

// Последовательный показ нескольких празднований. items: [[emoji, title, sub], ...]
export function celebrateQueue(items) {
  if (!items || !items.length) return;
  let i = 0;
  const next = () => {
    if (i >= items.length) return;
    const [e, t, s] = items[i++];
    celebrate(e, t, s);
    setTimeout(next, 2300);
  };
  next();
}

// Всплывающее «+N XP» рядом с элементом (анимация вверх и затухание).
export function floatXp(targetEl, text, kind = 'pos') {
  const r = targetEl.getBoundingClientRect();
  const node = el('div', { class: `float-xp float-${kind}`, text });
  node.style.left = `${r.left + r.width / 2}px`;
  node.style.top = `${r.top}px`;
  document.body.appendChild(node);
  requestAnimationFrame(() => node.classList.add('go'));
  setTimeout(() => node.remove(), 900);
}

// Тост с действием «Отменить». onUndo вызывается при нажатии. Возвращает функцию закрытия.
export function undoToast(text, onUndo, timeout = 5000) {
  if (!toastHost) { toastHost = el('div', { class: 'toast-host' }); document.body.appendChild(toastHost); }
  let timer = null;
  const dismiss = () => { clearTimeout(timer); t.classList.remove('show'); setTimeout(() => t.remove(), 300); };
  const btn = el('button', { class: 'toast-undo', text: 'Отменить', onClick: () => { dismiss(); onUndo && onUndo(); } });
  const t = el('div', { class: 'toast toast-undo-host' }, [el('span', { html: text }), btn]);
  toastHost.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  timer = setTimeout(dismiss, timeout);
  return dismiss;
}

// Диалог подтверждения. Возвращает Promise<boolean>.
export function confirmModal({ title = 'Подтвердите', message = '', okText = 'Удалить', cancelText = 'Отмена', danger = true } = {}) {
  return new Promise(resolve => {
    let settled = false;
    const done = (val) => { if (settled) return; settled = true; close(); resolve(val); };
    const body = el('div', { class: 'confirm-body' }, [el('p', { text: message })]);
    const close = modal(title, body, [
      el('button', { class: 'btn btn-ghost', text: cancelText, onClick: () => done(false) }),
      el('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, text: okText, onClick: () => done(true) }),
    ]);
  });
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
