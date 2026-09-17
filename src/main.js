import { Terrain, ThermalField, TUNE, WORLDS } from './world.js';
import { Glider, Autopilot, AIR, sunlight } from './flight.js';
import { View, CAMS, SIZES } from './scene.js';
import { Vario } from './audio.js';

const q = new URLSearchParams(location.search);
const SEED = Number(q.get('seed') ?? Math.floor(Math.random() * 9999));
const HARNESS = q.has('harness');          // 検査用: rAFを止めて手でコマを進める
const CAM_STORE = 'glide.cam';
let saved = null;
try { saved = localStorage.getItem(CAM_STORE); } catch (e) { /* 保存できない環境でも遊べる */ }
let CAM_KEY = CAMS[q.get('cam')] ? q.get('cam') : (CAMS[saved] && saved !== 'old' ? saved : 'a');
const camOf = key => {
  const r = Number(q.get('roll'));                     // 調整用: ?roll=0.2 で傾きの強さだけ上書き
  return Number.isFinite(r) && q.has('roll') ? { ...CAMS[key], roll: r } : CAMS[key];
};
if (CAM_KEY === 'old') { AIR.bankRate = 1.6; AIR.inputTau = 0; }   // 直す前の再現(比較測定用)

const el = id => document.getElementById(id);
const ui = {
  dist: el('dist'), alt: el('alt'), fill: el('varioFill'),
  msg: el('msg'), msgTitle: el('msgTitle'), msgSub: el('msgSub'),
  start: el('start'), go: el('go'),
};

const WORLD = WORLDS[q.get('world')] ? q.get('world') : 'hills';   // 既定は丘のある世界。?world=flat で起伏なし
Object.assign(TUNE, WORLDS[WORLD]);
if (WORLD === 'ridge') {
  const p = document.querySelector('#start p');
  if (p) p.insertAdjacentHTML('beforeend',
    '<br><br><b>山脈の世界：</b>風は左から吹いています。山の<b>左側の斜面</b>に沿って飛ぶと上がります。' +
    '反対側の斜面は下がる空気。鞍部で途切れたら、上昇気流か次の尾根へ。');
}
const terrain = new Terrain(SEED);
const field = new ThermalField(terrain, SEED);
const SIZE_KEY = SIZES[q.get('size')] ? q.get('size') : '2';   // 見せる大きさの候補(?size=1|2|3)
const camk = Number(q.get('camk'));                              // 調整用: ?camk=0.05 でカメラの距離の倍率だけ上書き
const SIZE = q.has('camk') && camk > 0 ? { ...SIZES[SIZE_KEY], cam: camk } : SIZES[SIZE_KEY];
const view = new View(el('app'), terrain, field, camOf(CAM_KEY), SIZE);
if (!q.has('box')) view.loadModel(import.meta.env.BASE_URL + 'models/rh02.glb');   // ?box で灰色の箱のまま

// スタート画面のカメラ選択。選んだものは次回も使う
const camButtons = [...document.querySelectorAll('#cams button')];
function pickCam(key) {
  CAM_KEY = key;
  view.setCam(camOf(key));
  for (const b of camButtons) b.setAttribute('aria-checked', String(b.dataset.cam === key));
  try { localStorage.setItem(CAM_STORE, key); } catch (e) { /* 覚えられなくても選択自体は効く */ }
}
for (const b of camButtons) b.addEventListener('click', () => pickCam(b.dataset.cam));
for (const b of camButtons) b.setAttribute('aria-checked', String(b.dataset.cam === CAM_KEY));
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
  world: WORLD,
  camKey: () => CAM_KEY,
  sizeKey: SIZE_KEY,
  modelReady: () => view.modelReady,
  bone: name => view.boneInfo(name),
  camRoll: () => view.cam.roll,
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
  // 検査用: 好きな場所・高さ(地面から)・向きに置く
  place(x, y, agl, head = 0) {
    glider.x = x; glider.y = y; glider.z = terrain.height(x, y) + agl; glider.head = head;
    glider.bank = 0; glider.inp = 0; glider.alive = true; view.camHead = head;
  },
  ridgeAt(x, y, z) { return field.ridgeAt(x, y, z, sunlight(glider.time)); },
  terrainHeight(x, y) { return terrain.height(x, y); },
  riverX(y) { return terrain.riverX(y); },
  forceInput: null,
  _view() { return { camHead: view.camHead, dust: view.dust.points, clouds: view.clouds.points,
                     local: (x, y, z) => view.projectLocal(x, y, z),
                     world: (x, y, z) => view.projectWorld(x, y, z),
                     noseDir: () => view.gliderForward(),
                     velDir: () => view.velocityDir(glider),
                     horizonLean: () => view.horizonLean() }; },
  reset,
};

if (HARNESS) { running = false; view.update(glider, 0, 1); hud(); }
else requestAnimationFrame(frame);
