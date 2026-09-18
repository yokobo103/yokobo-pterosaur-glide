// 地表の見た目: 公開版(直す前) と 手元(直した後) を同じ場所で見比べ、数字も並べる
//   node tools/with-dist.mjs tools/diag-look-ab.mjs
import puppeteer from 'puppeteer';
const LOCAL = process.env.GLIDE_BASE || 'http://localhost:8141/';
const PUBLIC = 'https://yokobo103.github.io/yokobo-pterosaur-glide/';
const SPOTS = [
  { n: '乾いた平地 高さ150m', x: 6100, y: -2400, alt: 150, head: 2.4 },
  { n: '丘 高さ300m', x: -4200, y: 2600, alt: 300, head: 0.7 },
  { n: '林の縁 高さ80m', x: 2600, y: -5200, alt: 80, head: 1.1 },
];

async function run(base, label, W, H) {
  const b = await puppeteer.launch({ headless: true, protocolTimeout: 900000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: W, height: H });
  await p.goto(`${base}?harness&seed=17&cam=a`, { waitUntil: 'networkidle0', timeout: 120000 });
  await p.waitForFunction(() => window.__slice && window.__slice.modelReady(), { timeout: 90000 });
  const out = { shots: [], rows: [] };
  for (const spot of SPOTS) {
    const r = await p.evaluate(spot => {
      const s = window.__slice;
      s.auto(false); s.reset(); s.begin(); s.place(spot.x, spot.y, spot.alt, spot.head);
      for (let i = 0; i < 20; i++) s.render();
      const cv = document.querySelector('canvas');
      const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height;
      const ctx = c.getContext('2d'); ctx.drawImage(cv, 0, 0);
      const img = ctx.getImageData(0, 0, c.width, c.height).data;
      const w = cv.clientWidth, h = cv.clientHeight;
      const lum = [];
      for (let y = Math.round(h * 0.55); y < h - 30; y += 4) for (let x = 8; x < w - 8; x += 6) {
        const i = ((Math.round(y * c.height / h)) * c.width + Math.round(x * c.width / w)) * 4;
        lum.push(0.2126 * img[i] + 0.7152 * img[i + 1] + 0.0722 * img[i + 2]);
      }
      lum.sort((a, b) => a - b);
      const mean = lum.reduce((a, b) => a + b, 0) / lum.length;
      const sd = Math.sqrt(lum.reduce((a, b) => a + (b - mean) ** 2, 0) / lum.length);
      const t = [];
      for (let i = 0; i < 25; i++) { const a = performance.now(); s.render(); t.push(performance.now() - a); }
      t.sort((a, b) => a - b);
      const info = s.info ? s.info() : { calls: 0, tris: 0 };
      return { 幅: lum[Math.floor(lum.length * 0.9)] - lum[Math.floor(lum.length * 0.1)], ばらつき: sd,
               ms: t[12], calls: info.calls, tris: info.tris };
    }, spot);
    out.rows.push({ ...r, n: spot.n });
    out.shots.push({ label: `${label} / ${spot.n}`, img: await p.screenshot({ encoding: 'base64', clip: { x: 0, y: Math.round(H * 0.42), width: W, height: Math.round(H * 0.45) } }) });
  }
  await b.close();
  return out;
}

for (const v of [{ n: 'スマホ縦', w: 390, h: 844 }, { n: 'PC横', w: 1280, h: 800 }]) {
  const before = await run(PUBLIC, '直す前', v.w, v.h);
  const after = await run(LOCAL, '直した後', v.w, v.h);
  console.log(`\n== ${v.n} (${v.w}x${v.h}) ==`);
  for (let i = 0; i < SPOTS.length; i++) {
    const b = before.rows[i], a = after.rows[i];
    console.log(`  ${SPOTS[i].n}`);
    console.log(`    明暗の幅 ${b.幅.toFixed(0)} -> ${a.幅.toFixed(0)} / ばらつき ${b.ばらつき.toFixed(1)} -> ${a.ばらつき.toFixed(1)}`);
    console.log(`    描画 ${b.calls}回 -> ${a.calls}回 / ${(b.tris / 1000).toFixed(0)}k -> ${(a.tris / 1000).toFixed(0)}k三角形 / 1コマ ${b.ms.toFixed(1)} -> ${a.ms.toFixed(1)}ms`);
  }
  if (v.n === 'スマホ縦') {
    const sh = await (await puppeteer.launch({ headless: true, args: ['--no-sandbox'] })).newPage();
    await sh.setViewport({ width: 1340, height: 700 });
    const cell = s => `<figure><img src="data:image/png;base64,${s.img}"><figcaption>${s.label}</figcaption></figure>`;
    await sh.setContent(`<meta charset="utf-8"><style>body{margin:0;padding:12px;background:#14181e;color:#e8eef7;font-family:system-ui}h2{font-size:14px;margin:0 0 8px}.row{display:flex;gap:6px;margin-bottom:8px}figure{margin:0;flex:1}img{width:100%;border-radius:4px}figcaption{font-size:11px;text-align:center}</style>
<h2>地表（上=直す前／下=直した後）</h2><div class="row">${before.shots.map(cell).join('')}</div><div class="row">${after.shots.map(cell).join('')}</div>`, { waitUntil: 'networkidle0' });
    await sh.screenshot({ path: 'screenshots/_地表の比較.png', fullPage: true });
    await sh.browser().close();
    console.log('  screenshots/_地表の比較.png');
  }
}
