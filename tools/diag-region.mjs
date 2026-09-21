// 地域(川沿い/乾いた台地/林/岩場)が色で見分けられるかを測る。数字は色の離れぐあい(0〜1)
import puppeteer from 'puppeteer';
const BASE = process.argv.includes('--public') ? 'https://yokobo103.github.io/yokobo-pterosaur-glide/' : (process.env.GLIDE_BASE || 'http://localhost:8141/');
const b = await puppeteer.launch({ headless: true, protocolTimeout: 900000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844 });
await p.goto(`${BASE}?harness&seed=5&cam=a`, { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.modelReady(), { timeout: 90000 });
const all = {};
for (const [x, y] of [[0, 0], [6100, -2400], [-4200, 2600], [2600, -5200], [1234, 5678]]) {
  const pal = await p.evaluate(([x, y]) => {
    const s = window.__slice; s.auto(false); s.reset(); s.begin(); s.place(x, y, 300, 0);
    for (let i = 0; i < 12; i++) s.render();
    return s.groundPalette();
  }, [x, y]);
  for (const [k, v] of Object.entries(pal)) {
    const e = all[k] = all[k] || { n: 0, r: 0, g: 0, b: 0 };
    e.n += v.n; e.r += v.r * v.n; e.g += v.g * v.n; e.b += v.b * v.n;
  }
}
for (const k of Object.keys(all)) { const e = all[k]; e.r /= e.n; e.g /= e.n; e.b /= e.n; }
const keys = ['川沿い', '乾いた台地', '林', '岩場'].filter(k => all[k]);
for (const k of keys) console.log(`  ${k.padEnd(6, '　')} 色 R${all[k].r.toFixed(2)} G${all[k].g.toFixed(2)} B${all[k].b.toFixed(2)} (${all[k].n}点)`);
let worst = 9, sum = 0, n = 0;
for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) {
  const a = all[keys[i]], c = all[keys[j]];
  const d = Math.hypot(a.r - c.r, a.g - c.g, a.b - c.b);
  console.log(`    ${keys[i]} ↔ ${keys[j]}: ${d.toFixed(3)}`);
  worst = Math.min(worst, d); sum += d; n++;
}
console.log(`  いちばん見分けにくい組の差 ${worst.toFixed(3)} / 平均 ${(sum / n).toFixed(3)}`);
await b.close();
