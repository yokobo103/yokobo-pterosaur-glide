// 飛行。左右の入力(-1..1)だけを受ける。three.jsにもDOMにも依存しない。
import { TUNE } from './world.js';
export const AIR = {
  Vcruise: 32,      // 直進時の対気速度 [m/s]
  Vcircle: 20,      // 旋回時(勝手に減速する)
  c1: 26.24, c2: 0.001602,   // 沈下 = c1/V + c2*V^2
  bankMax: 48 * Math.PI / 180,
  bankRate: 1.0,    // 傾きの追従 [rad/s]
  inputTau: 0.25,   // 入力をなめらかにする[秒]。押した瞬間に傾きが跳ねると酔う
  g: 9.8,
  startAlt: 400,
  day: 720,         // 日没まで [s]
};
export const sink = V => AIR.c1 / V + AIR.c2 * V * V;
export const glideRatio = V => V / sink(V);
// 実際に届く距離は、上昇風の外の沈下こみで決まる。ここを忘れると届かない柱へ突っ込む。
export const effGlide = V => V / (sink(V) + TUNE.ambient);
// このまま同じ向きにまっすぐ滑空したら、どこで地面に着くか。上昇風は当てにしない。
// 地面にぶつかる危険は、いつでも画面から読めるようにするための計算
export function glideReach(g, maxDist = 9000, step = 60) {
  const V = AIR.Vcruise, drop = step / effGlide(V);
  const sx = Math.sin(g.head), sy = Math.cos(g.head);
  let x = g.x, y = g.y, z = g.z;
  for (let d = step; d <= maxDist; d += step) {
    x += sx * step; y += sy * step; z -= drop;
    const h = g.t.height(x, y);
    if (z <= h + 2) return { x, y, z: h, dist: d, hit: true };
  }
  return { x, y, z: g.t.height(x, y), dist: maxDist, hit: false };
}
export const sunlight = t => { const u = Math.max(0, Math.min(1, t / AIR.day)); return Math.max(0, 1 - u * u); };

export class Glider {
  constructor(terrain, field, opts = {}) {
    this.t = terrain; this.f = field;
    this.x = opts.x || 0; this.y = opts.y || 0;
    this.z = this.t.height(this.x, this.y) + (opts.alt ?? AIR.startAlt);
    this.head = 0; this.bank = 0; this.time = 0; this.inp = 0;
    this.vz = 0; this.lift = 0; this.alive = true; this.best = 0;
  }
  get agl() { return this.z - this.t.height(this.x, this.y); }
  step(dt, input) {
    if (!this.alive) return;
    const k = AIR.inputTau > 0 ? 1 - Math.exp(-dt / AIR.inputTau) : 1;
    this.inp += (Math.max(-1, Math.min(1, input)) - this.inp) * k;
    const want = this.inp * AIR.bankMax;
    const db = Math.max(-AIR.bankRate * dt, Math.min(AIR.bankRate * dt, want - this.bank));
    this.bank += db;
    const a = Math.abs(this.bank) / AIR.bankMax;
    const V = AIR.Vcruise + (AIR.Vcircle - AIR.Vcruise) * a;   // 傾けるほど自動で減速
    const load = 1 / Math.cos(this.bank);
    const s = sink(V) * Math.pow(load, 1.5);
    this.head += (AIR.g * Math.tan(this.bank) / V) * dt;
    this.lift = this.f.liftAt(this.x, this.y, this.z, sunlight(this.time));
    this.vz = this.lift - s;
    this.z += this.vz * dt;
    this.x += V * Math.sin(this.head) * dt;
    this.y += V * Math.cos(this.head) * dt;
    this.time += dt;
    this.best = Math.max(this.best, this.y);
    if (this.agl <= 2) { this.alive = false; this.z = this.t.height(this.x, this.y) + 2; }
  }
}

// 調整用の自動操縦。人がやることの下限を機械で再現して、縮尺を詰めるために使う。
// 実装の狙いは「上手いAI」ではなく「ちゃんと飛べるAI」。
export class Autopilot {
  constructor(opts = {}) {
    this.Wmin = opts.Wmin ?? 7.5;         // これ未満の上昇風は見送る
    this.climbTo = opts.climbTo ?? 0.95;  // 雲底のどこまで上げるか
    this.lat = opts.lat ?? 0.5;           // 横へ寄り道する許容
    this.mode = 'CRUISE'; this.target = null; this.used = null; this.enterZ = 0; this.weak = 0;
    this.stats = { climbs: 0, circleT: 0, gained: 0 };
  }
  pick(g, sun) {
    const need = 80;
    const desperate = g.agl < need;
    let best = -1e18, tgt = null;
    for (const { d, c } of g.f.nearby(g.x, g.y, 6500, !desperate)) {
      if (this.used === c && d < 3 * c.R) continue;
      if (!desperate && c.W * sun < this.Wmin) continue;
      const arrive = g.z - d / effGlide(AIR.Vcruise);
      if (arrive < c.gz + (desperate ? 25 : need)) continue;
      let blocked = false;                                   // 途中の山を越えられるか
      for (let s = 150; s < d; s += 150) {
        const px = g.x + (c.x - g.x) * s / d, py = g.y + (c.y - g.y) * s / d;
        if (g.z - s / effGlide(AIR.Vcruise) < g.t.height(px, py) + 30) { blocked = true; break; }
      }
      if (blocked) continue;
      const s = (c.y - g.y) - this.lat * Math.abs(c.x - g.x) + (desperate ? 80000 / Math.max(d, 1) : 0);
      if (s > best) { best = s; tgt = c; }
    }
    return tgt;
  }
  steerTo(g, aimX, aimY) {
    let e = Math.atan2(aimX - g.x, aimY - g.y) - g.head;
    while (e > Math.PI) e -= 2 * Math.PI;
    while (e < -Math.PI) e += 2 * Math.PI;
    return Math.max(-1, Math.min(1, e * 2.4));
  }
  // 向き h へ直進したときに、静かな空気を滑るのと比べてどれだけ得か(距離換算)。ぶつかるなら大きく負
  gainAlong(g, h, sun, secs = 36, step = 3) {
    const V = AIR.Vcruise, ge = effGlide(V);
    let x = g.x, y = g.y, z = g.z;
    for (let t = 0; t < secs; t += step) {
      x += V * Math.sin(h) * step; y += V * Math.cos(h) * step;
      z += (g.f.ridgeAt(x, y, z, sun) - TUNE.ambient - sink(V)) * step;   // 尾根の上昇風だけで判断する(上昇気流は回って使う)
      if (z - g.t.height(x, y) < 35) return -1e7;
    }
    // 静かな空気を同じ時間滑った場合の高さと比べた、得した高さを距離に換算
    const stillZ = g.z - (sink(V) + TUNE.ambient) * secs;
    return (z - stillZ) * ge;
  }
  bestRidge(g, sun) {
    let best = -1e18, bestH = 0, bestGain = -1e18;
    for (let k = -7; k <= 7; k++) {
      const h = k * 12 * Math.PI / 180;
      const gain = this.gainAlong(g, h, sun);
      const s = gain + 0.35 * 36 * AIR.Vcruise * Math.cos(h);   // 前へ進む向きを少し好む
      if (s > best) { best = s; bestH = h; bestGain = gain; }
    }
    return { h: bestH, gain: bestGain };
  }
  input(g, dt) {
    const sun = sunlight(g.time);
    if (this.mode === 'CLIMB') {
      const c = this.target;
      const top = c.gz + this.climbTo * (c.top - c.gz);
      this.weak = g.vz < 0.15 ? this.weak + dt : 0;
      if (g.z >= top || this.weak > 6) {
        if (g.z - this.enterZ > 40) { this.stats.climbs++; this.stats.gained += g.z - this.enterZ; }
        this.mode = 'CRUISE'; this.used = c; this.target = null; this.weak = 0;
      } else {
        this.stats.circleT += dt;
        // 芯のまわりを回る。ただ傾け続けるのではなく、円の中心を芯に合わせにいく。
        const dx = g.x - c.x, dy = g.y - c.y, d = Math.hypot(dx, dy) || 1e-6;
        const rt = AIR.Vcircle / (AIR.g * Math.tan(AIR.bankMax) / AIR.Vcircle);  // 旋回半径
        const rx = dx / d, ry = dy / d;
        const radial = Math.max(-1.2, Math.min(1.2, (rt - d) / rt));
        const ax = -ry + rx * radial, ay = rx + ry * radial;
        return this.steerTo(g, g.x + ax * 100, g.y + ay * 100);
      }
    }
    // 尾根沿いに、静かな空気より明らかに得な向きがあればそちらを飛ぶ
    if (g.time >= (this.nextRidge || 0)) {
      this.nextRidge = g.time + 1.0;
      this.ridge = this.bestRidge(g, sun);
    }
    const nearTarget = this.target && Math.hypot(this.target.x - g.x, this.target.y - g.y) < 1.5 * this.target.R;
    if (this.ridge && this.ridge.gain > 250 && !nearTarget) {
      this.stats.ridgeT = (this.stats.ridgeT || 0) + dt;
      return this.steerTo(g, g.x + Math.sin(this.ridge.h) * 1000, g.y + Math.cos(this.ridge.h) * 1000);
    }
    if (!this.target) this.target = this.pick(g, sun);
    const c = this.target;
    if (!c) return this.steerTo(g, g.x, g.y + 1000);       // 目標なし: まっすぐ伸ばす
    const d = Math.hypot(c.x - g.x, c.y - g.y);
    if (d < 1.1 * c.R && g.lift > 1.0) { this.mode = 'CLIMB'; this.enterZ = g.z; this.weak = 0; }
    return this.steerTo(g, c.x, c.y);
  }
}
