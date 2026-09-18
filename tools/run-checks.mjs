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
  ['左右の向き(水平キープ)', 'check-signs.mjs', ['--cam=a']],
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
];
const results = [];
for (const [name, file, args] of CHECKS) {
  // spawnSync だと待っている間この場のサーバーが止まり、ページが返せない。非同期で待つ
  const r = await new Promise(resolve => {
    const c = spawn(process.execPath, [path.join(ROOT, 'tools', file), ...args], { env: { ...process.env, GLIDE_BASE: base } });
    let out = '';
    c.stdout.on('data', d => out += d); c.stderr.on('data', d => out += d);
    const timer = setTimeout(() => c.kill(), 600000);
    c.on('close', status => { clearTimeout(timer); resolve({ status, out }); });
  });
  const out = r.out;
  const fails = (out.match(/FAIL/g) || []).length;
  const ok = r.status === 0 && fails === 0 && /PASS/.test(out);
  results.push({ name, ok, fails });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  (FAIL ${fails}件 / 終了コード ${r.status})`}`);
  if (!ok) console.log(out.split('\n').filter(l => /FAIL|Error|エラー/.test(l)).slice(0, 8).join('\n'));
}
if (server) server.close();
const bad = results.filter(r => !r.ok).length;
console.log(bad ? `\n${bad}件の検査が通らなかった` : '\n全部の検査が通った');
process.exit(bad ? 1 : 0);
