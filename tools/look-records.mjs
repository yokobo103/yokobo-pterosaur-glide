// 走行の終わりとランキング画面を、日本語と英語でスマホ相当で撮る
import puppeteer from 'puppeteer';
const BASE = process.env.GLIDE_BASE || 'http://localhost:8141/';
const b = await puppeteer.launch({ headless: true, protocolTimeout: 600000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await p.goto(`${BASE}?harness&seed=5&cam=a`, { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.modelReady(), { timeout: 90000 });
const seed = lang => p.evaluate(l => {
  localStorage.setItem('glide.records', JSON.stringify([
    { name: 'よこぼ', km: 11.42, found: 9, at: 1 }, { name: 'たろう', km: 8.03, found: 5, at: 2 },
    { name: 'よこぼ', km: 6.55, found: 4, at: 3 }, { name: 'はなこ', km: 4.10, found: 2, at: 4 },
  ]));
  localStorage.setItem('glide.name', 'よこぼ');
  localStorage.setItem('glide.lang', l);
}, lang);

const shots = [];
for (const lang of ['ja', 'en']) {
  await seed(lang);
  await p.reload({ waitUntil: 'networkidle0' });
  await p.waitForFunction(() => window.__slice && window.__slice.modelReady(), { timeout: 90000 });
  shots.push({ lang, label: lang === 'ja' ? 'はじめの画面' : 'start', img: await p.screenshot({ encoding: 'base64' }) });
  // 発見を拾わせてから着地させる
  await p.evaluate(() => {
    const s = window.__slice; s.auto(true); s.reset(); s.begin(); s.place(0, 500, 400, 0);
    for (let i = 0; i < 60 * 70; i++) s.step(1 / 60, i % 2 === 0);   // 発見は描いたコマだけ判定(重いので半分)
  });
  await p.evaluate(() => {
    const s = window.__slice; s.auto(false);
    const st = s.state(); s.place(st.x, st.y, 1, 0);
    for (let i = 0; i < 60 * 30 && !s.state().ended; i++) s.step(1 / 60, i % 8 === 0);   // 降りるまで(描画は間引く)
  });
  await p.waitForFunction(() => !document.getElementById('msg').classList.contains('hidden'), { timeout: 20000, polling: 100 });
  shots.push({ lang, label: lang === 'ja' ? '走行の終わり' : 'end of run', img: await p.screenshot({ encoding: 'base64' }) });
  await p.click('#rankBtn');
  shots.push({ lang, label: lang === 'ja' ? 'ランキング（この端末）' : 'ranking (this device)', img: await p.screenshot({ encoding: 'base64' }) });
  await p.click('#nameGo'); await p.click('#tabWorld');
  await new Promise(r => setTimeout(r, 300));
  shots.push({ lang, label: lang === 'ja' ? 'ランキング（世界）' : 'ranking (world)', img: await p.screenshot({ encoding: 'base64' }) });
}
const sh = await b.newPage(); await sh.setViewport({ width: 1640, height: 1100 });
const row = lang => `<div class="row">${shots.filter(s => s.lang === lang).map(s => `<figure><img src="data:image/png;base64,${s.img}"><figcaption>${s.label}</figcaption></figure>`).join('')}</div>`;
await sh.setContent(`<meta charset="utf-8"><style>body{margin:0;padding:12px;background:#14181e;color:#e8eef7;font-family:system-ui}h2{font-size:14px;margin:10px 0 8px}.row{display:flex;gap:10px}figure{margin:0;flex:1}img{width:100%;border-radius:6px}figcaption{font-size:11px;text-align:center;opacity:.8;padding-top:4px}</style>
<h2>日本語</h2>${row('ja')}<h2>English</h2>${row('en')}`, { waitUntil: 'networkidle0' });
await sh.screenshot({ path: 'screenshots/_記録とランキング.png', fullPage: true });
await b.close();
console.log('screenshots/_記録とランキング.png');
