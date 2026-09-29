// 足した恐竜を、飛んでいる目線で1種ずつ撮って1枚に並べる
//   node tools/with-dist.mjs tools/shot-new-dinos.mjs
import puppeteer from 'puppeteer';
const BASE = process.env.GLIDE_BASE || 'http://localhost:8141/';
// [種類, 名前, 手前の距離m, 高度m]
const KINDS = [['trex', 'ティラノサウルス', 190, 55], ['spino', 'スピノサウルス', 220, 60], ['parasaur', 'パラサウロロフス', 170, 45],
               ['ankylo', 'アンキロサウルス', 120, 30], ['raptor', 'ヴェロキラプトル', 70, 18]];
const b = await puppeteer.launch({ headless: true, protocolTimeout: 600000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844 });
await p.goto(`${BASE}?harness&seed=5&cam=a`, { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.modelReady() && window.__slice.dinosReady(), { timeout: 120000 });
const shots = [];
for (const [id, name, d, alt] of KINDS) {
  const n = await p.evaluate((id, d, alt) => {
    const s = window.__slice; s.auto(false); s.reset(); s.begin();
    const h = s.herdsNear(0, 0, 14000, id).sort((a, b) => Math.hypot(a.cx, a.cy) - Math.hypot(b.cx, b.cy))[0];
    if (!h) return 0;
    s.place(h.cx, h.cy - d, alt, 0);
    for (let i = 0; i < 240; i++) s.render();
    return h.n;
  }, id, d, alt);
  console.log(`${name}: ${n ? n + '頭の群れ' : '見つからない'}`);
  shots.push({ label: `${name}（${d}m手前・高度${alt}m）`, img: await p.screenshot({ encoding: 'base64' }) });
}
const sh = await b.newPage(); await sh.setViewport({ width: 1800, height: 900 });
await sh.setContent(`<meta charset="utf-8"><style>body{margin:0;padding:16px;background:#14181e;color:#e8eef7;font-family:system-ui}h2{font-size:15px;margin:0 0 8px}.row{display:flex;gap:8px}figure{margin:0;flex:1}img{width:100%;border-radius:6px}figcaption{font-size:12px;text-align:center;margin-top:4px;opacity:.85}</style>
<h2>足した恐竜（飛んでいる目線）</h2><div class="row">${shots.map(s => `<figure><img src="data:image/png;base64,${s.img}"><figcaption>${s.label}</figcaption></figure>`).join('')}</div>`, { waitUntil: 'networkidle0' });
await sh.screenshot({ path: process.env.SHOT_OUT || 'screenshots/_足した恐竜.png', fullPage: true });
await b.close();
