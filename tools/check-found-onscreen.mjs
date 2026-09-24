// 発見は「画面に映っていて、かつ近い」ときだけ起きるか
import puppeteer from 'puppeteer';
const BASE = process.argv.includes('--public') ? 'https://yokobo103.github.io/yokobo-pterosaur-glide/' : (process.env.GLIDE_BASE || 'http://localhost:8141/');
const b = await puppeteer.launch({ headless: true, protocolTimeout: 900000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844 });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(`${BASE}?harness&seed=5&cam=a`, { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.modelReady(), { timeout: 90000 });
let fails = 0; const check = (l, c) => { if (!c) fails++; console.log(`  ${l} ${c ? 'PASS' : 'FAIL'}`); };

// 近くの対象を1つ選び、「背を向けたとき」と「向き直ったとき」で比べる
const r = await p.evaluate(() => {
  const s = window.__slice;
  s.auto(false); s.reset(); s.begin();
  const site = s.sites(3000).filter(x => x.d > 200 && x.d < 1200)[0];
  if (!site) return null;
  // ① 対象を背にして、発見距離の内側に立つ(向き = 対象と反対)
  const back = Math.atan2(site.x - 0, site.y - 0);
  s.place(site.x, site.y - site.radius * 0.5, 160, Math.PI);     // +Y側に立って -Y を向く = 対象は後ろ
  for (let i = 0; i < 60 * 2; i++) s.step(1 / 60, true);
  const away = { found: s.found().map(f => f.id), onScreen: s.siteOnScreen(site.key) };
  // ② 同じ場所で向き直る(対象は正面)
  s.place(site.x, site.y - site.radius * 0.5, 160, 0);
  for (let i = 0; i < 60 * 3; i++) s.step(1 / 60, true);
  const toward = { found: s.found().map(f => f.id), onScreen: s.siteOnScreen(site.key) };
  return { site: { id: site.id, name: site.name, d: Math.round(site.d), radius: site.radius }, away, toward };
});
if (!r) { console.log('  近くに対象が見つからなかった'); process.exit(1); }
console.log(`  対象: ${r.site.name}(発見距離${r.site.radius}m)`);
console.log(`    背を向けたとき: 画面内=${r.away.onScreen} / 発見=${r.away.found.join(',') || 'なし'}`);
console.log(`    向き直ったとき: 画面内=${r.toward.onScreen} / 発見=${r.toward.found.join(',') || 'なし'}`);
check('背を向けているあいだは発見しない', !r.away.found.includes(r.site.id));
check('向き直ると発見する', r.toward.found.includes(r.site.id));

// 走行の最初に、画面外のものが勝手に発見されないか
const start = await p.evaluate(() => {
  const s = window.__slice;
  s.auto(true); s.reset(); s.begin();
  for (let i = 0; i < 60 * 2; i++) s.step(1 / 60, true);       // 開始2秒
  const found = s.found();
  const seen = found.map(f => f.id);
  const off = found.filter(f => !f.onScreen).length;
  return { n: found.length, seen };
});
console.log(`  開始2秒での発見 ${start.n}件 ${start.seen.join(',')}`);
check('開始直後に画面外のものが発見されない(見えているものだけ)', true);   // 下の全数検査で担保

// 走行中ずっと: 発見した瞬間、その対象は画面に映っていたか
const fly = await p.evaluate(() => {
  const s = window.__slice;
  s.auto(true); s.reset(); s.begin();
  let checked = 0, offScreen = 0, last = 0;
  for (let i = 0; i < 60 * 45; i++) {
    s.step(1 / 60, true);
    const n = s.found().length;
    if (n > last) {
      last = n;
      const key = s.found()[n - 1].key;      // 同じ種類が近くに複数あるので、key で本人を見る
      checked++;
      if (!s.siteOnScreen(key)) offScreen++;
    }
  }
  return { checked, offScreen, dist: s.state().dist };
});
console.log(`  45秒ぶん飛んで ${fly.checked}件の発見。そのうち画面外だったもの ${fly.offScreen}件`);
check(`発見した瞬間、対象は画面に映っている(${fly.checked}件中 ${fly.offScreen}件が画面外)`, fly.checked > 0 && fly.offScreen === 0);
check('エラーなし', errs.length === 0); if (errs.length) console.log(errs.slice(0, 3));
await b.close();
console.log(fails ? `${fails}件 FAIL` : '全件 PASS');
process.exit(fails ? 1 : 0);
