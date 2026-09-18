// 発見(Discovery)の仕組み。飛びながら「あれは何だ」と思って近づくと発見になる。
//
// 新しい発見対象を足すときは、DISCOVERIES に1つ足すだけでよい。
//   id / name(名称) / desc(説明) / rarity(希少度) / radius(発見距離)
//   spawn(出現のさせ方) / cue(遠くからの目印) / model(見た目。無ければ地形やいきものをそのまま使う)
// 飛び方の計算には一切触れない。

// ---------- 出現のさせ方 ----------
// 区画ごとに種つきで決めるので、同じ地形なら毎回同じ場所に出る。
// 将来ランダム配置やバイオーム別にしたいときは、ここに置き方を足す。
const hash = (a, b, c) => {
  let n = Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263) + Math.imul(c | 0, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
};
const seededRng = a => () => {
  a |= 0; a = (a + 0x6D2B79F5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const SPAWNERS = {
  // すでに世界にいる/あるものに付ける
  herd: (ctx, px, py, rad) => [...ctx.herds.herdsNear(px, py, rad)].map(h => ({ key: 'herd:' + h.key, x: h.cx, y: h.cy })),
  volcano: (ctx, px, py, rad) => ctx.terrain.volcanoesNear(px, py, rad)
    .map(v => ({ key: `vol:${Math.round(v.x)},${Math.round(v.y)}`, x: v.x, y: v.y })),
  peak: (ctx, px, py, rad) => ctx.terrain.peaksNear ? ctx.terrain.peaksNear(px, py, rad) : [],

  // 区画ごとに条件に合う場所を探して置く(条件は種類ごとの pick で書く)
  cell: (ctx, px, py, rad, opt) => {
    const S = opt.cell, out = [];
    const n = Math.ceil(rad / S) + 1, ci0 = Math.floor(px / S), cj0 = Math.floor(py / S);
    for (let i = ci0 - n; i <= ci0 + n; i++) for (let j = cj0 - n; j <= cj0 + n; j++) {
      const key = `${opt.id}:${i},${j}`;
      let p = ctx.cache.get(key);
      if (p === undefined) {
        p = null;
        const r = seededRng(Math.imul(ctx.terrain.seed, 8191) ^ Math.imul(i, 92837111) ^ Math.imul(j, 689287499) ^ opt.salt);
        if (r() < opt.chance) {
          for (let k = 0; k < (opt.tries || 24); k++) {
            const x = (i + r()) * S, y = (j + r()) * S;
            if (opt.pick(ctx, x, y)) { p = { key, x, y }; break; }
          }
        }
        ctx.cache.set(key, p);
      }
      if (p && Math.hypot(p.x - px, p.y - py) <= rad) out.push(p);
    }
    return out;
  },
};

// ---------- 発見できるもの ----------
// radius: この距離まで近づくと発見。draw: この距離から描く(モデルがあるときだけ)
export const DISCOVERIES = [
  {
    id: 'stego_herd', name: 'ステゴサウルスの群れ', rarity: 'よくいる', radius: 380,
    desc: '背板を並べた四足の草食恐竜。開けた川辺で草を食み、ゆっくり歩いている。',
    spawn: { kind: 'herd' },
    cue: { color: 0x6d5238, radius: 150, strength: 0.85 },       // 踏み荒らされた地面
  },
  {
    id: 'volcano', name: '噴煙を上げる山', rarity: 'ときどき', radius: 1100,
    desc: '山頂がくぼみ、灰色の煙が風下へ長く流れている。遠くからでも位置が分かる。',
    spawn: { kind: 'volcano' },
  },
  {
    id: 'summit', name: '高い山の頂', rarity: 'よくある', radius: 700,
    desc: '雲底より高くそびえ、越えることができない。回り込むしかない。',
    spawn: { kind: 'peak' },
  },
  {
    id: 'oxbow', name: '大きく曲がる川', rarity: 'よくある', radius: 420,
    desc: '氾濫原を蛇行する川。内側に砂が溜まり、外側が深くえぐれている。',
    spawn: {
      kind: 'cell', cell: 4200, chance: 0.75, salt: 17,
      pick: (ctx, x, y) => {
        const t = ctx.terrain;
        const bend = Math.abs(t.riverX(y + 500) - t.riverX(y - 500));
        // 川筋の地面は水面より40〜60m高いので、高さでは判定できない。湿り気で川沿いを見る
        return bend > 250 && Math.abs(x - t.riverX(y)) < 260 && t.moisture(x, y) > 0.5;
      },
    },
  },
  {
    id: 'nest', name: '営巣地', rarity: 'まれ', radius: 260,
    desc: '乾いた土に掘られた浅いくぼみが並び、卵が寄せ集められている。親の姿は見当たらない。',
    spawn: {
      kind: 'cell', cell: 5200, chance: 0.6, salt: 91,
      pick: (ctx, x, y) => {
        const t = ctx.terrain;
        const h = t.height(x, y);
        return h > t.water + 4 && t.slope(x, y, 25) < 0.1 && t.moisture(x, y) < 0.42 && t.grove(x, y) < 0.42;
      },
    },
    cue: { color: 0xbba077, radius: 70, strength: 0.8 },          // 踏み固められた明るい土
    model: { build: 'nest', scale: 3.5, draw: 1800 },             // 形はその場で作る(GLB不要)
  },
  {
    id: 'lone_tree', name: 'ひときわ大きな木', rarity: 'ときどき', radius: 300,
    desc: '林から離れて一本だけ立つ大木。まわりに背の高い木がなく、遠目にも目立つ。',
    spawn: {
      kind: 'cell', cell: 3600, chance: 0.7, salt: 53,
      pick: (ctx, x, y) => {
        const t = ctx.terrain;
        return t.height(x, y) > t.water + 3 && t.slope(x, y, 25) < 0.14 && t.grove(x, y) < 0.36;
      },
    },
    model: { url: 'models/veg/conifer_lod0.glb', scale: 5, draw: 2600 },    // Astra製GLBはこの形式で足す(原型7.8m -> 39m)
  },
];

export const BY_ID = Object.fromEntries(DISCOVERIES.map(d => [d.id, d]));

// ---------- 近くの発見対象を出す ----------
export class DiscoverySites {
  constructor(ctx) {
    this.ctx = { ...ctx, cache: new Map() };
    this.types = DISCOVERIES;
  }
  // 近くの対象。{ key, type, x, y, z, d }
  near(px, py, rad = 2600) {
    const out = [];
    for (const type of this.types) {
      const spawn = SPAWNERS[type.spawn.kind];
      if (!spawn) continue;
      for (const p of spawn(this.ctx, px, py, rad, { ...type.spawn, id: type.id })) {
        const d = Math.hypot(p.x - px, p.y - py);
        if (d > rad) continue;
        out.push({ key: p.key, type, x: p.x, y: p.y, z: this.ctx.terrain.height(p.x, p.y), d });
      }
    }
    return out.sort((a, b) => a.d - b.d);
  }
  // 地面の色を変える目印(発見しやすくするため)
  tints(px, py, rad = 9000) {
    const out = [];
    for (const s of this.near(px, py, rad)) {
      if (!s.type.cue) continue;
      out.push({ x: s.x, y: s.y, r: s.type.cue.radius, color: s.type.cue.color, strength: s.type.cue.strength });
    }
    return out;
  }
}
