// ドリオサウルスの歩く姿を拡大して見る(調整用)。歩いている1頭に寄ってコマ送り
import puppeteer from 'puppeteer';
const BASE = process.env.GLIDE_BASE || 'http://localhost:8141/';
const b = await puppeteer.launch({ headless: true, protocolTimeout: 600000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 4 });
await p.goto(`${BASE}?harness&seed=5&cam=a`, { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.modelReady() && window.__slice.dryoReady(), { timeout: 90000 });
const herd = await p.evaluate(() => {
  const s = window.__slice; s.auto(false); s.reset(); s.begin();
  return s.herdsNear(0, 0, 12000, 'dryo').sort((a, b) => Math.hypot(a.cx, a.cy) - Math.hypot(b.cx, b.cy))[0];
});
// 歩いている個体の横手30mに構える
const aim = await p.evaluate(h => {
  const s = window.__slice;
  s.place(h.cx, h.cy - 40, 12, 0);
  for (let i = 0; i < 60 * 6; i++) s.render();
  const a = s.dryos().filter(d => d.state === 'walk').sort((x, y) => x.dist - y.dist)[0] || s.dryos()[0];
  return a ? { x: a.x, y: a.y, head: a.head } : null;
}, herd);
const shots = [];
for (let k = 0; k < 4; k++) {
  const px = await p.evaluate(a => {
    const s = window.__slice;
    // 個体の進行方向に対して真横・少し上から。カメラの向きはその個体へ
    const cx = a.x + Math.cos(a.head) * 30, cy = a.y - Math.sin(a.head) * 30;
    s.place(cx, cy, 7, Math.atan2(a.x - cx, a.y - cy));
    for (let i = 0; i < 9; i++) s.render();
    const d = s.dryos().sort((x, y) => x.dist - y.dist)[0];
    return d ? { px: d.px, state: d.state } : null;
  }, aim);
  const cx = Math.max(130, Math.min(260, px?.px?.[0] ?? 195)), cy = Math.max(130, Math.min(714, px?.px?.[1] ?? 500));
  shots.push({ label: `${(k * 0.15).toFixed(2)}秒 (${px?.state ?? '-'})`,
               img: await p.screenshot({ encoding: 'base64', clip: { x: cx - 130, y: cy - 130, width: 260, height: 260 } }) });
}
const sh = await b.newPage(); await sh.setViewport({ width: 1320, height: 400 });
await sh.setContent(`<meta charset="utf-8"><style>body{margin:0;padding:12px;background:#14181e;color:#e8eef7;font-family:system-ui}h2{font-size:14px;margin:0 0 8px}.row{display:flex;gap:8px}figure{margin:0;flex:1}img{width:100%;border-radius:4px}figcaption{font-size:11px;text-align:center}</style>
<h2>ドリオサウルスの歩き（コマ送り・拡大）</h2><div class="row">${shots.map(s => `<figure><img src="data:image/png;base64,${s.img}"><figcaption>${s.label}</figcaption></figure>`).join('')}</div>`, { waitUntil: 'networkidle0' });
await sh.screenshot({ path: 'screenshots/_ドリオ歩き.png', fullPage: true });
await b.close();
console.log('screenshots/_ドリオ歩き.png');
