// 起動にかかる時間と、地形を作り直す重さを測る(スマホでの体感に直接効く)
import puppeteer from 'puppeteer';
const BASE = process.env.GLIDE_BASE || 'http://localhost:8141/';
const b = await puppeteer.launch({ headless: true, protocolTimeout: 300000,
  args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
for (const [w, h] of [[390, 844], [1280, 800]]) {
  for (const world of ['flat', 'hills']) {
    const p = await b.newPage();
    await p.setViewport({ width: w, height: h });
    const t0 = Date.now();
    await p.goto(`${BASE}?harness&seed=17&world=${world}&box`, { waitUntil: 'load', timeout: 180000 });
    await p.waitForFunction(() => !!window.__slice, { timeout: 180000 });
    const ready = Date.now() - t0;
    const cost = await p.evaluate(() => {
      const s = window.__slice;
      // 地面の高さ1万回の時間
      let t = performance.now();
      for (let i = 0; i < 10000; i++) s.terrainHeight((i * 37) % 20000 - 10000, (i * 91) % 30000);
      const h1 = (performance.now() - t) / 10000 * 1000;
      // 実際に飛びながら描画した1コマの時間(地形の作り直しを含む)
      s.auto(false); s.reset(); s.begin();
      const frames = []; for (let i = 0; i < 240; i++) { t = performance.now(); s.step(1/60, true); frames.push(performance.now() - t); }
      frames.sort((a, b) => a - b);
      return { heightMicros: h1, med: frames[120], p95: frames[228], max: frames[239] };
    });
    console.log(`${w}x${h} ${world.padEnd(5)}: 起動 ${(ready/1000).toFixed(1)}秒 / 高さ1回 ${cost.heightMicros.toFixed(1)}μ秒 / 1コマ 中央${cost.med.toFixed(0)}ms 95%${cost.p95.toFixed(0)}ms 最大${cost.max.toFixed(0)}ms`);
    await p.close();
  }
}
await b.close();
