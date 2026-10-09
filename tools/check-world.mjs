// 世界ランキング(ゲーム側): 名を残すと世界へ送る / 世界のタブに載って自分の行に印 / 順位が出る /
// 名前を付けずに次へ行った「ななし」は送らない / 受付が落ちていても遊べる。
// 本物の受付(Cloudflare)は汚さないよう、手元に同じ形の偽の受付を立てて ?worldapi= で向ける。
// (受付そのものの守り — 連投・よそのページ・ありえない距離 — は server/ を curl で確かめた)
import http from 'node:http';
import puppeteer from 'puppeteer';
const BASE = process.env.GLIDE_BASE || 'http://localhost:8141/';
const PORT = 8151;
const got = [];                                   // 偽の受付が受け取った走行
let down = false;                                 // true のあいだは受付が落ちている
const srv = http.createServer((req, res) => {
  const h = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'content-type': 'application/json' };
  if (req.method === 'OPTIONS') { res.writeHead(204, h); return res.end(); }
  if (down) { res.writeHead(503, h); return res.end('{}'); }
  if (req.method === 'POST' && req.url === '/submit') {
    let body = ''; req.on('data', d => body += d); req.on('end', () => {
      const b = JSON.parse(body); got.push(b);
      const rows = [...got].sort((a, c) => c.km - a.km);
      res.writeHead(200, h); res.end(JSON.stringify({ ok: true, id: got.length, rank: rows.indexOf(b) + 1, total: rows.length }));
    });
    return;
  }
  if (req.method === 'GET' && req.url.startsWith('/top')) {
    const others = [{ name: 'ほかの人', km: 9.5, found: 4, at: 1 }, { name: 'だれか', km: 0.2, found: 0, at: 2 }];
    const rows = [...others, ...got].sort((a, c) => c.km - a.km).map((r, i) => ({ id: i + 1, name: r.name, km: r.km, found: r.found, at: r.at }));
    res.writeHead(200, h); return res.end(JSON.stringify({ rows, total: rows.length }));
  }
  res.writeHead(404, h); res.end('{}');
});
await new Promise(r => srv.listen(PORT, '127.0.0.1', r));

const b = await puppeteer.launch({ headless: true, protocolTimeout: 600000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844 });
const errs = []; p.on('pageerror', e => errs.push(e.message));
p.on('console', m => { if (m.type() === 'error' && !/503|Failed to load resource/.test(m.text())) errs.push(m.text()); });
let fails = 0; const check = (l, c) => { if (!c) fails++; console.log(`  ${l} ${c ? 'PASS' : 'FAIL'}`); };
const wait = ms => new Promise(r => setTimeout(r, ms));
const land = async y => {
  await p.evaluate(yy => { const s = window.__slice; s.auto(false); s.reset(); s.begin(); s.place(0, yy, 3, 0);
    for (let i = 0; i < 60 * 20 && !s.state().ended; i++) s.step(1 / 60, true); }, y);
  await p.waitForFunction(() => !document.getElementById('msg').classList.contains('hidden'), { timeout: 30000, polling: 100 });
};
const listText = () => p.evaluate(() => ({
  rows: [...document.querySelectorAll('#rankList li')].map(li => ({ text: li.textContent, me: li.classList.contains('me') })),
  foot: document.getElementById('seasonTag').textContent,
}));

await p.goto(`${BASE}?harness&seed=5&cam=a&worldapi=http://127.0.0.1:${PORT}`, { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.modelReady(), { timeout: 90000 });
await p.evaluate(() => { localStorage.clear(); localStorage.setItem('glide.lang', 'ja'); });

// 1. 名を残すと世界へ送る
await land(3000);
await p.click('#rankBtn');
await p.click('#nameIn'); await p.type('#nameIn', 'よこぼ');
await p.click('#nameGo');
await p.waitForFunction(() => /世界/.test(document.getElementById('seasonTag').textContent), { timeout: 15000, polling: 100 }).catch(() => {});
console.log(`  送られたもの: ${JSON.stringify(got[0] || null)}`);
check('名を残すと世界へ送る', got.length === 1 && got[0].name === 'よこぼ' && got[0].season === 's1' && got[0].km > 0 && typeof got[0].at === 'number');
const after = await listText();
console.log(`  この端末のタブの下: 「${after.foot}」`);
check('世界での順位が出る', /世界 \d+位 \/ \d+件/.test(after.foot));

// 2. 世界のタブに載り、自分の行に印
await p.click('#tabWorld');
await p.waitForFunction(() => document.querySelectorAll('#rankList li').length >= 3, { timeout: 15000, polling: 100 });
const w = await listText();
console.log(`  世界のタブ: ${w.rows.map(r => (r.me ? '★' : '') + r.text).join(' | ')}`);
check('世界のタブに全員ぶん並ぶ(距離順)', w.rows.length === 3 && /ほかの人/.test(w.rows[0].text));
check('自分の行に印が付く', w.rows.filter(r => r.me).length === 1 && /よこぼ/.test(w.rows.find(r => r.me).text));

// 3. 名前を付けずに次へ行った「ななし」は送らない
// 一度も名乗っていない人として開き直す(名前の覚えはメモリにも残っているので、開き直さないと試せない)
await p.evaluate(() => { localStorage.removeItem('glide.name'); localStorage.removeItem('glide.records'); });
await p.goto(`${BASE}?harness&seed=5&cam=a&worldapi=http://127.0.0.1:${PORT}`, { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.modelReady(), { timeout: 90000 });
await land(6000);
await p.click('#againBtn');                                             // 名前を付けずにもう一度
await wait(1500);
check('名前を付けずに次へ行った走行は世界へ送らない', got.length === 1);

// 4. 受付が落ちていても遊べる
down = true;
await land(9000);
await p.click('#rankBtn');
await p.evaluate(() => { document.getElementById('nameIn').value = ''; });   // 前の名前が入っているので消してから打つ
await p.click('#nameIn'); await p.type('#nameIn', 'てすと');
await p.click('#nameGo');
await wait(1500);
await p.click('#tabWorld');
await wait(1500);
const off = await listText();
console.log(`  受付が落ちているとき: 「${off.rows.map(r => r.text).join(' | ')}」`);
check('受付が落ちていると「つながらなかった」と出る', /つながらなかった/.test(off.rows[0]?.text || ''));
check('受付が落ちていても、この端末には残る', await p.evaluate(() => JSON.parse(localStorage.getItem('glide.records')).some(r => r.name === 'てすと')));
check('エラーなし', errs.length === 0); if (errs.length) console.log(errs.slice(0, 3));
await b.close(); srv.close();
console.log(fails ? `${fails}件 FAIL` : '全件 PASS');
process.exit(fails ? 1 : 0);
