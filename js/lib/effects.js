// Звук (WebAudio), вибрация (Vibration API), конфетти (canvas).
// Уважает настройки sound / haptics из состояния.
import { getState } from '../store.js';

function soundOn() { try { return getState().settings.sound !== false; } catch { return true; } }
function hapticsOn() { try { return getState().settings.haptics !== false; } catch { return true; } }

let audioCtx = null;
function ctx() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  }
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

export function beep(freq = 880, dur = 0.12, type = 'sine', when = 0, gain = 0.15) {
  if (!soundOn()) return;
  const ac = ctx();
  if (!ac) return;
  const t = ac.currentTime + when;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

export function vibrate(pattern) {
  if (!hapticsOn()) return;
  if (navigator.vibrate) navigator.vibrate(pattern);
}

// Сигнал окончания отдыха.
export function restEndCue() {
  beep(660, 0.12, 'sine', 0);
  beep(990, 0.16, 'sine', 0.14);
  vibrate([120, 60, 120]);
}

// Фанфара на рекорд / level-up.
export function fanfare() {
  [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.18, 'triangle', i * 0.11, 0.18));
  vibrate([60, 40, 60, 40, 120]);
}

export function tick() { beep(440, 0.05, 'square', 0, 0.08); vibrate(20); }

// Конфетти-вспышка из центра экрана.
export function confetti(count = 90) {
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti-canvas';
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  const g = canvas.getContext('2d');
  if (!g) return; // canvas недоступен — пропускаем эффект
  g.scale(dpr, dpr);
  document.body.appendChild(canvas);
  const W = window.innerWidth, H = window.innerHeight;
  const colors = ['#6c5ce7', '#8f7bff', '#00d2a8', '#f5c451', '#e74c3c', '#2ecc71'];
  const parts = Array.from({ length: count }, () => ({
    x: W / 2, y: H * 0.38,
    vx: (Math.random() - 0.5) * 10,
    vy: Math.random() * -9 - 4,
    s: Math.random() * 6 + 4,
    c: colors[(Math.random() * colors.length) | 0],
    rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 0.4,
  }));
  let frame = 0;
  function step() {
    g.clearRect(0, 0, W, H);
    frame++;
    for (const p of parts) {
      p.vy += 0.32; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      g.save();
      g.translate(p.x, p.y); g.rotate(p.rot);
      g.fillStyle = p.c;
      g.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6);
      g.restore();
    }
    if (frame < 110) requestAnimationFrame(step);
    else canvas.remove();
  }
  step();
}
