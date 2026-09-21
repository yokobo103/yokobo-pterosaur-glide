// 「世界を読む」ための5場面をスマホ相当で撮る
import puppeteer from 'puppeteer';
const BASE = process.argv.includes('--public') ? 'https://yokobo103.github.io/yokobo-pterosaur-glide/' : (process.env.GLIDE_BASE || 'http://localhost:8141/');
const b = await puppeteer.launch({ headless: true, protocolTimeout: 900000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await p.goto(`${BASE}?harness&seed=5&cam=a`, { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.dinosReady(), { timeout: 120000 });
const shots = [];
const shot = async (label, fn) => {
  await p.evaluate(fn);
  shots.push({ label, img: await p.screenshot({ encoding: 'base64' }) });
};
await shot('① 高いところから見渡す（高さ700m）', () => {
  const s = window.__slice; s.auto(false); s.reset(); s.begin();
  const h = s.herdsNear(0, 0, 14000, 'brachio').sort((a, b) => Math.hypot(a.cx, a.cy) - Math.hypot(b.cx, b.cy))[0];
  s.place(h.cx, h.cy - 4200, 700, 0);
  for (let i = 0; i < 90; i++) s.step(1 / 60, true);
});
await shot('② 1.5km先に群れ（高さ320m）', () => {
  const s = window.__slice;
  const h = s.herdsNear(0, 0, 14000, 'tricera').sort((a, b) => Math.hypot(a.cx, a.cy) - Math.hypot(b.cx, b.cy))[0];
  s.place(h.cx, h.cy - 1500, 320, 0);
  for (let i = 0; i < 90; i++) s.step(1 / 60, true);
});
await shot('③ 川沿い（高さ140m）', () => { const s = window.__slice; s.place(1234, 5678, 140, 0); for (let i = 0; i < 90; i++) s.step(1 / 60, true); });
await shot('④ 乾いた台地（高さ140m）', () => { const s = window.__slice; s.place(6100, -2400, 140, 2.4); for (let i = 0; i < 90; i++) s.step(1 / 60, true); });
await shot('⑤ 林の縁（高さ140m）', () => { const s = window.__slice; s.place(2600, -5200, 140, 1.1); for (let i = 0; i < 90; i++) s.step(1 / 60, true); });
await shot('⑥ 恐竜へ低空接近（高さ35m）', () => {
  const s = window.__slice;
  const h = s.herdsNear(0, 0, 14000, 'stego').sort((a, b) => Math.hypot(a.cx, a.cy) - Math.hypot(b.cx, b.cy))[0];
  s.place(h.cx, h.cy - 150, 35, 0);
  for (let i = 0; i < 150; i++) s.step(1 / 60, true);
});
await shot('⑦ 日没近く（高さ220m）', () => {
  const s = window.__slice; s.setTime(640); s.place(6100, -2400, 220, 0.6);
  for (let i = 0; i < 90; i++) s.step(1 / 60, true);
});
const sh = await b.newPage(); await sh.setViewport({ width: 1560, height: 900 });
await sh.setContent(`<meta charset="utf-8"><style>body{margin:0;padding:12px;background:#14181e;color:#e8eef7;font-family:system-ui}h2{font-size:14px;margin:0 0 8px}.row{display:flex;gap:6px;flex-wrap:wrap}figure{margin:0;width:210px}img{width:100%;border-radius:4px}figcaption{font-size:10px;text-align:center;margin-top:3px}</style>
<h2>${process.argv[3] || '世界を読む（スマホ相当）'}</h2><div class="row">${shots.map(s => `<figure><img src="data:image/png;base64,${s.img}"><figcaption>${s.label}</figcaption></figure>`).join('')}</div>`, { waitUntil: 'networkidle0' });
await sh.screenshot({ path: `screenshots/_世界を読む${process.argv[2] === '--public' ? '' : ''}.png`, fullPage: true });
await b.close();
console.log('screenshots/_世界を読む.png');
