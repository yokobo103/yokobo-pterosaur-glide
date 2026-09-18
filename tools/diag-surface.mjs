// 地表の模様の強さを振って、見た目(明暗の幅・形の読めやすさ)とコマ時間を測り、絵も並べる
//   node tools/with-dist.mjs tools/diag-surface.mjs
import puppeteer from 'puppeteer';
const BASE = process.env.GLIDE_BASE || 'http://localhost:8141/';
// 川から離れた、乾いた所と湿った所を混ぜて選ぶ
const SPOTS = [
  { n: '乾いた平地 高さ150m', x: 6100, y: -2400, alt: 150, head: 2.4 },
  { n: '丘 高さ300m', x: -4200, y: 2600, alt: 300, head: 0.7 },
  { n: '林の縁 高さ80m', x: 2600, y: -5200, alt: 80, head: 1.1 },
];
const SETS = [
  { n: '模様なし(いまの公開版と同じ)', amp: [0, 0, 0], sand: 0, damp: 0, bump: 0 },
  { n: '模様 弱', amp: [0.16, 0.14, 0.10], sand: 0.22, damp: 0.18, bump: 0.3 },
  { n: '模様 中', amp: [0.30, 0.26, 0.20], sand: 0.42, damp: 0.34, bump: 0.55 },
  { n: '模様 強', amp: [0.46, 0.40, 0.30], sand: 0.60, damp: 0.48, bump: 0.9 },
];

const b = await puppeteer.launch({ headless: true, protocolTimeout: 900000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844 });
await p.goto(`${BASE}?harness&seed=17&cam=a`, { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.modelReady(), { timeout: 90000 });
await p.evaluate(() => {
  window.__ground = (spot) => {
    const s = window.__slice;
    s.auto(false); s.reset(); s.begin(); s.place(spot.x, spot.y, spot.alt, spot.head);
    for (let i = 0; i < 12; i++) s.render();
    const cv = document.querySelector('canvas');
    const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height;
    const ctx = c.getContext('2d'); ctx.drawImage(cv, 0, 0);
    const img = ctx.getImageData(0, 0, c.width, c.height).data;
    const W = cv.clientWidth || 390, H = cv.clientHeight || 844;
    const sun = s.sunDir();
    const lum = [], xs = [], ys = [];
    for (let y = 40; y < H - 40; y += 6) for (let x = 8; x < W - 8; x += 8) {
      const hit = s.pick(x, y);
      if ((hit.what !== '近景' && hit.what !== '遠景') || hit.dist > 2000) continue;
      const i = ((Math.round(y * c.height / H)) * c.width + Math.round(x * c.width / W)) * 4;
      const L = 0.2126 * img[i] + 0.7152 * img[i + 1] + 0.0722 * img[i + 2];
      lum.push(L);
      const n = s.normalAt(-hit.point[0], hit.point[2], 25);
      xs.push(n[0] * sun[0] + n[1] * sun[1] + n[2] * sun[2]); ys.push(L);
    }
    if (lum.length < 30) return null;
    lum.sort((a, c) => a - c);
    const mx = xs.reduce((a, c) => a + c, 0) / xs.length, my = ys.reduce((a, c) => a + c, 0) / ys.length;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < xs.length; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
    return { 幅: lum[Math.floor(lum.length * 0.9)] - lum[Math.floor(lum.length * 0.1)],
             中央: lum[Math.floor(lum.length / 2)], r: sxy / Math.sqrt(sxx * syy || 1) };
  };
  window.__ms = () => {
    const s = window.__slice;
    for (let i = 0; i < 6; i++) s.render();
    const t = [];
    for (let i = 0; i < 30; i++) { const a = performance.now(); s.render(); t.push(performance.now() - a); }
    t.sort((a, c) => a - c);
    return t[15];
  };
});

const sheets = [];
for (const set of SETS) {
  await p.evaluate(o => window.__slice.surface(o), set);
  const rows = [];
  for (const spot of SPOTS) {
    const r = await p.evaluate(s => window.__ground(s), spot);
    if (r) rows.push(r);
    if (spot === SPOTS[0]) sheets.push({ label: set.n, img: await p.screenshot({ encoding: 'base64', clip: { x: 0, y: 330, width: 390, height: 400 } }) });
  }
  const ms = await p.evaluate(() => window.__ms());
  const avg = k => rows.reduce((a, c) => a + c[k], 0) / rows.length;
  console.log(`  ${set.n.padEnd(14, '　')} 明暗の幅 ${avg('幅').toFixed(0)} / 形の読めやすさ r=${avg('r').toFixed(2)} / 明るさ中央 ${avg('中央').toFixed(0)} / 1コマ ${ms.toFixed(1)}ms`);
}
const sh = await b.newPage(); await sh.setViewport({ width: 1320, height: 520 });
await sh.setContent(`<meta charset="utf-8"><style>body{margin:0;padding:12px;background:#14181e;color:#e8eef7;font-family:system-ui}h2{font-size:14px;margin:0 0 8px}.row{display:flex;gap:8px}figure{margin:0;flex:1}img{width:100%;border-radius:4px}figcaption{font-size:11px;text-align:center}</style>
<h2>地表の模様の強さ（乾いた平地・高さ150m）</h2><div class="row">${sheets.map(s => `<figure><img src="data:image/png;base64,${s.img}"><figcaption>${s.label}</figcaption></figure>`).join('')}</div>`, { waitUntil: 'networkidle0' });
await sh.screenshot({ path: 'screenshots/_地表の模様.png', fullPage: true });
await b.close();
console.log('screenshots/_地表の模様.png');
