// 山脈の風上側の斜面の横に置いて撮る。上昇が本当にそこにあるかも数字で出す
import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless: true, protocolTimeout: 300000,
  args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
for (const cam of ['a', 'c']) {
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 844 });
  await p.goto(`${process.env.GLIDE_BASE || 'http://localhost:8141/'}?harness&seed=17&cam=${cam}&world=ridge`, { waitUntil: 'networkidle0', timeout: 120000 });
  await p.waitForFunction(() => !!window.__slice);
  const info = await p.evaluate(() => {
    const s = window.__slice; s.auto(false); s.reset(); s.begin();
    const y = 4000;
    // 川の右側の山脈の、風上側で上昇がいちばん強い位置を探す(斜面から120m)
    let best = -99, bx = 0;
    for (let x = s.riverX(y) + 1200; x < s.riverX(y) + 4200; x += 20) {
      const r = s.ridgeAt(x, y, s.terrainHeight(x, y) + 120);
      if (r > best) { best = r; bx = x; }
    }
    s.place(bx, y, 120, 0);
    for (let i = 0; i < 90; i++) s.step(1/60, true);
    const st = s.state();
    return { lift: best, vz: st.vz, agl: st.agl, alive: st.alive };
  });
  console.log(`cam=${cam}: 置いた場所の尾根の上昇 ${info.lift.toFixed(1)}m/s / 1.5秒後 上下${info.vz.toFixed(1)}m/s 高度${info.agl.toFixed(0)}m`);
  await p.screenshot({ path: `screenshots/ridge-風上の斜面-${cam}.png` });
  await p.close();
}
await b.close();
