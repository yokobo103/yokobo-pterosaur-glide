// 尾根の上昇風が「使える」山の寸法を探す。
// 使える = 地上60mで上昇風が直進時の沈下(約3m/s)を上回る
import { Terrain, ThermalField, TUNE } from '../src/world.js';
import { sink, AIR } from '../src/flight.js';
const need = sink(AIR.Vcruise) + TUNE.ambient;
console.log(`直進時の沈下 ${need.toFixed(2)}m/s を上回れば、尾根に沿って飛び続けられる\n`);
console.log(' 山の高さ | 尾根の間隔 | 風速 | 最高点 | 25度超の斜面 | 飛び続けられる場所 | 尾根の上昇風 最大');
const rows = [];
for (const H of [400, 550, 700]) for (const W of [1600, 2200, 3000]) for (const ws of [8, 11]) {
  Object.assign(TUNE, { mtnHeight: H, mtnWave: W, windSpeed: ws });
  let hmax = 0, steep = 0, sus = 0, n = 0, mtnN = 0, rmax = 0;
  for (const seed of [17, 41, 113]) {
    const t = new Terrain(seed), f = new ThermalField(t, seed);
    for (let x = -7000; x <= 7000; x += 150) for (let y = 0; y <= 24000; y += 300) {
      const h = t.height(x, y); n++;
      const d = Math.abs(x - t.riverX(y));
      if (d > TUNE.mtnStart + TUNE.mtnRamp) mtnN++;
      hmax = Math.max(hmax, h);
      if (t.slope(x, y, 40) > 0.466) steep++;
      const r = f.ridgeAt(x, y, h + 60, 1);
      rmax = Math.max(rmax, r);
      if (r > need) sus++;
    }
  }
  rows.push({ H, W, ws, hmax, steep: steep / n * 100, sus: sus / n * 100, rmax });
  console.log(`   ${String(H).padStart(4)}m  |  ${String(W).padStart(5)}m   | ${String(ws).padStart(3)} | ${hmax.toFixed(0).padStart(4)}m | ${(steep/n*100).toFixed(1).padStart(6)}%     |   ${(sus/n*100).toFixed(1).padStart(6)}%          | ${rmax.toFixed(1)}m/s`);
}
