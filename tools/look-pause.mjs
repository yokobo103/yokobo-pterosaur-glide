// ポーズ画面を日本語と英語で撮る(とめるボタンが出ている飛行中の絵も)
import puppeteer from 'puppeteer';
const BASE = process.env.GLIDE_BASE || 'http://localhost:8141/';
const b = await puppeteer.launch({ headless: true, protocolTimeout: 600000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
const wait = ms => new Promise(r => setTimeout(r, ms));
const shots = [];
for (const lang of ['ja', 'en']) {
  await p.goto(`${BASE}?seed=17`, { waitUntil: 'networkidle0', timeout: 120000 });
  await p.evaluate(l => localStorage.setItem('glide.lang', l), lang);
  await p.reload({ waitUntil: 'networkidle0', timeout: 120000 });
  await p.waitForFunction(() => window.__slice && window.__slice.modelReady(), { timeout: 90000 });
  await p.click('#go');
  await wait(9000);                      // 少し飛ばして数字を出す
  shots.push({ lang, label: lang === 'ja' ? '飛行中(上にとめるボタン)' : 'in flight', img: await p.screenshot({ encoding: 'base64' }) });
  await p.click('#pauseBtn');
  await wait(300);
  shots.push({ lang, label: lang === 'ja' ? 'とめたところ' : 'paused', img: await p.screenshot({ encoding: 'base64' }) });
}
const sh = await b.newPage(); await sh.setViewport({ width: 900, height: 1000 });
const row = l => `<div class="row">${shots.filter(s => s.lang === l).map(s => `<figure><img src="data:image/png;base64,${s.img}"><figcaption>${s.label}</figcaption></figure>`).join('')}</div>`;
await sh.setContent(`<meta charset="utf-8"><style>body{margin:0;padding:12px;background:#14181e;color:#e8eef7;font-family:system-ui}h2{font-size:14px;margin:10px 0 8px}.row{display:flex;gap:10px}figure{margin:0;flex:1}img{width:100%;border-radius:6px;display:block}figcaption{font-size:11px;text-align:center;opacity:.8;padding-top:4px}</style>
<h2>日本語</h2>${row('ja')}<h2>English</h2>${row('en')}`, { waitUntil: 'networkidle0' });
await sh.screenshot({ path: 'screenshots/_ポーズ.png', fullPage: true });
await b.close();
console.log('screenshots/_ポーズ.png');
