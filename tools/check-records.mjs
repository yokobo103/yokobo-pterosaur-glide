// キョリの記録: 走行のあとに名前をつけて残せるか、並び順・持ち越し・打っている間の誤操作
import puppeteer from 'puppeteer';
const BASE = process.argv.includes('--public') ? 'https://yokobo103.github.io/yokobo-pterosaur-glide/' : (process.env.GLIDE_BASE || 'http://localhost:8141/');
const b = await puppeteer.launch({ headless: true, protocolTimeout: 600000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844 });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(`${BASE}?harness&seed=5&cam=a`, { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.modelReady(), { timeout: 90000 });
await p.evaluate(() => { try { localStorage.removeItem('glide.records'); localStorage.removeItem('glide.name'); } catch (e) {} });
let fails = 0; const check = (l, c) => { if (!c) fails++; console.log(`  ${l} ${c ? 'PASS' : 'FAIL'}`); };

// 1走行を終わらせる(地面すれすれに置いて着地させる)
const land = async () => {
  await p.evaluate(() => {
    const s = window.__slice; s.auto(false); s.reset(); s.begin();
    s.place(0, 500, 3, 0);
    for (let i = 0; i < 60 * 8; i++) s.step(1 / 60, true);
  });
  await p.waitForFunction(() => !document.getElementById('msg').classList.contains('hidden'), { timeout: 20000 });
};

await land();
const shown = await p.evaluate(() => ({
  msg: document.getElementById('msgTitle').textContent,
  rec: document.getElementById('recList').textContent,
  canType: !document.getElementById('nameIn').disabled,
}));
console.log(`  走行の終わり: 記録 "${shown.msg}" / 一覧 "${shown.rec.trim()}" / 名前を打てる ${shown.canType}`);
check('終わったら名前を打てる状態になる', shown.canType);

// 名前を打って記録する(本物のキー入力で)
await p.click('#nameIn');
await p.type('#nameIn', 'よこぼ');
const beforeReset = await p.evaluate(() => window.__slice.state().dist);
await p.keyboard.press('r');                       // 打っている最中の R でやり直しにならないこと
await new Promise(r => setTimeout(r, 300));
const afterR = await p.evaluate(() => ({ dist: window.__slice.state().dist, hidden: document.getElementById('msg').classList.contains('hidden') }));
check('名前を打っている間の R でやり直しにならない', !afterR.hidden);
await p.click('#nameGo');
const after = await p.evaluate(() => ({
  list: [...document.querySelectorAll('#recList li')].map(li => li.textContent),
  stored: JSON.parse(localStorage.getItem('glide.records') || '[]'),
  name: localStorage.getItem('glide.name'),
  btn: document.getElementById('nameGo').textContent,
}));
console.log(`  記録したあと: ${JSON.stringify(after.list)} / 覚えた名前 "${after.name}"`);
check('記録が1件保存される', after.stored.length === 1 && after.stored[0].name.includes('よこぼ'));
check('名前を覚えている', (after.name || '').includes('よこぼ'));
check('二重に記録できない', after.btn === '記録した');

// 2走行目: 名前が入った状態で出る / 並び順は距離の大きい順
await p.evaluate(() => { const s = window.__slice; s.reset(); s.begin(); s.place(0, 500, 400, 0); for (let i = 0; i < 60 * 30; i++) s.step(1 / 60, true); });
await p.evaluate(() => { const s = window.__slice; s.place(0, 3000, 3, 0); for (let i = 0; i < 60 * 8; i++) s.step(1 / 60, true); });
await p.waitForFunction(() => !document.getElementById('msg').classList.contains('hidden'), { timeout: 20000 });
const second = await p.evaluate(() => ({ value: document.getElementById('nameIn').value, can: !document.getElementById('nameIn').disabled }));
check(`2回目は名前が入っている("${second.value}")`, second.value.includes('よこぼ') && second.can);
await p.click('#nameGo');
const two = await p.evaluate(() => JSON.parse(localStorage.getItem('glide.records') || '[]'));
console.log(`  2件: ${two.map(r => r.name + ' ' + r.km.toFixed(2) + 'km').join(' / ')}`);
check('2件目も保存される', two.length === 2);
check('距離の大きい順に並ぶ', two[0].km >= two[1].km);
check('エラーなし', errs.length === 0); if (errs.length) console.log(errs.slice(0, 3));
await b.close();
console.log(fails ? `${fails}件 FAIL` : '全件 PASS');
process.exit(fails ? 1 : 0);
