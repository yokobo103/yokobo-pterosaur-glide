// 丘に向かって飛んだとき、着地点の輪が丘の斜面に落ちる場面を探して撮る
import puppeteer from 'puppeteer';
const BASE = process.argv.includes('--public') ? 'https://yokobo103.github.io/yokobo-pterosaur-glide/' : 'http://localhost:8141/';
const b = await puppeteer.launch({ headless: true, protocolTimeout: 300000,
  args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844 });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(BASE + '?harness&seed=17&cam=a', { waitUntil: 'networkidle0' });
await p.waitForFunction(() => !!window.__slice);
const found = await p.evaluate(() => {
  const s = window.__slice; s.auto(false); s.reset(); s.begin();
  let best = null;
  for (let y = 1000; y < 30000; y += 400) {
    for (let x = -5000; x <= 5000; x += 400) {
      s.place(x, y, 140, 0);
      s.step(1/60, true);
      const r = s.reach();
      if (!r || !r.hit) continue;
      const rise = r.z - s.terrainHeight(x, y);
      // 1〜3kmの距離で、いちばん高く盛り上がった斜面に輪が落ちる場面
      if (r.dist > 1000 && r.dist < 3000 && (!best || rise > best.rise)) best = { x, y, rise, dist: r.dist };
    }
  }
  if (!best) return null;
  s.place(best.x, best.y, 140, 0);
  for (let i = 0; i < 40; i++) s.step(1/60, true);
  const r2 = s.reach();
  return { ...best, distNow: r2.dist, world: s.world };
});
console.log('場面:', found);
await p.screenshot({ path: 'screenshots/reach-丘の手前に輪.png' });
// 輪が本当に画面に出ているか: 輪の位置を画面へ投影して画面内か
const inFrame = await p.evaluate(() => {
  const s = window.__slice, r = s.reach(), v = s._view();
  const q = v.world(-r.x, r.z + 2, r.y);   // 描画側はxを反転している
  return { px: q.map(Math.round), inside: q[0] > 0 && q[0] < 390 && q[1] > 0 && q[1] < 844 };
});
console.log('輪が画面内か:', inFrame);
console.log(errs.length ? errs : 'ページ内エラーなし');
await b.close();
