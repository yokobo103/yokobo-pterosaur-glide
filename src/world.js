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
// 稜線がとがるノイズ。尾根は細く、谷は広くなる
function ridged(x, y, seed, oct = 4) {
  let v = 0, amp = 0.5, f = 1, wgt = 1, norm = 0;
  for (let i = 0; i < oct; i++) {
    let n = 1 - Math.abs(noise2(x * f, y * f, seed + i * 131) * 2 - 1);
    n *= n; n *= wgt; wgt = Math.min(1, n * 2);
    v += n * amp; norm += amp; amp *= 0.5; f *= 2.1;
  }
  return v / norm;
}
const smoothstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
// 種つき乱数 (チャンク生成用)
function rng(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export class Terrain {
  constructor(seed = 17, roughness = 1.0) { this.seed = seed; this.rough = roughness; this.water = 2.0; this.peakCells = new Map(); }
  // 越えられない高い山。広い区画ごとに置くか決める。出発地点の近くには置かない
  peakIn(ci, cj) {
    const key = ci + ',' + cj;
    if (this.peakCells.has(key)) return this.peakCells.get(key);
    const r = rng(Math.imul(this.seed, 48271) ^ Math.imul(ci, 73856093) ^ Math.imul(cj, 19349663));
    let pk = null;
    if (r() < TUNE.peakChance) {
      const S = TUNE.peakCell;
      const x = (ci + 0.2 + 0.6 * r()) * S, y = (cj + 0.2 + 0.6 * r()) * S;
      if (!(Math.abs(x) < 2500 && y > -2500 && y < 3500)) {
        pk = { x, y, H: TUNE.peakMin + (TUNE.peakMax - TUNE.peakMin) * r(), R: 900 + 700 * r(), s: Math.floor(r() * 1000) };
        pk.volcano = r() < 0.4;                       // 一部は火山(頂にくぼみ・噴煙)。乱数の最後で引くので山の位置と形は変わらない
      }
    }
    this.peakCells.set(key, pk);
    return pk;
  }
  // 近くの高い山(発見の対象にも使う)
  peaksNear(x, y, rad) {
    if (!TUNE.peakChance) return [];
    const S = TUNE.peakCell, n = Math.ceil(rad / S) + 1, ci = Math.floor(x / S), cj = Math.floor(y / S), out = [];
    for (let i = ci - n; i <= ci + n; i++) for (let j = cj - n; j <= cj + n; j++) {
      const p = this.peakIn(i, j);
      if (p && !p.volcano && Math.hypot(p.x - x, p.y - y) <= rad) out.push({ key: `peak:${Math.round(p.x)},${Math.round(p.y)}`, x: p.x, y: p.y });
    }
    return out;
  }
  // 近くの火山(噴煙を出す位置)
  volcanoesNear(x, y, rad) {
    if (!TUNE.peakChance) return [];
    const S = TUNE.peakCell, n = Math.ceil(rad / S) + 1, ci = Math.floor(x / S), cj = Math.floor(y / S), out = [];
    for (let i = ci - n; i <= ci + n; i++) for (let j = cj - n; j <= cj + n; j++) {
      const p = this.peakIn(i, j);
      if (p && p.volcano && Math.hypot(p.x - x, p.y - y) <= rad) out.push(p);
    }
    return out;
  }
  peaks(x, y) {
    if (!TUNE.peakChance) return 0;
    const S = TUNE.peakCell, ci = Math.floor(x / S), cj = Math.floor(y / S);
    let h = 0;
    for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) {
      const p = this.peakIn(i, j);
      if (!p) continue;
      const q = ((x - p.x) ** 2 + (y - p.y) ** 2) / (p.R * p.R);
      if (q > 4) continue;
      // なだらかな裾＋少しごつごつさせた頂
      const rough = 0.8 + 0.35 * ridged((x - p.x) / 700, (y - p.y) / 700, this.seed + p.s, 3);
      let v = p.H * Math.exp(-q * 1.6) * rough;
      if (p.volcano) v -= p.H * 0.14 * Math.exp(-q / 0.012);   // 火口のくぼみ
      h = Math.max(h, v);
    }
    return h;
  }
  riverX(y) { return 900 * Math.sin(y / 5200) + 380 * Math.sin(y / 1900 + this.seed * .37); }
  height(x, y) {
    const d = Math.abs(x - this.riverX(y));
    const bed = -6.0 * Math.exp(-((d / 260) ** 2));
    const bank = 22.0 * (1 - Math.exp(-((d / 1100) ** 2)));
    const terrace = 70.0 * fbm(x / 5200, y / 5200, this.seed, 3);
    const amp = this.rough * Math.min(1, Math.max(.08, d / 700));
    const detail = 34.0 * amp * (fbm(x / 900, y / 900, this.seed + 11) - .5);
    // 山: 川から離れるほど立ち上がる。稜線は進行方向(+y)に長く伸ばし、横風が長い斜面に当たるようにする
    let mtn = 0;
    if (TUNE.mtn && TUNE.mtnMode === 'ranges') {
      // 進行方向に沿ってつながった山脈。ところどころ鞍部で低くなる(Astraに頼む山の形の仮置き)
      const rx = this.riverX(y);
      for (let k = 0; k < TUNE.rangeOffsets.length; k++) {
        for (const side of [-1, 1]) {
          const xk = rx + side * TUNE.rangeOffsets[k] + 260 * Math.sin(y / 2300 + k * 1.7 + side);
          const prof = Math.exp(-(((x - xk) / TUNE.rangeWidth) ** 2));
          const saddle = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(y / 2600 + k * 2.1 + side * 0.8)) ** 1.5;
          mtn += TUNE.mtnHeight * prof * saddle;
        }
      }
      mtn += 0.12 * TUNE.mtnHeight * ridged(x / 1400, y / 1400, this.seed + 71) * smoothstep(TUNE.mtnStart, TUNE.mtnStart + TUNE.mtnRamp, d);
    } else if (TUNE.mtn && TUNE.mtnMode === 'hills') {
      // 丘と峠。平らな所を残しつつ、ところどころ越えるか避けるかを迫る高さにする。
      // 川沿いも完全には平らにしない(川に沿っていれば安全、にならないように)
      const b = fbm(x / TUNE.mtnWave, y / TUNE.mtnWave, this.seed + 71, 4);
      const r = ridged(x / (TUNE.mtnWave * 0.8), y / (TUNE.mtnWave * 0.8), this.seed + 83, 3);
      const shape = Math.max(0, 0.6 * b + 0.4 * r - 0.35) / 0.65;
      mtn = TUNE.mtnHeight * shape * shape * (0.4 + 0.6 * smoothstep(150, 1300, d));
      mtn = Math.max(mtn, this.peaks(x, y));   // 高い山は丘の上に重ねる
    } else if (TUNE.mtn) {
      mtn = TUNE.mtnHeight * ridged(x / TUNE.mtnWave, y / (TUNE.mtnWave * 2.6), this.seed + 71)
        * smoothstep(TUNE.mtnStart, TUNE.mtnStart + TUNE.mtnRamp, d);
    }
    return this.water + bed + bank + terrace + detail + mtn;
  }
  slope(x, y, e = 30) {
    const z = this.height(x, y);
    let m = 0;
    for (const [dx, dy] of [[e, 0], [-e, 0], [0, e], [0, -e]]) m = Math.max(m, Math.abs(this.height(x + dx, y + dy) - z));
    return m / e;
  }
  // 地表の細かい濃淡。動いていることが分かるための模様で、飛行には影響しない
  grain(x, y) { return fbm(x / 230, y / 230, this.seed + 907, 2); }
  // 林のかたまり(0〜1)。木の配置と、上空から見える地面の色の両方で使う
  grove(x, y) { return fbm(x / 1400, y / 1400, this.seed + 300, 3); }
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
  // 山と尾根の上昇風(案C)。灰色の試作値。Astraに山を頼む前に、使える寸法をここで探る
  mtn: 0,             // 1で山あり。既定は今までどおり山なし(?world=ridge で山脈)
  mtnMode: 'noise',   // 'noise'=ノイズの山 / 'ranges'=つながった山脈
  peakChance: 0,      // 高い山を置く確率(区画ごと)。丘の世界で使う
  peakCell: 5000,     // 区画の大きさ [m]
  peakMin: 650, peakMax: 950,   // 高い山の高さ [m]。上昇気流の雲底(地面から最大280m)では越えられない
  rangeOffsets: [2600, 5400],   // 川から山脈までの距離 [m]
  rangeWidth: 700,    // 山脈の裾の広さ [m]
  mtnHeight: 340,     // 山の高さの最大 [m]
  mtnWave: 3400,      // 尾根の間隔の目安 [m]
  mtnStart: 900,      // 川からこの距離で山が立ち上がり始める [m]
  mtnRamp: 1600,
  windSpeed: 0,       // 風速 [m/s]。既定は無風
  windAngle: Math.PI / 2,   // 風の向き。0=+y(進行方向), π/2=+x(横風)
  ridgeK: 1.0,        // 斜面に当たった風がどれだけ上向きになるか
  ridgeH: 140,        // 斜面からこの高さで上昇風が弱まる [m]
  ridgeCap: 6,        // 尾根の上昇風の上限 [m/s]
};

// 尾根の試作で、尾根沿いに飛べると測れた山脈の設定(tools/ridge-band.mjs: 86%の区間で高度を保てる・最長2.5km・斜面から150m)
export const WORLDS = {
  flat: {},
  // 既定。尾根の風は使わず、起伏そのものを「避けるか越えるか」の判断にする(所長の試走 2026-09-17)
  // 高い山はたまに置く。越えられないので回り込む(所長 2026-09-17)。着地点の輪は「面白くない」で廃止
  hills: { mtn: 1, mtnMode: 'hills', mtnHeight: 220, mtnWave: 2400, peakChance: 0.4 },
  ridge: { mtn: 1, mtnMode: 'ranges', mtnHeight: 550, rangeWidth: 700, windSpeed: 11, ridgeH: 240, leeCap: 2.5 },
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
    return (best === -1e9 ? 0 : best) * sun - TUNE.ambient + this.ridgeAt(x, y, z, sun);
  }
  // 尾根の上昇風: 風が斜面を登る向きに当たれば上がり、風下側では下がる。
  // 日が暮れると風も弱まる(尾根だけで永遠に飛べないように)
  ridgeAt(x, y, z, sun = 1) {
    const ws = TUNE.windSpeed * (0.35 + 0.65 * sun);
    if (ws <= 0 || TUNE.ridgeK <= 0) return 0;
    const t = this.t, e = 35;
    const gx = (t.height(x + e, y) - t.height(x - e, y)) / (2 * e);
    const gy = (t.height(x, y + e) - t.height(x, y - e)) / (2 * e);
    const wx = Math.sin(TUNE.windAngle), wy = Math.cos(TUNE.windAngle);
    const agl = Math.max(0, z - t.height(x, y));
    const up = TUNE.ridgeK * ws * (wx * gx + wy * gy);
    return Math.max(-(TUNE.leeCap ?? TUNE.ridgeCap), Math.min(TUNE.ridgeCap, up)) * Math.exp(-agl / TUNE.ridgeH);
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

// ---------- 木と岩の配置 ----------
// 見た目の配置だけで、飛び方には影響しない。区画ごとに種つきで決めるので、何度来ても同じ場所に同じ木がある。
export const VEG = {
  cell: 400,          // 区画の大きさ [m]
  grid: 12,           // 区画あたりの候補点(12×12、約33mおき)。67mおきでは林に見えず草原にまばらな木だった
  radius: 2600,       // この距離まで置く [m]
  near: 150,          // この距離までは細かいモデル(1本3〜4千三角形なので近くだけ。220mだとイチョウ63本で290k三角形)
  scale: { conifer: 3.8, ginkgo: 3.4, rock: 5.5 },   // 原型は針葉樹7.8m/イチョウ5.7m/岩0.9m。上空から見えるよう実在の大木の高さへ
};

export class Vegetation {
  constructor(terrain) { this.t = terrain; this.cells = new Map(); }
  cellItems(ci, cj) {
    const key = ci + ',' + cj;
    let got = this.cells.get(key);
    if (got) return got;
    got = [];
    const t = this.t, S = VEG.cell, G = VEG.grid;
    const r = rng(Math.imul(t.seed, 1103515245) ^ Math.imul(ci, 2654435761) ^ Math.imul(cj, 40503));
    for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) {
      const x = (ci + (i + r()) / G) * S, y = (cj + (j + r()) / G) * S;
      const roll = r(), s = 0.75 + 0.55 * r(), rot = r() * Math.PI * 2;
      const grove = t.grove(x, y);
      // 林の外で、たまの一本にも岩にもならない候補は、重い計算の前に捨てる
      if (grove < 0.47 && roll > 0.03) continue;
      const h = t.height(x, y);
      if (h < t.water + 2) continue;
      const slope = t.slope(x, y, 30), m = t.moisture(x, y);
      let kind = null;
      if (slope > 0.3 || h > 260) { if (roll < 0.03) kind = 'rock'; }      // 急斜面と高い山は岩
      else if (grove > 0.52 && m < 0.55 && roll < 0.7) kind = 'conifer';  // 乾いた林は針葉樹
      else if (grove > 0.47 && m >= 0.4 && roll < 0.5) kind = 'ginkgo';   // 湿り気のある林はイチョウ
      else if (roll < 0.004) kind = m < 0.5 ? 'conifer' : 'ginkgo';        // 林の外にもたまに一本
      if (kind) got.push({ kind, x, y, z: h, s, rot });
    }
    this.cells.set(key, got);
    return got;
  }
  // 地点のまわりに置くものを、近い/遠いに分けて返す
  around(px, py) {
    const S = VEG.cell, n = Math.ceil(VEG.radius / S);
    const ci0 = Math.floor(px / S), cj0 = Math.floor(py / S);
    const out = [];
    for (let i = ci0 - n; i <= ci0 + n; i++) for (let j = cj0 - n; j <= cj0 + n; j++) {
      for (const it of this.cellItems(i, j)) {
        const d = Math.hypot(it.x - px, it.y - py);
        if (d <= VEG.radius) out.push({ ...it, d, near: d <= VEG.near });
      }
    }
    return out;
  }
}

// この世界のいきものの見せる大きさ。実寸だと飛行高度から数ピクセルにしかならないので、全部同じ倍率で大きくする
export const CREATURE_SCALE = 3.5;

// ---------- ステゴサウルスの群れ ----------
// 見た目のためだけの生き物で、飛び方には影響しない。群れの場所は区画ごとに種つきで決まる。
export const HERD = {
  cell: 3000,         // 区画の大きさ [m]
  chance: 0.9,        // 区画に群れがいる確率
  min: 5, max: 10,    // 群れの頭数(小さい群れは上空から見つけられなかった)
  spread: 95,         // 群れの広がり [m]
  scale: CREATURE_SCALE,   // この世界のいきものは全部3.5倍(所長 2026-09-18)。全長7m -> 24.5m
  walk: 0.21,         // 歩きの動き1回ぶんの前進の速さ [m/s](AstraのWalkクリップの値)
  timeScale: 3.0,     // 歩きの動きの再生速度。前進の速さも同じ倍率にする(足が滑らないように)
  active: 1800,       // この距離の群れだけ動かす [m]
  show: 3000,         // この距離の個体だけ描く [m]。1300mだと、近いときは画面の下・映るときは小さい、で見つけられなかった
};

export class Herds {
  constructor(terrain) { this.t = terrain; this.cells = new Map(); }
  herdIn(ci, cj) {
    const key = ci + ',' + cj;
    if (this.cells.has(key)) return this.cells.get(key);
    const t = this.t, S = HERD.cell;
    const r = rng(Math.imul(t.seed, 22695477) ^ Math.imul(ci, 1664525) ^ Math.imul(cj, 1013904223));
    let herd = null;
    if (r() < HERD.chance) {
      // 川の近くで、水際から離れた平らな所を探す
      for (let k = 0; k < 40 && !herd; k++) {
        const y = (cj + r()) * S;
        const side = r() < 0.5 ? -1 : 1;
        const x = t.riverX(y) + side * (140 + 1400 * r());   // 開けた所を見つけやすいよう、川から1.5kmまで探す
        if (Math.floor(x / S) !== ci) continue;
        const h = t.height(x, y);
        if (h < t.water + 1.5 || t.slope(x, y, 25) > 0.12) continue;
        if (t.grove(x, y) > 0.42) continue;                         // 林の中だと木に隠れて見えなかった。開けた所に置く
        const n = HERD.min + Math.floor(r() * (HERD.max - HERD.min + 1));
        const animals = [];
        for (let i = 0; i < n; i++) {
          const ax = x + (r() * 2 - 1) * HERD.spread, ay = y + (r() * 2 - 1) * HERD.spread;
          animals.push({ id: key + ':' + i, x: ax, y: ay, head: r() * Math.PI * 2, state: 'idle',
                         timer: 1 + r() * 8, tx: ax, ty: ay, s: 0.9 + 0.2 * r(), r: rng(Math.imul(ci + 7, 31) + cj * 977 + i) });
        }
        herd = { key, cx: x, cy: y, animals };
      }
    }
    this.cells.set(key, herd);
    return herd;
  }
  *herdsNear(px, py, rad) {
    const S = HERD.cell, n = Math.ceil(rad / S) + 1, ci0 = Math.floor(px / S), cj0 = Math.floor(py / S);
    for (let i = ci0 - n; i <= ci0 + n; i++) for (let j = cj0 - n; j <= cj0 + n; j++) {
      const h = this.herdIn(i, j);
      if (h && Math.hypot(h.cx - px, h.cy - py) <= rad + 2 * HERD.spread) yield h;
    }
  }
  update(px, py, dt) {
    const t = this.t;
    // 大きくすると歩幅も伸びるので、歩く速さも同じ倍率にしないと足が地面を滑る
    const vOf = a => HERD.walk * HERD.timeScale * HERD.scale * a.s;
    for (const herd of this.herdsNear(px, py, HERD.active)) {
      for (const a of herd.animals) {
        a.timer -= dt;
        if (a.timer <= 0) {
          if (a.state === 'idle') {
            // ほぼ正面の少し先へ歩き出す。群れから離れすぎていたら中心の方へ曲がる。
            // 群れの中の適当な一点を目指すと歩く間の9割で向きを変え続け、そのあいだ足が地面を横に滑った
            const toC = Math.atan2(herd.cx - a.x, herd.cy - a.y);
            let back = toC - a.head;
            while (back > Math.PI) back -= 2 * Math.PI;
            while (back < -Math.PI) back += 2 * Math.PI;
            const far = Math.hypot(herd.cx - a.x, herd.cy - a.y) > HERD.spread;
            const dir = a.head + (far ? Math.max(-0.7, Math.min(0.7, back)) : (a.r() * 2 - 1) * 0.3);
            const len = 10 + a.r() * 16;
            a.state = 'walk'; a.timer = 6 + a.r() * 14;
            a.tx = a.x + Math.sin(dir) * len; a.ty = a.y + Math.cos(dir) * len;
          } else { a.state = 'idle'; a.timer = 4 + a.r() * 10; }
        }
        if (a.state !== 'walk') continue;
        const want = Math.atan2(a.tx - a.x, a.ty - a.y);
        let e = want - a.head;
        while (e > Math.PI) e -= 2 * Math.PI;
        while (e < -Math.PI) e += 2 * Math.PI;
        a.head += Math.max(-0.1 * dt, Math.min(0.1 * dt, e));        // ゆっくり向きを変える(速いと足が横に滑る)
        const v = vOf(a);
        const nx = a.x + Math.sin(a.head) * v * dt, ny = a.y + Math.cos(a.head) * v * dt;
        const h = t.height(nx, ny);
        if (h < t.water + 1.2 || t.slope(nx, ny, 10) > 0.25 || Math.hypot(a.tx - a.x, a.ty - a.y) < 3) {
          a.state = 'idle'; a.timer = 3 + a.r() * 6;                   // 水際・急斜面・目的地で立ち止まる
          continue;
        }
        a.x = nx; a.y = ny;
      }
    }
  }
  near(px, py, rad) {
    const out = [];
    for (const herd of this.herdsNear(px, py, rad)) for (const a of herd.animals) {
      const d = Math.hypot(a.x - px, a.y - py);
      if (d <= rad) out.push({ a, d });
    }
    return out.sort((p, q) => p.d - q.d);
  }
}

// ---------- 他の翼竜 ----------
// 上昇気流の中を旋回する。実際の鳥と同じで「あそこで回っている = 上がる空気がある」の手がかりになる
export const FLOCK = {
  scale: CREATURE_SCALE,
  show: 2400,         // この距離の上昇気流に出す [m]
  minW: 6.5,          // これより強い上昇気流にだけ集まる [m/s]
  radius: 55,         // 旋回の半径 [m]
  turn: 0.22,         // 旋回の速さ [rad/s]
  max: 10,            // 同時に出す数
};

export class Flock {
  constructor(terrain, field) { this.t = terrain; this.f = field; }
  // 時刻 time における、近くの翼竜たちの位置・向き・傾き
  near(px, py, time) {
    const out = [];
    for (const c of this.f.around(px, py, FLOCK.show)) {
      if (c.W < FLOCK.minW) continue;
      const d = Math.hypot(c.x - px, c.y - py);
      if (d > FLOCK.show) continue;
      const seed = Math.abs(Math.floor(c.x * 7.31 + c.y * 3.17));
      const n = 1 + (seed % 3);                                  // 1〜3羽
      for (let i = 0; i < n; i++) {
        const phase = ((seed * (i + 1) * 9301 + 49297) % 233280) / 233280;
        const ang = time * FLOCK.turn * (1 + 0.15 * phase) + phase * Math.PI * 2;
        const r = FLOCK.radius * (0.75 + 0.5 * phase);
        // 上昇気流の中を、下から雲底へ上がっては戻るのを繰り返す
        const u = (time * 0.012 + phase) % 1;
        const z = c.gz + 70 + (c.top - c.gz - 70) * u;
        out.push({
          id: `${Math.round(c.x)},${Math.round(c.y)}:${i}`,
          x: c.x + Math.cos(ang) * r, y: c.y + Math.sin(ang) * r, z,
          head: -ang + Math.PI / 2,                              // 円の接線方向へ進む
          bank: 0.5, d,
        });
      }
    }
    return out.sort((a, b) => a.d - b.d).slice(0, FLOCK.max);
  }
}
