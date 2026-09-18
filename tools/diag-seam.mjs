// 地面の継ぎ目の調査: 「川に見える横線」が near/far のすき間から見えた水面かどうかを測る
//   node tools/with-dist.mjs tools/diag-seam.mjs
import puppeteer from 'puppeteer';
const BASE = process.env.GLIDE_BASE || 'http://localhost:8141/';
const b = await puppeteer.launch({ headless: true, protocolTimeout: 600000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844 });
await p.goto(`${BASE}?harness&seed=17&cam=a`, { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.modelReady(), { timeout: 90000 });

// 画面の画素を読む(WebGLのcanvasを2Dへ写して数える)
await p.evaluate(() => {
  window.__rows = (test) => {
    const cv = window.__slice._canvas();
    const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height;
    c.getContext('2d').drawImage(cv, 0, 0);
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    const out = [];
    for (let y = 0; y < c.height; y++) {
      let n = 0;
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        if (test(d[i], d[i + 1], d[i + 2])) n++;
      }
      if (n > c.width * 0.5) out.push([y, n]);
    }
    return { rows: out, h: c.height, w: c.width };
  };
  // 水面らしい色(青みが強い)
  window.__blue = () => window.__rows((r, g, b) => b > r + 12 && b > g + 6 && b > 80 && r < 170);
});

const look = async (label, before) => {
  const r = await p.evaluate(async (label, before) => {
    const s = window.__slice;
    if (before) new Function('s', before)(s);
    s.render();
    const q = window.__blue();
    return { rows: q.rows.map(v => v[0]), h: q.h };
  }, label, before || null);
  const span = r.rows.length ? `y=${r.rows[0]}〜${r.rows[r.rows.length - 1]} (画面の高さ${r.h})` : '';
  console.log(`  ${label}: 横幅の半分以上が水色の行 ${r.rows.length}行 ${span}`);
  return r.rows;
};

// 1. 形の上ですき間があるか(絵を見る前に、数で確かめる)
const geo = await p.evaluate(() => {
  const s = window.__slice; s.auto(false); s.reset(); s.begin();
  s.place(1234, 5678, 350, 0);
  for (let i = 0; i < 20; i++) s.render();
  return s.ground();
});
console.log(`  近景 中心(${geo.near.cx.toFixed(0)}, ${geo.near.cy.toFixed(0)}) 半幅${geo.near.half} 升目${geo.near.cell.toFixed(1)}m`);
console.log(`  遠景 中心(${geo.far.cx.toFixed(0)}, ${geo.far.cy.toFixed(0)}) 穴の半幅${geo.far.hole} 升目${geo.far.cell.toFixed(1)}m`);
console.log(`  中心のズレ ${Math.abs(geo.near.cx - geo.far.cx).toFixed(0)}m, ${Math.abs(geo.near.cy - geo.far.cy).toFixed(0)}m`);
// 沈めた頂点に触れる四角形はすべて崩れるので、穴は実際には1升ぶん外へ広がる
const hx0 = geo.far.cx - geo.far.hole - geo.far.cell, hx1 = geo.far.cx + geo.far.hole + geo.far.cell;
const hy0 = geo.far.cy - geo.far.hole - geo.far.cell, hy1 = geo.far.cy + geo.far.hole + geo.far.cell;
const nx0 = geo.near.cx - geo.near.half, nx1 = geo.near.cx + geo.near.half;
const ny0 = geo.near.cy - geo.near.half, ny1 = geo.near.cy + geo.near.half;
console.log('  どちらの地面も無い帯の幅 [m]: ' +
  `-X ${(nx0 - hx0).toFixed(0)} / +X ${(hx1 - nx1).toFixed(0)} / -Y ${(ny0 - hy0).toFixed(0)} / +Y ${(hy1 - ny1).toFixed(0)}`);

// 2. 絵の上で、水色の横線が出ているか(本物の川とは別に)
const a1 = await look('水面あり');
const a2 = await look('水面を消す', 's.waterVisible(false);');
await p.evaluate(() => window.__slice.waterVisible(true));
// 3. すき間の位置(正面1300m先)が画面のどこに来るか
const edge = await p.evaluate(() => {
  const s = window.__slice, g = s.state(), v = s.ground();
  const px = s._view().world(v.near.cx, v.near.cy + v.near.half, s.waterY());
  return { ahead: Math.round(v.near.cy + v.near.half - g.y), px };
});
console.log(`  近景の境目(正面${edge.ahead}m先)の水面の高さは 画面の y=${edge.px ? edge.px[1].toFixed(0) : '画面外'}`);
console.log(`  水色の横線: 水面あり ${a1.length}行 / 水面なし ${a2.length}行`);

// 4. その水色の行の画素は、何に当たっているのか(近景/遠景/水面)
if (a1.length) {
  const mid = a1[Math.floor(a1.length / 2)];
  const hits = await p.evaluate(y => {
    const s = window.__slice, out = [];
    for (const x of [40, 120, 195, 270, 350]) out.push({ x, ...s.pick(x, y) });
    return out;
  }, mid);
  console.log(`  水色の行 y=${mid} に映っているもの:`);
  for (const h of hits) console.log(`    x=${h.x}: ${h.what}` + (h.dist ? ` (${Math.round(h.dist)}m先)` : ''));
  // その1行上・1行下も見る
  for (const dy of [-3, 3]) {
    const hits2 = await p.evaluate(y => window.__slice.pick(195, y), mid + dy);
    console.log(`    y=${mid + dy} の中央: ${hits2.what}` + (hits2.dist ? ` (${Math.round(hits2.dist)}m先)` : ''));
  }
}
// 5. 画面全体を拾って、何がどれだけ映っているか(水面が遠くに見えていたら継ぎ目か世界の端)
const scanAt = () => p.evaluate(() => {
  const s = window.__slice, out = { 近景: 0, 遠景: 0, 地平: 0, 水面近く: 0, 水面遠く: 0, なし: 0 };
  for (let y = 0; y < 844; y += 6) for (let x = 5; x < 390; x += 10) {
    const h = s.pick(x, y);
    if (h.what === 'なし') out.なし++;
    else if (h.what === '水面') (h.dist > 3000 ? out.水面遠く++ : out.水面近く++);
    else out[h.what]++;
  }
  return out;
});
console.log('  いまの画面:', JSON.stringify(await scanAt()));
// 地平の層を消すと、直す前と同じ状態になる(遠景は6.5kmで終わる)
await p.evaluate(() => { window.__slice.horizonVisible(false); window.__slice.render(); });
console.log('  地平の層を消すと:', JSON.stringify(await scanAt()));
console.log('  そのときの水色の行:', (await look('地平なし')).length + '行');
await p.evaluate(() => { window.__slice.horizonVisible(true); window.__slice.render(); });
await b.close();
