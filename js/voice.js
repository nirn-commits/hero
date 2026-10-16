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
    const w = {
      polite: 3 + (has(h, ['真面目', '礼儀正しい', '冷静沈着', '完璧主義', '心配性']) ? 6 : 0) + (age > 35 ? 1 : 0),
      casual: 4,
      rough: 0.6 + (has(h, ['短気', '体育会系', '負けず嫌い', '頑固者', '毒舌']) ? 5 : 0) + (/暴走族|ヤンキー|ヴィラン/.test(h.job + h.quirk) ? 4 : 0),
      kansai: h.region === '近畿' ? 7 : 0.2,
      hakata: h.region === '九州沖縄' ? 4 : 0.05,
      tohoku: h.region === '東北' ? 4 : 0.05,
      samurai: 0.3 + (has(h, ['古風', '義理堅い']) ? 5 : 0) + (/剣術|忍術|陰陽|弓術|刀/.test(pw) ? 5 : 0),
      ojou: g === 'F' ? 0.4 + (has(h, ['ナルシスト', '自信家']) ? 3 : 0) + (pw === '大富豪' ? 5 : 0) : g === 'M' && pw === '大富豪' ? 2 : 0,
      gyaru: age < 28 ? 0.4 + (has(h, ['SNS中毒', 'お調子者', '陽気', '目立ちたがり']) ? 3 : 0) : 0,
      elder: age >= 62 ? 8 : age >= 55 ? 3 : age >= 48 ? 0.5 : 0,
      chuuni: 0.2 + (has(h, ['中二病']) ? 12 : 0) + (h.power && (h.power.el === 'dark' || h.power.el === 'mind') ? 0.6 : 0),
      cool: 0.5 + (has(h, ['寡黙', 'クール', '一匹狼', '無口な職人', 'ドライ', 'ミステリアス']) ? 6 : 0),
      cheerful: (age < 25 ? 1 : 0.2) + (has(h, ['陽気', '天然', 'ムードメーカー', '泣き虫', 'のんびり屋']) ? 4 : 0),
      robot: /サイボーグ|AI|ロボ|機/.test(pw) ? 3 : 0.03,
      hiroshima: ['広島県', '山口県', '岡山県'].includes(h.pref) ? 5 : 0.03,
      nagoya: ['愛知県', '岐阜県'].includes(h.pref) ? 4 : 0.03,
      okinawa: h.pref === '沖縄県' ? 8 : 0.02,
      kyoto: h.pref === '京都府' ? 6 : 0.02,
      tosa: h.pref === '高知県' ? 8 : 0.02,
      edo: h.pref === '東京都' ? 1.2 + (has(h, ['短気', '情に厚い', '義理堅い']) ? 3 : 0) : 0.05,
      otaku: 0.1 + (has(h, ['オタク気質']) ? 8 : 0),
      idol: 0.1 + (/アイドル|声優|モデル|配信/.test(h.job) ? 5 : 0) + (has(h, ['目立ちたがり', 'ナルシスト']) && age < 30 ? 1.5 : 0),
      neko: 0.05 + (/猫|ネコ/.test(pw) ? 10 : 0) + (h.power && h.power.el === 'beast' && has(h, ['天然', 'のんびり屋']) ? 2 : 0),
      kodomo: age < 15 ? 8 : age < 17 ? 1 : 0,
      hakase: 0.1 + (/研究者|大学教授|医師|外科医/.test(h.job) ? 4 : 0) + (has(h, ['理屈っぽい', '完璧主義']) ? 2 : 0) + (h.stats && h.stats.int > 85 ? 1 : 0),
      oneesan: (age >= 26 ? 0.3 : 0) + (has(h, ['世話焼き', '面倒見がいい', '姐御']) && age >= 26 ? 3 : 0),
      ninja: 0.05 + (/忍術|影|透明|光学迷彩/.test(pw) ? 4 : 0),
      chara: age < 35 ? 0.2 + (has(h, ['恋多き', 'お調子者', '人たらし']) ? 3 : 0) : 0,
      butler: 0.1 + (has(h, ['礼儀正しい', '完璧主義']) && age >= 25 ? 1.5 : 0) + (/ホテルマン/.test(h.job) ? 4 : 0),
      teacher: 0.1 + (/教師|塾講師|保育士|教授|先生/.test(h.job) ? 5 : 0),
      monk: 0.05 + (/住職|僧|神主|巫女/.test(h.job) ? 6 : 0),
      taiikukai: 0.3 + (has(h, ['体育会系', '筋トレ馬鹿']) ? 5 : 0) + (/選手|力士|ボクサー|トレーナー/.test(h.job) ? 3 : 0),
    };
    h.tone = R.wpick(Object.keys(w), (k) => w[k]);
    const t = D.tones[h.tone];
    h.fp = R.pick(t.fp[g] || t.fp.N);
  }
  function assignVillainVoice(v) {
    const ks = Object.keys(D.vtones);
    v.tone = R.pick(ks);
    v.fp = R.pick(D.vtones[v.tone].fp);
  }

  P.ensureVoice = function () {
    for (const h of this.heroes) { if (!h.tone) assignVoice(h); if (!h.quotes) h.quotes = []; }
    for (const v of this.villains) if (v.kind === 'villain' && !v.tone) assignVillainVoice(v);
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
