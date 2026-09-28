// タイトルの後ろの明るさ比べ。翼竜が背景から浮いて見えるか(明るさの差)も測る
import puppeteer from 'puppeteer';
const BASE = process.env.GLIDE_BASE || 'http://localhost:8141/';
const b = await puppeteer.launch({ headless: true, protocolTimeout: 900000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844 });
const shots = [];
for (const sun of [0.39, 0.5, 0.62]) {
  await p.goto(`${BASE}?seed=17&demosun=${sun}`, { waitUntil: 'networkidle0', timeout: 120000 });
  await p.waitForFunction(() => window.__slice && window.__slice.modelReady(), { timeout: 90000 });
  await new Promise(r => setTimeout(r, 7000));
  // 翼竜のあたり(画面の下 1/4 の中央)と、その少し上の地面の明るさを比べる
  const lum = await p.evaluate(() => {
    const cv = window.__slice._canvas();
    const g = document.createElement('canvas'); g.width = cv.width; g.height = cv.height;
    g.getContext('2d').drawImage(cv, 0, 0);
    const c = g.getContext('2d');
    const box = (x, y, w, h) => {
      const d = c.getImageData(x, y, w, h).data; let s = 0;
      for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      return s / (d.length / 4);
    };
    const W = cv.width, H = cv.height;
    return { bird: box(W * 0.3, H * 0.78, W * 0.4, H * 0.07), ground: box(W * 0.3, H * 0.62, W * 0.4, H * 0.07) };
  });
  const label = `日 ${sun} / 翼竜 ${lum.bird.toFixed(0)} 地面 ${lum.ground.toFixed(0)} (差 ${Math.abs(lum.bird - lum.ground).toFixed(0)})`;
  console.log('  ' + label);
  shots.push({ label, img: await p.screenshot({ encoding: 'base64' }) });
}
const sh = await b.newPage(); await sh.setViewport({ width: 1300, height: 950 });
await sh.setContent(`<meta charset="utf-8"><style>body{margin:0;padding:12px;background:#14181e;color:#e8eef7;font-family:system-ui}
.row{display:flex;gap:10px}figure{margin:0;flex:1}img{width:100%;border-radius:6px;display:block}figcaption{font-size:11px;text-align:center;opacity:.85;padding-top:4px}</style>
<div class="row">${shots.map(s => `<figure><img src="data:image/png;base64,${s.img}"><figcaption>${s.label}</figcaption></figure>`).join('')}</div>`, { waitUntil: 'networkidle0' });
await sh.screenshot({ path: 'screenshots/_タイトルの明るさ.png', fullPage: true });
await b.close();
console.log('screenshots/_タイトルの明るさ.png');
