// タイトル画面を日本語と英語で撮る。遊び方・設定も開いて撮る
import puppeteer from 'puppeteer';
const BASE = process.env.GLIDE_BASE || 'http://localhost:8141/';
const b = await puppeteer.launch({ headless: true, protocolTimeout: 600000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
const shots = [];
for (const lang of ['ja', 'en']) {
  await p.goto(`${BASE}?seed=17`, { waitUntil: 'networkidle0', timeout: 120000 });
  await p.evaluate(l => localStorage.setItem('glide.lang', l), lang);
  await p.reload({ waitUntil: 'networkidle0', timeout: 120000 });
  await p.waitForFunction(() => window.__slice && window.__slice.modelReady(), { timeout: 90000 });
  await new Promise(r => setTimeout(r, 6000));        // 後ろの見本飛行が世界に入るまで待つ
  shots.push({ lang, label: lang === 'ja' ? 'タイトル' : 'title', img: await p.screenshot({ encoding: 'base64' }) });
  await p.click('#howtoBtn');
  shots.push({ lang, label: lang === 'ja' ? '遊び方' : 'how to play', img: await p.screenshot({ encoding: 'base64' }) });
  await p.click('#howtoClose'); await p.click('#setBtn');
  shots.push({ lang, label: lang === 'ja' ? '設定' : 'settings', img: await p.screenshot({ encoding: 'base64' }) });
  await p.click('#setClose');
  await new Promise(r => setTimeout(r, 4000));
  shots.push({ lang, label: lang === 'ja' ? 'タイトル(少しあと)' : 'title, later', img: await p.screenshot({ encoding: 'base64' }) });
}
console.log(errs.length ? `エラー: ${errs.slice(0, 3).join(' / ')}` : 'エラーなし');
const sh = await b.newPage(); await sh.setViewport({ width: 1700, height: 1100 });
const row = lang => `<div class="row">${shots.filter(s => s.lang === lang).map(s => `<figure><img src="data:image/png;base64,${s.img}"><figcaption>${s.label}</figcaption></figure>`).join('')}</div>`;
await sh.setContent(`<meta charset="utf-8"><style>body{margin:0;padding:12px;background:#14181e;color:#e8eef7;font-family:system-ui}h2{font-size:14px;margin:10px 0 8px}.row{display:flex;gap:10px}figure{margin:0;flex:1}img{width:100%;border-radius:6px;display:block}figcaption{font-size:11px;text-align:center;opacity:.8;padding-top:4px}</style>
<h2>日本語</h2>${row('ja')}<h2>English</h2>${row('en')}`, { waitUntil: 'networkidle0' });
await sh.screenshot({ path: 'screenshots/_タイトル画面.png', fullPage: true });
await b.close();
console.log('screenshots/_タイトル画面.png');
