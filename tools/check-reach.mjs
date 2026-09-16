// 「まっすぐ滑空したら着く場所」の予測が、実際にまっすぐ飛んで着いた場所と合うか。
// 上昇風のない空気(外の沈下だけ)で比べる。
import { Terrain, TUNE, WORLDS } from '../src/world.js';
import { Glider, glideReach } from '../src/flight.js';
Object.assign(TUNE, WORLDS.hills);
const still = { liftAt: () => -TUNE.ambient, ridgeAt: () => 0, nearby: () => [] };
let worst = 0, n = 0, over = 0;
for (const seed of [17, 41, 113]) {
  const t = new Terrain(seed);
  for (let k = 0; k < 20; k++) {
    const x = (k * 733) % 6000 - 3000, y = (k * 1511) % 20000;
    const g = new Glider(t, still, { x, y, alt: 120 + (k % 5) * 60 });
    g.head = (k * 0.7) % (2 * Math.PI);
    const pred = glideReach(g);
    if (!pred.hit) { over++; continue; }
    while (g.alive && g.time < 1000) g.step(1 / 60, 0);
    const err = Math.hypot(g.x - pred.x, g.y - pred.y);
    worst = Math.max(worst, err); n++;
  }
}
console.log(`予測と実際の着地点のずれ: 最大 ${worst.toFixed(0)}m (${n}件 / 9km先まで届かなかった ${over}件)`);
console.log(worst < 150 ? 'PASS' : 'FAIL');
