// さわって覚える(タイトル): はじめての人に案内が出る / 左右を押しっぱなしにすると後ろの翼竜が曲がる /
// 左右とも試したら「はじめる」へ誘う / 次からは出ない / ボタンは押せたまま
// 本物のタッチ(CDP)で、スマホの画面で回す
import puppeteer from 'puppeteer';
const BASE = process.argv.includes('--public') ? 'https://yokobo103.github.io/yokobo-pterosaur-glide/' : (process.env.GLIDE_BASE || 'http://localhost:8141/');
const b = await puppeteer.launch({ headless: true, protocolTimeout: 600000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
let fails = 0; const check = (l, c) => { if (!c) fails++; console.log(`  ${l} ${c ? 'PASS' : 'FAIL'}`); };
const cdp = await p.createCDPSession();
const wait = ms => new Promise(r => setTimeout(r, ms));
const tut = () => p.evaluate(() => window.__slice.tutorial());
// 画面のその点に指を置いたまま ms ミリ秒。置いている間の傾きと、左右の印の光り方を拾う
const hold = async (x, y, ms) => {
  const hit = await p.evaluate(({ x, y }) => { const e = document.elementFromPoint(x, y); return e ? (e.id || e.tagName) : null; }, { x, y });
  const b0 = await p.evaluate(() => window.__slice.state().bank);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await wait(ms * 0.5);
  const lit = await p.evaluate(() => ({ onL: document.getElementById('tryL').classList.contains('on'), onR: document.getElementById('tryR').classList.contains('on') }));
  await wait(ms * 0.4);
  const b1 = await p.evaluate(() => window.__slice.state().bank);
  await wait(ms * 0.1);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wait(250);
  // 傾きは遅れて追いかけるので、押している間にどちらへ動いたかで向きを見る
  return { hit, bank: b1, dBank: b1 - b0, ...lit };
};
// 押した側へ曲がっているか。もとから同じ側にいっぱいまで傾いていると動く余地が無いので、
// 「押している側にしっかり傾いている」か「押した側へ動いた」のどちらかで見る
const turned = (h, want) => (Math.sign(h.bank) === want && Math.abs(h.bank) > 0.3) || (Math.sign(h.dBank) === want && Math.abs(h.dBank) > 0.05);
const tap = async sel => {
  const r = await p.$eval(sel, e => { const q = e.getBoundingClientRect(); return { x: q.x + q.width / 2, y: q.y + q.height / 2 }; });
  const ok = await p.evaluate(({ x, y }, s2) => { const e = document.querySelector(s2), at = document.elementFromPoint(x, y); return !!at && (at === e || e.contains(at)); }, r, sel);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await wait(250);
  return ok;
};

await p.goto(`${BASE}?seed=17`, { waitUntil: 'networkidle0', timeout: 120000 });
await p.evaluate(() => { try { localStorage.clear(); localStorage.setItem('glide.lang', 'ja'); } catch (e) {} });
await p.reload({ waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.modelReady(), { timeout: 90000 });
await wait(1500);

const t0 = await tut();
console.log(`  はじめて: 「${t0.text}」`);
check('はじめての人に案内が出る', t0.shown && /さわって/.test(t0.text));

// キーの ← で曲がる向きを先に測る(左右の取り違えを、画面の上の符号どうしで比べるため)
await p.keyboard.down('ArrowLeft'); await wait(500);
const keyBank = await p.evaluate(() => window.__slice.state().bank);
await p.keyboard.up('ArrowLeft'); await wait(1200);
// キーで片側が「できた」になっているので、指の検査のために覚えをまっさらに戻す
await p.evaluate(() => { try { localStorage.clear(); localStorage.setItem('glide.lang', 'ja'); } catch (e) {} });
await p.reload({ waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.modelReady(), { timeout: 90000 });
await wait(1500);

// 左半分を押しっぱなし(題とボタンの間、何も無い所)
const L = await hold(70, 470, 900);
const t1 = await tut();
console.log(`  左を押した: 指が当たったもの ${L.hit} / 傾き ${L.bank.toFixed(3)}・動き ${L.dBank.toFixed(3)}(キーの←では ${keyBank.toFixed(3)}) / 印 左${L.onL ? '光' : '-'} 右${L.onR ? '光' : '-'} / 「${t1.text}」`);
check('タイトルの上でも指は後ろの世界に届く', L.hit === 'CANVAS' || L.hit === 'canvas');
check('左を押すと、キーの←と同じ向きに曲がる', turned(L, Math.sign(keyBank)));
check('押している側の印が光る', L.onL && !L.onR);
check('左ができたら次は右へ', t1.doneL && !t1.doneR && /右も/.test(t1.text));

const R = await hold(320, 470, 900);
const t2 = await tut();
console.log(`  右を押した: 傾き ${R.bank.toFixed(3)}・動き ${R.dBank.toFixed(3)} / 印 左${R.onL ? '光' : '-'} 右${R.onR ? '光' : '-'} / 「${t2.text}」`);
check('右を押すと反対に曲がる', turned(R, -Math.sign(keyBank)));
check('左右ともできたら「はじめる」へ誘う', t2.doneL && t2.doneR && /はじめる/.test(t2.text));
check('「はじめる」が脈打つ', await p.$eval('#go', e => e.classList.contains('pulse')));
check('できたことを覚える', await p.evaluate(() => localStorage.getItem('glide.tut') === '1'));

// 離したら自動操縦に戻る(タイトルの後ろで落ちない)
await wait(4000);
const after = await p.evaluate(() => window.__slice.state());
check('離すと自動操縦に戻って飛び続ける', after.alive && after.agl > 50);

// ボタンは押せたまま
check('「はじめる」に指が当たる', await tap('#go'));
check('はじめると走行が始まる', await p.$eval('#start', e => e.classList.contains('hidden')));

// 2回目は出ない
await p.reload({ waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.modelReady(), { timeout: 90000 });
await wait(800);
check('2回目からは案内を出さない', !(await tut()).shown);
const L2 = await hold(70, 470, 700);
check('案内が無くても、タイトルで左右を押せば曲がる', turned(L2, Math.sign(keyBank)));

// 英語
await p.evaluate(() => { localStorage.removeItem('glide.tut'); localStorage.setItem('glide.lang', 'en'); });
await p.reload({ waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.modelReady(), { timeout: 90000 });
await wait(800);
const en = await tut();
console.log(`  英語: 「${en.text}」`);
check('英語でも出る', en.shown && /Try it/.test(en.text));
await p.screenshot({ path: 'screenshots/_さわって覚える.png' });
check('エラーなし', errs.length === 0); if (errs.length) console.log(errs.slice(0, 3));
await b.close();
console.log(fails ? `${fails}件 FAIL` : '全件 PASS');
process.exit(fails ? 1 : 0);
