// ポーズ: 指が当たる / 押しても曲がらない / 止まっている間は進まない / つづけると戻る /
//        ずかん・設定が開く / やり直し・タイトルへ / 画面を離れたら自動で止まる
import puppeteer from 'puppeteer';
const BASE = process.argv.includes('--public') ? 'https://yokobo103.github.io/yokobo-pterosaur-glide/' : (process.env.GLIDE_BASE || 'http://localhost:8141/');
const b = await puppeteer.launch({ headless: true, protocolTimeout: 600000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
let fails = 0; const check = (l, c) => { if (!c) fails++; console.log(`  ${l} ${c ? 'PASS' : 'FAIL'}`); };
const cdp = await p.createCDPSession();
const hidden = sel => p.$eval(sel, e => e.classList.contains('hidden'));
const tap = async sel => {
  await p.$eval(sel, e => e.scrollIntoView({ block: 'nearest' }));
  const r = await p.$eval(sel, e => { const q = e.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; });
  const hit = await p.evaluate(({ x, y }, s2) => {
    const e = document.querySelector(s2), at = document.elementFromPoint(x, y);
    return !!at && (at === e || e.contains(at));
  }, r, sel);
  if (!hit) { fails++; console.log(`  ${sel} が押せない FAIL`); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await new Promise(res => setTimeout(res, 220));
  return r;
};
const wait = ms => new Promise(r => setTimeout(r, ms));

await p.goto(`${BASE}?seed=17`, { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.modelReady(), { timeout: 90000 });
check('タイトルではとめるボタンを出さない', await hidden('#pauseBtn'));
await tap('#go');
await wait(600);
check('飛び始めるととめるボタンが出る', !(await hidden('#pauseBtn')));

// とめるボタンを押しても曲がらないこと(左右の操作はcanvasに直付け)
const bank0 = await p.evaluate(() => window.__slice.state().bank);
const at = await tap('#pauseBtn');
const st1 = await p.evaluate(() => window.__slice.state());
console.log(`  とめるボタン (${Math.round(at.x)},${Math.round(at.y)}) / 傾き ${bank0.toFixed(3)} -> ${st1.bank.toFixed(3)}`);
check('ポーズ画面が開く', !(await hidden('#pause')));
check('押しても曲がらない', Math.abs(st1.bank) < 0.02);
check('いまの距離と高さが出る', (await p.$eval('#pDist', e => e.textContent)) !== '' && (await p.$eval('#pAlt', e => e.textContent)) !== '');

// 止まっている間は進まない
await wait(1500);
const st2 = await p.evaluate(() => window.__slice.state());
console.log(`  1.5秒待つ: 距離 ${st1.dist.toFixed(1)}m -> ${st2.dist.toFixed(1)}m / 時計 ${st1.time.toFixed(2)} -> ${st2.time.toFixed(2)} / 高さ ${st1.z.toFixed(1)} -> ${st2.z.toFixed(1)}`);
check('止めている間は進まない', Math.abs(st2.dist - st1.dist) < 0.01 && Math.abs(st2.time - st1.time) < 0.01);
check('止めている間は落ちない', Math.abs(st2.z - st1.z) < 0.01);

// ずかん・設定はポーズの上に開き、閉じるとポーズに戻る
await tap('#pDexBtn');
check('ポーズからずかんが開く', !(await hidden('#dex')) && !(await hidden('#pause')));
await tap('#dexClose');
check('ずかんを閉じるとポーズに戻る', (await hidden('#dex')) && !(await hidden('#pause')));
await tap('#pSetBtn');
check('ポーズから設定が開く', !(await hidden('#settings')));
await tap('#setClose');
check('設定を閉じるとポーズに戻る', (await hidden('#settings')) && !(await hidden('#pause')));

// つづける
await tap('#resumeBtn');
check('ポーズ画面が閉じる', await hidden('#pause'));
await wait(900);
const st3 = await p.evaluate(() => window.__slice.state());
console.log(`  つづけたあと: 距離 ${st2.dist.toFixed(1)}m -> ${st3.dist.toFixed(1)}m / 傾き ${st3.bank.toFixed(3)}`);
check('つづけると進み出す', st3.dist > st2.dist);
check('再開した瞬間に曲がらない', Math.abs(st3.bank) < 0.05);

// 画面を離れたら自動で止まる
await p.evaluate(() => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
  document.dispatchEvent(new Event('visibilitychange', { bubbles: true }));
});
await wait(200);
check('画面を離れると自動で止まる', !(await hidden('#pause')));
await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); });

// やり直し
const before = await p.evaluate(() => window.__slice.state().dist);
await tap('#retryBtn');
await wait(400);
const afterRetry = await p.evaluate(() => window.__slice.state());
console.log(`  やり直し: 距離 ${before.toFixed(1)}m -> ${afterRetry.dist.toFixed(1)}m`);
check('やり直しで走行がはじめから', afterRetry.dist < before * 0.5 && afterRetry.time < 1 && (await hidden('#pause')) && !(await hidden('#pauseBtn')));
check('やり直しでは記録しない', (await p.evaluate(() => JSON.parse(localStorage.getItem('glide.records') || '[]'))).length === 0);

// タイトルへ
await tap('#pauseBtn');
await tap('#titleBtn');
await wait(400);
check('タイトルへ戻れる', !(await hidden('#start')) && (await hidden('#pauseBtn')) && (await hidden('#pause')));
check('タイトルでは記録しない', (await p.evaluate(() => JSON.parse(localStorage.getItem('glide.records') || '[]'))).length === 0);
await wait(1200);
check('タイトルの後ろでまた飛んでいる', (await p.evaluate(() => window.__slice.state().dist)) > 0);
check('エラーなし', errs.length === 0); if (errs.length) console.log(errs.slice(0, 3));
await b.close();
console.log(fails ? `${fails}件 FAIL` : '全件 PASS');
process.exit(fails ? 1 : 0);
