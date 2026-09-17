// 書き出した dist をこの場で配りながら、別の検査スクリプトを1本動かす
//   node tools/with-dist.mjs tools/check-forest.mjs [引数...]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
const DIST = path.resolve('dist');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.glb': 'model/gltf-binary' };
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(DIST, p);
  if (!f.startsWith(DIST) || !fs.existsSync(f)) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r);
});
srv.listen(8142, '127.0.0.1', () => {
  const c = spawn(process.execPath, process.argv.slice(2), { env: { ...process.env, GLIDE_BASE: 'http://127.0.0.1:8142/' }, stdio: 'inherit' });
  c.on('close', code => { srv.close(); process.exit(code ?? 1); });
});
