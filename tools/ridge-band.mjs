// 自動操縦を通さずに、山そのものが「尾根沿いに飛べる形」かを測る。
// 進行方向(y)に沿って、風上側の斜面の上に「高度を保てる位置」があるかを 50m ごとに調べる。
import { Terrain, ThermalField, TUNE } from '../src/world.js';
import { sink, AIR } from '../src/flight.js';
const base = { ...TUNE };
const need = sink(AIR.Vcruise) + TUNE.ambient;   // 直進時に失う高さ[m/s]
const CASES = [
  { name: 'ノイズの山550m・風11',          set: { mtn: 1, mtnHeight: 550, mtnWave: 1600, windSpeed: 11 } },
  { name: '山脈550m・裾700m・風11',        set: { mtn: 1, mtnMode: 'ranges', mtnHeight: 550, rangeWidth: 700, windSpeed: 11 } },
  { name: '山脈550m・上昇が高くまで届く',   set: { mtn: 1, mtnMode: 'ranges', mtnHeight: 550, rangeWidth: 700, windSpeed: 11, ridgeH: 240, leeCap: 2.5 } },
  { name: '山脈700m・裾700m・風13',        set: { mtn: 1, mtnMode: 'ranges', mtnHeight: 700, rangeWidth: 700, windSpeed: 13, ridgeH: 240, leeCap: 2.5 } },
];
console.log(`直進すると毎秒 ${need.toFixed(2)}m 沈む。これを上回る上昇が、斜面から40〜160mの高さにある区間を数える\n`);
console.log(' 条件                          | 高度を保てる区間 | 途切れずに続く最長 | 保てる最大の高さ(斜面から)');
for (const c of CASES) {
  Object.assign(TUNE, base, c.set);
  const t = new Terrain(17), f = new ThermalField(t, 17);
  let ok = 0, n = 0, run = 0, best = 0, clearSum = 0;
  let prevX = null;
  for (let y = 0; y <= 20000; y += 50) {
    n++;
    // 山脈のあたり(川の右 1500〜7000m)の風上側を横に走査して、いちばん上がる位置を探す
    const rx = t.riverX(y);
    let bestV = -99, bestC = 0, bestX = 0;
    for (let x = rx + 1500; x <= rx + 7000; x += 40) {
      const h = t.height(x, y);
      // 高度を保てる中で、いちばん斜面から離れていられる高さ(=余裕)を探す
      for (const cl of [40, 60, 80, 100, 130, 160, 200, 250]) {
        const v = f.ridgeAt(x, y, h + cl, 1) - need;
        if (v > 0 && (cl > bestC || (cl === bestC && v > bestV))) { bestV = v; bestC = cl; bestX = x; }
        else if (bestC === 0 && v > bestV) { bestV = v; bestX = x; }
      }
    }
    // 位置が前の区間から横に大きく飛ぶなら、つながっていない(飛んで移れない)
    const connected = prevX === null || Math.abs(bestX - prevX) < 250;
    if (bestV > 0 && connected) { ok++; run += 50; best = Math.max(best, run); clearSum += bestC; }
    else run = 0;
    prevX = bestV > 0 ? bestX : null;
  }
  console.log(` ${c.name.padEnd(30)}| ${(ok / n * 100).toFixed(0).padStart(5)}%          | ${(best / 1000).toFixed(1).padStart(5)}km           | 平均 ${ok ? (clearSum / ok).toFixed(0) : '-'}m`);
}
