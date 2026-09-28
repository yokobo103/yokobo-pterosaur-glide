// 「読み込み時の線が川に見える」を数える。
// 画面の点ごとに何に当たったかを見て、水面の板に当たったのに、その場所の地形が水面より上
// (＝本来は陸)なら「偽の水」。本物の川(地形が水面より下)は数えない。
import puppeteer from 'puppeteer';
const BASE = process.env.GLIDE_BASE || 'http://localhost:8141/';
const b = await puppeteer.launch({ headless: true, protocolTimeout: 900000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage(); await p.setViewport({ width: 390, height: 844 });
const SAMPLE = () => {
  const s = window.__slice, W = innerWidth, H = innerHeight, water = s.waterY();
  let fake = 0, real = 0, land = 0, sky = 0; const rows = new Map();
  for (let j = 0; j < 44; j++) for (let i = 0; i < 20; i++) {
    const x = (i + 0.5) * W / 20, y = (j + 0.5) * H / 44;
    const h = s.pick(x, y);
    if (h.what === 'なし') { sky++; continue; }
    if (h.what !== '水面') { land++; continue; }
    const gx = -h.point[0], gy = h.point[2];
    if (s.terrainHeight(gx, gy) > water + 1.5) { fake++; rows.set(j, (rows.get(j) || 0) + 1); } else real++;
  }
  // 偽の水がどの高さ(画面の行)に並んでいるか。横一列に並ぶと「線」に見える
  const worst = [...rows.entries()].sort((a, c) => c[1] - a[1])[0];
  return { fake, real, land, sky, worstRow: worst ? { y: Math.round((worst[0] + 0.5) * H / 44), n: worst[1] } : null };
};

console.log('■ 読み込み直後(描き始めてからのコマ数ごと)');
await p.goto(`${BASE}?harness&seed=17&cam=a`, { waitUntil: 'networkidle0', timeout: 120000 });
await p.waitForFunction(() => window.__slice && window.__slice.modelReady(), { timeout: 90000 });
await p.evaluate(() => { const s = window.__slice; s.auto(false); s.reset(); s.begin(); s.place(0, 0, 400, 0); });
let frames = 0;
for (const n of [1, 2, 3, 4, 6, 10, 30]) {
  await p.evaluate(k => { for (let i = 0; i < k; i++) window.__slice.render(); }, n - frames); frames = n;
  const r = await p.evaluate(SAMPLE);
  console.log(`  ${String(n).padStart(2)}コマ目: 偽の水 ${r.fake}点 / 本物の水 ${r.real} / 陸 ${r.land} / 空 ${r.sky}${r.worstRow ? ` / 一番多い行 y=${r.worstRow.y}px に${r.worstRow.n}点(横20点中)` : ''}`);
}

console.log('■ 飛んでいる途中(まっすぐ速く進んで、地面の作り直しが追いつくか)');
for (const [label, x, y, head] of [['北へ', 0, 0, 0], ['東へ', 0, 0, Math.PI / 2], ['斜め', 3000, 8000, 0.8]]) {
  await p.evaluate(({ x, y, head }) => { const s = window.__slice; s.reset(); s.begin(); s.place(x, y, 350, head); s.forceInput = 0; for (let i = 0; i < 40; i++) s.render(); }, { x, y, head });
  let worst = { fake: 0 };
  for (let k = 0; k < 12; k++) {
    await p.evaluate(() => { const s = window.__slice; for (let i = 0; i < 30; i++) s.step(1 / 60, true); });
    const r = await p.evaluate(SAMPLE);
    if (r.fake > worst.fake) worst = { ...r, t: (k + 1) * 0.5 };
  }
  console.log(`  ${label}: 6秒間でいちばん多いとき 偽の水 ${worst.fake}点${worst.fake ? ` (${worst.t}秒 / 行 y=${worst.worstRow.y}px に${worst.worstRow.n}点)` : ''}`);
}
await b.close();
