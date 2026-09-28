// ずかん: 出会っていないものは ???、出会ったら名前が出る / 数 / 覚えている / 英語 / 指が当たる
import puppeteer from 'puppeteer';
const BASE = process.argv.includes('--public') ? 'https://yokobo103.github.io/yokobo-pterosaur-glide/' : (process.env.GLIDE_BASE || 'http://localhost:8141/');
const b = await puppeteer.launch({ headless: true, protocolTimeout: 600000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
let fails = 0; const check = (l, c) => { if (!c) fails++; console.log(`  ${l} ${c ? 'PASS' : 'FAIL'}`); };
const cdp = await p.createCDPSession();
// 本物の指で押す。上に何か被っていたら落とす
const tap = async sel => {
  await p.$eval(sel, e => e.scrollIntoView({ block: 'nearest' }));
  const r = await p.$eval(sel, e => { const b2 = e.getBoundingClientRect(); return { x: b2.x + b2.width / 2, y: b2.y + b2.height / 2 }; });
  const hit = await p.evaluate(({ x, y }, s2) => {
    const e = document.querySelector(s2), at = document.elementFromPoint(x, y);
    return !!at && (at === e || e.contains(at));
  }, r, sel);
  if (!hit) { fails++; console.log(`  ${sel} が押せない FAIL`); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await new Promise(res => setTimeout(res, 200));
};
const dexState = () => p.evaluate(() => ({
  count: document.getElementById('dexCount').textContent,
  rows: [...document.querySelectorAll('#dexList li')].map(li => ({
    no: li.querySelector('i').textContent, name: li.querySelector('b').textContent, seen: li.className })),
}));

// ---- 何も出会っていない状態 ----
await p.goto(`${BASE}?seed=5`, { waitUntil: 'networkidle0', timeout: 120000 });
await p.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
await p.goto(`${BASE}?seed=5`, { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.modelReady(), { timeout: 90000 });
await tap('#dexBtn');
check('ずかんが開く', !(await p.$eval('#dex', e => e.classList.contains('hidden'))));
const empty = await dexState();
console.log(`  はじめ: ${empty.count} / ${empty.rows.length}件 / 先頭 ${empty.rows[0].no} ${empty.rows[0].name}`);
check('発見できるものの数だけ並ぶ', empty.rows.length >= 6);
check('番号が01から連番', empty.rows.map(r => r.no).join(',') === empty.rows.map((_, i) => String(i + 1).padStart(2, '0')).join(','));
check('出会っていないものは ???', empty.rows.every(r => r.name === '???' && r.seen === 'unseen'));
check('数は 0', /0 \/ \d+/.test(empty.count));
// スマホで下まで送れるか。最後の行が見えるところまでスクロールできること
const scroll = await p.evaluate(() => {
  const pn = document.querySelector('#dex .panel'), last = document.querySelector('#dexList li:last-child');
  pn.scrollTop = pn.scrollHeight;
  const r = last.getBoundingClientRect(), close = document.getElementById('dexClose').getBoundingClientRect();
  return { top: Math.round(pn.getBoundingClientRect().top), bottom: Math.round(pn.getBoundingClientRect().bottom),
           view: innerHeight, lastBottom: Math.round(r.bottom), closeTop: Math.round(close.top),
           hidden: Math.round(pn.scrollHeight - pn.clientHeight - pn.scrollTop) };
});
console.log(`  板 ${scroll.top}〜${scroll.bottom}px / 画面 ${scroll.view}px / 最後の行の下端 ${scroll.lastBottom} / 閉じるの上端 ${scroll.closeTop}`);
check('板が画面に収まっている', scroll.top >= 0 && scroll.bottom <= scroll.view);
check('一番下まで送れる', scroll.hidden <= 1);
check('最後の行が閉じるボタンに隠れない', scroll.lastBottom <= scroll.closeTop + 1);

await tap('#dexClose');
check('閉じられる', await p.$eval('#dex', e => e.classList.contains('hidden')));

// 背の低い画面(ブラウザの枠が出ているスマホ)でも、板が収まって下まで送れるか
await p.setViewport({ width: 360, height: 520, isMobile: true, hasTouch: true });
await new Promise(r => setTimeout(r, 300));
for (const [open, close, name] of [['#howtoBtn', '#howtoClose', '遊び方'], ['#dexBtn', '#dexClose', 'ずかん']]) {
  await tap(open);
  const m = await p.evaluate(sel => {
    const pn = document.querySelector(sel);
    pn.scrollTop = pn.scrollHeight;
    const r = pn.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), view: innerHeight,
             hidden: Math.round(pn.scrollHeight - pn.clientHeight - pn.scrollTop) };
  }, open === '#dexBtn' ? '#dex .panel' : '#howto .panel');
  console.log(`  ${name}(360x520): 板 ${m.top}〜${m.bottom}px / 画面 ${m.view}px / 送り残し ${m.hidden}px`);
  check(`${name}が背の低い画面に収まる`, m.top >= 0 && m.bottom <= m.view + 1);
  check(`${name}を一番下まで送れる`, m.hidden <= 1);
  await tap(close);
}
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await new Promise(r => setTimeout(r, 300));

// ---- 1つ出会う(ブラキオサウルスのそばを低く通る) ----
await p.goto(`${BASE}?harness&seed=5&cam=a`, { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.modelReady(), { timeout: 90000 });
const got = await p.evaluate(() => {
  const s = window.__slice; s.auto(false); s.reset(); s.begin(); s.place(0, 500, 60, 0);
  for (let i = 0; i < 60 * 6; i++) s.step(1 / 60, true);
  return s.found().map(f => f.id);
});
console.log(`  出会ったもの: ${got.join(',') || 'なし'}`);
check('1つ以上出会えた', got.length > 0);
await p.goto(`${BASE}?seed=5`, { waitUntil: 'networkidle0', timeout: 120000 });   // 開き直しても覚えているか
await p.waitForFunction(() => window.__slice && window.__slice.modelReady(), { timeout: 90000 });
await tap('#dexBtn');
const after = await dexState();
const seen = after.rows.filter(r => r.seen === 'seen');
console.log(`  開き直したあと: ${after.count} / 出た名前 ${seen.map(r => r.no + ' ' + r.name).join(' / ')}`);
check('出会ったものが名前で出る', seen.length === got.length && seen.every(r => r.name !== '???'));
check('数が増える', after.count.includes(`${got.length} / ${after.rows.length}`));
check('残りは ???のまま', after.rows.filter(r => r.seen === 'unseen').every(r => r.name === '???'));

const shots = [{ label: '日本語', img: await p.screenshot({ encoding: 'base64' }) }];

// ---- 英語 ----
await tap('#lang button[data-lang="en"]');
const en = await dexState();
const enTitle = await p.evaluate(() => document.getElementById('dexTitle').textContent);
console.log(`  英語: "${enTitle}" / ${en.count} / ${en.rows.filter(r => r.seen === 'seen').map(r => r.name).join(',')}`);
check('ずかんも英語になる', /Seen \d+ \/ \d+/.test(en.count) && en.rows.filter(r => r.seen === 'seen').every(r => !/[ぁ-んァ-ヶ一-龠]/.test(r.name)));
check('エラーなし', errs.length === 0); if (errs.length) console.log(errs.slice(0, 3));
shots.push({ label: 'English', img: await p.screenshot({ encoding: 'base64' }) });
const sh = await b.newPage(); await sh.setViewport({ width: 900, height: 950 });
await sh.setContent(`<meta charset="utf-8"><style>body{margin:0;padding:12px;background:#14181e;color:#e8eef7;font-family:system-ui}
.row{display:flex;gap:10px}figure{margin:0;flex:1}img{width:100%;border-radius:6px;display:block}figcaption{font-size:11px;text-align:center;opacity:.85;padding-top:4px}</style>
<div class="row">${shots.map(x => `<figure><img src="data:image/png;base64,${x.img}"><figcaption>${x.label}</figcaption></figure>`).join('')}</div>`, { waitUntil: 'networkidle0' });
await sh.screenshot({ path: 'screenshots/_ずかん.png', fullPage: true });
await b.close();
console.log(fails ? `${fails}件 FAIL` : '全件 PASS');
process.exit(fails ? 1 : 0);
