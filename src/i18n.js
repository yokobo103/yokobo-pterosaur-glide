// 日本語と英語。ブラウザの言語で決め、スタート画面のボタンで切り替えられる。
// 画面に出る文字はここに集める(発見の名前と説明は discoveries.js 側に en を持たせる)。

const DICT = {
  ja: {
    title: '翼竜グライダー',
    hudDist: 'キョリ km', hudAlt: 'タカサ m',
    intro: [
      '上がる空気（上昇気流）に乗って、どこまで行けるか。',
      '見つけかたは、舞い上がっている土ぼこりの柱。', '',
      '操作は左右だけ。<kbd>←</kbd><kbd>→</kbd>、スマホは画面の左半分／右半分を押しっぱなし。',
      '押している間だけ曲がります。', '',
      '右の帯と音が上がっていれば、上昇気流の芯に近い。', '',
      '乾いて開けた地面のすぐ上は空気が暖かく、<b>低く飛ぶほど沈みにくい</b>。',
      '恐竜を間近で見たいときは、地面すれすれを行く。',
      '日が傾くと空気は上がらなくなります。降りたところが記録。',
    ],
    camA: '水平キープ', camB: '少し傾く', camC: '見下ろし',
    camNote: '画面酔いしやすい人は「水平キープ」か「見下ろし」',
    start: 'はじめる',
    endSunset: '日が暮れて、空気が上がらなくなった',
    endLanded: '降りた。もう一度: R キー / 画面を二回たたく',
    foundNone: '今回の発見はなし',
    foundFirst: 'はじめて',
    again: 'もう一度', ranking: 'ランキング',
    rankMine: 'この端末', rankWorld: '世界',
    rankHeadMine: 'この端末の記録', rankHeadWorld: '世界の記録',
    rankEmpty: 'まだ記録がない',
    rankWorldOff: '世界の記録はまだ開いていません',
    rankWorldFail: '世界の記録を読めませんでした',
    rankLoading: '読み込み中…',
    namePlace: 'なまえ', save: '記録する', saved: '記録した',
    close: '閉じる', thisRun: '今回',
    season: 'シーズン',
    discoveries: n => `発見 ${n}`,
    km: 'km',
  },
  en: {
    title: 'Pterosaur Glider',
    hudDist: 'DIST km', hudAlt: 'ALT m',
    intro: [
      'Ride the rising air and see how far you can go.',
      'Look for columns of dust lifting off the ground.', '',
      'Left and right only. <kbd>←</kbd><kbd>→</kbd>, or hold the left/right half of the screen.',
      'You turn only while holding.', '',
      'When the bar on the right rises, you are near the core of a thermal.', '',
      'The air just above dry open ground is warm: <b>the lower you fly, the slower you sink</b>.',
      'Skim the ground to see the dinosaurs up close.',
      'As the sun sets the air stops rising. Where you land is your record.',
    ],
    camA: 'Level', camB: 'Slight tilt', camC: 'Look down',
    camNote: 'If you get motion sick, pick "Level" or "Look down"',
    start: 'Start',
    endSunset: 'The sun set and the air stopped rising',
    endLanded: 'Landed. Again: R key / double tap',
    foundNone: 'Nothing found this run',
    foundFirst: 'first time',
    again: 'Again', ranking: 'Ranking',
    rankMine: 'This device', rankWorld: 'World',
    rankHeadMine: 'Records on this device', rankHeadWorld: 'World records',
    rankEmpty: 'No records yet',
    rankWorldOff: 'World records are not open yet',
    rankWorldFail: 'Could not load the world records',
    rankLoading: 'Loading…',
    namePlace: 'name', save: 'Save', saved: 'Saved',
    close: 'Close', thisRun: 'this run',
    season: 'Season',
    discoveries: n => `${n} found`,
    km: 'km',
  },
};

const STORE = 'glide.lang';
let lang = 'ja';
try {
  const saved = localStorage.getItem(STORE);
  lang = DICT[saved] ? saved : (navigator.language || '').toLowerCase().startsWith('ja') ? 'ja' : 'en';
} catch (e) { /* 読めない環境でも遊べる */ }

export const getLang = () => lang;
export function setLang(v) {
  if (!DICT[v]) return;
  lang = v;
  try { localStorage.setItem(STORE, v); } catch (e) { /* 覚えられなくても切り替えは効く */ }
}
export function t(key, ...args) {
  const v = DICT[lang][key] ?? DICT.ja[key] ?? key;
  return typeof v === 'function' ? v(...args) : v;
}
// 発見の名前・説明のように、データ側が {name, en:{name}} を持つときに引く
export const pick = (obj, key) => (lang === 'en' && obj.en && obj.en[key]) || obj[key];
