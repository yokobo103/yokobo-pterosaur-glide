// 地形と上昇風。ブラウザにもNodeにも依存しない純JS。
// Jurassic Floodplain Generator と同じ構造(川の距離場・堤・段丘・種つきノイズ)を関数で持つ。

const hash = (ix, iy, seed) => {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
};
const smooth = t => t * t * (3 - 2 * t);
function noise2(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = smooth(x - ix), fy = smooth(y - iy);
  const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}
function fbm(x, y, seed, oct = 4) {
  let v = 0, amp = 1, f = 1, norm = 0;
  for (let i = 0; i < oct; i++) { v += amp * noise2(x * f, y * f, seed + i * 977); norm += amp; amp *= .5; f *= 2; }
  return v / norm;
}
// 種つき乱数 (チャンク生成用)
function rng(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export class Terrain {
  constructor(seed = 17, roughness = 1.0) { this.seed = seed; this.rough = roughness; this.water = 2.0; }
  riverX(y) { return 900 * Math.sin(y / 5200) + 380 * Math.sin(y / 1900 + this.seed * .37); }
  height(x, y) {
    const d = Math.abs(x - this.riverX(y));
    const bed = -6.0 * Math.exp(-((d / 260) ** 2));
    const bank = 22.0 * (1 - Math.exp(-((d / 1100) ** 2)));
    const terrace = 70.0 * fbm(x / 5200, y / 5200, this.seed, 3);
    const amp = this.rough * Math.min(1, Math.max(.08, d / 700));
    const detail = 34.0 * amp * (fbm(x / 900, y / 900, this.seed + 11) - .5);
    return this.water + bed + bank + terrace + detail;
  }
  slope(x, y, e = 30) {
    const z = this.height(x, y);
    let m = 0;
    for (const [dx, dy] of [[e, 0], [-e, 0], [0, e], [0, -e]]) m = Math.max(m, Math.abs(this.height(x + dx, y + dy) - z));
    return m / e;
  }
  // 湿っているほど植生が濃く、地面が暖まらない = 上昇風が立たない
  moisture(x, y) {
    const d = Math.abs(x - this.riverX(y));
    const near = Math.exp(-((d / 1300) ** 2));
    const patch = fbm(x / 1800, y / 1800, this.seed + 501);
    return Math.max(0, Math.min(1, .55 * near + .75 * patch - .12));
  }
}

export const TUNE = {
  spacing: 900,       // 上昇風の間隔 [m]
  jitter: 320,
  Wmin: 5.5, Wmax: 11.0,   // 上昇風の強さ [m/s]
  Rmin: 110, Rmax: 185,   // 半径 [m]
  ceilMin: 150, ceilMax: 280, // 地面からの雲底 [m] — 1本あたりの滞在を短くする
  ambient: 0.50,      // 上昇風の外の沈下 [m/s] — 上がった空気はどこかで下りる
  ring: 0.9,          // 上昇風のまわりの沈下の輪
};

export class ThermalField {
  // チャンク単位で必要になったときに湧かせる。場は無限で、転送量はゼロ。
  constructor(terrain, seed, CH = 4400) { this.t = terrain; this.seed = seed; this.CH = CH; this.chunks = new Map(); }
  chunk(ci, cj) {
    const key = ci + ',' + cj;
    let got = this.chunks.get(key);
    if (got) return got;
    got = [];
    const n = Math.round(this.CH / TUNE.spacing);
    const r = rng(Math.imul(this.seed, 7919) ^ Math.imul(ci, 92837111) ^ Math.imul(cj, 689287499));
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = ci * this.CH + (i + .5) * TUNE.spacing + (r() * 2 - 1) * TUNE.jitter;
      const y = cj * this.CH + (j + .5) * TUNE.spacing + (r() * 2 - 1) * TUNE.jitter;
      const z = this.t.height(x, y);
      if (z < this.t.water + .5) continue;
      const dry = 1 - this.t.moisture(x, y);
      const flat = Math.max(0, 1 - this.t.slope(x, y) / .16);
      const sun = .55 + .45 * r();
      const q = Math.min(1, dry ** 1.6 * (.35 + .65 * flat) * sun * 1.7);
      if (q < .18) continue;
      got.push({
        x, y, gz: z, q,
        W: TUNE.Wmin + (TUNE.Wmax - TUNE.Wmin) * q,
        R: TUNE.Rmin + (TUNE.Rmax - TUNE.Rmin) * q,
        top: z + TUNE.ceilMin + (TUNE.ceilMax - TUNE.ceilMin) * q,
      });
    }
    this.chunks.set(key, got);
    return got;
  }
  *around(x, y, rad) {
    const n = Math.floor(rad / this.CH) + 1;
    const i0 = Math.floor(x / this.CH), j0 = Math.floor(y / this.CH);
    for (let i = i0 - n; i <= i0 + n; i++) for (let j = j0 - n; j <= j0 + n; j++) yield* this.chunk(i, j);
  }
  // 日照つきの上昇風。柱のまわりには沈下の輪があり、どこにも乗らなければ常に沈む。
  liftAt(x, y, z, sun = 1) {
    let best = -1e9;
    for (const c of this.around(x, y, 900)) {
      if (z > c.top) continue;
      const r2 = ((x - c.x) ** 2 + (y - c.y) ** 2) / (c.R * c.R);
      if (r2 > 9) continue;
      const v = c.W * Math.exp(-.5 * r2) * (1 - TUNE.ring * r2);
      if (v > best) best = v;
    }
    if (best < 0) best = Math.max(best, -TUNE.ambient * 2.2);
    return (best === -1e9 ? 0 : best) * sun - TUNE.ambient;
  }

  nearby(x, y, maxd = 7000, aheadOnly = true, cone = 900) {
    const out = [];
    for (const c of this.around(x, y, maxd)) {
      const dx = c.x - x, dy = c.y - y;
      if (aheadOnly && dy < -cone) continue;
      const d = Math.hypot(dx, dy);
      if (d <= maxd) out.push({ d, c });
    }
    return out.sort((a, b) => a.d - b.d);
  }
}
