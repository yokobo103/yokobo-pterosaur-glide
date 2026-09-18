import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TUNE, VEG, Vegetation, HERD, SPECIES, Herds, FLOCK, Flock } from './world.js';
import { DiscoverySites } from './discoveries.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

// three.jsは右手系で、+X は画面の左に出る。
// シミュレーション側の x(右が正) をそのまま渡すと左右が反転するので、描画のときだけ反転させる。
const SX = -1;

// 群れのいる地面の踏み荒らし。上空から群れを見つける唯一の手がかり(個体は500m先で18pxしかない)

// カメラの型。酔いは人によるので、並べて選ぶ。?cam=a / b / c
//   roll:    機体の傾きに対してカメラをどれだけ傾けるか(0=地平線は常に水平)
//   yawTau:  機体の向きにカメラが遅れてついていく時間[秒]
//   look:    注視点の高さ(機体からの差)。負だと見下ろす
// 翼竜の見せる大きさ。RH02は実寸で翼開長2.2m。飛び方の計算は変えず、見た目とカメラの距離だけ変える
//   scale: モデルの拡大率 / cam: カメラの距離の倍率
export const SIZES = {
  1: { name: 'いきもの3.5倍',  scale: 3.5, cam: 0.147 },  // 翼開長7.7m。カメラも3.5倍(後ろ約17.6m)で、画面の見え方は同じ
  2: { name: '翼開長10m',               scale: 4.6, cam: 0.5 },
  3: { name: '翼開長22m(灰色の箱と同じ)', scale: 10,  cam: 1.0 },
};

export const CAMS = {
  a:   { name: '水平キープ',   back: 120, up: 52, ahead: 360, look: -6,  roll: 0.0,  yawTau: 0.6, fov: 70, lookDrop: 0 },  // 本物の翼竜では up34 だと翼を真横から見て細い線になった
  b:   { name: '少しだけ傾く', back: 120, up: 52, ahead: 360, look: -6,  roll: 0.1,  yawTau: 0.6, fov: 70, lookDrop: 0 },  // 所長の試走: 14度=酔う / 10度=ギリギリ / 5度=快適
  c:   { name: '見下ろし',     back: 120, up: 95, ahead: 200, look: -60, roll: 0.0,  yawTau: 0.6, fov: 66, lookDrop: 0 },
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
  update(px, py, marks = []) {
    const cx = Math.round(px / this.cell) * this.cell, cy = Math.round(py / this.cell) * this.cell;
    const herdKey = marks.map(m => Math.round(m.x) + ',' + Math.round(m.y)).join('|');
    if (this.snap && this.snap[0] === cx && this.snap[1] === cy && this.herdKey === herdKey) return false;
    this.herdKey = herdKey;
    this.snap = [cx, cy];
    const t = this.t, half = this.size / 2, s = this.seg, hole = this.inner / 2;
    // ジュラ紀には草原がない。乾いた所は赤茶の土、湿った所はシダの緑、水辺は泥(黄土色の「草原」に見えていた)
    const dry = new THREE.Color(0xb0764a), wet = new THREE.Color(0x4f7d38), sand = new THREE.Color(0x7a6448);
    const canopyDry = new THREE.Color(0x22381f), canopyWet = new THREE.Color(0x3a5524);
    const tintColor = new THREE.Color();
    const c = new THREE.Color();
    for (let j = 0; j <= s; j++) for (let i = 0; i <= s; i++) {
      const k = (j * (s + 1) + i) * 3;
      const x = cx - half + i * this.cell, y = cy - half + j * this.cell;
      let z = t.height(x, y);
      // 内側は高精細メッシュが描くので、ここは沈めて隠す
      if (hole && Math.abs(x - cx) < hole && Math.abs(y - cy) < hole) z = -9999;
      this.pos[k] = SX * x; this.pos[k + 1] = z; this.pos[k + 2] = y;
      const m = t.moisture(x, y);
      // 湿り気は大半が中くらいで、そのまま混ぜるとオリーブ色になって何も変わらなかった。差を強調して振り分ける
      const mm = Math.min(1, Math.max(0, (m - 0.3) / 0.3));
      c.copy(dry).lerp(wet, mm * mm * (3 - 2 * mm));
      // 林の下は樹冠の色。上空からは1本1本より、この色のかたまりで林と読める
      const gv = t.grove(x, y);
      if (gv > 0.47 && z > t.water + 2) {
        const k = Math.min(1, (gv - 0.47) / 0.08) * 0.7;
        c.lerp(m < 0.5 ? canopyDry : canopyWet, k);
      }
      // 発見対象の目印。上空から「あそこに何かある」と分かるように地面の色を変える
      // (土ぼこりで示したら上昇気流の柱と見分けがつかなかった)
      for (const mk of marks) {
        const dh = Math.hypot(x - mk.x, y - mk.y);
        if (dh < mk.r) { tintColor.set(mk.color); c.lerp(tintColor, mk.strength * (1 - dh / mk.r) ** 0.6); break; }
      }
      const grain = 0.92 + 0.18 * t.grain(x, y);   // 近景の手がかり(速度と向きが読める)。暗く沈めすぎない
      c.multiplyScalar(grain);
      if (z < t.water + 1.2) c.lerp(sand, 0.8);
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

// 火山の噴煙。遠くからの目印。風下(+x)へ流れながら広がる
class Plumes {
  constructor(terrain, max = 1800) {
    this.t = terrain; this.max = max; this.parts = [];
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3); this.alpha = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uSize: { value: 380.0 }, uMax: { value: 60.0 }, uColor: { value: new THREE.Color(0x9a948c) }, uFade: { value: 1 } },   // 暗く濃いと黒い塊のシールに見えた
      vertexShader: DUST_VERT, fragmentShader: DUST_FRAG, transparent: true, depthWrite: false,
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false;
  }
  update(px, py, dt) {
    const vs = this.t.volcanoesNear(px, py, 16000).slice(0, 6);
    const per = Math.floor(this.max / Math.max(vs.length, 1));
    let n = 0;
    for (const v of vs) {
      const top = this.t.height(v.x, v.y) + v.H * 0.02;
      for (let i = 0; i < per && n < this.max; i++, n++) {
        let p = this.parts[n];
        if (!p || p.v !== v) p = this.parts[n] = { v, u: Math.random(), a: Math.random() * 6.28, r: Math.random() };
        p.u += dt * 0.018;
        if (p.u > 1) { p.u -= 1; p.a = Math.random() * 6.28; p.r = Math.random(); }
        const spread = 30 + 420 * p.u * p.u;              // 根元は細い柱、上で広がる
        const k = n * 3;
        this.pos[k] = SX * (v.x + 1400 * p.u * p.u * p.u + Math.cos(p.a) * spread * p.r);
        this.pos[k + 1] = top + 1300 * p.u;
        this.pos[k + 2] = v.y + Math.sin(p.a) * spread * p.r;
        this.alpha[n] = 0.28 * Math.min(1, p.u * 6) * (1 - p.u);
      }
    }
    for (; n < this.max; n++) { this.alpha[n] = 0; this.pos[n * 3 + 1] = -9999; }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
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

// ---- 木の近景と遠景の入れ替え ----
// 遠景は、読み込んだAstraの木を横と上から撮った画像を板に貼ったもの(1本6三角形)。
// 以前は円錐と多面体の代わりの形で、近づくと別物に切り替わって見えた(所長「変化が大きすぎて受け入れ難い」)。
const FADE_NEAR = 90, FADE_FAR = 150;        // この距離の間で、近景と遠景を少しずつ入れ替える

// 近景と遠景で同じ乱れ方を使い、足すとちょうど1本分になるように消す(穴も二重にもならない)
function addDistanceFade(material, isFar) {
  material.onBeforeCompile = shader => {
    shader.uniforms.uFadeA = { value: FADE_NEAR };
    shader.uniforms.uFadeB = { value: FADE_FAR };
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying float vFadeD;\nvoid main() {')
      .replace('#include <project_vertex>', [
        '#include <project_vertex>',
        '  #ifdef USE_INSTANCING',
        '    vFadeD = distance((modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz, cameraPosition);',
        '  #else',
        '    vFadeD = distance((modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz, cameraPosition);',
        '  #endif',
      ].join('\n'));
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'uniform float uFadeA;\nuniform float uFadeB;\nvarying float vFadeD;\nvoid main() {')
      .replace('#include <clipping_planes_fragment>', [
        '#include <clipping_planes_fragment>',
        '  {',
        '    float fadeT = clamp((vFadeD - uFadeA) / (uFadeB - uFadeA), 0.0, 1.0);',
        '    float fadeH = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898, 78.233))) * 43758.5453);',
        isFar ? '    if (fadeH < 1.0 - fadeT) discard;' : '    if (fadeH > 1.0 - fadeT) discard;',
        '  }',
      ].join('\n'));
  };
  material.customProgramCacheKey = () => (isFar ? 'fade-far' : 'fade-near');
}

// Astraの木を撮って、遠景の板を作る。画像の左半分=横から、右下=上から
function bakeImpostor(renderer, geo, opt = {}) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const w = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z), h = bb.max.y - bb.min.y;
  const rt = new THREE.WebGLRenderTarget(512, 512, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const scene = new THREE.Scene();
  // 色だけ撮る。光は板の側で当てる
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
  const side = new THREE.OrthographicCamera(-w / 2, w / 2, bb.max.y, bb.min.y, 0.1, 1000);
  side.position.set(0, 0, 500); side.lookAt(0, 0, 0);
  const top = new THREE.OrthographicCamera(-w / 2, w / 2, w / 2, -w / 2, 0.1, 2000);
  top.position.set(0, 1000, 0); top.up.set(0, 0, -1); top.lookAt(0, 0, 0);
  const prevTarget = renderer.getRenderTarget();
  const prevColor = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
  renderer.setRenderTarget(rt);
  // 透明な背景を黒にすると、遠くで画像を縮めたときに黒と混ざって暗くなった。背景は木自身の平均の色(透明)にする
  const col = geo.attributes.color.array; const avg = new THREE.Color(0, 0, 0);
  for (let i = 0; i < col.length; i += 3) { avg.r += col[i]; avg.g += col[i + 1]; avg.b += col[i + 2]; }
  avg.multiplyScalar(3 / col.length);
  renderer.setClearColor(avg, 0); renderer.clear();
  rt.scissorTest = true;
  rt.viewport.set(0, 0, 256, 512); rt.scissor.set(0, 0, 256, 512); renderer.setRenderTarget(rt); renderer.render(scene, side);
  rt.viewport.set(256, 0, 256, 256); rt.scissor.set(256, 0, 256, 256); renderer.setRenderTarget(rt); renderer.render(scene, top);
  rt.scissorTest = false; rt.viewport.set(0, 0, 512, 512); rt.scissor.set(0, 0, 512, 512);
  renderer.setRenderTarget(prevTarget); renderer.setClearColor(prevColor, prevAlpha);
  // 十字の縦板2枚＋樹冠の高さの水平板1枚。法線は上向きにそろえ、向きで明るさが変わらないようにする
  const pos = [], uv = [], nrm = [];
  const quad = (a, b, c, d, ua, ub, uc, ud) => {
    for (const [p, u] of [[a, ua], [b, ub], [c, uc], [a, ua], [c, uc], [d, ud]]) { pos.push(...p); uv.push(...u); nrm.push(0, 1, 0); }
  };
  const y0 = bb.min.y, y1 = bb.max.y, r = w / 2;
  quad([-r, y0, 0], [r, y0, 0], [r, y1, 0], [-r, y1, 0], [0, 0], [0.5, 0], [0.5, 1], [0, 1]);
  // 木は十字に組む。いきものは1枚だけにして、並べるときにこちらへ向ける
  // (細い二足歩行を十字にすると、2頭が重なったような形に見えた)
  if (!opt.cross) {
    quad([0, y0, -r], [0, y0, r], [0, y1, r], [0, y1, -r], [0, 0], [0.5, 0], [0.5, 1], [0, 1]);
  }
  // 水平の板は「上から見た樹冠」。いきものに付けると地面に倒れた影のように見えるので、その時は外す
  if (!opt.cross) {
    const yc = y0 + (y1 - y0) * 0.62;
    quad([-r, yc, r], [r, yc, r], [r, yc, -r], [-r, yc, -r], [0.5, 0], [1, 0], [1, 0.5], [0.5, 0.5]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return { geo: g, texture: rt.texture };
}

// 木と岩。種類×近景/遠景ごとに1つの InstancedMesh(描画1回)にまとめる。
// GLBの材質の色を頂点色に焼き込んで1つの形にしてから並べる
class Forest {
  constructor(terrain, scene) {
    this.veg = new Vegetation(terrain);
    this.scene = scene;
    this.meshes = {};            // 'conifer_lod0' など
    this.ready = false; this.last = null;
    this.counts = {};
  }
  async load(baseUrl, renderer) {
    const loader = new GLTFLoader();
    const CAP = { lod0: 150, lod1: 12000 };
    for (const kind of ['conifer', 'ginkgo', 'rock']) {
      const gltf = await loader.loadAsync(baseUrl + 'models/veg/' + kind + '_lod0.glb');
      const parts = [];
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse(o => {
        if (!o.isMesh) return;
        const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
        for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
        const c = (o.material && o.material.color) ? o.material.color.clone().multiplyScalar(1.35) : new THREE.Color(0.3, 0.3, 0.3);
        const n = g.attributes.position.count, col = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        parts.push(g);
      });
      const geo = mergeGeometries(parts, false);
      const add = (key, g, mat, cap) => {
        const im = new THREE.InstancedMesh(g, mat, cap);
        im.count = 0; im.frustumCulled = false;
        im.userData.tris = (g.index ? g.index.count : g.attributes.position.count) / 3;
        this.meshes[key] = im; this.scene.add(im);
      };
      if (kind === 'rock') {                          // 岩は18三角形なので入れ替えなし
        add('rock_lod0', geo, new THREE.MeshLambertMaterial({ vertexColors: true }), CAP.lod1);
        continue;
      }
      const nearMat = new THREE.MeshLambertMaterial({ vertexColors: true });
      addDistanceFade(nearMat, false);
      add(kind + '_lod0', geo, nearMat, CAP.lod0);
      const imp = bakeImpostor(renderer, geo);
      const farMat = new THREE.MeshLambertMaterial({ map: imp.texture, alphaTest: 0.4, side: THREE.DoubleSide });
      addDistanceFade(farMat, true);
      add(kind + '_lod1', imp.geo, farMat, CAP.lod1);
    }
    this.ready = true;
  }
  update(px, py) {
    if (!this.ready || this.frozen) return;
    // 40m動くごとに並べ直す。入れ替えの帯(90〜150m)に入る木を、近景と遠景の両方に必ず入れておくため
    if (this.last && Math.hypot(px - this.last[0], py - this.last[1]) < 40) return;
    this.last = [px, py];
    const idx = {};
    for (const k of Object.keys(this.meshes)) idx[k] = 0;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const it of this.veg.around(px, py)) {
      const s = VEG.scale[it.kind] * it.s;
      q.setFromAxisAngle(up, it.rot);
      p.set(SX * it.x, it.z - 0.4 * s, it.y);          // 斜面でも浮かないよう少し沈める
      sc.set(s, s, s);
      m.compose(p, q, sc);
      // 近景と遠景のどちらに入れるか。帯の前後に並べ直しの間隔(40m)ぶん余裕を持たせる。描く/消すはシェーダが距離で決める
      const keys = it.kind === 'rock' ? ['rock_lod0']
        : [...(it.d <= FADE_FAR + 50 ? [it.kind + '_lod0'] : []), ...(it.d >= FADE_NEAR - 50 ? [it.kind + '_lod1'] : [])];
      for (const key of keys) {
        const im = this.meshes[key];
        if (!im || idx[key] >= im.instanceMatrix.count) continue;
        im.setMatrixAt(idx[key]++, m);
      }
    }
    for (const [k, im] of Object.entries(this.meshes)) {
      im.count = idx[k];
      im.instanceMatrix.needsUpdate = true;
    }
    this.counts = { ...idx };
  }
  // 検査用: 各種類を横一列に並べて、形を直接見る。並べたあとは自動の並べ直しを止める
  lineup(px, py, pz, dist = 140) {
    this.frozen = true;
    const order = ['conifer_lod0', 'conifer_lod1', 'ginkgo_lod0', 'ginkgo_lod1', 'rock_lod0'];
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    for (const im of Object.values(this.meshes)) im.count = 0;
    order.forEach((key, i) => {
      const im = this.meshes[key]; if (!im) return;
      const kind = key.split('_')[0], s = VEG.scale[kind];
      const x = px + (i - 2) * 45;
      p.set(SX * x, pz, py + dist); sc.set(s, s, s); m.compose(p, q, sc);
      im.setMatrixAt(0, m); im.count = 1; im.instanceMatrix.needsUpdate = true;
    });
  }
  triangles() {
    let t = 0;
    for (const im of Object.values(this.meshes)) t += im.count * im.userData.tris;
    return t;
  }
}

// 他の翼竜。自分と同じモデルを使い回す(追加の読み込みなし)
class Flyers {
  constructor(terrain, field, scene) {
    this.flock = new Flock(terrain, field); this.scene = scene;
    this.proto = null; this.clip = null; this.pool = []; this.byId = new Map(); this.ready = false;
  }
  setModel(gltfScene, clips) {
    this.proto = gltfScene; this.clip = clips.Glide_Loop; this.ready = true;
  }
  make() {
    const group = new THREE.Group();
    const model = cloneSkinned(this.proto);
    model.rotation.y = Math.PI;                 // RH02は機首が-Z
    model.position.y = -0.35 * FLOCK.scale;
    model.scale.setScalar(FLOCK.scale);
    model.traverse(o => { if (o.isMesh) o.frustumCulled = false; });
    group.add(model);
    const mixer = new THREE.AnimationMixer(model);
    const act = mixer.clipAction(this.clip);
    act.time = Math.random() * this.clip.duration;             // 羽ばたきをそろえない
    act.play();
    this.scene.add(group);
    return { group, model, mixer, bird: null };
  }
  update(px, py, dt, time) {
    if (!this.ready) return;
    const list = this.flock.near(px, py, time);
    const keep = new Set(list.map(b => b.id));
    for (const e of this.pool) if (e.bird && !keep.has(e.bird.id)) { this.byId.delete(e.bird.id); e.bird = null; e.group.visible = false; }
    for (const b of list) {
      let e = this.byId.get(b.id);
      if (!e) {
        e = this.pool.find(p => !p.bird) || (this.pool.push(this.make()), this.pool[this.pool.length - 1]);
        e.bird = b; this.byId.set(b.id, e);
      }
      e.bird = b;
      e.group.visible = true;
      e.group.position.set(SX * b.x, b.z, b.y);
      e.group.rotation.set(0, -b.head, b.bank, 'YXZ');
      e.mixer.update(dt);
    }
  }
  count() { return this.pool.filter(p => p.bird).length; }
}

// 発見対象のうち、自前の見た目を持つもの。
// model.url があればGLBを読む(Astra製アセットはこれ)。model.build があればその場で形を作る。
// 遠くは木と同じ方式で、モデルを撮った画像を板に貼ったものに入れ替える(1体6三角形)。
class Discoveries {
  constructor(sites, scene, renderer) {
    this.sites = sites; this.scene = scene; this.renderer = renderer; this.terrain = sites.ctx.terrain;
    this.kinds = new Map();          // typeId -> { near, far, pool }
    this.loading = new Set();
  }
  buildGeometry(build) {
    // 営巣地: 浅いくぼみと、寄せ集めた卵
    if (build === 'nest') {
      const parts = [];
      const paint = (geo, color) => {
        const g = geo.toNonIndexed();
        for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
        const n = g.attributes.position.count, col = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) { col[i * 3] = color.r; col[i * 3 + 1] = color.g; col[i * 3 + 2] = color.b; }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        parts.push(g);
      };
      const rim = new THREE.TorusGeometry(2.2, 0.55, 5, 14); rim.rotateX(Math.PI / 2); rim.translate(0, 0.25, 0);
      paint(rim, new THREE.Color(0.42, 0.33, 0.22));
      for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2, r = 0.5 + 0.5 * ((i * 7) % 3) / 3;
        const egg = new THREE.SphereGeometry(0.45, 7, 5); egg.scale(1, 1.35, 1);
        egg.translate(Math.cos(a) * r, 0.45, Math.sin(a) * r);
        paint(egg, new THREE.Color(0.74, 0.70, 0.58));
      }
      return mergeGeometries(parts, false);
    }
    return new THREE.BufferGeometry();
  }
  async ensure(type) {
    if (this.kinds.has(type.id) || this.loading.has(type.id) || !type.model) return;
    this.loading.add(type.id);
    let geo = null, material = null;
    if (type.model.build) {
      geo = this.buildGeometry(type.model.build);
      material = new THREE.MeshLambertMaterial({ vertexColors: true });
    } else {
      const gltf = await new GLTFLoader().loadAsync(type.model.url);
      const parts = [];
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse(o => {
        if (!o.isMesh) return;
        const g = o.geometry.clone().applyMatrix4(o.matrixWorld);
        // 体色が頂点カラーに入っているモデルがある(Astraの恐竜)。消さずに材質の色と掛け合わせる。
        // 部品ごとに成分数が違うと結合できないので、必ず3成分に作り直す
        const src = o.material && o.material.vertexColors ? g.attributes.color : null;
        for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
        const c = (o.material && o.material.color) ? o.material.color.clone().multiplyScalar(1.35) : new THREE.Color(0.35, 0.35, 0.35);
        const n = g.attributes.position.count, col = new Float32Array(n * 3);
        for (let i = 0; i < n; i++) {
          const r = src ? src.getX(i) : 1, gg = src ? src.getY(i) : 1, b = src ? src.getZ(i) : 1;
          col[i * 3] = c.r * r; col[i * 3 + 1] = c.g * gg; col[i * 3 + 2] = c.b * b;
        }
        g.setAttribute('color', new THREE.BufferAttribute(col, 3));
        parts.push(g);
      });
      geo = mergeGeometries(parts, false);
      material = new THREE.MeshLambertMaterial({ vertexColors: true });
    }
    addDistanceFade(material, false);
    const num = type.model.count || 1;
    const near = new THREE.InstancedMesh(geo, material, 12 * num);
    near.count = 0; near.frustumCulled = false;
    near.userData.tris = (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
    const imp = bakeImpostor(this.renderer, geo, { cross: type.model.impostor === 'cross' });
    const farMat = new THREE.MeshLambertMaterial({ map: imp.texture, alphaTest: 0.4, side: THREE.DoubleSide });
    addDistanceFade(farMat, true);
    const far = new THREE.InstancedMesh(imp.geo, farMat, 40 * num);
    far.count = 0; far.frustumCulled = false; far.userData.tris = imp.geo.attributes.position.count / 3;
    this.scene.add(near, far);
    this.kinds.set(type.id, { near, far });
    this.loading.delete(type.id);
  }
  update(px, py) {
    // 50m動くまでは並べ直さない(探すのは毎コマやるほどのことではない)
    if (this.last && Math.hypot(px - this.last[0], py - this.last[1]) < 50 && !this.loading.size) return;
    this.last = [px, py];
    const counts = {};
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), sc = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const [, k] of this.kinds) { k.near.count = 0; k.far.count = 0; }
    for (const site of this.sites.near(px, py, 3000)) {
      const type = site.type;
      if (!type.model) continue;
      if (site.d > (type.model.draw || 2200)) continue;
      if (!this.kinds.has(type.id)) { this.ensure(type); continue; }
      const k = this.kinds.get(type.id);
      const target = site.d <= FADE_FAR ? k.near : k.far;   // 近くは本物、遠くは板(入れ替えは距離でぼかす)
      const both = site.d > FADE_NEAR && site.d < FADE_FAR + 60 ? [k.near, k.far] : [target];
      sc.setScalar(type.model.scale || 1);
      // count を書けば、その場に何頭か散らして置く(位置は場所から決まるので毎回同じ)
      const num = type.model.count || 1, spread = type.model.spread || 0;
      for (let i = 0; i < num; i++) {
        let x = site.x, y = site.y, z = site.z;
        if (i > 0) {
          const a = (site.x * 0.013 + site.y * 0.007 + i * 2.399) % (Math.PI * 2);
          const r = spread * (0.35 + 0.65 * ((i * 7 + Math.floor(site.x)) % 5) / 5);
          x += Math.cos(a) * r; y += Math.sin(a) * r;
          z = this.terrain.height(x, y);
        }
        p.set(SX * x, z, y);
        for (const im of both) {
          if (im.count >= im.instanceMatrix.count) continue;
          // 1枚板の遠景はこちらを向ける。それ以外は場所で決まる向き
          const face = im === k.far && type.model.impostor === 'cross';
          q.setFromAxisAngle(up, face ? Math.atan2(SX * px - p.x, py - p.z) : (x * 0.7 + y * 0.3 + i * 1.7) % (Math.PI * 2));
          m.compose(p, q, sc);
          im.setMatrixAt(im.count++, m);
          counts[type.id] = (counts[type.id] || 0) + 1;
        }
      }
    }
    for (const [, k] of this.kinds) { k.near.instanceMatrix.needsUpdate = true; k.far.instanceMatrix.needsUpdate = true; }
    this.counts = counts;
  }
  triangles() {
    let t = 0;
    for (const [, k] of this.kinds) t += k.near.count * k.near.userData.tris + k.far.count * k.far.userData.tris;
    return t;
  }
}

// 群れで暮らす恐竜(Astraのリグ版を tools/export-*.py で書き出したもの)。近い個体だけ骨つきで描く。
// 種類ごとに1つ作る。動きは Idle と Walk の2つのクリップを使う
class Creatures {
  constructor(terrain, scene, cfg = HERD) {
    this.t = terrain; this.scene = scene; this.cfg = cfg; this.herds = new Herds(terrain, cfg);
    this.proto = null; this.clips = null; this.pool = []; this.byId = new Map(); this.ready = false;

  }
  async load(url) {
    const gltf = await new GLTFLoader().loadAsync(url);
    this.proto = gltf.scene;
    this.proto.traverse(o => { if (o.isMesh) { o.frustumCulled = false; } });
    this.clips = Object.fromEntries(gltf.animations.map(c => [c.name, c]));
    this.ready = true;
  }
  make() {
    const group = new THREE.Group();
    const model = cloneSkinned(this.proto);
    model.rotation.y = Math.PI / 2;           // 書き出したモデルは頭が -X。群れの向き(+Z)へ回す
    group.add(model);
    const mixer = new THREE.AnimationMixer(model);
    const idle = mixer.clipAction(this.clips.Idle), walk = mixer.clipAction(this.clips.Walk);
    walk.timeScale = this.cfg.timeScale;
    idle.play();
    this.scene.add(group);
    return { group, model, mixer, idle, walk, animal: null, state: 'idle' };
  }
  update(px, py, dt) {
    this.herds.update(px, py, dt);
    if (!this.ready) return;                       // 土ぼこりはモデルの読み込み前から出す
    const list = this.herds.near(px, py, this.cfg.show).slice(0, 18);
    const keep = new Set(list.map(e => e.a.id));
    // 見えなくなった個体の器を空ける
    for (const e of this.pool) if (e.animal && !keep.has(e.animal.id)) { this.byId.delete(e.animal.id); e.animal = null; e.group.visible = false; }
    for (const { a } of list) {
      let e = this.byId.get(a.id);
      if (!e) {
        e = this.pool.find(p => !p.animal) || (this.pool.push(this.make()), this.pool[this.pool.length - 1]);
        e.animal = a; this.byId.set(a.id, e);
        e.state = null;                         // 状態を合わせ直す
      }
      e.group.visible = true;
      e.group.position.set(SX * a.x, this.t.height(a.x, a.y), a.y);
      e.group.rotation.set(0, -a.head, 0);
      e.group.scale.setScalar(a.s * this.cfg.scale);
      if (e.state !== a.state) {
        const to = a.state === 'walk' ? e.walk : e.idle, from = a.state === 'walk' ? e.idle : e.walk;
        if (e.state === null) { from.stop(); to.reset().play(); }
        else { to.reset().play(); from.crossFadeTo(to, 0.4, false); }
        e.state = a.state;
      }
      e.mixer.update(dt);
    }
  }
  count() { return this.pool.filter(p => p.animal).length; }
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
    this.cam = cam; this.size = size; this.terrain = terrain;
    this.landing = null;          // 着地の演出中の状態
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(cam.fov, 1, 0.5, 18000);
    this.sunLight = new THREE.DirectionalLight(0xffe6c4, 1.5);
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
    this.forest = new Forest(terrain, this.scene);
    this.stegos = new Creatures(terrain, this.scene, SPECIES.stego);
    this.dryos = new Creatures(terrain, this.scene, SPECIES.dryo);
    this.flyers = new Flyers(terrain, field, this.scene);
    this.sites = new DiscoverySites({ terrain, field, herdsOf: { stego: this.stegos.herds, dryo: this.dryos.herds } });
    this.discoveries = new Discoveries(this.sites, this.scene, this.renderer);
    this.plumes = new Plumes(terrain);
    this.scene.add(this.plumes.points);
    this.fog = new THREE.FogExp2(0xc9cfc4, 0.00009);   // 暖かく湿った霞
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
      this.act = {
        glide: this.mixer.clipAction(this.clips.Glide_Loop),
        land: this.mixer.clipAction(this.clips.Landing_Fold),
        idle: this.mixer.clipAction(this.clips.Ground_Idle),
      };
      this.act.land.setLoop(THREE.LoopOnce, 1);
      this.act.land.clampWhenFinished = true;
      this.act.glide.play();
      // 着地が終わったら地上待機へ
      // 着地の動きはRootが前へ約2.4m進む。地上待機はRootが原点から始まるので、そのまま切り替えると後ろへ飛び戻って画面の下へ消えた
      const rootTrack = this.clips.Landing_Fold.tracks.find(t => /^Root\.position$/.test(t.name));
      this.rootTrackNames = this.clips.Landing_Fold.tracks.filter(t => /position/.test(t.name)).map(t => t.name).slice(0, 8);
      this.landShift = 0;
      if (rootTrack) {
        const v = rootTrack.values, n = v.length;
        this.landShift = Math.hypot(v[n - 3] - v[0], v[n - 1] - v[2]) * this.size.scale;
      }
      this.mixer.addEventListener('finished', e => {
        if (e.action === this.act.land && this.landing) {
          this.landing.shift = this.landShift;                // 進んだ分だけ機体の位置を前へ送ってから切り替える
          this.act.land.stop();
          this.act.idle.reset().play();
        }
      });
      this.flyers.setModel(m, this.clips);     // 同じモデルを他の翼竜にも使う
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
    const marks = this.sites ? this.sites.tints(g.x, g.y, 9000) : [];
    this.far.update(g.x, g.y, marks);
    this.near.update(g.x, g.y, marks);
    this.water.position.x = SX * g.x; this.water.position.z = g.y;
    this.forest.update(g.x, g.y);
    this.plumes.update(g.x, g.y, dt);
    this.stegos.update(g.x, g.y, dt);
    this.dryos.update(g.x, g.y, dt);
    this.flyers.update(g.x, g.y, dt, g.time);
    this.discoveries.update(g.x, g.y);
    this.dust.update(g.x, g.y, dt, sun);
    this.clouds.update(g.x, g.y, sun);
    // ---- 着地 ----
    // 地面に着いた瞬間は時速100km以上出ているので、その場で止めず2秒ほどで滑るように減速しながら着地の動きへ移る
    let P = g;
    if (!g.alive && this.model && this.act) {
      if (!this.landing) {
        this.landing = { t: 0, x: g.x, y: g.y, head: g.head, v: 32 };
        this.act.land.reset().play();
        this.act.glide.crossFadeTo(this.act.land, 0.35, false);
      }
      const L = this.landing, tau = 0.45;
      L.t += dt;
      const d = L.v * tau * (1 - Math.exp(-L.t / tau));
      const lx = L.x + Math.sin(L.head) * d, ly = L.y + Math.cos(L.head) * d;
      P = { x: lx, y: ly, z: this.terrain.height(lx, ly), head: L.head, bank: 0 };
      this.glider.position.set(SX * P.x, P.z, P.y);
      this.glider.rotation.set(0, -P.head, 0, 'YXZ');
      this.model.position.y = 0;                              // 着地の動きは足元が原点。空中用の持ち上げを外す
      this.model.position.z = L.shift || 0;                  // 地上待機に移ったら、着地で進んだ分だけ体だけを前へ(カメラは動かさない)
    } else {
      if (this.landing) {                                     // やり直したら空中の姿へ戻す
        this.landing = null;
        if (this.act) { this.act.land.stop(); this.act.idle.stop(); this.act.glide.reset().play(); }
        if (this.model) { this.model.position.y = -0.35 * this.size.scale; this.model.position.z = 0; }
      }
      this.glider.position.set(SX * g.x, g.z, g.y);
      this.glider.rotation.set(0, -g.head, g.bank, 'YXZ');
    }
    // 夕暮れ。時計ではなく空の色で残り時間が分かる
    const day = new THREE.Color(0xc9cfc4), dusk = new THREE.Color(0xd98a5a), night = new THREE.Color(0x2b3348);
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
    // 高く飛ぶほど視線を下げ、近くの地面を画面に入れる(高いと足元が画面の下に隠れて、地上の生き物が見えなかった)
    const drop = Math.min(160, (C.lookDrop || 0) * Math.max(0, g.agl - 60));
    const camZ = P === g ? g.z : P.z + 2;
    this.camera.position.set(SX * (P.x - Math.sin(ch) * C.back * k), camZ + C.up * k, P.y - Math.cos(ch) * C.back * k);
    this.camera.lookAt(SX * (P.x + Math.sin(ch) * C.ahead), camZ + (C.look + 12 * tall) * k - drop, P.y + Math.cos(ch) * C.ahead);
    // 右に傾いたらカメラも右に傾く(rotation.z は負が右)。直す前はここの符号が逆だった
    this.camera.rotation.z -= g.bank * C.roll;
    this.renderer.render(this.scene, this.camera);
  }
}
