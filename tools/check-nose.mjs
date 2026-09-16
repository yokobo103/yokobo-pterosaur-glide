// 旋回を続けたとき、機体の鼻がどっちを向いて見えるか。
// 0度=真正面(向こう向き) / 90度=真横 / 180度=完全にこちら向き
import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless: true, protocolTimeout: 240000,
  args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844 });
await p.goto('http://localhost:8141/?harness&seed=17', { waitUntil: 'networkidle0' });
await p.waitForFunction(() => !!window.__slice);
const rows = await p.evaluate(() => {
  const s = window.__slice; s.auto(false); s.reset(); s.begin();
  for (let i=0;i<120;i++) s.step(1/60,true);
  const out = [];
  s.forceInput = 1;
  for (let t=1; t<=1800; t++) {
    s.step(1/60, true);
    if ([30,60,120,300,600,1200,1800].includes(t)) {
      const v = s._view();
      // 鼻と尾を画面へ落として、見かけの向きを出す
      const nose = v.local(0,0,7), tail = v.local(0,0,-3), c = v.local(0,0,0);
      const len = Math.hypot(nose[0]-tail[0], nose[1]-tail[1]);
      out.push({
        t:+(t/60).toFixed(1),
        yawOff:+((s.state().head - v.camHead)*57.3).toFixed(1),
        // 機体の長さが画面上でどれだけ縮んで見えるか。真正面なら短く、真横なら長い
        lenPx:+len.toFixed(0),
        x:+(c[0]/390*100).toFixed(0),
      });
    }
  }
  s.forceInput = null;
  return out;
});
console.log(' 押した時間 | カメラに対する振れ | 画面上の機体の長さ | 横位置');
for (const r of rows) console.log(`  ${String(r.t).padStart(5)}秒 |      ${String(r.yawOff).padStart(6)}度     |      ${String(r.lenPx).padStart(4)}px      | ${r.x}%`);
await b.close();
