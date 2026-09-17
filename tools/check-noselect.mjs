// スマホで押しっぱなしにしても、文字の選択や長押しメニューが出ない設定になっているか
import puppeteer from 'puppeteer';
const BASE = process.env.GLIDE_BASE || 'http://localhost:8141/';
const b = await puppeteer.launch({ headless: true, protocolTimeout: 120000, args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await p.goto(`${BASE}?seed=17`, { waitUntil: 'networkidle0', timeout: 120000 });
const r = await p.evaluate(() => {
  const out = {};
  for (const sel of ['body', 'canvas', '#hud', '#msg']) {
    const el = document.querySelector(sel); if (!el) continue;
    const cs = getComputedStyle(el);
    out[sel] = { userSelect: cs.userSelect || cs.webkitUserSelect, callout: cs.webkitTouchCallout };
  }
  const ev = new Event('contextmenu', { cancelable: true, bubbles: true }); document.body.dispatchEvent(ev);
  const ev2 = new Event('selectstart', { cancelable: true, bubbles: true }); document.body.dispatchEvent(ev2);
  out.contextmenuBlocked = ev.defaultPrevented; out.selectstartBlocked = ev2.defaultPrevented;
  return out;
});
let fails = 0;
for (const [k, v] of Object.entries(r)) {
  if (typeof v === 'object') { const ok = v.userSelect === 'none'; if (!ok) fails++; console.log(`  ${k}: 選択 ${v.userSelect} / 長押しメニュー ${v.callout ?? '(この環境では取得不可)'} ${ok ? 'PASS' : 'FAIL'}`); }
  else { if (!v) fails++; console.log(`  ${k} ${v ? 'PASS' : 'FAIL'}`); }
}
await b.close();
console.log(fails ? `${fails}件 FAIL` : '全件 PASS');
process.exit(fails ? 1 : 0);
