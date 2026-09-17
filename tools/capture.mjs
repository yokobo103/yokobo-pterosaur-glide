// 画面を出さずに、実際のブラウザで飛ばして絵と数字を取る。
// よこぼに撮らせないための装置。npm run dev を先に起動しておくこと。
//
//   node tools/capture.mjs            # 絵と計測
//   node tools/capture.mjs --touch    # 指(本物のタッチ)で操作できるかの検査

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'screenshots');
const URL = (process.env.GLIDE_BASE || 'http://localhost:8141/');
const argv = process.argv.slice(2);
const has = f => argv.includes(f);

const SIZES = [
  { name: 'pc', w: 1280, h: 800, mobile: false },
  { name: 'phone', w: 390, h: 844, mobile: true },
];

async function newPage(browser, size) {
  const page = await browser.newPage();
  await page.setViewport({ width: size.w, height: size.h, deviceScaleFactor: 1, isMobile: size.mobile, hasTouch: size.mobile });
  page.on('pageerror', e => console.error('  [ページ内エラー]', e.message));
  page.on('console', m => { if (m.type() === 'error') console.error('  [console]', m.text()); });
  return page;
}

async function shot(page, name) {
  const f = path.join(OUT, name + '.png');
  await page.screenshot({ path: f });
  const { size } = await fs.stat(f);
  console.log(`  ${name}.png  ${(size / 1024).toFixed(0)}KB`);
  return f;
}

async function main() {
  await fs.mkdir(OUT, { recursive: true });
  const browser = await puppeteer.launch({
    headless: true,
    protocolTimeout: 240000,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-gl=angle',
           '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  });

  for (const size of SIZES) {
    console.log(`\n=== ${size.name} (${size.w}x${size.h}) ===`);
    const page = await newPage(browser, size);
    await page.goto(URL + '?harness&seed=17', { waitUntil: 'networkidle0', timeout: 120000 });
    await page.waitForFunction(() => !!window.__slice, { timeout: 15000 });

    await shot(page, `${size.name}-00-入口`);

    // 自動操縦で飛ばして、要所の絵を取る
    await page.evaluate(() => { const s = window.__slice; s.auto(true); s.begin(); });
    for (const [sec, label] of [[25, '01-出だし'], [70, '02-柱へ寄る'], [40, '03-旋回中'], [150, '04-乗り継ぎ後'], [260, '05-夕暮れ']]) {
      const st = await page.evaluate(s => {
        const g = window.__slice;
        g.step(s - 1, false);
        for (let i = 0; i < 12; i++) g.step(1 / 12, true);   // 最後は描画しながら
        return g.state();
      }, sec);
      console.log(`  t=${st.time.toFixed(0)}s  ${(st.dist / 1000).toFixed(2)}km  高度${Math.round(st.agl)}m  上下${st.vz.toFixed(1)}m/s  日照${st.sun.toFixed(2)}`);
      await shot(page, `${size.name}-${label}`);
    }

    // 描画性能: 実際に回して測る
    const fps = await page.evaluate(async () => {
      const s = window.__slice;
      let n = 0; const t0 = performance.now();
      while (performance.now() - t0 < 3000) { s.step(1 / 60, true); n++; }
      return (n / ((performance.now() - t0) / 1000));
    });
    console.log(`  描画 ${fps.toFixed(0)} コマ/秒 (swiftshader = 実機GPUより遅い)`);

    // 見えている手がかりの数
    const dust = await page.evaluate(() => window.__slice.visibleDust());
    console.log(`  視界内の上昇気流 ${dust.length}本 / 一番近いの ${dust[0]?.d}m先 強さ${dust[0]?.W}`);
    await page.close();
  }

  if (has('--touch')) {
    console.log('\n=== 指で操作できるか (本物のタッチ) ===');
    const page = await newPage(browser, SIZES[1]);
    await page.goto(URL + '?harness&seed=17', { waitUntil: 'networkidle0', timeout: 120000 });
    await page.waitForFunction(() => !!window.__slice);
    await page.evaluate(() => window.__slice.begin());
    const cdp = await page.createCDPSession();
    const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', {
      type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
    });
    for (const [label, x] of [['左半分', 90], ['右半分', 300]]) {
      await page.evaluate(() => window.__slice.reset());
      await page.evaluate(() => window.__slice.begin());
      await touch('touchStart', x, 500);
      const st = await page.evaluate(() => { window.__slice.step(3, false); return window.__slice.state(); });
      await touch('touchEnd', x, 500);
      const dir = st.bank < -0.05 ? '左へ傾いた' : st.bank > 0.05 ? '右へ傾いた' : '傾かなかった';
      const ok = (label === '左半分' && st.bank < -0.05) || (label === '右半分' && st.bank > 0.05);
      console.log(`  ${label}を押す -> ${dir} (傾き${(st.bank * 57.3).toFixed(0)}度) ${ok ? 'PASS' : 'FAIL'}`);
    }
    // 2本目の指: 左右同時に押したら打ち消し合うか
    await page.evaluate(() => { window.__slice.reset(); window.__slice.begin(); });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 90, y: 500, id: 1 }, { x: 300, y: 500, id: 2 }] });
    const both = await page.evaluate(() => { window.__slice.step(3, false); return window.__slice.state(); });
    console.log(`  左右を同時に押す -> 傾き${(both.bank * 57.3).toFixed(0)}度 ${Math.abs(both.bank) < 0.05 ? 'PASS (打ち消す)' : 'FAIL'}`);
    await page.close();
  }

  await browser.close();
  console.log(`\n出力: ${OUT}`);
}
main().catch(e => { console.error(e); process.exit(1); });
