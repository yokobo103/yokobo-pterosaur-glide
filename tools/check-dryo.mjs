// ドリオサウルス: 世界に出るか、体色が入っているか、画面で見えるか、重くないか
import puppeteer from 'puppeteer';
const BASE = process.argv.includes('--public') ? 'https://yokobo103.github.io/yokobo-pterosaur-glide/' : (process.env.GLIDE_BASE || 'http://localhost:8141/');
const b = await puppeteer.launch({ headless: true, protocolTimeout: 600000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844 });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(`${BASE}?harness&seed=5&cam=a`, { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.modelReady(), { timeout: 90000 });
let fails = 0; const check = (l, c) => { if (!c) fails++; console.log(`  ${l} ${c ? 'PASS' : 'FAIL'}`); };

// 出発点まわりにドリオの一団があるか(種ごとの出やすさの確認)
const around = await p.evaluate(() => {
  const s = window.__slice; s.auto(false); s.reset(); s.begin();
  return s.sites(12000).filter(x => x.id === 'dryo_group');
});
console.log(`  12km以内のドリオの一団 ${around.length}か所 / 一番近い ${around.length ? Math.round(around[0].d) + 'm' : '-'}`);
check('世界にドリオの一団が出る', around.length >= 1);
if (!around.length) { await b.close(); process.exit(1); }

const site = around[0];
const shots = [];
for (const dist of [1400, 500, 140]) {
  const r = await p.evaluate(({ s0, d }) => {
    const w = window.__slice;
    w.place(s0.x, s0.y - d, Math.max(40, d * 0.35), 0);
    for (let i = 0; i < 30; i++) w.render();
    return { look: w.discoveryLook('dryo_group'), found: w.found().map(f => f.id), tris: w.discoveryTris(), frame: w.forest().frameTris };
  }, { s0: site, d: dist });
  const look = r.look || {};
  console.log(`  ${dist}m手前 -> 近くの姿 ${look.near ?? 0}体 / 遠くの板 ${look.far ?? 0}体 / 三角形 ${r.tris}`);
  check(`${dist}m先でも画面に置かれている`, (look.near || 0) + (look.far || 0) >= 5);
  shots.push({ label: `${dist}m手前`, img: await p.screenshot({ encoding: 'base64' }) });
  if (dist === 140) {
    const c = look.color || [0, 0, 0];
    console.log(`  体の色(頂点カラーの平均) R${c[0].toFixed(2)} G${c[1].toFixed(2)} B${c[2].toFixed(2)} / 1体${look.tris}三角形`);
    check('赤茶の体色が入っている(白でも灰色でもない)', c[0] > c[2] * 1.25 && c[0] > 0.15);
    check(`1体が軽い(${look.tris}三角形)`, look.tris < 9000);
    check('画面全体に対して重すぎない', r.tris < r.frame * 0.25);
    check('近づくと発見になる', r.found.includes('dryo_group'));
  }
}
check('エラーなし', errs.length === 0); if (errs.length) console.log(errs.slice(0, 3));

const sh = await b.newPage(); await sh.setViewport({ width: 1300, height: 900 });
await sh.setContent(`<meta charset="utf-8"><style>body{margin:0;padding:16px;background:#14181e;color:#e8eef7;font-family:system-ui}h2{font-size:15px;margin:0 0 8px}.row{display:flex;gap:10px}figure{margin:0;flex:1}img{width:100%;border-radius:6px}figcaption{font-size:12px;text-align:center;margin-top:4px}</style>
<h2>ドリオサウルスの一団（近づいていく）</h2><div class="row">${shots.map(s => `<figure><img src="data:image/png;base64,${s.img}"><figcaption>${s.label}</figcaption></figure>`).join('')}</div>`, { waitUntil: 'networkidle0' });
await sh.screenshot({ path: 'screenshots/_ドリオサウルス.png', fullPage: true });
await b.close();
console.log(fails ? `${fails}件 FAIL` : '全件 PASS');
process.exit(fails ? 1 : 0);
