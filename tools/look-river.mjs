// 川の見え方を並べる。川なし / 幅3通り を、タイトルの視点・飛行中400m・見下ろし700m で撮る。
// あわせて画面に占める水の割合(本物の水 = その場所の地形が水面より下)を数える
import puppeteer from 'puppeteer';
const BASE = process.env.GLIDE_BASE || 'http://localhost:8141/';
const b = await puppeteer.launch({ headless: true, protocolTimeout: 900000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844 });
const VARIANTS = [['川なし', '&noriver'], ['幅150m', '&riverw=150'], ['幅260m', '&riverw=260'], ['幅420m', '&riverw=420']];
const VIEWS = [
  { label: 'タイトル', cam: 'title', x: 0, y: 0, agl: 380, head: 0 },
  { label: '400m', cam: 'a', x: 0, y: 3000, agl: 400, head: 0.35 },
  { label: '見下ろし700m', cam: 'c', x: 0, y: 9000, agl: 700, head: -0.3 },
];
const rows = [];
for (const v of VIEWS) {
  const row = [];
  for (const [name, qs] of VARIANTS) {
    await p.goto(`${BASE}?harness&seed=17&cam=${v.cam}${qs}`, { waitUntil: 'networkidle0', timeout: 120000 });
    await p.waitForFunction(() => window.__slice && window.__slice.modelReady(), { timeout: 90000 });
    const r = await p.evaluate(v => {
      const s = window.__slice; s.auto(false); s.reset(); s.begin(); s.place(v.x, v.y, v.agl, v.head); s.forceInput = 0;
      for (let i = 0; i < 60; i++) s.render();
      const W = innerWidth, H = innerHeight, water = s.waterY(); let wet = 0, fake = 0, ground = 0;
      for (let j = 0; j < 50; j++) for (let i = 0; i < 20; i++) {
        const h = s.pick((i + 0.5) * W / 20, (j + 0.5) * H / 50);
        if (h.what === 'なし') continue;
        ground++;
        if (h.what !== '水面') continue;
        if (s.terrainHeight(-h.point[0], h.point[2]) > water + 1.5) fake++; else wet++;
      }
      return { wet: Math.round(100 * wet / Math.max(1, ground)), fake };
    }, v);
    row.push({ name, r, img: await p.screenshot({ encoding: 'base64' }) });
    console.log(`  ${v.label} / ${name}: 地面のうち水 ${r.wet}% / 偽の水 ${r.fake}点`);
  }
  rows.push({ v, row });
}
const sh = await b.newPage(); await sh.setViewport({ width: 1300, height: 900 });
await sh.setContent(`<meta charset="utf-8"><style>body{margin:0;padding:12px;background:#14181e;color:#e8eef7;font-family:system-ui}
h2{font-size:13px;margin:10px 0 6px}.row{display:flex;gap:8px}figure{margin:0;flex:1}img{width:100%;border-radius:6px;display:block}
figcaption{font-size:11px;text-align:center;opacity:.85;padding-top:3px}</style>
${rows.map(({ v, row }) => `<h2>${v.label}</h2><div class="row">${row.map(c => `<figure><img src="data:image/png;base64,${c.img}"><figcaption>${c.name}（水 ${c.r.wet}%）</figcaption></figure>`).join('')}</div>`).join('')}`, { waitUntil: 'networkidle0', timeout: 120000 });
await sh.screenshot({ path: 'screenshots/_川の幅.png', fullPage: true });
await b.close();
console.log('screenshots/_川の幅.png');
