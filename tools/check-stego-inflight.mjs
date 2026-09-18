// 出発点から実際に飛ばして、ステゴサウルスが画面に描かれるかを数える(公開版も検査できる)
import puppeteer from 'puppeteer';
const BASE = process.argv.includes('--public') ? 'https://yokobo103.github.io/yokobo-pterosaur-glide/' : (process.env.GLIDE_BASE || 'http://localhost:8141/');
const SEEDS = (process.env.SEEDS || '5,17,22').split(',');
const b = await puppeteer.launch({ headless: true, protocolTimeout: 900000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
console.log('検査の対象:', BASE);
for (const seed of SEEDS) {
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844 });
  const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(`${BASE}?harness&seed=${seed}&cam=a`, { waitUntil: 'networkidle0', timeout: 120000 });
  await p.waitForFunction(() => window.__slice && window.__slice.modelReady() && window.__slice.stegoReady(), { timeout: 90000 });
  // 15秒ずつに区切って回す(一度に回すと重くて時間切れになる)
  await p.evaluate(() => {
    const s = window.__slice; s.auto(true); s.reset(); s.begin();
    window.__st = { drawn: 0, frames: 0, checks: 0, onScreen: 0, bigOnScreen: 0, bestPx: 0, aglAtBest: 0, minHerd: 1e9, minAnimal: 1e9, alive: true };
  });
  for (let chunk = 0; chunk < 10; chunk++) {
    const alive = await p.evaluate(() => {
      const s = window.__slice, T = window.__st;
      for (let i = 0; i < 60 * 15; i++) {
        const st = s.step(1/60, true);
        if (!st.alive) { T.alive = false; break; }
        T.frames++;
        if (i % 6) continue;
        T.checks++;
        for (const h of s.herdsNear(st.x, st.y, 6000)) T.minHerd = Math.min(T.minHerd, Math.hypot(h.cx - st.x, h.cy - st.y));
        const list = s.stegos();
        if (!list.length) continue;
        T.drawn++;
        for (const a of list) T.minAnimal = Math.min(T.minAnimal, a.dist);
        const vis = list.filter(a => a.inFrame);
        if (vis.length) T.onScreen++;
        if (vis.some(a => a.sizePx > 8)) T.bigOnScreen++;
        for (const a of vis) if (a.sizePx > T.bestPx) { T.bestPx = a.sizePx; T.aglAtBest = st.agl; }
      }
      return T.alive;
    });
    if (!alive) break;
  }
  const r = await p.evaluate(() => {
    const T = window.__st;
    return { ...T, bestPx: Math.round(T.bestPx), aglAtBest: Math.round(T.aglAtBest), minHerd: Math.round(T.minHerd), minAnimal: T.minAnimal === 1e9 ? null : Math.round(T.minAnimal) };
  });
  console.log(`seed ${seed}: ${(r.frames/60/60).toFixed(1)}分飛行 / 群れに最接近 ${r.minHerd}m`);
  console.log(`  描かれた ${(r.drawn / r.checks * 100).toFixed(0)}% / 画面に映った ${(r.onScreen / r.checks * 100).toFixed(0)}% / 8px以上で映った ${(r.bigOnScreen / r.checks * 100).toFixed(0)}% / 一番大きく映ったとき ${r.bestPx}px(高度${r.aglAtBest}m)`);
  if (errs.length) console.log('  エラー:', errs.slice(0, 3));
  await p.close();
}
await b.close();
