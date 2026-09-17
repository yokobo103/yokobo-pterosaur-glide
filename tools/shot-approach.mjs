// 木に近づきながら距離ごとに撮る。近景と遠景の入れ替えで「突然変わる」かを見る
import puppeteer from 'puppeteer';
const BASE = process.env.GLIDE_BASE || 'http://localhost:8141/';
const DISTS = [300, 200, 160, 130, 110, 90, 60];
const b = await puppeteer.launch({ headless: true, protocolTimeout: 300000,
  args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const rows = [];
for (const kind of ['conifer', 'ginkgo']) {
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844 });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(`${BASE}?harness&seed=17&cam=a`, { waitUntil: 'networkidle0', timeout: 120000 });
  await p.waitForFunction(() => window.__slice && window.__slice.modelReady() && window.__slice.forestReady(), { timeout: 90000 });
  // 手前300mに他の木がない、その種類の木を1本選ぶ
  const tree = await p.evaluate(kind => {
    const s = window.__slice; s.auto(false); s.reset(); s.begin();
    const all = [...s.trees(0, 4000), ...s.trees(0, 9000), ...s.trees(3000, 6000)];
    for (const t of all.filter(t => t.kind === kind)) {
      // 林から離れた一本木(まわり200mにほかの木がない)を選ぶ
      const alone = !all.some(o => o !== t && Math.hypot(o.x - t.x, o.y - t.y) < 200);
      if (alone) return t;
    }
    return null;
  }, kind);
  if (!tree) { console.log(kind, '条件に合う木がない'); continue; }
  const shots = [];
  for (const d of DISTS) {
    await p.evaluate((t, d) => {
      const s = window.__slice;
      s.place(t.x, t.y - d + 5, 0, 0);                       // カメラは機体の5m後ろ。カメラから木までをほぼ d にする
      const g = s.state(); s.place(t.x + 10, t.y - d + 5, (t.z + 12) - (g.z - g.agl), 0);   // 木の中ほどの高さ・少し横
      for (let i = 0; i < 50; i++) s.step(1/60, true);        // 並べ直し(40mごと)を確実に効かせる
      s.place(t.x + 10, t.y - d + 5, (t.z + 12) - (window.__slice.state().z - window.__slice.state().agl), 0);
      s.step(1/60, true);
    }, tree, d);
    shots.push({ d, img: await p.screenshot({ encoding: 'base64', clip: { x: 0, y: 150, width: 390, height: 560 } }) });
  }
  console.log(kind, '木の位置', Math.round(tree.x), Math.round(tree.y), errs.length ? errs : 'エラーなし');
  rows.push({ kind, shots });
  await p.close();
}
const s = await b.newPage();
await s.setViewport({ width: 1500, height: 900 });
await s.setContent(`<meta charset="utf-8"><style>body{margin:0;padding:18px;background:#14181e;color:#e8eef7;font-family:system-ui}
h2{font-size:14px;margin:12px 0 6px}.row{display:flex;gap:6px}figure{margin:0;flex:1}img{width:100%;border-radius:5px;display:block}
figcaption{font-size:12px;text-align:center;opacity:.8;margin-top:3px}</style>
${rows.map(r => `<h2>${r.kind === 'conifer' ? '針葉樹' : 'イチョウ'}に近づく（90〜150mで近景と遠景を少しずつ入れ替え）</h2><div class="row">${r.shots.map(x => `<figure><img src="data:image/png;base64,${x.img}"><figcaption>${x.d}m</figcaption></figure>`).join('')}</div>`).join('')}`, { waitUntil: 'networkidle0' });
await s.screenshot({ path: 'screenshots/_木に近づく.png', fullPage: true });
await b.close();
