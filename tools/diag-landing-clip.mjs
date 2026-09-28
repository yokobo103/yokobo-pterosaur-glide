// 着地の動き(Landing_Fold)の中身を測る。どこまでが羽ばたきで、どこから畳み始めるか
import puppeteer from 'puppeteer';
const BASE = process.env.GLIDE_BASE || 'http://localhost:8141/';
const b = await puppeteer.launch({ headless: true, protocolTimeout: 300000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844 });
await p.goto(`${BASE}?harness&seed=17&cam=a`, { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.modelReady(), { timeout: 90000 });
await p.evaluate(() => { const s = window.__slice; s.auto(false); s.reset(); s.begin(); s.place(0, 1500, 12, 0); for (let i = 0; i < 60 * 12 && s.state().alive; i++) s.step(1/60, i % 3 === 0); s.render(); });
const clip = await p.evaluate(() => window.__slice.landClip());
console.log(`  長さ ${clip.dur.toFixed(2)}秒`);
const rows = await p.evaluate(d => {
  const out = [];
  for (let t = 0; t <= d + 1e-6; t += d / 24) out.push(window.__slice.landPose(Math.min(t, d)));
  return out;
}, clip.dur);
const span0 = rows[0].span, spanEnd = rows[rows.length - 1].span;
console.log('   時刻   翼の開き  手の高さ  頭の高さ  足の高さ');
for (const r of rows) {
  const pct = ((r.span - spanEnd) / (span0 - spanEnd) * 100);
  console.log(`  ${r.t.toFixed(2)}s  ${r.span.toFixed(2)}  ${'#'.repeat(Math.max(0, Math.round(pct / 4)))}${' '.repeat(Math.max(0, 25 - Math.round(pct / 4)))} ${r.handY.toFixed(2)}  ${r.headY.toFixed(2)}  ${r.footY.toFixed(2)}`);
}
// 畳み始め = 開きが5%縮んだ時刻 / 畳み終わり = 95%縮んだ時刻
const at = f => { const th = span0 - (span0 - spanEnd) * f; const r = rows.find(x => x.span <= th); return r ? r.t : clip.dur; };
console.log(`  畳み始め ${at(0.05).toFixed(2)}秒 / 半分 ${at(0.5).toFixed(2)}秒 / 畳み終わり ${at(0.95).toFixed(2)}秒`);
const hMax = Math.max(...rows.map(r => r.handY)), h0 = rows[0].handY;
console.log(`  手の高さ: はじめ ${h0.toFixed(2)} / 一番上 ${hMax.toFixed(2)} (差 ${(hMax - h0).toFixed(2)}m ＝ 羽ばたきの上げ)`);
await b.close();
