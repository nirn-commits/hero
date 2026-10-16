// 口調（裏ステータス）と台詞
(function (G) {
  'use strict';
  const { R, D, fill } = G;
  const P = G.Sim.prototype;
  const H = (h) => `⟦h${h.id}⟧`;
  const has = (h, list) => h.traits && h.traits.some((t) => list.includes(t));

  // ヒーローの口調と一人称を決める
  function assignVoice(h) {
    const age = typeof h.age === 'number' ? h.age : 30;
    const g = h.gender === '男' ? 'M' : h.gender === '女' ? 'F' : 'N';
    const pw = h.power ? h.power.name : '';
    // ほとんどは普通の話し方。方言はほどほど、くせの強い口調は条件がそろった人だけ
    const strong = (cond, wt) => (cond ? wt : 0);
    const w = {
      polite: 6 + (has(h, ['真面目', '礼儀正しい', '冷静沈着', '完璧主義', '心配性']) ? 3 : 0) + (age > 35 ? 1 : 0),
      casual: 7 + (age < 35 ? 1 : 0),
      cool: 0.8 + (has(h, ['寡黙', 'クール', '一匹狼', '無口な職人', 'ドライ', 'ミステリアス']) ? 3 : 0),
      cheerful: 0.4 + (has(h, ['陽気', '天然', 'ムードメーカー', '泣き虫']) ? 1.5 : 0),
      rough: 0.3 + (has(h, ['短気', '体育会系', '負けず嫌い', '頑固者', '毒舌']) ? 1.5 : 0),
      kansai: h.region === '近畿' ? 3.5 : 0,
      hakata: h.region === '九州沖縄' && h.pref !== '沖縄県' ? 1.2 : 0,
      tohoku: h.region === '東北' ? 1 : 0,
      hiroshima: ['広島県', '山口県', '岡山県'].includes(h.pref) ? 1.2 : 0,
      nagoya: ['愛知県', '岐阜県'].includes(h.pref) ? 0.8 : 0,
      kyoto: h.pref === '京都府' ? 1 : 0,
      tosa: h.pref === '高知県' ? 1.2 : 0,
      okinawa: h.pref === '沖縄県' ? 1.5 : 0,
      taiikukai: strong(has(h, ['体育会系', '筋トレ馬鹿']) || /選手|力士|ボクサー/.test(h.job), 0.8),
      elder: age >= 68 ? 1.5 : 0,
      kodomo: age < 15 ? 2 : 0,
      samurai: strong(has(h, ['古風']) && /剣術|忍術|弓術|陰陽/.test(pw), 1),
      chuuni: strong(has(h, ['中二病']), 1.5),
      otaku: strong(has(h, ['オタク気質']), 0.5),
      teacher: strong(/教師|塾講師|保育士/.test(h.job), 0.5),
      monk: strong(/住職|僧/.test(h.job), 0.6),
      hakase: strong(/研究者|大学教授/.test(h.job) && has(h, ['理屈っぽい', '完璧主義']), 0.6),
      edo: strong(h.pref === '東京都' && has(h, ['短気', '情に厚い']) && age > 45, 0.4),
      oneesan: strong(has(h, ['世話焼き', '面倒見がいい']) && age >= 30, 0.2),
      ninja: strong(/忍術/.test(pw), 0.8),
      robot: strong(/サイボーグ|AI相棒/.test(pw), 0.4),
      ojou: strong(pw === '大富豪' && g === 'F', 0.8),
      butler: strong(/ホテルマン/.test(h.job), 0.4),
      idol: strong(/地下アイドル/.test(h.job), 0.6),
      gyaru: strong(age < 22 && has(h, ['SNS中毒', 'お調子者']), 0.3),
      chara: strong(age < 30 && has(h, ['恋多き', 'お調子者']), 0.25),
      neko: strong(pw === '猫化', 1),
    };
    h.tone = R.wpick(Object.keys(w), (k) => w[k]);
    const t = D.tones[h.tone];
    h.fp = R.pick(t.fp[g] || t.fp.N);
  }
  function assignVillainVoice(v) {
    v.tone = R.wpick(Object.keys(D.vtones), (k) => ({ villain_polite: 3, villain_rough: 4, villain_cold: 4, villain_laugh: 0.8, villain_mad: 0.5 })[k] || 1);
    v.fp = R.pick(D.vtones[v.tone].fp);
  }

  P.ensureVoice = function () {
    // 口調の割り振りを改めた版（v2）より前の世界は、全員を割り振り直す
    const redo = this.voiceVer !== 2;
    for (const h of this.heroes) { if (!h.tone || redo) assignVoice(h); if (!h.quotes) h.quotes = []; }
    for (const v of this.villains) if (v.kind === 'villain' && (!v.tone || redo)) assignVillainVoice(v);
    this.voiceVer = 2;
  };

  // ヒーローが場面に合った台詞を言う（「」なし）。語録に残す
  P.line = function (h, sit, ctx = {}) {
    if (!h.tone) assignVoice(h);
    const t = D.tones[h.tone] || D.tones.casual;
    const list = t[sit] || D.tones.casual[sit];
    if (!list) return '';
    const text = fill(R.pick(list), { fp: h.fp, ...ctx }).replace(/。$/, '');
    if (!h.quotes) h.quotes = [];
    h.quotes.push({ y: this.year, d: this.day, s: sit, t: text });
    if (h.quotes.length > 15) h.quotes.shift();
    return text;
  };
  // 「〜」と語った、の形
  P.says = function (h, sit, ctx, verb) {
    const t = this.line(h, sit, ctx);
    return t ? `${H(h)}は「${t}」と${verb || R.pick(['語った', '話した', 'コメントした'])}。` : '';
  };
  // 旧来の quote() を口調つきに置き換える
  P.quote = function (h, win) { return `「${this.line(h, win ? 'win' : 'lose')}」`; };

  P.vline = function (v, sit) {
    if (v.kind !== 'villain') return '';
    if (!v.tone) assignVillainVoice(v);
    const t = D.vtones[v.tone];
    return t && t[sit] ? fill(R.pick(t[sit]), { fp: v.fp }).replace(/。$/, '') : '';
  };

  // 記者の質問に答える
  P.interview = function (h) {
    const opts = D.interviews.filter(([, s]) => !s.includes('{rival}') || h.rival !== null);
    const [q, s] = R.pick(opts);
    const t = D.tones[h.tone] || D.tones.casual;
    const ctx = {
      food: h.food, skill: h.skill, motto: h.motto, move: h.move, motive: h.motive, pref: h.pref, dislike: h.dislike, weak: h.weak, color: h.color,
      rival: h.rival !== null ? this.heroes[h.rival].name : '', goal: h.rank && h.rank > 10 ? Math.max(1, Math.round(h.rank / 20) * 10) : 1,
    };
    let ans = fill(s, ctx) + R.pick(t.cop);
    if (h.tone === 'cool') ans = '……' + ans;
    if (h.tone === 'robot') ans = ans.replace(/[ぁ-ん]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
    ans = ans.replace(/。$/, '');
    if (!h.quotes) h.quotes = [];
    h.quotes.push({ y: this.year, d: this.day, s: 'interview', t: ans });
    if (h.quotes.length > 15) h.quotes.shift();
    this.post('media', this.isTop(h, 10) ? 2 : 1, `${q}${H(h)}は「${ans}」と答えた。`, { h: [h] });
  };

  P.voiceDaily = function () {
    if (R.chance(0.35)) {
      const h = R.wpick(this.ranked.slice(0, 150).filter((x) => x.status === 'active'), (x) => 1 + x.fame / 150);
      if (h) this.interview(h);
    }
  };

  G.assignVoice = assignVoice;
  G.assignVillainVoice = assignVillainVoice;
})(globalThis.HG = globalThis.HG || {});
