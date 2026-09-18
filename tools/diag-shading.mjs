// 地面の陰影が「形」を伝えているかを測る。
//   画面の点ごとに、その場の地面の傾き(太陽に対する向き)と、実際に出ている明るさを突き合わせる。
//   r が高いほど「明るさを見れば斜面の向きが分かる」= 立体に見える。幅は明暗の開き。
//   node tools/with-dist.mjs tools/diag-shading.mjs
import puppeteer from 'puppeteer';
const BASE = process.env.GLIDE_BASE || 'http://localhost:8141/';
const SPOTS = [[6100, -2400, 150, 2.4], [-4200, 2600, 300, 0.7], [2600, -5200, 80, 1.1]];
// 試す光の配分(直射の強さ / 天空光 / 太陽高度[度])
const SETS = [
  { name: 'いまの設定', sunMin: 0.35, sunGain: 1.25, hemi: 1.0, elevBase: 2.5, elevGain: 11 },
  { name: '天空光0.7', sunMin: 0.4, sunGain: 1.6, hemi: 0.7, elevBase: 4, elevGain: 14 },
  { name: '天空光0.55', sunMin: 0.45, sunGain: 1.9, hemi: 0.55, elevBase: 5, elevGain: 16 },
  { name: '天空光0.4', sunMin: 0.5, sunGain: 2.3, hemi: 0.4, elevBase: 6, elevGain: 18 },
];

const b = await puppeteer.launch({ headless: true, protocolTimeout: 900000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844 });
await p.goto(`${BASE}?harness&seed=17&cam=a`, { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.modelReady(), { timeout: 90000 });
await p.evaluate(() => {
  window.__shading = (spot) => {
    const s = window.__slice;
    s.auto(false); s.reset(); s.begin(); s.place(spot[0], spot[1], spot[2], spot[3]);
    for (let i = 0; i < 12; i++) s.render();
    const cv = document.querySelector('canvas');
    const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height;
    const ctx = c.getContext('2d'); ctx.drawImage(cv, 0, 0);
    const img = ctx.getImageData(0, 0, c.width, c.height).data;
    const sun = s.sunDir();
    const xs = [], ys = [];
    const W = cv.clientWidth || 390, H = cv.clientHeight || 844;
    for (let y = 40; y < H - 40; y += 7) for (let x = 10; x < W - 10; x += 9) {
      const hit = s.pick(x, y);
      if (hit.what !== '近景' && hit.what !== '遠景') continue;
      if (hit.dist > 2500) continue;                       // 霧が混ざらない範囲だけ
      const wx = -hit.point[0], wy = hit.point[2];         // 画面側はXが反転している
      const n = s.normalAt(wx, wy, 25);
      const dot = n[0] * sun[0] + n[1] * sun[1] + n[2] * sun[2];
      const i = ((Math.round(y * c.height / H)) * c.width + Math.round(x * c.width / W)) * 4;
      const lum = 0.2126 * img[i] + 0.7152 * img[i + 1] + 0.0722 * img[i + 2];
      xs.push(dot); ys.push(lum);
    }
    if (xs.length < 30) return null;
    const mx = xs.reduce((a, c) => a + c, 0) / xs.length, my = ys.reduce((a, c) => a + c, 0) / ys.length;
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < xs.length; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
    const sorted = [...ys].sort((a, c) => a - c);
    return { n: xs.length, r: sxy / Math.sqrt(sxx * syy || 1),
             明るさ中央: sorted[Math.floor(sorted.length / 2)],
             明暗の幅: sorted[Math.floor(sorted.length * 0.9)] - sorted[Math.floor(sorted.length * 0.1)] };
  };
});

for (const set of SETS) {
  await p.evaluate(o => window.__slice.lights(o), set);
  const rows = [];
  for (const spot of SPOTS) {
    const r = await p.evaluate(sp => window.__shading(sp), spot);
    if (r) rows.push(r);
  }
  const avg = k => (rows.reduce((a, c) => a + c[k], 0) / rows.length);
  console.log(`  ${set.name.padEnd(8, '　')} 形の読めやすさ r=${avg('r').toFixed(2)} / 明暗の幅 ${avg('明暗の幅').toFixed(0)} / 明るさ中央 ${avg('明るさ中央').toFixed(0)}`);
}
const sheet = [];
for (const set of SETS) {
  await p.evaluate(o => window.__slice.lights(o), set);
  await p.evaluate(sp => { const s = window.__slice; s.auto(false); s.reset(); s.begin(); s.place(sp[0], sp[1], sp[2], sp[3]); for (let i = 0; i < 20; i++) s.render(); }, SPOTS[1]);
  sheet.push({ label: set.name, img: await p.screenshot({ encoding: 'base64', clip: { x: 0, y: 330, width: 390, height: 400 } }) });
}
const sh = await b.newPage(); await sh.setViewport({ width: 1320, height: 520 });
await sh.setContent(`<meta charset="utf-8"><style>body{margin:0;padding:12px;background:#14181e;color:#e8eef7;font-family:system-ui}h2{font-size:14px;margin:0 0 8px}.row{display:flex;gap:8px}figure{margin:0;flex:1}img{width:100%;border-radius:4px}figcaption{font-size:11px;text-align:center}</style>
<h2>光の配分（丘・高さ300m）</h2><div class="row">${sheet.map(s => `<figure><img src="data:image/png;base64,${s.img}"><figcaption>${s.label}</figcaption></figure>`).join('')}</div>`, { waitUntil: 'networkidle0' });
await sh.screenshot({ path: 'screenshots/_光の配分.png', fullPage: true });
await b.close();
