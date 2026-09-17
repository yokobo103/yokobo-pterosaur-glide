import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { TUNE } from './world.js';

// three.jsは右手系で、+X は画面の左に出る。
// シミュレーション側の x(右が正) をそのまま渡すと左右が反転するので、描画のときだけ反転させる。
const SX = -1;

// カメラの型。酔いは人によるので、並べて選ぶ。?cam=a / b / c
//   roll:    機体の傾きに対してカメラをどれだけ傾けるか(0=地平線は常に水平)
//   yawTau:  機体の向きにカメラが遅れてついていく時間[秒]
//   look:    注視点の高さ(機体からの差)。負だと見下ろす
// 翼竜の見せる大きさ。RH02は実寸で翼開長2.2m。飛び方の計算は変えず、見た目とカメラの距離だけ変える
//   scale: モデルの拡大率 / cam: カメラの距離の倍率
export const SIZES = {
  1: { name: '実寸2.2m・カメラを寄せる', scale: 1.0, cam: 0.15 },
  2: { name: '翼開長10m',               scale: 4.6, cam: 0.5 },
  3: { name: '翼開長22m(灰色の箱と同じ)', scale: 10,  cam: 1.0 },
};

export const CAMS = {
  a:   { name: '水平キープ',   back: 120, up: 52, ahead: 360, look: -6,  roll: 0.0,  yawTau: 0.6, fov: 70 },  // 本物の翼竜では up34 だと翼を真横から見て細い線になった
  b:   { name: '少しだけ傾く', back: 120, up: 52, ahead: 360, look: -6,  roll: 0.1,  yawTau: 0.6, fov: 70 },  // 所長の試走: 14度=酔う / 10度=ギリギリ / 5度=快適
  c:   { name: '見下ろし',     back: 120, up: 95, ahead: 200, look: -60, roll: 0.0,  yawTau: 0.6, fov: 66 },
  // 比較用: 直す前の版(カメラが逆向きに0.75傾く)。選択肢には出さない
  old: { name: '直す前',       back: 105, up: 28, ahead: 320, look: 7,   roll: -0.75, yawTau: 0.75, fov: 62 },
};

// 地形は運ばず、その場で作る。プレイヤーに合わせて格子をスナップして高さを引き直す。
class Ground {
  constructor(terrain, size, seg, opts = {}) {
    this.t = terrain; this.size = size; this.seg = seg; this.cell = size / seg;
    this.inner = opts.inner || 0;             // 内側をくり抜く(高精細メッシュと重ねる)
    const n = (seg + 1) * (seg + 1);
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 3);
    this.col = new Float32Array(n * 3);
    const idx = [];
    for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) {
      const a = j * (seg + 1) + i, b = a + 1, c = a + seg + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);   // SXでX反転しているぶん巻き順も反転
    }
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    g.setIndex(idx);
    this.geo = g;
    this.mesh = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true }));
    this.mesh.frustumCulled = false;
    this.snap = null;
  }
  update(px, py) {
    const cx = Math.round(px / this.cell) * this.cell, cy = Math.round(py / this.cell) * this.cell;
    if (this.snap && this.snap[0] === cx && this.snap[1] === cy) return false;
    this.snap = [cx, cy];
    const t = this.t, half = this.size / 2, s = this.seg, hole = this.inner / 2;
    const dry = new THREE.Color(0xc4a76a), wet = new THREE.Color(0x35572c), sand = new THREE.Color(0xcbb98d);
    const c = new THREE.Color();
    for (let j = 0; j <= s; j++) for (let i = 0; i <= s; i++) {
      const k = (j * (s + 1) + i) * 3;
      const x = cx - half + i * this.cell, y = cy - half + j * this.cell;
      let z = t.height(x, y);
      // 内側は高精細メッシュが描くので、ここは沈めて隠す
      if (hole && Math.abs(x - cx) < hole && Math.abs(y - cy) < hole) z = -9999;
      this.pos[k] = SX * x; this.pos[k + 1] = z; this.pos[k + 2] = y;
      const m = t.moisture(x, y);
      c.copy(dry).lerp(wet, m);
      const grain = 0.86 + 0.28 * t.grain(x, y);   // 近景の手がかり(速度と向きが読める)
      c.multiplyScalar(grain);
      if (z < t.water + 1.2) c.lerp(sand, 0.7);
      this.col[k] = c.r; this.col[k + 1] = c.g; this.col[k + 2] = c.b;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
    // 急な斜面は岩の色に。法線から出すので高さの再計算は要らない
    const nrm = this.geo.attributes.normal.array;
    for (let k = 0; k < this.col.length; k += 3) {
      const steep = Math.max(0, Math.min(1, (1 - nrm[k + 1]) * 4.5));
      if (steep > 0) {
        this.col[k] += (0.46 - this.col[k]) * steep;
        this.col[k + 1] += (0.42 - this.col[k + 1]) * steep;
        this.col[k + 2] += (0.38 - this.col[k + 2]) * steep;
      }
    }
    this.geo.attributes.color.needsUpdate = true;
    return true;
  }
}

const DUST_VERT = [
  'attribute float aAlpha;',
  'varying float vA;',
  'uniform float uSize;',
  'uniform float uMax;',
  'void main(){',
  '  float dist = -(modelViewMatrix * vec4(position, 1.0)).z;',
  '  vA = aAlpha * clamp((dist - 80.0) / 320.0, 0.0, 1.0);',   // 近い粒は消す。柱の中や真下にいると空一面をふさいでいた
  '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
  '  gl_PointSize = clamp(uSize * (900.0 / max(-mv.z, 1.0)), 3.0, uMax);',
  '  vA *= clamp(9.0 / gl_PointSize, 0.3, 1.0);',   // 大きく映るほど薄く(近い柱は気配だけ、遠い柱はくっきり)
  '  gl_Position = projectionMatrix * mv;',
  '}',
].join('\n');

const DUST_FRAG = [
  'varying float vA;',
  'uniform vec3 uColor;',
  'uniform float uFade;',
  'void main(){',
  '  vec2 p = gl_PointCoord - 0.5;',
  '  float d = length(p);',
  '  if (d > 0.5) discard;',
  '  gl_FragColor = vec4(uColor, vA * uFade * (1.0 - d * 2.0) * 0.85);',
  '}',
].join('\n');

// 上昇気流は「舞い上がる土ぼこりの柱」としてだけ見せる。数字も矢印も出さない。
class Dust {
  constructor(field, max = 7000) {
    this.f = field; this.max = max;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.alpha = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uSize: { value: 9.0 }, uMax: { value: 18.0 }, uColor: { value: new THREE.Color(0xe6d9b4) }, uFade: { value: 1 } },
      vertexShader: DUST_VERT, fragmentShader: DUST_FRAG,
      transparent: true, depthWrite: false,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.parts = [];
  }
  update(px, py, dt, sun) {
    const near = [];
    for (const c of this.f.around(px, py, 6200)) {
      const d = Math.hypot(c.x - px, c.y - py);
      if (d < 6200) near.push([d, c]);
    }
    near.sort((a, b) => a[0] - b[0]);
    const use = near.slice(0, 30).map(v => v[1]);
    const per = Math.floor(this.max / Math.max(use.length, 1));
    let n = 0;
    for (const c of use) {
      for (let i = 0; i < per && n < this.max; i++, n++) {
        let p = this.parts[n];
        if (!p || p.c !== c) p = this.parts[n] = { c, u: Math.random(), a: Math.random() * Math.PI * 2, r: Math.random() };
        // 強い柱ほど速く上がる = 遠くからでも勢いの違いが見える
        p.u += (c.W / 9) * dt * 0.10 * sun;
        if (p.u > 1) { p.u -= 1; p.a = Math.random() * Math.PI * 2; p.r = Math.random(); }
        const rad = c.R * (0.18 + 0.72 * p.r) * (0.35 + 0.65 * p.u);
        const k = n * 3;
        this.pos[k] = SX * (c.x + Math.cos(p.a + p.u * 5.0) * rad);
        this.pos[k + 1] = c.gz + 6 + (c.top - c.gz + 60) * p.u;
        this.pos[k + 2] = c.y + Math.sin(p.a + p.u * 5.0) * rad;
        this.alpha[n] = Math.min(1, (1 - p.u) * 1.7) * Math.min(1, c.W / 7);
      }
    }
    for (; n < this.max; n++) { this.alpha[n] = 0; this.pos[n * 3 + 1] = -9999; }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.mat.uniforms.uFade.value = 0.25 + 0.75 * sun;
  }
}

// 上昇気流の頭にできる雲。土ぼこりは近くでしか見えないので、遠距離の手がかりはこちら。
class Clouds {
  constructor(field, max = 900) {
    this.f = field; this.max = max;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.alpha = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uSize: { value: 150.0 }, uMax: { value: 34.0 }, uColor: { value: new THREE.Color(0xffffff) }, uFade: { value: 1 } },
      vertexShader: DUST_VERT, fragmentShader: DUST_FRAG,
      transparent: true, depthWrite: false,
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.seeds = [];
  }
  update(px, py, sun) {
    let n = 0;
    const per = 7;
    for (const c of this.f.around(px, py, 9000)) {
      if (c.W < 7.0) continue;                         // 強い柱にだけ雲がつく = 強さが遠くから読める
      if (n + per > this.max) break;
      for (let i = 0; i < per; i++, n++) {
        let s = this.seeds[n];
        if (!s || s.c !== c) s = this.seeds[n] = { c, a: Math.random() * 6.28, r: Math.random(), h: Math.random() };
        const rad = c.R * (0.25 + 0.85 * s.r);
        const k = n * 3;
        this.pos[k] = SX * (c.x + Math.cos(s.a) * rad);
        this.pos[k + 1] = c.top + 40 + s.h * 55;
        this.pos[k + 2] = c.y + Math.sin(s.a) * rad;
        this.alpha[n] = 0.75 * Math.min(1, (c.W - 6.5) / 2.5);
      }
    }
    for (; n < this.max; n++) { this.alpha[n] = 0; this.pos[n * 3 + 1] = -9999; }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
    this.mat.uniforms.uFade.value = 0.3 + 0.7 * sun;
  }
}

function makeGlider() {
  // 灰色の箱。どの角度から見ても向きが分かる形にする。
  // 厚みゼロの板だと、カメラの仰角が浅いとき消えて「鼻がこちらを向いた」ように見える。
  const g = new THREE.Group();
  const skin = new THREE.MeshLambertMaterial({ color: 0xd8d2c4 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x8d857a });

  const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.6, 12), skin);
  body.position.z = 1;
  g.add(body);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.0, 4.5, 6), dark);  // 前がどっちか分かる目印
  nose.rotation.x = Math.PI / 2; nose.position.z = 9;
  g.add(nose);

  // 上反角つきの翼。左右が別の面を向くので、真横から見ても片方は必ず見える
  for (const sgn of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.BoxGeometry(11, 0.55, 4.6), skin);
    w.position.set(sgn * 5.8, 1.1, 0.5);
    w.rotation.z = -sgn * 0.21;          // 上反角 12度
    w.rotation.y = sgn * 0.30;           // 後退角
    g.add(w);
  }
  // 尾。回転している向きが読める
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.4, 3.0), dark);
  fin.position.set(0, 2.2, -5.5);
  g.add(fin);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(6.0, 0.45, 2.2), skin);
  tail.position.set(0, 1.0, -5.8);
  g.add(tail);
  return g;
}

export class View {
  constructor(el, terrain, field, cam = CAMS.a, size = SIZES[2]) {
    this.cam = cam; this.size = size;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(cam.fov, 1, 0.5, 18000);
    this.sunLight = new THREE.DirectionalLight(0xffeedd, 1.5);
    this.sunLight.position.set(-0.4, 1, 0.5);
    this.scene.add(this.sunLight, new THREE.HemisphereLight(0xbcd6ff, 0x5a5340, 1.0));
    this.far = new Ground(terrain, 13000, 110, { inner: 2600 });
    this.near = new Ground(terrain, 2600, 72);
    this.scene.add(this.far.mesh, this.near.mesh);
    const water = new THREE.Mesh(new THREE.PlaneGeometry(30000, 30000),
      new THREE.MeshLambertMaterial({ color: 0x4d7fa8, transparent: true, opacity: 0.85 }));
    water.rotation.x = -Math.PI / 2; water.position.y = terrain.water + 0.6;
    water.frustumCulled = false;
    this.scene.add(water); this.water = water;
    // 夕日。+Y(スコアが伸びる向き)の空に固定で置く。方位の手がかりと残り時間を兼ねる
    this.sunDisc = new THREE.Mesh(new THREE.CircleGeometry(1, 40),
      new THREE.MeshBasicMaterial({ color: 0xfff0cc, fog: false, transparent: true, depthWrite: false }));
    this.sunDisc.renderOrder = -1;
    this.scene.add(this.sunDisc);
    this.dust = new Dust(field);
    this.clouds = new Clouds(field);
    this.scene.add(this.dust.points, this.clouds.points);
    // 機体: 外側のグループが向きと傾きを持つ(+Zが機首)。中身は読み込むまで灰色の箱
    this.glider = new THREE.Group();
    this.placeholder = makeGlider();
    this.placeholder.scale.setScalar(size.scale / 10);   // 灰色の箱は翼開長22m相当
    this.glider.add(this.placeholder);
    this.scene.add(this.glider);
    this.mixer = null; this.model = null; this.modelReady = false;
    this.fog = new THREE.FogExp2(0xbfd0e0, 0.000075);
    this.scene.fog = this.fog;
    this.camHead = null;      // 機体の向きに遅れて追従する。旋回を「見える」ようにするため
    this.resize();
    addEventListener('resize', () => this.resize());
  }
  // 本物の翼竜を読み込む。RH02は機首が-Zなので180度回して+Zへそろえる(骨の位置で確認済み)
  loadModel(url) {
    new GLTFLoader().load(url, gltf => {
      const m = gltf.scene;
      m.rotation.y = Math.PI;
      m.position.y = -0.35 * this.size.scale;     // 胴体の高さを機体の中心へ
      m.scale.setScalar(this.size.scale);
      m.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
      this.glider.add(m);
      this.placeholder.visible = false;
      this.model = m;
      this.mixer = new THREE.AnimationMixer(m);
      this.clips = Object.fromEntries(gltf.animations.map(c => [c.name, c]));
      if (this.clips.Glide_Loop) this.mixer.clipAction(this.clips.Glide_Loop).play();
      this.modelReady = true;
    }, undefined, err => { console.error('翼竜の読み込みに失敗。灰色の箱のまま飛ぶ', err); });
  }
  // 検査用: 骨の画面上の位置とカメラからの距離
  boneInfo(name) {
    if (!this.model) return null;
    const o = this.model.getObjectByName(name);
    if (!o) return null;
    const w = new THREE.Vector3(); o.getWorldPosition(w);
    return { px: this._proj(w), dist: w.distanceTo(this.camera.position) };
  }
  setCam(cam) {
    this.cam = cam;
    this.camera.fov = cam.fov;
    this.camera.updateProjectionMatrix();
  }
  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  // 検査用: 座標を画面のピクセルへ落とす
  projectLocal(x, y, z) { return this._proj(new THREE.Vector3(x, y, z).applyMatrix4(this.glider.matrixWorld)); }
  projectWorld(x, y, z) { return this._proj(new THREE.Vector3(x, y, z)); }
  // 検査用: 機首が向いている向きと、実際に進んでいる向き。ここがズレると機首が明後日を向く
  gliderForward() {
    const d = new THREE.Vector3(0, 0, 1).transformDirection(this.glider.matrixWorld);
    return [d.x, d.y, d.z];
  }
  velocityDir(g) {
    const SXv = SX;
    const d = new THREE.Vector3(SXv * Math.sin(g.head), 0, Math.cos(g.head)).normalize();
    return [d.x, d.y, d.z];
  }
  // 検査用: 地平線の傾き。世界の「上」が画面でどちらへ傾いて見えるかで測るので、左右の取り違えが起きない
  // 0=水平 / 正=地平線の右側が上がっている(右バンクのときに正しい向き)
  horizonLean() {
    const f = new THREE.Vector3();
    this.camera.getWorldDirection(f); f.y = 0; f.normalize();
    const P = this.camera.position.clone().addScaledVector(f, 1000);
    const a = this._proj(P), b = this._proj(P.clone().add(new THREE.Vector3(0, 100, 0)));
    return Math.atan2(-(b[0] - a[0]), -(b[1] - a[1])) * 57.3;
  }
  _proj(v) {
    const q = v.clone().project(this.camera);
    const s = this.renderer.getSize(new THREE.Vector2());
    return [(q.x + 1) / 2 * s.x, (1 - (q.y + 1) / 2) * s.y];
  }
  update(g, dt, sun) {
    this.far.update(g.x, g.y);
    this.near.update(g.x, g.y);
    this.water.position.x = SX * g.x; this.water.position.z = g.y;
    this.dust.update(g.x, g.y, dt, sun);
    this.clouds.update(g.x, g.y, sun);
    this.glider.position.set(SX * g.x, g.z, g.y);
    this.glider.rotation.set(0, -g.head, g.bank, 'YXZ');
    // 夕暮れ。時計ではなく空の色で残り時間が分かる
    const day = new THREE.Color(0xbfd0e0), dusk = new THREE.Color(0xd98a5a), night = new THREE.Color(0x2b3348);
    const sky = sun > 0.35
      ? day.clone().lerp(dusk, (1 - sun) / 0.65)
      : dusk.clone().lerp(night, (0.35 - sun) / 0.35);
    this.scene.background = sky; this.fog.color = sky;
    this.sunLight.intensity = 0.35 + 1.25 * sun;
    // 太陽は +Y の方角、高度は日照とともに下がる
    const elev = (2.5 + 11 * sun) * Math.PI / 180, D = 9000;
    const sx = SX * g.x, sy = g.z + Math.sin(elev) * D + 60, sz = g.y + Math.cos(elev) * D;
    this.sunDisc.position.set(sx, sy, sz);
    this.sunDisc.scale.setScalar(300 + 260 * (1 - sun));
    this.sunDisc.lookAt(this.camera.position);
    this.sunDisc.material.color.setHSL(0.11, 0.55 * (1 - sun) + 0.08, 0.92 - 0.12 * (1 - sun));
    if (TUNE.windSpeed > 0) {
      // 風のある世界では、光を風上(左)から低めに当てる。上昇風が出る斜面が明るく、風下は暗く見える
      const wx = Math.sin(TUNE.windAngle), wy = Math.cos(TUNE.windAngle);
      this.sunLight.position.set(SX * -wx, 0.55, -wy);
    } else {
      this.sunLight.position.set(SX * 0.35, Math.sin(elev), Math.cos(elev));
    }
    const tall = Math.max(0, 1 - this.camera.aspect);      // 縦持ちほど大きい
    const C = this.cam, k = this.size.cam;
    if (this.mixer) this.mixer.update(dt);
    // カメラは機体の向きに遅れてついていく
    if (this.camHead === null) this.camHead = g.head;
    let e = g.head - this.camHead;
    while (e > Math.PI) e -= 2 * Math.PI;
    while (e < -Math.PI) e += 2 * Math.PI;
    this.camHead += e * (1 - Math.exp(-dt / C.yawTau));
    const ch = this.camHead;
    this.camera.position.set(SX * (g.x - Math.sin(ch) * C.back * k), g.z + C.up * k, g.y - Math.cos(ch) * C.back * k);
    this.camera.lookAt(SX * (g.x + Math.sin(ch) * C.ahead), g.z + (C.look + 12 * tall) * k, g.y + Math.cos(ch) * C.ahead);
    // 右に傾いたらカメラも右に傾く(rotation.z は負が右)。直す前はここの符号が逆だった
    this.camera.rotation.z -= g.bank * C.roll;
    this.renderer.render(this.scene, this.camera);
  }
}
