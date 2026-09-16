// 右バンクで、地平線がどちらに傾いて見えるか(左右の取り違えが起きない測り方)
import puppeteer from 'puppeteer';
const BASE = process.argv.includes('--public') ? 'https://yokobo103.github.io/yokobo-pterosaur-glide/' : 'http://localhost:8141/';
const b = await puppeteer.launch({ headless: true, protocolTimeout: 240000,
  args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844 });
await p.goto(BASE + '?harness&seed=17', { waitUntil: 'networkidle0' });
await p.waitForFunction(() => !!window.__slice);
const r = await p.evaluate(() => {
  const s = window.__slice; s.auto(false); s.reset(); s.begin();
  for (let i=0;i<60;i++) s.step(1/60,true);
  s.forceInput = 1;
  for (let i=0;i<120;i++) s.step(1/60,true);
  const v = s._view();
  const wR = v.local(11,1.1,0.5), wL = v.local(-11,1.1,0.5);
  const right = wR[0] > wL[0] ? wR : wL, left = wR[0] > wL[0] ? wL : wR;
  const planeRoll = Math.atan2(right[1]-left[1], right[0]-left[0]) * 57.3;  // 正=画面で右翼が下
  s.forceInput = null;
  return { lean: v.horizonLean(), planeRoll };
});
console.log('右へ2秒傾けた状態');
console.log(`  機体: 画面で右翼が ${r.planeRoll > 0 ? '下' : '上'} (${r.planeRoll.toFixed(0)}度)`);
console.log(`  地平線: 右側が ${r.lean > 0 ? '上がっている(正しい)' : '下がっている(逆)'} (${r.lean.toFixed(0)}度)`);
await b.close();
