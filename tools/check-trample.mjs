// 踏み荒らされた地面が、上空からどれだけ見えているか(踏み荒らし有/無の画面の差で測る)
import puppeteer from 'puppeteer';
const BASE = process.env.GLIDE_BASE || 'http://localhost:8141/';
const b = await puppeteer.launch({ headless: true, protocolTimeout: 300000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
async function shoot(params, dist, alt) {
  const p = await b.newPage(); await p.setViewport({ width: 390, height: 844 });
  await p.goto(`${BASE}?harness&seed=5&cam=a&nodinos&${params}`, { waitUntil: 'networkidle0', timeout: 120000 });
  await p.waitForFunction(() => !!window.__slice, { timeout: 60000 });
  const buf = await p.evaluate((d, a) => {
    const s = window.__slice; s.auto(false); s.reset(); s.begin();
    const h = s.herdsNear(0, 0, 8000).sort((x, y) => Math.hypot(x.cx, x.cy) - Math.hypot(y.cx, y.cy))[0];
    s.place(h.cx, h.cy - d, a, 0);
    for (let i = 0; i < 30; i++) s.render();
    const c = document.querySelector('canvas'); const gl = c.getContext('webgl2') || c.getContext('webgl');
    const px = new Uint8Array(c.width * c.height * 4);
    gl.readPixels(0, 0, c.width, c.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return { px: Array.from(px.filter((_, i) => i % 4 !== 3)), w: c.width, h: c.height };
  }, dist, alt);
  await p.close();
  return buf;
}
for (const [dist, alt] of [[700, 250], [1500, 300], [2500, 350]]) {
  const off = await shoot('trample=0', dist, alt);
  const on = await shoot('trample=0.75', dist, alt);
  let changed = 0, n = 0;
  for (let i = 0; i < on.px.length; i += 3) {
    n++;
    if (Math.abs(on.px[i] - off.px[i]) + Math.abs(on.px[i+1] - off.px[i+1]) + Math.abs(on.px[i+2] - off.px[i+2]) > 18) changed++;
  }
  console.log(`群れの${dist}m手前・高度${alt}m: 踏み荒らしで変わった画素 ${(changed / n * 100).toFixed(2)}% (${changed}画素)`);
}
await b.close();
