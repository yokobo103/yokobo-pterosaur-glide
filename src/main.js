import { Terrain, ThermalField } from './world.js';
import { Glider, Autopilot, AIR, sunlight } from './flight.js';
import { View } from './scene.js';
import { Vario } from './audio.js';

const q = new URLSearchParams(location.search);
const SEED = Number(q.get('seed') ?? Math.floor(Math.random() * 9999));
const HARNESS = q.has('harness');          // 検査用: rAFを止めて手でコマを進める

const el = id => document.getElementById(id);
const ui = {
  dist: el('dist'), alt: el('alt'), fill: el('varioFill'),
  msg: el('msg'), msgTitle: el('msgTitle'), msgSub: el('msgSub'),
  start: el('start'), go: el('go'),
};

const terrain = new Terrain(SEED);
const field = new ThermalField(terrain, SEED);
const view = new View(el('app'), terrain, field);
const vario = new Vario();
let glider = new Glider(terrain, field);
let running = false, ended = false;
let auto = null;                            // 自動操縦(調整・検査用)

// ---- 操作は左右だけ ----
const keys = new Set();
const touch = new Map();                    // pointerId -> -1 | 1
addEventListener('keydown', e => {
  if (['ArrowLeft', 'ArrowRight', 'a', 'd', 'A', 'D'].includes(e.key)) { keys.add(e.key); e.preventDefault(); }
});
addEventListener('keyup', e => keys.delete(e.key));
const cv = view.renderer.domElement;
const side = e => (e.clientX < innerWidth / 2 ? -1 : 1);
cv.addEventListener('pointerdown', e => { touch.set(e.pointerId, side(e)); cv.setPointerCapture(e.pointerId); });
cv.addEventListener('pointermove', e => { if (touch.has(e.pointerId)) touch.set(e.pointerId, side(e)); });
const drop = e => touch.delete(e.pointerId);
cv.addEventListener('pointerup', drop);
cv.addEventListener('pointercancel', drop);

function input(dt) {
  if (window.__slice && typeof window.__slice.forceInput === 'number') return window.__slice.forceInput;
  if (auto) return auto.input(glider, dt);
  let v = 0;
  if (keys.has('ArrowLeft') || keys.has('a') || keys.has('A')) v -= 1;
  if (keys.has('ArrowRight') || keys.has('d') || keys.has('D')) v += 1;
  for (const s of touch.values()) v += s;
  return Math.max(-1, Math.min(1, v));
}

function hud() {
  ui.dist.textContent = (Math.max(0, glider.best) / 1000).toFixed(2);
  ui.alt.textContent = Math.round(Math.max(0, glider.agl));
  const k = Math.max(-1, Math.min(1, glider.vz / 5));
  const h = Math.abs(k) * 95;
  ui.fill.style.height = h + 'px';
  ui.fill.style.top = k > 0 ? (95 - h) + 'px' : '95px';
  ui.fill.style.background = k > 0 ? '#7fe08a' : '#e08a7f';
}

function finish() {
  ended = true; running = false;
  vario.stop();
  ui.msgTitle.textContent = (glider.best / 1000).toFixed(2) + ' km';
  ui.msgSub.textContent = sunlight(glider.time) <= 0.02
    ? '日が暮れて、空気が上がらなくなった' : '降りた。もう一度: R キー / 画面を二回たたく';
  ui.msg.classList.remove('hidden');
}

function reset() {
  glider = new Glider(terrain, field);
  if (auto) auto = new Autopilot();
  ended = false; running = true;
  ui.msg.classList.add('hidden');
}
addEventListener('keydown', e => { if ((e.key === 'r' || e.key === 'R') && ended) reset(); });
cv.addEventListener('dblclick', () => { if (ended) reset(); });

const STEP = 1 / 60;
let acc = 0, last = performance.now();

function advance(dt) {
  if (!running || !glider.alive) return;
  acc += dt;
  let n = 0;
  while (acc >= STEP && n++ < 8) {
    glider.step(STEP, input(STEP));
    acc -= STEP;
  }
  if (!glider.alive || sunlight(glider.time) <= 0 && glider.vz < 0 && glider.agl < 3) finish();
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  advance(dt);
  view.update(glider, dt, sunlight(glider.time));
  vario.update(glider.vz, dt);
  hud();
  if (!HARNESS) requestAnimationFrame(frame);
}

ui.go.addEventListener('click', () => {
  vario.start();
  ui.start.classList.add('hidden');
  running = true; last = performance.now();
  if (!HARNESS) requestAnimationFrame(frame);
});

// ---- 検査用の口。画面が出ない環境でもここから回す ----
window.__slice = {
  seed: SEED,
  begin() { ui.start.classList.add('hidden'); running = true; },
  auto(on = true) { auto = on ? new Autopilot() : null; },
  // 実時間を待たずにn秒ぶん進める
  step(seconds, render = true) {
    const n = Math.round(seconds / STEP);
    for (let i = 0; i < n; i++) { if (!running || !glider.alive) break; glider.step(STEP, input(STEP)); }
    if (render) { view.update(glider, STEP, sunlight(glider.time)); hud(); }
    return this.state();
  },
  state() {
    return {
      x: glider.x, y: glider.y, z: glider.z, agl: glider.agl, vz: glider.vz,
      dist: glider.best, time: glider.time, sun: sunlight(glider.time),
      bank: glider.bank, head: glider.head, alive: glider.alive, ended,
      thermalsNear: field.nearby(glider.x, glider.y, 4000).length,
    };
  },
  // 画面に見えている土ぼこりの柱(＝プレイヤーが読める手がかり)
  visibleDust() {
    const out = [];
    for (const c of field.around(glider.x, glider.y, 6200)) {
      const d = Math.hypot(c.x - glider.x, c.y - glider.y);
      if (d < 6200) out.push({ d: Math.round(d), W: +c.W.toFixed(1), R: Math.round(c.R) });
    }
    return out.sort((a, b) => a.d - b.d).slice(0, 12);
  },
  render() { view.update(glider, STEP, sunlight(glider.time)); hud(); },
  forceInput: null,
  _view() { return { glider: view.glider, camera: view.camera, THREE: view.THREE,
                     camHead: view.camHead, dust: view.dust.points, clouds: view.clouds.points }; },
  reset,
};

if (HARNESS) { running = false; view.update(glider, 0, 1); hud(); }
else requestAnimationFrame(frame);
