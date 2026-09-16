// 撮った絵を1枚に並べる。チャットへ出すのはこの1枚。
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(ROOT, 'screenshots');

const ROWS = [
  { title: 'PC 1280x800', items: [
    ['pc-01-出だし.png', '出だし 0.79km / 高度296m — 遠近に柱が散る'],
    ['pc-03-旋回中.png', '旋回中 高度133m — 柱の芯を回す'],
    ['pc-05-夕暮れ.png', '夕暮れ 7.49km / 日照0.43 — 空気が弱ってくる'],
  ]},
  { title: 'スマホ 390x844 (縦持ち)', items: [
    ['phone-01-出だし.png', '出だし'],
    ['phone-04-乗り継ぎ後.png', '乗り継ぎ後 4.05km'],
    ['phone-05-夕暮れ.png', '夕暮れ'],
  ]},
];

const b64 = async f => 'data:image/png;base64,' + (await fs.readFile(path.join(SHOTS, f))).toString('base64');

const html = async () => {
  let body = '';
  for (const row of ROWS) {
    body += `<h2>${row.title}</h2><div class="row">`;
    for (const [f, cap] of row.items) {
      body += `<figure><img src="${await b64(f)}"><figcaption>${cap}</figcaption></figure>`;
    }
    body += '</div>';
  }
  return `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;padding:26px 26px 30px;background:#14181e;color:#e8eef7;font-family:system-ui,sans-serif;width:1500px}
    h1{font-size:20px;margin:0 0 4px} .sub{font-size:12px;opacity:.65;margin-bottom:20px}
    h2{font-size:13px;font-weight:600;opacity:.8;margin:18px 0 8px;letter-spacing:.04em}
    .row{display:flex;gap:12px;align-items:flex-start}
    figure{margin:0;flex:1} img{width:100%;border-radius:7px;display:block;background:#000}
    figcaption{font-size:11px;opacity:.72;margin-top:6px;line-height:1.5}
  </style><h1>翼竜滑空 — 縦切り試作</h1>
  <div class="sub">灰色の箱。操作は左右のみ・上昇率は音と右の帯・日没で終わる。seed 17 / 自動操縦での記録。</div>${body}`;
};

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1200 });
await page.setContent(await html(), { waitUntil: 'networkidle0' });
const out = path.join(SHOTS, '_比較シート.png');
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log('出力:', out);
