import puppeteer from 'puppeteer';
const URL = 'https://yokobo103.github.io/yokobo-pterosaur-glide/';
const b = await puppeteer.launch({ headless: true, protocolTimeout: 240000,
  args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
const errs = [];
p.on('pageerror', e => errs.push('page: ' + e.message));
p.on('console', m => { if (m.type()==='error') errs.push('console: ' + m.text()); });
p.on('requestfailed', r => errs.push('req: ' + r.url()));
p.on('response', r => { if (r.status()===404) errs.push('404: ' + r.url()); });
await p.goto(URL + '?harness&seed=17', { waitUntil: 'networkidle0', timeout: 60000 });
await p.waitForFunction(() => !!window.__slice, { timeout: 30000 });
console.log('harnessの口 OK / seed =', await p.evaluate(() => window.__slice.seed));
// 通しで1走行
const r = await p.evaluate(() => { const s=window.__slice; s.auto(true); s.begin();
  let st, g=0; do { st = s.step(10,false); } while (st.alive && g++ < 200); return st; });
console.log(`1走行 ${(r.dist/1000).toFixed(2)}km / ${(r.time/60).toFixed(1)}分 (ローカルと同じなら8.51km/9.9分)`);
// 本物のタッチ
await p.evaluate(() => { window.__slice.auto(false); window.__slice.reset(); window.__slice.begin(); });  // 自動操縦を切ってから指で試す
const cdp = await p.createCDPSession();
await cdp.send('Input.dispatchTouchEvent', { type:'touchStart', touchPoints:[{x:300,y:600,id:1}] });
const t = await p.evaluate(() => { window.__slice.step(3,false); return window.__slice.state(); });
console.log(`右半分を指で押す -> 傾き ${(t.bank*57.3).toFixed(0)}度 ${t.bank>0.05?'PASS':'FAIL'}`);
// 見た目
await p.evaluate(() => { const s=window.__slice; s.reset(); s.auto(true); s.begin(); s.step(90,false); for(let i=0;i<12;i++) s.step(1/12,true); });
await p.screenshot({ path: 'screenshots/公開URL-スマホ.png' });
console.log('公開URLでの絵: screenshots/公開URL-スマホ.png');
console.log(errs.length ? 'エラー:\n  ' + errs.join('\n  ') : 'エラーなし');
await b.close();
