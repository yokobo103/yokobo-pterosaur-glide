// 遠景の「あれ何だ」: いきものが画面に何画素ぶん見えているか(消した画との差分で測る)
//   node tools/with-dist.mjs tools/diag-farview.mjs
import puppeteer from 'puppeteer';
const BASE = process.argv.includes('--public') ? 'https://yokobo103.github.io/yokobo-pterosaur-glide/' : (process.env.GLIDE_BASE || 'http://localhost:8141/');
const PARTS = ['ブラキオ'];      // 見ている群れの種類だけを消して差分を取る(近くの別の種が混ざらないように)
const b = await puppeteer.launch({ headless: true, protocolTimeout: 900000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844 });
await p.goto(`${BASE}?harness&seed=5&cam=a`, { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.dinosReady(), { timeout: 120000 });
await p.evaluate(() => {
  window.__grab = () => {
    const cv = document.querySelector('canvas');
    const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height;
    c.getContext('2d').drawImage(cv, 0, 0);
    return c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  };
  window.__diff = (a, b) => { let n = 0; for (let i = 0; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) + Math.abs(a[i+1] - b[i+1]) + Math.abs(a[i+2] - b[i+2]) > 24) n++; return n; };
});
const rows = await p.evaluate(PARTS => {
  const s = window.__slice; s.auto(false); s.reset(); s.begin();
  const h = s.herdsNear(0, 0, 14000, 'brachio').sort((a, b) => Math.hypot(a.cx, a.cy) - Math.hypot(b.cx, b.cy))[0];
  const out = [];
  for (const d of [1000, 2000, 3000, 4000, 5000, 7000]) {
    s.place(h.cx, h.cy - d, Math.max(220, d * 0.14), 0);
    for (let i = 0; i < 50; i++) s.render();
    const on = window.__grab();
    const info = s.info();
    for (const k of PARTS) s.hide(k, false);
    s.render(); s.render();
    const off = window.__grab();
    for (const k of PARTS) s.hide(k, true);
    s.render();
    out.push({ d, px: window.__diff(on, off), calls: info.calls, tris: info.tris });
  }
  return out;
}, PARTS);
for (const r of rows) {
  console.log(`  ${String(r.d).padStart(5)}m先: いきものが見えている画素 ${String(r.px).padStart(6)} (画面の${(r.px / (390 * 844) * 100).toFixed(2)}%) / 描画 ${r.calls}回・${(r.tris / 1000).toFixed(0)}k`);
}
await b.close();
