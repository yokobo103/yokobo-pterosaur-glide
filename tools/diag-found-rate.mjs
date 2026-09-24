// 同じ飛行で、発見の件数が変わりすぎていないか(公開版=直す前 と 手元=直した後)
import puppeteer from 'puppeteer';
const BASE = process.argv.includes('--public') ? 'https://yokobo103.github.io/yokobo-pterosaur-glide/' : (process.env.GLIDE_BASE || 'http://localhost:8141/');
const b = await puppeteer.launch({ headless: true, protocolTimeout: 900000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844 });
await p.goto(`${BASE}?harness&seed=5&cam=a`, { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.modelReady(), { timeout: 90000 });
const r = [];
for (const run of [1, 2]) {                     // 1回ずつ別に回す(まとめて回すと通信が時間切れになる)
  const x = await p.evaluate(() => {
    const s = window.__slice;
    s.auto(true); s.reset(); s.begin();
    for (let i = 0; i < 60 * 100; i++) s.step(1 / 60, true);   // 100秒
    return { n: s.found().length, ids: [...new Set(s.found().map(f => f.id))].join(','), km: +(s.state().dist / 1000).toFixed(2) };
  });
  r.push(x);
}
for (const x of r) console.log(`  100秒で ${x.n}件 (${x.ids || 'なし'}) / 飛距離 ${x.km}km`);
console.log(`  平均 ${(r.reduce((a, c) => a + c.n, 0) / r.length).toFixed(1)}件`);
await b.close();
