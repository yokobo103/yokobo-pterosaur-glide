// 左右の符号の検査。「bankが正か」ではなく「画面がどっちに回るか」を見る。
import puppeteer from 'puppeteer';
const BASE = process.argv.includes('--public')
  ? 'https://yokobo103.github.io/yokobo-pterosaur-glide/' : 'http://localhost:8141/';
const b = await puppeteer.launch({ headless: true, protocolTimeout: 240000,
  args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 1280, height: 800 });
const CAM = (process.argv.find(a => a.startsWith('--cam=')) || '--cam=a').slice(6);
await p.goto(BASE + '?harness&seed=17&cam=' + CAM, { waitUntil: 'networkidle0' });
await p.waitForFunction(() => !!window.__slice);
console.log('測る対象:', BASE, 'カメラ', CAM);

const r = await p.evaluate(() => {
  const s = window.__slice;
  const run = (dir) => {
    s.auto(false); s.reset(); s.begin();
    for (let i=0;i<60;i++) s.step(1/60,true);
    const v0 = s._view();
    const st0 = s.state();
    // 正面ずっと先の目印。自分が右に曲がれば、これは画面の左へ流れる
    const mark = [st0.x + Math.sin(st0.head)*5000, 200, st0.y + Math.cos(st0.head)*5000];
    const before = v0.world(mark[0], mark[1], mark[2])[0];
    s.forceInput = dir;
    for (let i=0;i<150;i++) s.step(1/60,true);
    const v = s._view();
    const after = v.world(mark[0], mark[1], mark[2])[0];
    const wR = v.local(11, 1.1, 0.5), wL = v.local(-11, 1.1, 0.5);
    // 画面上で右側にある翼はどちらか、その翼は下がっているか
    const right = wR[0] > wL[0] ? wR : wL, left = wR[0] > wL[0] ? wL : wR;
    const nose = v.noseDir(), vel = v.velDir();
    const dot = nose[0]*vel[0] + nose[1]*vel[1] + nose[2]*vel[2];
    s.forceInput = null;
    return { markMove: after - before, rightWingLower: right[1] - left[1],
             horizonLean: v.horizonLean(), noseVsVel: Math.acos(Math.max(-1,Math.min(1,dot)))*57.3,
             bank: s.state().bank*57.3 };
  };
  return { right: run(1), left: run(-1) };
});

const ok = (c) => c ? 'PASS' : 'FAIL';
console.log('');
console.log('■ 右を押したとき');
console.log(`  正面の目印が画面の ${r.right.markMove < 0 ? '左' : '右'} へ ${Math.abs(r.right.markMove).toFixed(0)}px 動いた`
          + `  -> ${r.right.markMove < 0 ? '右へ曲がっている' : '左へ曲がっている'} ${ok(r.right.markMove < 0)}`);
console.log(`  機体の傾き ${r.right.bank.toFixed(0)}度 / 画面で右側の翼が ${r.right.rightWingLower > 0 ? '下がっている' : '上がっている'} ${ok(r.right.rightWingLower > 0)}`);
const L = r.right.horizonLean;
console.log(`  地平線 ${Math.abs(L) < 1 ? '水平のまま' : (L > 0 ? '右側が上がった' : '右側が下がった(逆)')} (${L.toFixed(0)}度) ${ok(L > -1)}`);
console.log('  (以前は左右の目印を取り違えて、逆向きでもPASSと出していた)');
console.log('■ 左を押したとき');
console.log(`  正面の目印が画面の ${r.left.markMove > 0 ? '右' : '左'} へ ${Math.abs(r.left.markMove).toFixed(0)}px 動いた`
          + `  -> ${r.left.markMove > 0 ? '左へ曲がっている' : '右へ曲がっている'} ${ok(r.left.markMove > 0)}`);
console.log('■ 機首と進行方向');
console.log(`  ズレ 右旋回中 ${r.right.noseVsVel.toFixed(1)}度 / 左旋回中 ${r.left.noseVsVel.toFixed(1)}度  ${ok(r.right.noseVsVel < 1 && r.left.noseVsVel < 1)}`);
console.log('  (ここがズレると、旋回するほど機首が明後日を向く)');
await b.close();
