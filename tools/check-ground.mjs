// 地面: 飛び続けても層のすき間が空かないか、水面の直線が見えないか、作り直しの引っかかりが小さいか
import puppeteer from 'puppeteer';
const BASE = process.argv.includes('--public') ? 'https://yokobo103.github.io/yokobo-pterosaur-glide/' : (process.env.GLIDE_BASE || 'http://localhost:8141/');
const b = await puppeteer.launch({ headless: true, protocolTimeout: 600000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844 });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
await p.goto(`${BASE}?harness&seed=17&cam=a`, { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.modelReady(), { timeout: 90000 });
let fails = 0; const check = (l, c) => { if (!c) fails++; console.log(`  ${l} ${c ? 'PASS' : 'FAIL'}`); };

// 1. 飛びながら、層のすき間を毎コマ計算で確かめる(絵を見るより速くて確実)
const fly = await p.evaluate(() => {
  const s = window.__slice; s.auto(true); s.reset(); s.begin();
  let worstGap = -1e9, worstAt = null, frames = 0;
  for (let i = 0; i < 60 * 60; i++) {
    s.step(1 / 60, true);
    if (i % 5) continue;
    frames++;
    const v = s.ground();
    // 「沈めた頂点に触れる四角形」は1升ぶん外まで崩れるので、穴は実効でそのぶん広い
    for (const [outer, inner] of [[v.far, v.near], [v.horizon, v.far]]) {
      const hole = outer.hole + outer.cell;               // 実効の穴の半幅
      const gap = (outer.cx - hole) < (inner.cx - inner.half)
        ? (inner.cx - inner.half) - (outer.cx - hole) : (outer.cx + hole) - (inner.cx + inner.half);
      const gapY = (outer.cy - hole) < (inner.cy - inner.half)
        ? (inner.cy - inner.half) - (outer.cy - hole) : (outer.cy + hole) - (inner.cy + inner.half);
      const g = Math.max(gap, gapY);
      if (g > worstGap) { worstGap = g; worstAt = { i, g: +g.toFixed(1) }; }
    }
  }
  const g = s.state();
  // 引っかかりは「地面の作り直しにかかった時間」だけを見る(ソフトウェア描画のコマ時間は環境の値で、ここでは意味がない)
  return { worstGap, worstAt, frames, moved: Math.round(Math.hypot(g.x, g.y)), times: s.groundTimes() };
});
console.log(`  60秒ぶん飛んで ${fly.frames}回すき間を測った(出発点から ${(fly.moved / 1000).toFixed(2)}km 動いた)`);
console.log(`  地面の作り直し [ms] ${JSON.stringify(fly.times)}`);
check(`どちらの地面も無い帯ができない(いちばん広いとき ${fly.worstGap.toFixed(1)}m)`, fly.worstGap <= 0.5);
// 最大はゴミ集めが混ざって2倍まで跳ねるので、中央値で見る(最大は目安として出す)
const worstMs = Math.max(...Object.values(fly.times).map(t => t.中央値 || 0));
check(`作り直しが軽い(いちばん重い層の中央値 ${worstMs}ms)`, worstMs < 20);

// 2. 絵の上でも、水面のまっすぐな線が出ないか(いろいろな高さ・向きで)
const spots = [[1234, 5678, 350, 0], [-4200, 2600, 700, 0.7], [800, -3000, 120, 2.2], [5000, 9000, 1200, 4.0]];
let blueTotal = 0;
for (const [x, y, alt, head] of spots) {
  const blue = await p.evaluate(([x, y, alt, head]) => {
    const s = window.__slice; s.auto(false); s.place(x, y, alt, head);
    for (let i = 0; i < 20; i++) s.render();
    const cv = document.querySelector('canvas');
    const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height;
    const ctx = c.getContext('2d'); ctx.drawImage(cv, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let rows = 0;
    for (let yy = 0; yy < c.height; yy++) {
      let n = 0;
      for (let xx = 0; xx < c.width; xx++) {
        const i = (yy * c.width + xx) * 4;
        if (d[i + 2] > d[i] + 12 && d[i + 2] > d[i + 1] + 6 && d[i + 2] > 80 && d[i] < 170) n++;
      }
      if (n > c.width * 0.5) rows++;     // 横幅の半分以上が水色 = まっすぐな水の線
    }
    return rows;
  }, [x, y, alt, head]);
  blueTotal += blue;
  console.log(`  高さ${alt}m 向き${head.toFixed(1)}: 横幅の半分以上が水色の行 ${blue}`);
}
check(`水面のまっすぐな線が出ない(合計 ${blueTotal}行)`, blueTotal === 0);
check('エラーなし', errs.length === 0); if (errs.length) console.log(errs.slice(0, 3));
await b.close();
console.log(fails ? `${fails}件 FAIL` : '全件 PASS');
process.exit(fails ? 1 : 0);
