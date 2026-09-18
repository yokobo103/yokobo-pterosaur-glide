// 地形そのものに起伏があるのか(描画ではなく関数の側)を測る
import { Terrain, TUNE, WORLDS } from '../src/world.js';
Object.assign(TUNE, WORLDS.hills);
const t = new Terrain(17);
const pct = (a, p) => a[Math.floor(a.length * p)];
for (const win of [200, 500, 1000, 3000]) {
  const ranges = [];
  for (let k = 0; k < 400; k++) {
    const x0 = (Math.random() - 0.5) * 20000, y0 = (Math.random() - 0.5) * 20000;
    let lo = 1e9, hi = -1e9;
    for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) {
      const h = t.height(x0 + (i / 11 - 0.5) * win, y0 + (j / 11 - 0.5) * win);
      lo = Math.min(lo, h); hi = Math.max(hi, h);
    }
    ranges.push(hi - lo);
  }
  ranges.sort((a, b) => a - b);
  console.log(`  ${win}m四方の高低差: 中央値 ${pct(ranges, .5).toFixed(0)}m / 上位1割 ${pct(ranges, .9).toFixed(0)}m / 最大 ${ranges[ranges.length - 1].toFixed(0)}m`);
}
const slopes = [], mo = [], gr = [];
for (let k = 0; k < 4000; k++) {
  const x = (Math.random() - 0.5) * 20000, y = (Math.random() - 0.5) * 20000;
  slopes.push(t.slope(x, y, 36)); mo.push(t.moisture(x, y)); gr.push(t.grove(x, y));
}
slopes.sort((a, b) => a - b); mo.sort((a, b) => a - b); gr.sort((a, b) => a - b);
const deg = s => (Math.atan(s) * 180 / Math.PI).toFixed(1);
console.log(`  傾き(36m間隔): 中央値 ${deg(pct(slopes, .5))}° / 上位1割 ${deg(pct(slopes, .9))}° / 最大 ${deg(slopes[slopes.length - 1])}°`);
console.log(`  湿り気: 下位1割 ${pct(mo, .1).toFixed(2)} / 中央値 ${pct(mo, .5).toFixed(2)} / 上位1割 ${pct(mo, .9).toFixed(2)}`);
console.log(`  林の濃さ: 下位1割 ${pct(gr, .1).toFixed(2)} / 中央値 ${pct(gr, .5).toFixed(2)} / 上位1割 ${pct(gr, .9).toFixed(2)}`);
