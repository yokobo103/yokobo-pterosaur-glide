import puppeteer from 'puppeteer';
const b = await puppeteer.launch({ headless: true, protocolTimeout: 240000,
  args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844 });
await p.goto('http://localhost:8141/?harness&seed=17', { waitUntil: 'networkidle0' });
await p.waitForFunction(() => !!window.__slice);
await p.evaluate(() => { const s=window.__slice; s.auto(false); s.reset(); s.begin(); for(let i=0;i<120;i++) s.step(1/60,true); });
await p.screenshot({ path: 'screenshots/nose-0-まっすぐ.png' });
for (const [sec,name] of [[2,'nose-1-2秒'],[10,'nose-2-10秒'],[30,'nose-3-30秒']]) {
  await p.evaluate(s => { const g=window.__slice; g.forceInput=1; const n=Math.round(s*60); for(let i=0;i<n;i++) g.step(1/60,true); }, sec === 2 ? 2 : 8 + (sec===30?20:0));
  await p.screenshot({ path: `screenshots/${name}.png` });
}
await b.close(); console.log('撮った');
