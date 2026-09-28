// 記録とランキング: 走行の終わりの板 -> ランキング画面(この端末/世界) / 名前 / 並び順 / 消えないこと / 英語
import puppeteer from 'puppeteer';
const BASE = process.argv.includes('--public') ? 'https://yokobo103.github.io/yokobo-pterosaur-glide/' : (process.env.GLIDE_BASE || 'http://localhost:8141/');
const b = await puppeteer.launch({ headless: true, protocolTimeout: 600000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844 });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(`${BASE}?harness&seed=5&cam=a`, { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.modelReady(), { timeout: 90000 });
await p.evaluate(() => { try { localStorage.clear(); } catch (e) {} localStorage.setItem('glide.lang', 'ja'); });
await p.reload({ waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.modelReady(), { timeout: 90000 });
let fails = 0; const check = (l, c) => { if (!c) fails++; console.log(`  ${l} ${c ? 'PASS' : 'FAIL'}`); };
const hidden = id => p.evaluate(i => document.getElementById(i).classList.contains('hidden'), id);
// 押せることまで見る(pointer-events を素通りしない)
const tap = async sel => {
  const s2 = sel.startsWith('#') || sel.includes(' ') ? sel : `#${sel}`;
  const ok = await p.evaluate(x => {
    const e = document.querySelector(x); if (!e) return false;
    const r = e.getBoundingClientRect();
    const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !!at && (at === e || e.contains(at));      // ボタンの中の字や絵に当たるのはよい
  }, s2);
  if (!ok) { fails++; console.log(`  ${s2} が押せない FAIL`); }
  await p.click(s2);
};

// 1走行を終わらせる(地面すれすれに置いて着地させる)
const land = async (y = 500) => {
  const st = await p.evaluate(yy => {
    const s = window.__slice; s.auto(false); s.reset(); s.begin(); s.place(0, yy, 3, 0);
    for (let i = 0; i < 60 * 20 && !s.state().ended; i++) s.step(1 / 60, true);   // 降りるまで進める
    return s.state();
  }, y);
  if (!st.ended) { fails++; console.log(`  降りられなかった(高さ${st.agl.toFixed(1)}m) FAIL`); }
  await p.waitForFunction(() => !document.getElementById('msg').classList.contains('hidden'), { timeout: 20000, polling: 100 });
};

await land();
const end = await p.evaluate(() => ({
  title: document.getElementById('msgTitle').textContent,
  list: document.getElementById('foundList').textContent.trim(),
  again: document.getElementById('againBtn').textContent,
  rank: document.getElementById('rankBtn').textContent,
}));
console.log(`  走行の終わり: "${end.title}" / 発見 "${end.list}" / ボタン "${end.again}" "${end.rank}"`);
check('終わりの板に距離と発見が出る', /km/.test(end.title) && end.list.length > 0);
check('ランキングはボタンの中(最初は出ていない)', await hidden('rank'));

await tap('rankBtn');
const opened = await p.evaluate(() => ({
  head: document.getElementById('rankHead').textContent,
  mine: document.getElementById('tabMine').getAttribute('aria-selected'),
  list: document.getElementById('rankList').textContent.trim(),
  season: document.getElementById('seasonTag').textContent,
  name: !document.getElementById('rankName').classList.contains('hidden'),
}));
console.log(`  ランキング: "${opened.head}" / 一覧 "${opened.list}" / ${opened.season}`);
check('ランキングが開く(この端末のタブ)', !(await hidden('rank')) && opened.mine === 'true');
check('まだ記録が無いと分かる', /まだ記録/.test(opened.list));
check('シーズンが出る', /s\d/.test(opened.season));
check('名前の欄が出る', opened.name);

// 世界のタブ: サーバーが無いうちは「開いていません」と出るだけ(黙って空にしない)
await tap('tabWorld');
await new Promise(r => setTimeout(r, 200));
const world = await p.evaluate(() => ({ head: document.getElementById('rankHead').textContent, list: document.getElementById('rankList').textContent.trim(), name: !document.getElementById('rankName').classList.contains('hidden') }));
console.log(`  世界のタブ: "${world.head}" / "${world.list}"`);
check('世界のタブは状態を言う', /つながって/.test(world.list));
check('世界のタブでは名前の欄を出さない', !world.name);
await tap('tabMine');

// 名前を打って記録する(本物のキー入力で)
await p.click('#nameIn');
await p.type('#nameIn', 'よこぼ');
await p.keyboard.press('r');                       // 打っている最中の R でやり直しにならないこと
await new Promise(r => setTimeout(r, 300));
check('名前を打っている間の R でやり直しにならない', !(await hidden('msg')));
await tap('nameGo');
const after = await p.evaluate(() => ({
  list: [...document.querySelectorAll('#rankList li')].map(li => li.textContent),
  me: document.querySelectorAll('#rankList li.me').length,
  stored: JSON.parse(localStorage.getItem('glide.records') || '[]'),
  name: localStorage.getItem('glide.name'),
  nameBox: !document.getElementById('rankName').classList.contains('hidden'),
}));
console.log(`  記録したあと: ${JSON.stringify(after.list)} / 覚えた名前 "${after.name}"`);
check('記録が1件保存される', after.stored.length === 1 && after.stored[0].name.includes('よこぼ'));
check('自分の行に印が付く', after.me === 1);
check('名前を覚えている', (after.name || '').includes('よこぼ'));
check('二重に記録できない', !after.nameBox);
await tap('rankClose');
check('閉じられる', await hidden('rank'));

// 2走行目: 名前を付けずに「もう一度」でも記録は消えない
await land(3000);
await tap('againBtn');
const kept = await p.evaluate(() => JSON.parse(localStorage.getItem('glide.records') || '[]'));
console.log(`  ${kept.length}件: ${kept.map(r => r.name + ' ' + r.km.toFixed(2) + 'km').join(' / ')}`);
check('名前を付けずに次へ行っても記録は残る', kept.length === 2 && kept.every(r => r.name.includes('よこぼ')));
check('距離の大きい順に並ぶ', kept[0].km >= kept[1].km);

// 英語(発見が1つ出る走り方にして、名前と説明まで英語になることを見る)
await land(500);
await tap('#lang button[data-lang="en"]');
await tap('rankBtn');
const en = await p.evaluate(() => ({
  head: document.getElementById('rankHead').textContent,
  again: document.getElementById('againBtn').textContent,
  found: document.getElementById('foundList').textContent.trim(),
  world: document.getElementById('tabWorld').textContent,
  lang: document.documentElement.lang,
  title: document.title,
}));
console.log(`  英語: "${en.head}" / "${en.again}" / <html lang=${en.lang}> / "${en.title}"`);
console.log(`  英語の発見: "${en.found.slice(0, 90)}"`);
check('英語に切り替わる', en.lang === 'en' && /Records/.test(en.head) && en.again === 'Fly again' && en.title === 'Pterosaur Glider');
check('発見の名前と説明も英語になる', en.found.length > 20 && !/[ぁ-んァ-ヶ一-龠]/.test(en.found));
// 上位3つの見え方(記録を4件そろえてから測る)
await p.evaluate(() => {
  localStorage.setItem('glide.lang', 'ja');
  localStorage.setItem('glide.records', JSON.stringify([
    { name: 'よこぼ', km: 11.42, found: 9, at: 1 }, { name: 'たろう', km: 8.03, found: 5, at: 2 },
    { name: 'はなこ', km: 6.55, found: 4, at: 3 }, { name: 'ななし', km: 4.10, found: 2, at: 4 },
  ]));
});
await p.reload({ waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.modelReady(), { timeout: 90000 });
await land(500);
await tap('rankBtn');
// 上位3つが目立っているか(色と大きさを測る)
const podium = await p.evaluate(() => {
  const rows = [...document.querySelectorAll('#rankList li')];
  return rows.map(li => {
    const i = li.querySelector('i'), b = li.querySelector('b');
    const cs = getComputedStyle(i);
    return { cls: li.className, medal: cs.backgroundColor, w: i.getBoundingClientRect().width,
             name: b ? +getComputedStyle(b).fontSize.replace('px', '') : 0 };
  });
});
console.log(`  行: ${podium.map(r => `${r.cls || '-'}/${r.medal}/名前${r.name}px`).join(' | ')}`);
const painted = c => c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent';
check('1〜3位に金銀銅の丸が付く', podium.slice(0, 3).every(r => painted(r.medal) && r.w > 14) &&
      new Set(podium.slice(0, 3).map(r => r.medal)).size === 3);
check('4位以下には付かない', podium.slice(3).every(r => !painted(r.medal)));
if (podium.length > 3) check('1位は名前が大きい', podium[0].name > podium[3].name);


check('エラーなし', errs.length === 0); if (errs.length) console.log(errs.slice(0, 3));
await b.close();
console.log(fails ? `${fails}件 FAIL` : '全件 PASS');
process.exit(fails ? 1 : 0);
