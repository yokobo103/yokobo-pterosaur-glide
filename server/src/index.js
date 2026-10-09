// 翼竜グライダーの世界ランキング。Cloudflare Workers + D1。
//
//   POST /submit  { season, name, km, found, seed, at }  → { ok, id, rank, total }
//   GET  /top?season=s1&limit=1000&offset=0               → { rows: [{ id, name, km, found, at }], total }
//
// 守りは最低限(所長 2026-10-09): 名前12文字まで / ありえない距離は受けない / 同じ送り元からは10秒あける /
// このゲームのページからだけ受ける。手で偽の距離を送るズルは防げない(荒れたら飛行の再生で確かめる案がある)。
// 名前の言葉狩りはしない(気になる名前が出たら所長が言い、手で消す)。

const ORIGINS = [
  'https://yokobo103.github.io',
  'http://localhost:8141', 'http://127.0.0.1:8141',
  'http://localhost:8142', 'http://127.0.0.1:8142',
];
const MAX_KM = 50;            // 自動操縦の平均が約8km、上手い人で十数km。これを超えるのは作り物
const GAP_MS = 10_000;        // 同じ送り元からの受付の間隔
const SEASON = /^(s\d{1,3}|test)$/;   // test は検査用(ゲームからは使わない)

const cors = origin => ({
  'access-control-allow-origin': ORIGINS.includes(origin) ? origin : ORIGINS[0],
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'vary': 'origin',
});
const json = (body, status, origin) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...cors(origin) } });

// 名前: 制御文字を落として前後の空白を削り、12文字(書記素ではなくコードポイント)まで
const cleanName = s => [...String(s ?? '')].filter(c => c >= ' ' && c !== '\u007f').join('').trim().slice(0, 12);

async function ipKey(req, salt) {
  const ip = req.headers.get('cf-connecting-ip') || 'unknown';
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ip));
  return [...new Uint8Array(buf)].slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function submit(req, env, origin) {
  if (!ORIGINS.includes(origin)) return json({ ok: false, error: 'origin' }, 403, origin);
  let b;
  try { b = await req.json(); } catch (e) { return json({ ok: false, error: 'json' }, 400, origin); }
  const season = String(b.season || '');
  const name = cleanName(b.name);
  const km = Number(b.km), found = Math.trunc(Number(b.found) || 0);
  const seed = Number.isFinite(Number(b.seed)) ? Math.trunc(Number(b.seed)) : null;
  const at = Number.isFinite(Number(b.at)) ? Math.trunc(Number(b.at)) : null;
  if (!SEASON.test(season)) return json({ ok: false, error: 'season' }, 400, origin);
  if (!name) return json({ ok: false, error: 'name' }, 400, origin);
  if (!Number.isFinite(km) || km <= 0 || km > MAX_KM) return json({ ok: false, error: 'km' }, 400, origin);
  if (found < 0 || found > 100) return json({ ok: false, error: 'found' }, 400, origin);

  const now = Date.now();
  const ip = await ipKey(req, env.SALT || 'glide');
  const last = await env.DB.prepare('SELECT last FROM limits WHERE ip = ?').bind(ip).first();
  if (last && now - last.last < GAP_MS) return json({ ok: false, error: 'wait' }, 429, origin);

  const r = await env.DB.batch([
    env.DB.prepare('INSERT INTO runs (season, name, km, found, seed, at, created, ip) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(season, name, Math.round(km * 1000) / 1000, found, seed, at, now, ip),
    env.DB.prepare('INSERT INTO limits (ip, last) VALUES (?, ?) ON CONFLICT(ip) DO UPDATE SET last = excluded.last').bind(ip, now),
  ]);
  const id = r[0].meta.last_row_id;
  const rank = await env.DB.prepare('SELECT COUNT(*) AS n FROM runs WHERE season = ? AND km > ?').bind(season, km).first();
  const total = await env.DB.prepare('SELECT COUNT(*) AS n FROM runs WHERE season = ?').bind(season).first();
  return json({ ok: true, id, rank: rank.n + 1, total: total.n }, 200, origin);
}

async function top(url, env, origin) {
  const season = url.searchParams.get('season') || '';
  if (!SEASON.test(season)) return json({ rows: [], total: 0, error: 'season' }, 400, origin);
  const limit = Math.min(1000, Math.max(1, Math.trunc(Number(url.searchParams.get('limit')) || 1000)));
  const offset = Math.max(0, Math.trunc(Number(url.searchParams.get('offset')) || 0));
  const rows = await env.DB.prepare(
    'SELECT id, name, km, found, at FROM runs WHERE season = ? ORDER BY km DESC, created ASC LIMIT ? OFFSET ?')
    .bind(season, limit, offset).all();
  const total = await env.DB.prepare('SELECT COUNT(*) AS n FROM runs WHERE season = ?').bind(season).first();
  return json({ rows: rows.results, total: total.n }, 200, origin);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), origin = req.headers.get('origin') || '';
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    try {
      if (req.method === 'POST' && url.pathname === '/submit') return await submit(req, env, origin);
      if (req.method === 'GET' && url.pathname === '/top') return await top(url, env, origin);
      return json({ ok: false, error: 'not found' }, 404, origin);
    } catch (e) {
      return json({ ok: false, error: 'server' }, 500, origin);
    }
  },
};
