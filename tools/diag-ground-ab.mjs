// 地面の直し方の前後比較: 公開版(直す前) と 手元(直した後) を同じ場所・同じ種で見比べ、コマの重さも測る
//   node tools/with-dist.mjs tools/diag-ground-ab.mjs
import puppeteer from 'puppeteer';
import fs from 'node:fs';
const LOCAL = process.env.GLIDE_BASE || 'http://localhost:8141/';
const PUBLIC = 'https://yokobo103.github.io/yokobo-pterosaur-glide/';
const SPOTS = [
  { name: '高度350m・正面', x: 1234, y: 5678, alt: 350, head: 0 },
  { name: '高度700m・斜め', x: -4200, y: 2600, alt: 700, head: 0.7 },
];

async function run(base, label) {
  const b = await puppeteer.launch({ headless: true, protocolTimeout: 600000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 390, height: 844 });
  await p.goto(`${base}?harness&seed=17&cam=a`, { waitUntil: 'networkidle0', timeout: 120000 });
  await p.waitForFunction(() => window.__slice && window.__slice.modelReady(), { timeout: 90000 });
  await p.evaluate(() => {
    window.__blueRows = () => {
      const cv = document.querySelector('canvas');   // 直す前の公開版にも通じるように
      const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height;
      const ctx = c.getContext('2d'); ctx.drawImage(cv, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let rows = 0;
      for (let y = 0; y < c.height; y++) {
        let n = 0;
        for (let x = 0; x < c.width; x++) {
          const i = (y * c.width + x) * 4;
          if (d[i + 2] > d[i] + 12 && d[i + 2] > d[i + 1] + 6 && d[i + 2] > 80 && d[i] < 170) n++;
        }
        if (n > c.width * 0.5) rows++;
      }
      return rows;
    };
  });
  const shots = [];
  for (const s of SPOTS) {
    const blue = await p.evaluate(s => {
      const w = window.__slice; w.auto(false); w.reset(); w.begin();
      w.place(s.x, s.y, s.alt, s.head);
      for (let i = 0; i < 20; i++) w.render();
      return window.__blueRows();
    }, s);
    console.log(`  ${label} / ${s.name}: 画面の半分以上が水色の行 ${blue}行`);
    shots.push({ name: s.name, blue, img: await p.screenshot({ encoding: 'base64' }) });
  }
  // 実際に飛びながらのコマの重さ(地面の作り直しも含む)
  const perf = await p.evaluate(() => {
    const w = window.__slice; w.auto(true); w.reset(); w.begin();
    for (let i = 0; i < 120; i++) w.step(1 / 60, true);
    const ms = [];
    for (let i = 0; i < 900; i++) { const t = performance.now(); w.step(1 / 60, true); ms.push(performance.now() - t); }
    ms.sort((a, b) => a - b);
    const sum = ms.reduce((a, c) => a + c, 0);
    return { mean: sum / ms.length, p95: ms[Math.floor(ms.length * 0.95)], max: ms[ms.length - 1] };
  });
  console.log(`  ${label} / 15秒ぶん飛んだときの1コマ: 平均 ${perf.mean.toFixed(1)}ms / 95% ${perf.p95.toFixed(1)}ms / 最大 ${perf.max.toFixed(1)}ms`);
  await b.close();
  return { shots, perf };
}

const before = await run(PUBLIC, '直す前(公開版)');
const after = await run(LOCAL, '直した後(手元)');
const row = (s, t) => `<figure><img src="data:image/png;base64,${s.img}"><figcaption>${t}<br>${s.name}／水色の行 ${s.blue}</figcaption></figure>`;
const b2 = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const sh = await b2.newPage(); await sh.setViewport({ width: 1300, height: 980 });
await sh.setContent(`<meta charset="utf-8"><style>body{margin:0;padding:16px;background:#14181e;color:#e8eef7;font-family:system-ui}h2{font-size:15px;margin:0 0 8px}.row{display:flex;gap:10px}figure{margin:0;flex:1}img{width:100%;border-radius:6px}figcaption{font-size:12px;text-align:center;margin-top:4px}</style>
<h2>地面の継ぎ目（左2枚=直す前／右2枚=直した後）</h2><div class="row">
${before.shots.map(s => row(s, '直す前')).join('')}${after.shots.map(s => row(s, '直した後')).join('')}</div>
<p style="font-size:12px;opacity:.8">1コマの重さ: 直す前 平均${before.perf.mean.toFixed(1)}ms／95%${before.perf.p95.toFixed(1)}ms／最大${before.perf.max.toFixed(1)}ms　→　直した後 平均${after.perf.mean.toFixed(1)}ms／95%${after.perf.p95.toFixed(1)}ms／最大${after.perf.max.toFixed(1)}ms（ソフトウェア描画での値）</p>`, { waitUntil: 'networkidle0' });
await sh.screenshot({ path: 'screenshots/_地面の継ぎ目.png', fullPage: true });
await b2.close();
console.log('screenshots/_地面の継ぎ目.png');
