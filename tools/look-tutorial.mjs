// タイトルの「さわって覚える」を撮る: はじめ / 左を押している最中 / 左右できたあと
import puppeteer from 'puppeteer';
const BASE = process.env.GLIDE_BASE || 'http://localhost:8141/';
const b = await puppeteer.launch({ headless: true, protocolTimeout: 600000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const cdp = await p.createCDPSession();
const wait = ms => new Promise(r => setTimeout(r, ms));
const down = (x, y) => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
const up = () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
await p.goto(`${BASE}?seed=17`, { waitUntil: 'networkidle0', timeout: 120000 });
await p.evaluate(() => { localStorage.clear(); localStorage.setItem('glide.lang', 'ja'); });
await p.reload({ waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.modelReady(), { timeout: 90000 });
await wait(5000);
const shots = [];
shots.push({ label: 'はじめて開いたとき', img: await p.screenshot({ encoding: 'base64' }) });
await down(70, 470); await wait(1500);
shots.push({ label: '左を押しっぱなし（翼竜が左へ）', img: await p.screenshot({ encoding: 'base64' }) });
await up(); await wait(400);
await down(320, 470); await wait(1500); await up(); await wait(600);
shots.push({ label: '左右とも試したあと', img: await p.screenshot({ encoding: 'base64' }) });
const sh = await b.newPage(); await sh.setViewport({ width: 1300, height: 900 });
await sh.setContent(`<meta charset="utf-8"><style>body{margin:0;padding:12px;background:#14181e;color:#e8eef7;font-family:system-ui}
.row{display:flex;gap:10px}figure{margin:0;flex:1}img{width:100%;border-radius:6px;display:block}figcaption{font-size:12px;text-align:center;opacity:.85;padding-top:4px}</style>
<div class="row">${shots.map(s => `<figure><img src="data:image/png;base64,${s.img}"><figcaption>${s.label}</figcaption></figure>`).join('')}</div>`, { waitUntil: 'networkidle0' });
await sh.screenshot({ path: 'screenshots/_さわって覚える.png', fullPage: true });
await b.close();
console.log('screenshots/_さわって覚える.png');
