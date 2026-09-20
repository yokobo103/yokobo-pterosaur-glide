// 旋回を続けたとき、自機が画面から出ないか。旋回は走行の44%を占めるので外れたら致命的。
import puppeteer from 'puppeteer';
const LOCAL = !process.argv.includes('--public');
const BASE = LOCAL ? (process.env.GLIDE_BASE || 'http://localhost:8141/') : 'https://yokobo103.github.io/yokobo-pterosaur-glide/';
for (const size of [{n:'スマホ縦',w:390,h:844},{n:'PC横',w:1280,h:800}]) {
  // 大きさごとに新しいブラウザで開く。同じブラウザで2ページ目を開くと、この検査環境では読み込みが止まった(実際の起動は0.6秒)
  const b = await puppeteer.launch({ headless: true, protocolTimeout: 600000,
    args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  await p.setViewport({ width: size.w, height: size.h });
  await p.goto(BASE + '?harness&seed=17', { waitUntil: 'networkidle0', timeout: 120000 });
  await p.waitForFunction(() => !!window.__slice);
  const r = await p.evaluate((W, H) => {
    const s = window.__slice; s.auto(false); s.reset(); s.begin();
    for (let i=0;i<120;i++) s.step(1/60, true);
    let minX=1e9, maxX=-1e9, minY=1e9, maxY=-1e9, off=0, n=0;
    s.forceInput = 1;
    for (let i=0;i<1800;i++) {           // 30秒 旋回しっぱなし
      s.step(1/60, true);
      const c = s._view().local(0,0,0);
      minX=Math.min(minX,c[0]); maxX=Math.max(maxX,c[0]);
      minY=Math.min(minY,c[1]); maxY=Math.max(maxY,c[1]);
      n++; if (c[0]<0||c[0]>W||c[1]<0||c[1]>H) off++;
    }
    s.forceInput = null;
    return { minX, maxX, minY, maxY, offPct: off/n*100 };
  }, size.w, size.h);
  console.log(`${size.n} (${size.w}x${size.h}) 30秒回しっぱなし`);
  console.log(`  自機の横位置 ${(r.minX/size.w*100).toFixed(0)}% 〜 ${(r.maxX/size.w*100).toFixed(0)}%`);
  console.log(`  自機の縦位置 ${(r.minY/size.h*100).toFixed(0)}% 〜 ${(r.maxY/size.h*100).toFixed(0)}%`);
  console.log(`  画面の外に出ていた時間 ${r.offPct.toFixed(1)}%  ${r.offPct<0.1?'PASS':'FAIL'}`);
  await b.close();
}
