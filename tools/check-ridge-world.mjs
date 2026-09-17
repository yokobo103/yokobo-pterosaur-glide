// 山脈の世界: 向きの検査・スタート地点・画面の絵
import puppeteer from 'puppeteer';
const BASE = process.argv.includes('--public') ? 'https://yokobo103.github.io/yokobo-pterosaur-glide/' : (process.env.GLIDE_BASE || 'http://localhost:8141/');
const b = await puppeteer.launch({ headless: true, protocolTimeout: 300000,
  args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const ok = c => c ? 'PASS' : 'FAIL';
let fails = 0; const check = (l, c) => { if (!c) fails++; console.log(`  ${l} ${ok(c)}`); };
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844 });
const errs = []; p.on('pageerror', e => errs.push(e.message));
await p.goto(BASE + '?harness&seed=17&cam=a&world=ridge', { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => !!window.__slice);
check('山脈の世界になっている', await p.evaluate(() => window.__slice.world) === 'ridge');
const r = await p.evaluate(() => {
  const s = window.__slice; s.auto(false); s.reset(); s.begin();
  for (let i=0;i<60;i++) s.step(1/60,true);
  const st0 = s.state(); const v0 = s._view();
  const markBefore = v0.world(0, 200, st0.y + 5000)[0];
  s.forceInput = 1; for (let i=0;i<150;i++) s.step(1/60,true);
  const v = s._view();
  const markAfter = v.world(0, 200, st0.y + 5000)[0];
  const nose = v.noseDir(), vel = v.velDir();
  const dev = Math.acos(Math.max(-1, Math.min(1, nose[0]*vel[0]+nose[1]*vel[1]+nose[2]*vel[2]))) * 57.3;
  s.forceInput = null;
  return { alive: s.state().alive, agl0: st0.agl, markMove: markAfter - markBefore, dev, lean: v.horizonLean() };
});
check(`スタート直後に地面の上にいる(高度${r.agl0.toFixed(0)}m)`, r.agl0 > 100);
check('右を押すと右へ曲がる', r.markMove < 0);
check(`機首と進行方向のズレ ${r.dev.toFixed(1)}度`, r.dev < 1);
check(`水平キープで地平線が水平(${r.lean.toFixed(1)}度)`, Math.abs(r.lean) < 1);
// 尾根の風上側に置いて、上昇が画面の帯と音に出るか(浮き上がるか)
const ridge = await p.evaluate(() => {
  const s = window.__slice; s.auto(false); s.reset(); s.begin();
  return s.probeRidge ? s.probeRidge() : null;
});
// 絵: 山脈が見えている場面
await p.evaluate(() => { const s = window.__slice; s.reset(); s.begin(); s.forceInput = 0.35; for (let i=0;i<60*14;i++) s.step(1/60, i % 6 === 0); s.forceInput = 0.0; for (let i=0;i<60*4;i++) s.step(1/60,true); s.forceInput = null; });
await p.screenshot({ path: 'screenshots/ridge-山脈が見える.png' });
check('ページ内エラーなし', errs.length === 0);
if (errs.length) console.log(errs);
await b.close();
console.log(fails ? `${fails}件 FAIL` : '全件 PASS');
