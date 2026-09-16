// 「操作が分かりにくい」「どっち向いてるか分からない」「暇」を数字にする。
// 感想を推測で直さないための装置。npm run dev を先に起動しておくこと。
import puppeteer from 'puppeteer';

const URL = 'http://localhost:8141/?harness&seed=17';
const b = await puppeteer.launch({
  headless: true, protocolTimeout: 240000,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 800 });
await p.goto(URL, { waitUntil: 'networkidle0' });
await p.waitForFunction(() => !!window.__slice);

// ---------- 1. 右を押してから、実際に向きが変わるまで ----------
console.log('=== 1. 押してから向きが変わるまで ===');
const turn = await p.evaluate(() => {
  const s = window.__slice; s.auto(false); s.reset(); s.begin();
  const marks = {};
  let h0 = null, t = 0;
  s.forceInput = 1;   // 右を押しっぱなしにする
  for (let i = 0; i < 600; i++) {
    s.step(1 / 60, false);
    const st = s.state();
    if (h0 === null) h0 = st.head;
    t += 1 / 60;
    const deg = Math.abs(((st.head - h0 + Math.PI) % (2 * Math.PI)) - Math.PI) * 57.3;
    for (const d of [10, 45, 90, 180]) if (!marks[d] && deg >= d) marks[d] = +t.toFixed(2);
  }
  s.forceInput = null;
  return marks;
});
for (const d of [10, 45, 90, 180]) {
  console.log(`  ${String(d).padStart(3)}度 曲がるまで ${turn[d] ?? '(届かず)'}秒`);
}

// ---------- 2. 押したとき、画面の中で「自分が曲がった」と分かるか ----------
console.log('');
console.log('=== 2. 右を押した2秒間に、画面の中で何が動くか ===');
const yaw = await p.evaluate(() => {
  const s = window.__slice;
  s.auto(false); s.reset(); s.begin();
  const sample = () => {
    const v = s._view();
    const c = v.local(0, 0, 0), nose = v.local(0, 0, 60), wing = v.local(11, 0.6, -3);
    const hL = v.world(-4000, 60, 6000), hR = v.world(4000, 60, 6000);
    return {
      // カメラの向きと機体の向きの差。これが「画面の中で機体が振れて見える」量
      yawOff: (s.state().head - v.camHead) * 57.3,
      nosePx: nose[0] - c[0],                       // 鼻先が画面の左右どちらへ出ているか
      wingAng: Math.atan2(wing[1] - c[1], wing[0] - c[0]) * 57.3,
      horizonAng: Math.atan2(hR[1] - hL[1], hR[0] - hL[0]) * 57.3,
    };
  };
  s.render(); const a = sample();
  s.forceInput = 1;
  for (let i = 0; i < 120; i++) s.step(1 / 60, true);   // 実際の遊びと同じく毎コマ描く
  const b2 = sample();
  s.forceInput = null;
  return {
    yawOff: +b2.yawOff.toFixed(1), nosePx: +b2.nosePx.toFixed(0),
    wingRoll: +(b2.wingAng - a.wingAng).toFixed(1),
    horizonRoll: +(b2.horizonAng - a.horizonAng).toFixed(1),
  };
});
console.log(`  カメラに対する機体の振れ ${yaw.yawOff}度 (鼻先が画面中央から ${yaw.nosePx}px 横へ)`);
console.log(`  自機の傾き ${yaw.wingRoll}度 / 地平線の傾き ${yaw.horizonRoll}度`);

// ---------- 3. 上昇気流の手がかりは、画面のどれだけを占めているか ----------
console.log('');
console.log('=== 3. 上昇気流の手がかりが画面に占める割合 ===');
const mix = await p.evaluate(() => {
  const s = window.__slice;
  s.auto(true); s.reset(); s.begin(); s.step(95, false);
  const grab = () => {
    s.render();
    const c = document.querySelector('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    const px = new Uint8Array(c.width * c.height * 4);
    gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return px;
  };
  const v = s._view();
  v.dust.visible = false; v.clouds.visible = false;
  const without = grab();
  v.dust.visible = true; v.clouds.visible = true;
  const with_ = grab();
  // 手がかりを消したときに変わる画素 = 手がかりが占めている面積
  let changed = 0, n = 0, sky = 0;
  for (let i = 0; i < with_.length; i += 4 * 7) {
    n++;
    const d = Math.abs(with_[i] - without[i]) + Math.abs(with_[i + 1] - without[i + 1]) + Math.abs(with_[i + 2] - without[i + 2]);
    if (d > 12) changed++;
    if (without[i + 2] > without[i] && without[i + 2] > without[i + 1]) sky++;
  }
  return { cue: +(changed / n * 100).toFixed(1), sky: +(sky / n * 100).toFixed(1) };
});
console.log(`  上昇気流の手がかり(土ぼこり＋雲) ${mix.cue}%  ← 読む対象がこれだけしか映っていない`);
console.log(`  空 ${mix.sky}% / 残りは地面`);

// ---------- 4. 何もすることがない時間 ----------
console.log('\n=== 4. 1走行のうち、操作しても意味がない時間 ===');
const idle = await p.evaluate(() => {
  const s = window.__slice; s.auto(true); s.reset(); s.begin();
  let total = 0, cruise = 0, circling = 0, longest = 0, run = 0;
  for (let i = 0; i < 4000; i++) {
    const st = s.step(0.5, false);
    if (!st.alive) break;
    total += 0.5;
    if (Math.abs(st.bank) > 0.55) { circling += 0.5; run = 0; }
    else { cruise += 0.5; run += 0.5; longest = Math.max(longest, run); }
  }
  return { total, cruise, circling, longest };
});
console.log(`  1走行 ${(idle.total / 60).toFixed(1)}分 のうち`);
console.log(`    旋回している    ${(idle.circling / 60).toFixed(1)}分 (${(idle.circling / idle.total * 100).toFixed(0)}%)`);
console.log(`    ただ滑空している ${(idle.cruise / 60).toFixed(1)}分 (${(idle.cruise / idle.total * 100).toFixed(0)}%)`);
console.log(`    連続で何もない最長 ${idle.longest.toFixed(0)}秒`);

await b.close();
