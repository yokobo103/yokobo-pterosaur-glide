// 高い山に向かって飛んでいる場面を撮る
import puppeteer from 'puppeteer';
const BASE = process.argv.includes('--public') ? 'https://yokobo103.github.io/yokobo-pterosaur-glide/' : (process.env.GLIDE_BASE || 'http://localhost:8141/');
const b = await puppeteer.launch({ headless: true, protocolTimeout: 300000,
  args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844 });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(BASE + '?harness&seed=17&cam=a', { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => !!window.__slice);
const info = await p.evaluate(() => {
  const s = window.__slice; s.auto(false); s.reset(); s.begin();
  // 出発点の先で一番高い地点を探し、その4km手前から向かう
  let best = { h: 0 };
  for (let x = -6000; x <= 6000; x += 200) for (let y = 3000; y <= 20000; y += 200) {
    const h = s.terrainHeight(x, y); if (h > best.h) best = { x, y, h };
  }
  s.place(best.x, best.y - 4000, 250, 0);
  for (let i = 0; i < 60; i++) s.step(1/60, true);
  return { peak: Math.round(best.h), groundHere: Math.round(s.terrainHeight(best.x, best.y - 4000)), world: s.world };
});
console.log('場面:', info);
await p.screenshot({ path: 'screenshots/peak-高い山.png' });
console.log(errs.length ? errs : 'ページ内エラーなし');
await b.close();
