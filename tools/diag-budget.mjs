// 描画の内訳: 何が描画回数・三角形・コマ時間を使っているか
//   node tools/with-dist.mjs tools/diag-budget.mjs
// 恐竜や他の翼竜が近くにいる場所を自分で探してから測る(誰もいない場所で測っても0になる)
import puppeteer from 'puppeteer';
const BASE = process.env.GLIDE_BASE || 'http://localhost:8141/';

for (const view of [{ n: 'スマホ縦', w: 390, h: 844 }, { n: 'PC横', w: 1280, h: 800 }]) {
  const b = await puppeteer.launch({ headless: true, protocolTimeout: 600000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: view.w, height: view.h });
  await p.goto(`${BASE}?harness&seed=17&cam=a`, { waitUntil: 'networkidle0', timeout: 120000 });
  await p.waitForFunction(() => window.__slice && window.__slice.modelReady() && window.__slice.stegoReady() && window.__slice.dryoReady(), { timeout: 90000 });
  const r = await p.evaluate(async () => {
    const s = window.__slice;
    s.auto(false); s.reset(); s.begin();
    // ステゴの群れの近く、かつドリオの一団も入る所を選ぶ
    const h = s.herdsNear(0, 0, 15000, 'stego').sort((a, b) => Math.hypot(a.cx, a.cy) - Math.hypot(b.cx, b.cy))[0];
    s.place(h.cx, h.cy - 700, 320, 0);
    for (let i = 0; i < 180; i++) s.render();                 // 群れ・木・発見がそろうまで
    const times = () => {
      for (let i = 0; i < 8; i++) s.render();
      const ms = [];
      for (let i = 0; i < 40; i++) { const t = performance.now(); s.render(); ms.push(performance.now() - t); }
      ms.sort((a, c) => a - c);
      return ms[20];                                           // 中央値(ゴミ集めの跳ねを避ける)
    };
    const stats = s.sceneStats();
    const base = { ...s.info(), ms: times() };
    const ms = {};
    for (const name of Object.keys(stats)) {
      s.hide(name, false);
      ms[name] = +(base.ms - times()).toFixed(1);
      s.hide(name, true);
    }
    return { stats, base, ms, place: { x: Math.round(h.cx), y: Math.round(h.cy) } };
  });
  console.log(`
== ${view.n} (${view.w}x${view.h}) 群れの手前700m・高さ320m ==`);
  console.log(`  全部: ${r.base.calls}回 / ${(r.base.tris / 1000).toFixed(0)}k三角形 / 1コマ ${r.base.ms.toFixed(1)}ms`);
  const rows = Object.entries(r.stats).sort((a, c) => c[1].tris - a[1].tris);
  for (const [k, v] of rows) {
    console.log(`  ${k.padEnd(6, '　')} 描画 ${String(v.calls).padStart(4)}回 (${(v.calls / r.base.calls * 100).toFixed(0)}%)` +
                ` / ${String((v.tris / 1000).toFixed(0)).padStart(4)}k三角形 (${(v.tris / r.base.tris * 100).toFixed(0)}%)` +
                ` / 消すと ${String(r.ms[k]).padStart(5)}ms 軽くなる`);
  }
  await b.close();
}
