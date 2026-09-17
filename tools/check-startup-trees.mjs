// 木あり・PCサイズを、まっさらなブラウザで開いたときの起動時間(遠景の画像づくりを含む)
import puppeteer from 'puppeteer';
const BASE = process.env.GLIDE_BASE || 'http://localhost:8141/';
for (const [w, h] of [[1280, 800], [390, 844]]) {
  const b = await puppeteer.launch({ headless: true, protocolTimeout: 300000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  await p.setViewport({ width: w, height: h });
  const t0 = Date.now();
  await p.goto(`${BASE}?harness&seed=17`, { waitUntil: 'load', timeout: 300000 });
  const tLoad = Date.now() - t0;
  await p.waitForFunction(() => window.__slice && window.__slice.forestReady(), { timeout: 300000 });
  console.log(`${w}x${h}: ページ読み込み ${(tLoad/1000).toFixed(1)}秒 / 木の準備(遠景の画像づくり込み)まで ${((Date.now()-t0)/1000).toFixed(1)}秒`);
  await b.close();
}
