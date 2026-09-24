// 全部の検査を1回で回す。開発サーバーに頼らず、書き出した dist をこの場で配って検査する。
//   npm run build && node tools/run-checks.mjs
//   node tools/run-checks.mjs --public   # 公開版を検査
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = process.argv.includes('--public');
const DIST = path.join(ROOT, 'dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json' };

let server = null, base = 'https://yokobo103.github.io/yokobo-pterosaur-glide/';
if (!PUBLIC) {
  if (!fs.existsSync(path.join(DIST, 'index.html'))) { console.error('dist がない。先に npm run build'); process.exit(1); }
  server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const f = path.join(DIST, p);
    if (!f.startsWith(DIST) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => server.listen(8142, '127.0.0.1', r));
  base = 'http://127.0.0.1:8142/';
}
console.log('検査の対象:', base);

const CHECKS = [

  ['低空の居心地',           'check-lowfly.mjs', []],  ['左右の向き(水平キープ)', 'check-signs.mjs', ['--cam=a']],
  ['左右の向き(少し傾く)',   'check-signs.mjs', ['--cam=b']],
  ['本物の翼竜の向き',       'check-model.mjs', []],
  ['画面から出ない',         'check-frame.mjs', []],
  ['カメラ選択(タッチ)',     'check-cam-picker.mjs', []],
  ['山脈の世界',             'check-ridge-world.mjs', []],
  ['押しても文字が選択されない', 'check-noselect.mjs', []],
  ['着地の動き',             'check-landing.mjs', []],

  ['ステゴサウルス',         'check-stego.mjs', []],
  ['他の翼竜',               'check-flyers.mjs', []],
  ['発見',                   'check-discovery.mjs', []],
  ['発見は画面に映ってから',  'check-found-onscreen.mjs', []],
  ['ドリオサウルス',         'check-dryo.mjs', []],
  ['新しい恐竜3種',         'check-walkers.mjs', []],
];
// 1本ずつ順番に回すと16本で40分かかっていた。まとめて走らせて待ち時間を縮める。
// (検査どうしは独立。同時に走らせすぎると1本が遅くなるので4本まで)
const PAR = Number(process.env.GLIDE_PAR || 2);   // 4本だと互いに遅くして誤判定が出た
// 時間を測る検査は他と一緒に走らせると値が化けるので、最後に1本だけで回す
const SOLO = [['地面の継ぎ目', 'check-ground.mjs', []]];
const run = ([name, file, args]) => new Promise(resolve => {
  const t0 = Date.now();
  const c = spawn(process.execPath, [path.join(ROOT, 'tools', file), ...args], { env: { ...process.env, GLIDE_BASE: base } });
  let out = '';
  c.stdout.on('data', d => out += d); c.stderr.on('data', d => out += d);
  const timer = setTimeout(() => c.kill(), 900000);
  c.on('close', status => {
    clearTimeout(timer);
    const fails = (out.match(/FAIL/g) || []).length;
    const ok = status === 0 && fails === 0 && /PASS/.test(out);
    resolve({ name, ok, fails, status, out, sec: Math.round((Date.now() - t0) / 1000) });
  });
});

const results = [];
const queue = [...CHECKS];
const workers = Array.from({ length: Math.min(PAR, queue.length) }, async () => {
  while (queue.length) {
    const r = await run(queue.shift());
    results.push(r);
    console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name} (${r.sec}秒)${r.ok ? '' : `  (FAIL ${r.fails}件 / 終了コード ${r.status})`}`);
    if (!r.ok) console.log(r.out.split('\n').filter(l => /FAIL|Error|エラー/.test(l)).slice(0, 8).join('\n'));
  }
});
const started = Date.now();
await Promise.all(workers);
for (const c of SOLO) {
  const r = await run(c);
  results.push(r);
  console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name} (${r.sec}秒・単独)${r.ok ? '' : `  (FAIL ${r.fails}件)`}`);
  if (!r.ok) console.log(r.out.split('\n').filter(l => /FAIL|Error|エラー/.test(l)).slice(0, 8).join('\n'));
}
console.log(`\n全体 ${Math.round((Date.now() - started) / 60000 * 10) / 10}分 (同時 ${PAR}本)`);
if (server) server.close();
const bad = results.filter(r => !r.ok).length;
console.log(bad ? `\n${bad}件の検査が通らなかった` : '\n全部の検査が通った');
process.exit(bad ? 1 : 0);
