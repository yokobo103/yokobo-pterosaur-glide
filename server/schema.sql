-- 翼竜グライダーの世界ランキング(Cloudflare D1)
-- runs: 1走行1行。season ごとに別の表として読む(大きく作り変えたら season を変える)
CREATE TABLE IF NOT EXISTS runs (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  season  TEXT    NOT NULL,
  name    TEXT    NOT NULL,
  km      REAL    NOT NULL,
  found   INTEGER NOT NULL DEFAULT 0,
  seed    INTEGER,
  at      INTEGER,            -- 端末が付けた時刻(自分の行に印を付けるのに使う)
  created INTEGER NOT NULL,   -- 受け付けた時刻
  ip      TEXT                -- 連投よけ。IPそのものではなく塩を足したハッシュの頭だけ
);
CREATE INDEX IF NOT EXISTS runs_season_km ON runs (season, km DESC, created ASC);

-- 連投よけ: 同じ送り元からの最後の受付時刻
CREATE TABLE IF NOT EXISTS limits (
  ip   TEXT PRIMARY KEY,
  last INTEGER NOT NULL
);
