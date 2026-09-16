import * as THREE from 'three';

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
      idx.push(a, c, b, b, c, d);
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
      this.pos[k] = x; this.pos[k + 1] = z; this.pos[k + 2] = y;
      const m = t.moisture(x, y);
      c.copy(dry).lerp(wet, m);
      if (z < t.water + 1.2) c.lerp(sand, 0.7);
      this.col[k] = c.r; this.col[k + 1] = c.g; this.col[k + 2] = c.b;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.computeVertexNormals();
    return true;
  }
}

const DUST_VERT = [
  'attribute float aAlpha;',
  'varying float vA;',
  'uniform float uSize;',
  'void main(){',
  '  float dist = -(modelViewMatrix * vec4(position, 1.0)).z;',
  '  vA = aAlpha * clamp((dist - 30.0) / 150.0, 0.0, 1.0);',   // 近すぎる粒は消す(視界を塞ぐ)
  '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
  '  gl_PointSize = clamp(uSize * (900.0 / max(-mv.z, 1.0)), 2.0, 26.0);',
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
  constructor(field, max = 4200) {
    this.f = field; this.max = max;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.alpha = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uSize: { value: 9.0 }, uColor: { value: new THREE.Color(0xe6d9b4) }, uFade: { value: 1 } },
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
        this.pos[k] = c.x + Math.cos(p.a + p.u * 5.0) * rad;
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

function makeGlider() {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color: 0xd8d2c4, side: THREE.DoubleSide });
  // 灰色の箱。翼開長だけ合わせた三角で、本番の翼竜モデルではない。
  const wing = new THREE.BufferGeometry();
  wing.setAttribute('position', new THREE.BufferAttribute(new Float32Array([
    0, 0, 7, -11, 0.6, -3, 11, 0.6, -3,
    0, 0, 7, 11, 0.6, -3, -11, 0.6, -3,
  ]), 3));
  wing.computeVertexNormals();
  g.add(new THREE.Mesh(wing, mat));
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(1.1, 7, 4, 8),
    new THREE.MeshLambertMaterial({ color: 0xbdb49f }));
  body.rotation.x = Math.PI / 2; body.position.z = 1.5;
  g.add(body);
  return g;
}

export class View {
  constructor(el, terrain, field) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    el.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 2, 18000);
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
    this.dust = new Dust(field);
    this.scene.add(this.dust.points);
    this.glider = makeGlider();
    this.scene.add(this.glider);
    this.fog = new THREE.FogExp2(0xbfd0e0, 0.000075);
    this.scene.fog = this.fog;
    this.resize();
    addEventListener('resize', () => this.resize());
  }
  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
  update(g, dt, sun) {
    this.far.update(g.x, g.y);
    this.near.update(g.x, g.y);
    this.water.position.x = g.x; this.water.position.z = g.y;
    this.dust.update(g.x, g.y, dt, sun);
    this.glider.position.set(g.x, g.z, g.y);
    this.glider.rotation.set(0, -g.head, -g.bank * 1.25, 'YXZ');
    // 夕暮れ。時計ではなく空の色で残り時間が分かる
    const day = new THREE.Color(0xbfd0e0), dusk = new THREE.Color(0xd98a5a), night = new THREE.Color(0x2b3348);
    const sky = sun > 0.35
      ? day.clone().lerp(dusk, (1 - sun) / 0.65)
      : dusk.clone().lerp(night, (0.35 - sun) / 0.35);
    this.scene.background = sky; this.fog.color = sky;
    this.sunLight.intensity = 0.35 + 1.25 * sun;
    const tall = Math.max(0, 1 - this.camera.aspect);      // 縦持ちほど大きい
    const back = 78, up = 38 + 14 * tall;
    this.camera.position.set(g.x - Math.sin(g.head) * back, g.z + up, g.y - Math.cos(g.head) * back);
    this.camera.lookAt(g.x + Math.sin(g.head) * 340, g.z - 34 + 46 * tall, g.y + Math.cos(g.head) * 340);
    this.camera.rotation.z += g.bank * 0.16;
    this.renderer.render(this.scene, this.camera);
  }
}
