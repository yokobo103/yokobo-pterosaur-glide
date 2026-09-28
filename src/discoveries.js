// 発見(Discovery)の仕組み。飛びながら「あれは何だ」と思って近づくと発見になる。
//
// 新しい発見対象を足すときは、DISCOVERIES に1つ足すだけでよい。
//   no(ずかんの番号) / id / name(名称) / desc(説明) / rarity(希少度) / radius(発見距離) / eye(見えるべき高さ)
//   en(英語の名称・説明・希少度)
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
  herd: (ctx, px, py, rad, opt) => [...ctx.herdsOf[opt.species].herdsNear(px, py, rad)]
    .map(h => ({ key: `${opt.species}:${h.key}`, x: h.cx, y: h.cy })),
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
    no: 1, id: 'stego_herd', name: 'ステゴサウルスの群れ', rarity: 'よくいる', radius: 380, eye: 25,
    desc: '背板を並べた四足の草食恐竜。開けた川辺で草を食み、ゆっくり歩いている。',
    en: { name: 'A herd of Stegosaurus', desc: 'Four-legged plant eaters with plates along the back. They graze by the river and walk slowly.', rarity: 'common' },
    spawn: { kind: 'herd', species: 'stego' },
    cue: { color: 0x6d5238, radius: 150, strength: 0.85 },       // 踏み荒らされた地面
  },
  {
    no: 2, id: 'dryo_group', name: 'ドリオサウルスの一団', rarity: 'ときどき', radius: 340, eye: 12,
    desc: '赤茶の背と砂色の腹をした二足の小型草食恐竜。林の縁を数頭で歩き、時どき立ち止まる。',
    en: { name: 'A group of Dryosaurus', desc: 'Small two-legged plant eaters, russet backs and sandy bellies. They walk the forest edge and stop now and then.', rarity: 'uncommon' },
    // 群れは world.js の SPECIES.dryo が世界に配っている。ここでは「発見できる」ことだけを書く
    spawn: { kind: 'herd', species: 'dryo' },
    cue: { color: 0x7a6a42, radius: 80, strength: 0.55 },                     // 食み跡の薄い土
  },
  {
    no: 3, id: 'tricera_herd', name: 'トリケラトプスの群れ', rarity: 'ときどき', radius: 420, eye: 28,
    desc: '三本の角と大きな襟飾りを持つ四足の草食恐竜。乾いた開けた台地を、隊列のように並んで歩く。',
    en: { name: 'A herd of Triceratops', desc: 'Four-legged plant eaters with three horns and a wide frill. They cross the dry plateau almost in file.', rarity: 'uncommon' },
    spawn: { kind: 'herd', species: 'tricera' },
    cue: { color: 0x8a6b45, radius: 130, strength: 0.7 },                     // 踏み荒らされた乾いた土
  },
  {
    no: 4, id: 'brachio_group', name: 'ブラキオサウルス', rarity: 'まれ', radius: 900, eye: 45,
    desc: '首を高く上げた巨大な四足の草食恐竜。全長69m・高さ42m。川沿いの低地をゆっくり歩き、遠くからでも見つかる。',
    en: { name: 'Brachiosaurus', desc: 'A huge four-legged plant eater with its neck held high. 69m long, 42m tall. It walks the lowland by the river and shows from far off.', rarity: 'rare' },
    spawn: { kind: 'herd', species: 'brachio' },
    cue: { color: 0x6f6244, radius: 190, strength: 0.6 },
  },
  {
    no: 5, id: 'allo', name: 'アロサウルス', rarity: 'まれ', radius: 380, eye: 30,
    desc: '大きな頭と鋭い歯を持つ二足の捕食者。単独か二頭で、草食の群れから少し離れた開けた所を歩いている。',
    en: { name: 'Allosaurus', desc: 'A two-legged hunter with a big head and sharp teeth. One or two of them, out in the open a little away from the herds.', rarity: 'rare' },
    spawn: { kind: 'herd', species: 'allo' },
    cue: { color: 0x5f5138, radius: 70, strength: 0.65 },
  },
  {
    no: 6, id: 'trex', name: 'ティラノサウルス', rarity: 'まれ', radius: 420, eye: 40,
    desc: '大きな箱のような頭と、小さな二本指の腕。いつも一頭で、トリケラトプスのいる乾いた台地を歩いている。',
    en: { name: 'Tyrannosaurus', desc: 'A huge boxy head and tiny two-fingered arms. Always alone, walking the dry plateau where the Triceratops roam.', rarity: 'rare' },
    spawn: { kind: 'herd', species: 'trex' },
    cue: { color: 0x5a4028, radius: 80, strength: 0.65 },
  },
  // ---------- 景色として置くだけのもの ----------
  // scenery: true は「世界には出るが、発見にもずかんにも入らない」印。
  // 恐竜以外を発見にすると何を探す遊びなのか分かりにくかったので、置物に戻した(所長 2026-09-28)
  {
    scenery: true, id: 'nest', name: '営巣地',
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
    scenery: true, id: 'lone_tree', name: 'ひときわ大きな木',
    spawn: {
      kind: 'cell', cell: 3600, chance: 0.7, salt: 53,
      pick: (ctx, x, y) => {
        const t = ctx.terrain;
        return t.height(x, y) > t.water + 3 && t.slope(x, y, 25) < 0.14 && t.grove(x, y) < 0.36;
      },
    },
    model: { url: 'models/veg/conifer_lod0.glb', scale: 5, draw: 2600 },    // Astra製GLB(原型7.8m -> 39m)
  },
];

export const BY_ID = Object.fromEntries(DISCOVERIES.map(d => [d.id, d]));
// ずかんの並び。番号順。足せばそのぶんずかんも増える(番号は書いたものをそのまま使う)
// scenery のものは入れない(置物であって、発見の対象ではない)
export const DEX = DISCOVERIES.filter(d => !d.scenery).sort((a, b) => (a.no || 99) - (b.no || 99));

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
