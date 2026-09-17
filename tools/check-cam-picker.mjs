// スタート画面のカメラ選択を、スマホの本物のタッチで確かめる。
import puppeteer from 'puppeteer';
const BASE = process.argv.includes('--public') ? 'https://yokobo103.github.io/yokobo-pterosaur-glide/' : (process.env.GLIDE_BASE || 'http://localhost:8141/');
const b = await puppeteer.launch({ headless: true, protocolTimeout: 240000,
  args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
const ok = c => c ? 'PASS' : 'FAIL';
let fails = 0; const check = (label, c) => { if (!c) fails++; console.log(`  ${label} ${ok(c)}`); };

await p.goto(BASE + '?seed=17', { waitUntil: 'networkidle0' });
await p.evaluate(() => { try { localStorage.removeItem('glide.cam'); } catch (e) {} });
await p.goto(BASE + '?seed=17', { waitUntil: 'networkidle0' });
await p.waitForFunction(() => !!window.__slice);
await p.screenshot({ path: 'screenshots/start-カメラ選択.png' });

const cdp = await p.createCDPSession();
async function tap(selector) {
  const r = await p.$eval(selector, e => { const b = e.getBoundingClientRect(); return { x: b.x + b.width/2, y: b.y + b.height/2 }; });
  // 指が本当にそのボタンに当たるか(上に何か被っていないか)
  const hit = await p.evaluate(({x, y}, sel) => document.elementFromPoint(x, y) === document.querySelector(sel), r, selector);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await new Promise(res => setTimeout(res, 150));
  return hit;
}

console.log('■ 初回');
check('何も選んでいなければ「水平キープ」', await p.evaluate(() => window.__slice.camKey()) === 'a');
console.log('■ 「見下ろし」をタップ');
check('指がボタンに当たる', await tap('#cams button[data-cam="c"]'));
check('カメラが見下ろしになる', await p.evaluate(() => window.__slice.camKey()) === 'c');
check('選んだボタンだけが選択表示', await p.evaluate(() =>
  [...document.querySelectorAll('#cams button')].map(b => b.getAttribute('aria-checked')).join() === 'false,true,false'));
console.log('■ 開き直す');
await p.reload({ waitUntil: 'networkidle0' });
await p.waitForFunction(() => !!window.__slice);
check('前回の「見下ろし」を覚えている', await p.evaluate(() => window.__slice.camKey()) === 'c');
console.log('■ 「少し傾く」をタップして、はじめる');
check('指がボタンに当たる', await tap('#cams button[data-cam="b"]'));
check('傾きの強さ 0.1', await p.evaluate(() => window.__slice.camRoll()) === 0.1);
check('「はじめる」に指が当たる', await tap('#go'));
check('スタート画面が閉じる', await p.$eval('#start', e => e.classList.contains('hidden')));
console.log('■ URLで指定したときはURLが優先');
await p.goto(BASE + '?seed=17&cam=a', { waitUntil: 'networkidle0' });
await p.waitForFunction(() => !!window.__slice);
check('?cam=a が効く', await p.evaluate(() => window.__slice.camKey()) === 'a');
await b.close();
console.log(fails ? `\n${fails}件 FAIL` : '\n全件 PASS');
process.exit(fails ? 1 : 0);
