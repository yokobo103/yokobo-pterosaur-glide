// 旋回中、画面の中で本当に何が起きているかを、公開されている版で測る。
// 使い方: node tools/check-turn.mjs [--local]
import puppeteer from 'puppeteer';

const LOCAL = process.argv.includes('--local');
const BASE = LOCAL ? (process.env.GLIDE_BASE || 'http://localhost:8141/') : 'https://yokobo103.github.io/yokobo-pterosaur-glide/';
console.log('測る対象:', BASE);

const b = await puppeteer.launch({
  headless: true, protocolTimeout: 240000,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });   // スマホ縦
await p.goto(BASE + '?harness&seed=17', { waitUntil: 'networkidle0', timeout: 60000 });
await p.waitForFunction(() => !!window.__slice, { timeout: 30000 });

const hasLag = await p.evaluate(() => typeof window.__slice._view === 'function' && '_view' in window.__slice
  && window.__slice._view().camHead !== undefined);
console.log('カメラ遅延の仕組みが入っているか:', hasLag ? 'ある' : 'ない');

const rows = await p.evaluate(() => {
  const s = window.__slice;
  s.auto(false); s.reset(); s.begin();
  const W = 390, H = 844;
  const sample = () => {
    const v = s._view();
    const c = v.local(0, 0, 0), wing = v.local(11, 0.6, -3);
    const hL = v.world(-4000, 60, 6000), hR = v.world(4000, 60, 6000);
    const ang = (a, o) => Math.atan2(a[1] - o[1], a[0] - o[0]) * 57.3;
    return {
      bank: s.state().bank * 57.3,
      yawOff: (s.state().head - v.camHead) * 57.3,
      wing: ang(wing, c),
      horizon: ang(hR, hL),
      selfY: c[1] / H * 100,
    };
  };
  s.render();
  const base = sample();
  const out = [];
  s.forceInput = 1;
  for (let t = 0; t <= 300; t++) {
    s.step(1 / 60, true);
    if ([30, 60, 120, 240].includes(t)) {
      const m = sample();
      out.push({
        t: +(t / 60).toFixed(1), bank: +m.bank.toFixed(0), yawOff: +m.yawOff.toFixed(1),
        wingRoll: +(m.wing - base.wing).toFixed(0), horizonRoll: +(m.horizon - base.horizon).toFixed(1),
        selfY: +m.selfY.toFixed(0),
      });
    }
  }
  s.forceInput = null;
  return out;
});

console.log('');
console.log(' 押した時間 | 機体の傾き | カメラに対する振れ | 画面の機体の回転 | 地平線の傾き | 機体の縦位置');
for (const r of rows) {
  console.log(`   ${String(r.t).padStart(4)}秒  |  ${String(r.bank).padStart(4)}度  |` +
    `      ${String(r.yawOff).padStart(5)}度      |     ${String(r.wingRoll).padStart(4)}度      |` +
    `   ${String(r.horizonRoll).padStart(5)}度  |   画面の${r.selfY}%`);
}
await b.close();
