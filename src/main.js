import { Terrain, ThermalField, TUNE, WORLDS, HERD, SPECIES } from './world.js';
import { Glider, Autopilot, AIR, sunlight } from './flight.js';
import { View, CAMS, SIZES, LIGHT, SURFACE } from './scene.js';
import { Vario } from './audio.js';
import { BY_ID } from './discoveries.js';

const q = new URLSearchParams(location.search);
const SEED = Number(q.get('seed') ?? Math.floor(Math.random() * 9999));
const HARNESS = q.has('harness');          // 検査用: rAFを止めて手でコマを進める
const CAM_STORE = 'glide.cam';
let saved = null;
try { saved = localStorage.getItem(CAM_STORE); } catch (e) { /* 保存できない環境でも遊べる */ }
let CAM_KEY = CAMS[q.get('cam')] ? q.get('cam') : (CAMS[saved] && saved !== 'old' ? saved : 'a');
const camOf = key => {
  const ld = Number(q.get('lookdrop'));                 // 調整用: ?lookdrop=0 で下向きを切る
  const r = Number(q.get('roll'));                     // 調整用: ?roll=0.2 で傾きの強さだけ上書き
  const base = q.has('lookdrop') && Number.isFinite(ld) ? { ...CAMS[key], lookDrop: ld } : CAMS[key];
  return Number.isFinite(r) && q.has('roll') ? { ...base, roll: r } : base;
};
if (CAM_KEY === 'old') { AIR.bankRate = 1.6; AIR.inputTau = 0; }   // 直す前の再現(比較測定用)

const el = id => document.getElementById(id);
const ui = {
  dist: el('dist'), alt: el('alt'), fill: el('varioFill'),
  msg: el('msg'), msgTitle: el('msgTitle'), msgSub: el('msgSub'),
  found: el('found'), foundKind: el('foundKind'), foundName: el('foundName'), foundList: el('foundList'),
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
const SIZE_KEY = SIZES[q.get('size')] ? q.get('size') : '1';   // 既定は実寸・カメラ後ろ5m(所長 2026-09-17)。?size=2|3 は比較用に残す
const camk = Number(q.get('camk'));                              // 調整用: ?camk=0.05 でカメラの距離の倍率だけ上書き
const SIZE = q.has('camk') && camk > 0 ? { ...SIZES[SIZE_KEY], cam: camk } : SIZES[SIZE_KEY];
const view = new View(el('app'), terrain, field, camOf(CAM_KEY), SIZE);
if (!q.has('box')) view.loadModel(import.meta.env.BASE_URL + 'models/rh02.glb');   // ?box で灰色の箱のまま
if (!q.has('nodinos')) view.stegos.load(import.meta.env.BASE_URL + 'models/stego.glb').catch(e => console.error('ステゴサウルスの読み込みに失敗', e));   // ?nodinos で無し
if (!q.has('nodinos')) view.dryos.load(import.meta.env.BASE_URL + 'models/dryo.glb').catch(e => console.error('ドリオサウルスの読み込みに失敗', e));
if (!q.has('nodinos')) for (const [k, f] of [['triceras', 'tricera'], ['brachios', 'brachio'], ['allos', 'allo']]) {
  view[k].load(import.meta.env.BASE_URL + `models/${f}.glb`).catch(e => console.error(f + 'の読み込みに失敗', e));
}
if (q.has('nowater')) view.water.visible = false;          // 調査用: 水の板を消す
if (q.has('debugground')) setTimeout(() => window.__slice.debugGround(true), 0);   // 調査用: 地面の層を色分け
if (!q.has('notrees')) view.forest.load(import.meta.env.BASE_URL, view.renderer).catch(e => console.error('木の読み込みに失敗', e));   // ?notrees で木なし(比較用)

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
// 長押しでメニューや選択が出ないように
addEventListener('contextmenu', e => e.preventDefault());
addEventListener('selectstart', e => e.preventDefault());

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
  renderFoundList();
  // 着地の動きを見せてから記録を出す(やり直しはすぐ効く)
  const shownFor = glider;
  setTimeout(() => { if (ended && glider === shownFor) ui.msg.classList.remove('hidden'); }, 2200);
}

function reset() {
  glider = new Glider(terrain, field);
  found = []; foundKeys = new Set(); foundTimer = 0;
  ui.found.classList.add('hidden'); ui.found.classList.remove('show');
  if (auto) auto = new Autopilot();
  ended = false; running = true;
  ui.msg.classList.add('hidden');
}
addEventListener('keydown', e => { if ((e.key === 'r' || e.key === 'R') && ended) reset(); });
cv.addEventListener('dblclick', () => { if (ended) reset(); });

// ---- 発見 ----
// 一定距離まで近づいたら発見。飛行は止めず、控えめに知らせるだけ。
const FOUND_STORE = 'glide.found';          // これまでに見つけたもの(ずかん)
let foundAll = new Set();
try { foundAll = new Set(JSON.parse(localStorage.getItem(FOUND_STORE) || '[]')); } catch (e) { /* 保存できない環境でも遊べる */ }
let found = [], foundKeys = new Set(), foundTimer = 0, nextScan = 0;

function showFound(item) {
  ui.foundKind.textContent = item.first ? 'NEW DISCOVERY' : 'DISCOVERED';
  ui.foundName.textContent = item.name;
  ui.found.classList.remove('hidden');
  ui.found.classList.add('show');
  foundTimer = 2.6;
}

function scanDiscoveries(dt) {
  if (!running || !glider.alive) return;
  if (foundTimer > 0) {
    foundTimer -= dt;
    if (foundTimer <= 0) { ui.found.classList.remove('show'); setTimeout(() => ui.found.classList.add('hidden'), 500); }
  }
  nextScan -= dt;
  if (nextScan > 0) return;
  nextScan = 0.25;
  for (const site of view.sites.near(glider.x, glider.y, 1600)) {
    if (site.d > site.type.radius || foundKeys.has(site.key)) continue;
    foundKeys.add(site.key);
    const first = !foundAll.has(site.type.id);
    foundAll.add(site.type.id);
    try { localStorage.setItem(FOUND_STORE, JSON.stringify([...foundAll])); } catch (e) { /* 覚えられなくても遊べる */ }
    const item = { id: site.type.id, name: site.type.name, desc: site.type.desc, rarity: site.type.rarity, first };
    found.push(item);
    showFound(item);
    break;                                   // 一度に1つだけ知らせる
  }
}

function renderFoundList() {
  if (!found.length) { ui.foundList.innerHTML = '<div class="none">今回の発見はなし</div>'; return; }
  const seen = new Map();
  for (const f of found) seen.set(f.id, { ...f, n: (seen.get(f.id)?.n || 0) + 1 });
  ui.foundList.innerHTML = [...seen.values()].map(f =>
    `<div class="item"><b>${f.name}</b>${f.n > 1 ? `<i>×${f.n}</i>` : ''}<i>${f.rarity}</i>${f.first ? '<em>はじめて</em>' : ''}</div><p>${f.desc}</p>`).join('');
}

const STEP = 1 / 60;
let acc = 0, last = performance.now();

// 走行が終わったかの判定。実際の遊びでも検査用のコマ送りでも、必ずここを通す
function checkEnd() {
  if (ended) return;
  if (!glider.alive || (sunlight(glider.time) <= 0 && glider.vz < 0 && glider.agl < 3)) finish();
}

function advance(dt) {
  if (!running || !glider.alive) return;
  acc += dt;
  let n = 0;
  while (acc >= STEP && n++ < 8) {
    glider.step(STEP, input(STEP));
    acc -= STEP;
  }
  checkEnd();
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  advance(dt);
  view.update(glider, dt, sunlight(glider.time));
  vario.update(glider.vz, dt);
  scanDiscoveries(dt);
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
  forestReady: () => view.forest.ready,
  stegoReady: () => view.stegos.ready,
  dryoReady: () => view.dryos.ready,
  dinosReady: () => view.stegos.ready && view.dryos.ready && view.triceras.ready && view.brachios.ready && view.allos.ready,
  herdTune: o => Object.assign(HERD, o),
  herdScale: () => HERD.scale,
  speciesTune: (kind = 'stego', o) => Object.assign(SPECIES[kind], o || {}),   // 検査用: 種類ごとの設定を見る/変える
  flyersReady: () => view.flyers.ready,
  flyers: () => view.flyers.pool.filter(p => p.bird).map(p => {
    const o = p.model.getObjectByName('Head'), t = p.model.getObjectByName('Tail04');
    const v = n => { const q = new p.group.position.constructor(); n.getWorldPosition(q); return [q.x, q.y, q.z]; };
    const ph = o && view.projectWorld(...v(o)), pt = t && view.projectWorld(...v(t));
    return { id: p.bird.id, x: p.bird.x, y: p.bird.y, z: p.bird.z, agl: p.bird.z - terrain.height(p.bird.x, p.bird.y),
             dist: Math.hypot(p.bird.x - glider.x, p.bird.y - glider.y),
             lift: field.ridgeAt ? field.liftAt(p.bird.x, p.bird.y, p.bird.z, sunlight(glider.time)) : 0,
             px: ph, sizePx: ph && pt ? Math.hypot(ph[0] - pt[0], ph[1] - pt[1]) : 0,
             inFrame: !!ph && ph[0] > 0 && ph[0] < innerWidth && ph[1] > 0 && ph[1] < innerHeight };
  }),
  // 検査用: 描いている個体の、骨の位置(世界座標)・状態・地面の高さ
  creatures: (kind = 'stego', bones = ['Head', 'Tail04', 'ForeLFoot', 'ForeRFoot', 'HindLFoot', 'HindRFoot']) =>
    view[{ stego: 'stegos', dryo: 'dryos', tricera: 'triceras', brachio: 'brachios', allo: 'allos' }[kind] || 'stegos'].pool.filter(p => p.animal).map(p => {
    const w = name => { const o = p.model.getObjectByName(name); if (!o) return null; const v = o.getWorldPosition(new p.group.position.constructor()); return [v.x, v.y, v.z]; };
    const a = p.animal;
    const head = w(bones[0]), tail = w(bones[1]);
    // 画面のどこに映っているか(枠の外なら見えていない)
    const ph = head && view.projectWorld(head[0], head[1], head[2]);
    const pt = tail && view.projectWorld(tail[0], tail[1], tail[2]);
    return { id: a.id, state: a.state, x: a.x, y: a.y, head: a.head, ground: terrain.height(a.x, a.y),
             headBone: head, tailBone: tail, feet: bones.slice(2).map(w),
             dist: Math.hypot(a.x - glider.x, a.y - glider.y),
             px: ph, sizePx: ph && pt ? Math.hypot(ph[0] - pt[0], ph[1] - pt[1]) : 0,
             inFrame: !!ph && ph[0] > 0 && ph[0] < innerWidth && ph[1] > 0 && ph[1] < innerHeight };
  }),
  stegos: () => window.__slice.creatures('stego'),
  dryos: () => window.__slice.creatures('dryo', ['Head', 'Tail04', 'LegLFoot', 'LegRFoot']),
  herdsNear: (x, y, r, kind = 'stego') => [...view[{ stego: 'stegos', dryo: 'dryos', tricera: 'triceras', brachio: 'brachios', allo: 'allos' }[kind] || 'stegos'].herds.herdsNear(x, y, r)].map(h => ({ cx: h.cx, cy: h.cy, n: h.animals.length })),
  trees: (x, y) => view.forest.veg.around(x, y).filter(t => t.kind !== 'rock').slice(0, 4000),
  vegLineup(dist) { view.forest.lineup(glider.x, glider.y, terrain.height(glider.x, glider.y + (dist || 140)), dist); },
  forest: () => ({ counts: view.forest.counts, tris: view.forest.triangles(), frameTris: view.renderer.info.render.triangles, calls: view.renderer.info.render.calls }),
  bone: name => view.boneInfo(name),
  volcanoes: rad => terrain.volcanoesNear(glider.x, glider.y, rad || 20000).map(v => ({ x: v.x, y: v.y, H: Math.round(v.H), top: Math.round(terrain.height(v.x, v.y)) })),
  // 検査用: 地面の2層(近景・遠景)の位置と、水面
  // 検査用: 作り直しにかかった時間の分布(最初の1回は準備も含むので分けて見る)
  groundTimes: () => {
    const of = g => {
      const t = (g.times || []).slice();
      if (!t.length) return { n: 0 };
      const first = t[0], rest = t.slice(1).sort((a, b) => a - b);
      return { n: t.length, 最初: +first.toFixed(1),
               中央値: +(rest.length ? rest[Math.floor(rest.length / 2)] : first).toFixed(1),
               最大: +(rest.length ? rest[rest.length - 1] : first).toFixed(1) };
    };
    return { 近景: of(view.near), 遠景: of(view.far), 地平: of(view.horizon) };
  },
  ground: () => ({
    near: { cx: view.near.snap[0], cy: view.near.snap[1], half: view.near.size / 2, cell: view.near.cell, ms: view.near.maxMs || 0 },
    far: { cx: view.far.snap[0], cy: view.far.snap[1], hole: view.near.size / 2 - view.far.cell - view.far.cell, cell: view.far.cell, half: view.far.size / 2, ms: view.far.maxMs || 0 },
    horizon: { cx: view.horizon.snap[0], cy: view.horizon.snap[1], hole: view.far.size / 2 - view.horizon.cell - view.far.cell, cell: view.horizon.cell, half: view.horizon.size / 2, ms: view.horizon.maxMs || 0 },
  }),
  // 調査用: 層ごとに色を変える(?debugground=1 と同じ)
  debugGround: (on = true) => {
    view.near.mesh.material.color.set(on ? 0x88ff88 : 0xffffff);
    view.far.mesh.material.color.set(on ? 0xff8888 : 0xffffff);
    view.horizon.mesh.material.color.set(on ? 0x8888ff : 0xffffff);
  },
  // 検査用: 描画の内訳。名札(userData.part)ごとに、描画の回数と三角形を数える
  sceneStats: () => {
    const out = {};
    view.scene.traverse(o => {
      if (!o.geometry || !o.visible) return;
      let p = o, part = null;
      while (p && !part) { part = p.userData && p.userData.part; p = p.parent; }
      part = part || 'その他';
      const g = o.geometry;
      const n = o.isInstancedMesh ? o.count : (o.isPoints ? 0 : 1);
      const tri = o.isPoints ? 0 : (g.index ? g.index.count : g.attributes.position.count) / 3;
      const e = out[part] = out[part] || { calls: 0, tris: 0 };
      if (o.isInstancedMesh) { if (o.count) { e.calls += 1; e.tris += tri * o.count; } }
      else { e.calls += 1; e.tris += tri * n; }
    });
    for (const k of Object.keys(out)) out[k].tris = Math.round(out[k].tris);
    return out;
  },
  // 検査用: 名札ごとに消す(コマ時間の差分を測る)
  hide: (name, on = false) => {
    let n = 0;
    view.scene.traverse(o => { if (o.userData && o.userData.part === name) { o.visible = on; n++; } });
    return n;
  },
  lights: o => Object.assign(LIGHT, o || {}),            // 調整用: 光の配分を変える
  // 調整用: 地面の模様の強さをその場で変える
  surface: o => {
    Object.assign(SURFACE, o || {});
    for (const g of [view.near, view.far, view.horizon]) {
      const sh = g.mesh.material.userData.sh;
      if (!sh) continue;
      sh.uniforms.uSurf.value.set(SURFACE.macro, SURFACE.meso, SURFACE.fine, SURFACE.bump);
      sh.uniforms.uSurfAmp.value.set(SURFACE.amp[0], SURFACE.amp[1], SURFACE.amp[2], SURFACE.sand);
      sh.uniforms.uSurfFade.value.set(SURFACE.midFade[0], SURFACE.midFade[1], SURFACE.fineFade[0], SURFACE.fineFade[1]);
      sh.uniforms.uSurfDamp.value = SURFACE.damp;
    }
    return { ...SURFACE };
  },
  heightAt: (x, y) => terrain.height(x, y),
  // 地面の法線(その場の傾きの向き)。陰影が形を伝えているかを測るのに使う
  normalAt: (x, y, d = 30) => {
    const hx = terrain.height(x + d, y) - terrain.height(x - d, y);
    const hy = terrain.height(x, y + d) - terrain.height(x, y - d);
    const n = [-hx / (2 * d), 1, -hy / (2 * d)];
    const L = Math.hypot(n[0], n[1], n[2]);
    return [n[0] / L, n[1] / L, n[2] / L];
  },
  sunDir: () => { const p = view.sunLight.position; const L = p.length(); return [p.x / L, p.y / L, p.z / L]; },
  info: () => ({ calls: view.renderer.info.render.calls, tris: view.renderer.info.render.triangles }),
  waterVisible: on => { view.water.visible = on; },
  horizonVisible: on => { view.horizon.mesh.visible = on; },
  grounds: () => ({ near: view.near, far: view.far, horizon: view.horizon }),
  pick: (x, y) => view.pick(x, y),
  waterY: () => terrain.water,
  _canvas: () => view.renderer.domElement,
  camRoll: () => view.cam.roll,
  begin() { ui.start.classList.add('hidden'); running = true; },
  auto(on = true) { auto = on ? new Autopilot() : null; },
  // 実時間を待たずにn秒ぶん進める
  step(seconds, render = true) {
    const n = Math.round(seconds / STEP);
    for (let i = 0; i < n; i++) { if (!running || !glider.alive) break; glider.step(STEP, input(STEP)); }
    if (render) { view.update(glider, STEP, sunlight(glider.time)); hud(); }
    scanDiscoveries(seconds);        // 実際の遊びと同じ経路を通す(描画の有無によらず発見は起きる)
    checkEnd();
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
  render() { view.update(glider, STEP, sunlight(glider.time)); scanDiscoveries(STEP); hud(); },
  // 検査用: 好きな場所・高さ(地面から)・向きに置く
  place(x, y, agl, head = 0) {
    glider.x = x; glider.y = y; glider.z = terrain.height(x, y) + agl; glider.head = head;
    glider.bank = 0; glider.inp = 0; glider.alive = true; view.camHead = head;
  },
  ridgeAt(x, y, z) { return field.ridgeAt(x, y, z, sunlight(glider.time)); },
  terrainHeight(x, y) { return terrain.height(x, y); },
  riverX(y) { return terrain.riverX(y); },
  landing: () => view.landing && view.act ? { t: view.landing.t, shift: view.landShift, tracks: view.rootTrackNames, land: view.act.land.isRunning(), idle: view.act.idle.isRunning(), glide: view.act.glide.isRunning(),
    groundY: terrain.height(view.landing.x, view.landing.y), bones: ['Head', 'HandL', 'HandR', 'FootL', 'FootR'].map(n => view.boneInfo(n)) } : null,
  boneY: name => { const o = view.model && view.model.getObjectByName(name); if (!o) return null; const v = o.getWorldPosition(new o.position.constructor()); return v.y; },
  // 検査用: 近くの発見対象と、今回の発見
  sites: (rad = 2600) => view.sites.near(glider.x, glider.y, rad).map(s => ({ id: s.type.id, name: s.type.name, key: s.key, x: s.x, y: s.y, d: s.d, radius: s.type.radius })),
  found: () => found.map(f => ({ id: f.id, name: f.name, first: f.first })),
  foundVisible: () => ui.found.classList.contains('show') ? ui.foundName.textContent : null,
  foundListText: () => ui.foundList.textContent,
  discoveryTris: () => view.discoveries.triangles(),
  discoveryCounts: () => ({ ...view.discoveries.counts }),
  kinds: id => view.discoveries.kinds.get(id),   // 検査用: 近景/遠景の描画物をそのまま渡す
  // 見た目の確認用: 置いた数と、頂点カラーの平均(体色がちゃんと入っているか)
  discoveryLook: id => {
    const k = view.discoveries.kinds.get(id);
    if (!k) return null;
    const c = k.near.geometry.attributes.color, n = c.count;
    let r = 0, g = 0, b = 0;
    for (let i = 0; i < n; i++) { r += c.getX(i); g += c.getY(i); b += c.getZ(i); }
    return { near: k.near.count, far: k.far.count, tris: k.near.userData.tris, color: [r / n, g / n, b / n] };
  },
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
