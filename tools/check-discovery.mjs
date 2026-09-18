// 発見の仕組み: 近づくと発見になるか、知らせが出るか、終わりに一覧が出るか、重さはどうか
import puppeteer from 'puppeteer';
const BASE = process.argv.includes('--public') ? 'https://yokobo103.github.io/yokobo-pterosaur-glide/' : (process.env.GLIDE_BASE || 'http://localhost:8141/');
const b = await puppeteer.launch({ headless: true, protocolTimeout: 600000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844 });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(`${BASE}?harness&seed=5&cam=a`, { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.modelReady(), { timeout: 90000 });
let fails = 0; const check = (l, c) => { if (!c) fails++; console.log(`  ${l} ${c ? 'PASS' : 'FAIL'}`); };

const list = await p.evaluate(() => { const s = window.__slice; s.auto(false); s.reset(); s.begin(); return s.sites(4000); });
const kinds = [...new Set(list.map(s => s.id))];
console.log(`  出発付近の発見対象 ${list.length}件 (${kinds.join(', ')})`);
check('発見対象が近くにある', list.length >= 3);

// 3か所へ順に近づく
const shots = [];
for (const target of list.slice(0, 3)) {
  const r = await p.evaluate(t => {
    const s = window.__slice;
    s.place(t.x, t.y - t.radius * 0.6, 120, 0);      // 発見距離の内側へ
    for (let i = 0; i < 40; i++) s.step(1/60, true);
    return { found: s.found(), toast: s.foundVisible() };
  }, target);
  console.log(`  ${target.name}(発見距離${target.radius}m)へ近づく -> 知らせ「${r.toast ?? 'なし'}」`);
  check(`${target.name} が発見になる`, r.found.some(f => f.id === target.id));
  check('知らせが画面に出ている', !!r.toast && r.found.some(f => f.name === r.toast));   // 近くに複数あると1件ずつ知らせるので、発見済みのどれかが出ていればよい
  shots.push({ label: target.name, img: await p.screenshot({ encoding: 'base64' }) });
}
// 同じ所へ戻っても二重に数えない
const again = await p.evaluate(t => {
  const s = window.__slice; s.place(t.x, t.y - 50, 120, 0);
  for (let i = 0; i < 30; i++) s.step(1/60, true);
  return s.found().length;
}, list[0]);
check(`同じ対象を二重に数えない(${again}件)`, again === (await p.evaluate(() => window.__slice.found().length)));

// 走行の終わりに一覧が出る
const endText = await p.evaluate(() => {
  const s = window.__slice;
  s.place(0, 500, 3, 0);                              // 地面すれすれ -> 着地して終了
  for (let i = 0; i < 60 * 6; i++) s.step(1/60, true);
  return { text: s.foundListText(), found: s.found().map(f => f.name) };
});
check(`終わりの一覧に発見が並ぶ(${endText.found.join(' / ')})`, endText.found.every(n => endText.text.includes(n)) && endText.found.length > 0);

const tris = await p.evaluate(() => ({ disc: window.__slice.discoveryTris(), frame: window.__slice.forest().frameTris }));
console.log(`  発見対象の見た目が使う三角形 ${tris.disc} / 画面全体 ${(tris.frame/1000).toFixed(0)}k`);
check('見た目が重すぎない(全体の1割以下)', tris.disc < tris.frame * 0.1);
check('エラーなし', errs.length === 0); if (errs.length) console.log(errs.slice(0, 3));

shots.push({ label: '走行の終わり（今回の発見）', img: await p.screenshot({ encoding: 'base64' }) });
const sh = await b.newPage(); await sh.setViewport({ width: 1300, height: 900 });
await sh.setContent(`<meta charset="utf-8"><style>body{margin:0;padding:16px;background:#14181e;color:#e8eef7;font-family:system-ui}h2{font-size:15px;margin:0 0 8px}.row{display:flex;gap:10px}figure{margin:0;flex:1}img{width:100%;border-radius:6px}figcaption{font-size:12px;text-align:center;margin-top:4px}</style>
<h2>発見（DISCOVERED の知らせ）</h2><div class="row">${shots.map(s => `<figure><img src="data:image/png;base64,${s.img}"><figcaption>${s.label}</figcaption></figure>`).join('')}</div>`, { waitUntil: 'networkidle0' });
await sh.screenshot({ path: 'screenshots/_発見.png', fullPage: true });
await b.close();
console.log(fails ? `${fails}件 FAIL` : '全件 PASS');
process.exit(fails ? 1 : 0);
