// 酔いにつながりやすい動きを、カメラの型ごとに測る。
// 右5秒 → 直進3秒 → 左5秒 → 直進3秒 を毎コマ描画しながら流す。
import puppeteer from 'puppeteer';
const BASE = process.argv.includes('--public') ? 'https://yokobo103.github.io/yokobo-pterosaur-glide/' : (process.env.GLIDE_BASE || 'http://localhost:8141/');
const KEYS = ['old', 'a', 'b', 'c'];
const b = await puppeteer.launch({ headless: true, protocolTimeout: 300000,
  args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const rows = [];
for (const key of KEYS) {
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844 });
  await p.goto(`${BASE}?harness&seed=17&cam=${key}`, { waitUntil: 'networkidle0', timeout: 120000 });
  await p.waitForFunction(() => !!window.__slice);
  const r = await p.evaluate(() => {
    const s = window.__slice; s.auto(false); s.reset(); s.begin();
    for (let i=0;i<60;i++) s.step(1/60,true);
    const plan = [[1,300],[0,180],[-1,300],[0,180]];
    let prevLean = null, prevCam = null, prevYawRate = null;
    let maxLean=0, maxLeanRate=0, maxYawRate=0, maxYawAcc=0, maxPlane=0, minY=1e9, maxY=-1e9, minX=1e9, maxX=-1e9;
    const dt = 1/60;
    for (const [inp, n] of plan) {
      s.forceInput = inp;
      for (let i=0;i<n;i++) {
        s.step(dt,true);
        const v = s._view();
        const lean = v.horizonLean();
        const cam = v.camHead;
        maxLean = Math.max(maxLean, Math.abs(lean));
        if (prevLean !== null) maxLeanRate = Math.max(maxLeanRate, Math.abs(lean-prevLean)/dt);
        if (prevCam !== null) {
          const yr = (cam-prevCam)/dt*57.3;
          maxYawRate = Math.max(maxYawRate, Math.abs(yr));
          if (prevYawRate !== null) maxYawAcc = Math.max(maxYawAcc, Math.abs(yr-prevYawRate)/dt);
          prevYawRate = yr;
        }
        prevLean = lean; prevCam = cam;
        const wR = v.local(11,1.1,0.5), wL = v.local(-11,1.1,0.5), c = v.local(0,0,0);
        const right = wR[0] > wL[0] ? wR : wL, left = wR[0] > wL[0] ? wL : wR;
        maxPlane = Math.max(maxPlane, Math.abs(Math.atan2(right[1]-left[1], right[0]-left[0])*57.3));
        minX=Math.min(minX,c[0]); maxX=Math.max(maxX,c[0]); minY=Math.min(minY,c[1]); maxY=Math.max(maxY,c[1]);
      }
    }
    s.forceInput = null;
    return { maxLean, maxLeanRate, maxYawRate, maxYawAcc, maxPlane, minX, maxX, minY, maxY };
  });
  rows.push({ key, ...r });
  await p.close();
}
await b.close();
const f = (x, w=5) => x.toFixed(0).padStart(w);
console.log('型   | 地平線の傾き最大 | 地平線が傾く速さ最大 | 画面の回転の速さ最大 | 回転の急な変化 | 画面上の機体の傾き | 機体の位置(横/縦)');
for (const r of rows) {
  console.log(`${r.key.padEnd(4)} |   ${f(r.maxLean)}度        |   ${f(r.maxLeanRate)}度/秒        |   ${f(r.maxYawRate)}度/秒         |  ${f(r.maxYawAcc)}度/秒²   |   ${f(r.maxPlane)}度          | ${f(r.minX/390*100,3)}-${f(r.maxX/390*100,3)}% / ${f(r.minY/844*100,3)}-${f(r.maxY/844*100,3)}%`);
}
