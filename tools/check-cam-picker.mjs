// スタート画面のカメラ選択を、スマホの本物のタッチで確かめる。
import puppeteer from 'puppeteer';
const BASE = process.argv.includes('--public') ? 'https://yokobo103.github.io/yokobo-pterosaur-glide/' : (process.env.GLIDE_BASE || 'http://localhost:8141/');
const b = await puppeteer.launch({ headless: true, protocolTimeout: 240000,
  args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
const ok = c => c ? 'PASS' : 'FAIL';
let fails = 0; const check = (label, c) => { if (!c) fails++; console.log(`  ${label} ${ok(c)}`); };

await p.goto(BASE + '?seed=17', { waitUntil: 'networkidle0', timeout: 120000 });
await p.evaluate(() => { try { localStorage.removeItem('glide.cam'); } catch (e) {} });
await p.goto(BASE + '?seed=17', { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => !!window.__slice);
await p.screenshot({ path: 'screenshots/start-カメラ選択.png' });

const cdp = await p.createCDPSession();
async function tap(selector) {
  const r = await p.$eval(selector, e => { const b = e.getBoundingClientRect(); return { x: b.x + b.width/2, y: b.y + b.height/2 }; });
  // 指が本当にそのボタンに当たるか(上に何か被っていないか)
  // ボタンの中に字や絵が入っていてもよい(押せば効く)。上に別のものが被っていないかを見る
  const hit = await p.evaluate(({x, y}, sel) => {
    const target = document.querySelector(sel), at = document.elementFromPoint(x, y);
    return !!at && (at === target || target.contains(at));
  }, r, selector);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await new Promise(res => setTimeout(res, 150));
  return hit;
}

console.log('■ 初回');
check('何も選んでいなければ「水平キープ」', await p.evaluate(() => window.__slice.camKey()) === 'a');
console.log('■ 設定を開いて「見下ろし」をタップ');
check('設定のボタンに指が当たる', await tap('#setBtn'));
check('設定が開く', !(await p.$eval('#settings', e => e.classList.contains('hidden'))));
check('指がボタンに当たる', await tap('#cams button[data-cam="c"]'));
check('カメラが見下ろしになる', await p.evaluate(() => window.__slice.camKey()) === 'c');
check('選んだボタンだけが選択表示', await p.evaluate(() =>
  [...document.querySelectorAll('#cams button')].map(b => b.getAttribute('aria-checked')).join() === 'false,true,false'));
console.log('■ 開き直す');
await p.reload({ waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => !!window.__slice);
check('前回の「見下ろし」を覚えている', await p.evaluate(() => window.__slice.camKey()) === 'c');
console.log('■ 設定を開いて「少し傾く」をタップして、はじめる');
await tap('#setBtn');
check('指がボタンに当たる', await tap('#cams button[data-cam="b"]'));
check('傾きの強さ 0.1', await p.evaluate(() => window.__slice.camRoll()) === 0.1);
check('設定を閉じられる', await tap('#setClose') && (await p.$eval('#settings', e => e.classList.contains('hidden'))));
console.log('■ 遊び方');
check('遊び方に指が当たる', await tap('#howtoBtn'));
check('操作の説明が出ている', (await p.$eval('#intro', e => e.textContent)).length > 40);
check('遊び方を閉じられる', await tap('#howtoClose') && (await p.$eval('#howto', e => e.classList.contains('hidden'))));
check('「はじめる」に指が当たる', await tap('#go'));
check('スタート画面が閉じる', await p.$eval('#start', e => e.classList.contains('hidden')));
console.log('■ 言語の切り替え(タイトルの右上)');
await p.goto(BASE + '?seed=17', { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => !!window.__slice);
check('EN に指が当たる', await tap('#lang button[data-lang="en"]'));
const en = await p.evaluate(() => ({ lang: document.documentElement.lang, title: document.getElementById('title').textContent, go: document.getElementById('goLabel').textContent }));
console.log(`  EN を押したあと: <html lang=${en.lang}> "${en.title}" / "${en.go}"`);
check('英語になる', en.lang === 'en' && en.title === 'Pterosaur Glider' && en.go === 'Start');
check('日本語 に指が当たる', await tap('#lang button[data-lang="ja"]'));
check('日本語に戻る', await p.evaluate(() => document.documentElement.lang) === 'ja');

console.log('■ URLで指定したときはURLが優先');
await p.goto(BASE + '?seed=17&cam=a', { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => !!window.__slice);
check('?cam=a が効く', await p.evaluate(() => window.__slice.camKey()) === 'a');
await b.close();
console.log(fails ? `\n${fails}件 FAIL` : '\n全件 PASS');
process.exit(fails ? 1 : 0);
