// 長編の仕掛け：時代・世論・黒幕・宿敵・節目・師弟の継承・事務所・週刊誌・全国大会・年代記
(function (G) {
  'use strict';
  const { R, D, clamp, fill, Gen } = G;
  const P = G.Sim.prototype;
  const H = (h) => `⟦h${h.id}⟧`;
  const V = (v) => `⟦v${v.id}⟧`;
  const O = (o) => `⟦o${o.id}⟧`;
  const dayOf = (y, m, d) => Math.round((new Date(y, m - 1, d) - new Date(y, 0, 1)) / 864e5);

  // 古い保存データにも足りない項目を補う
  P.ensureStory = function () {
    if (this.startYear === undefined) this.startYear = this.awards.length ? this.awards[0].year : this.year;
    if (!this.era) this.era = { key: 'normal', from: this.year, to: this.year + R.int(1, 2) };
    if (this.approval === undefined) this.approval = 62;
    if (!this.apHist) this.apHist = [[this.day, this.approval]];
    if (this.reformCool === undefined) this.reformCool = 60;
    if (this.boss === undefined) this.boss = null;
    if (this.bossNext === undefined) this.bossNext = this.year + R.int(1, 3);
    if (!this.covers) this.covers = [];
    if (!this.tourneys) this.tourneys = [];
    if (!this.chronicles) this.chronicles = [];
    if (!this.ag) {
      this.ag = {};
      for (const a of D.agencies) if (a.type !== 'フリー') this.ag[a.name] = { name: a.name, region: a.region, type: a.type, status: 'active', founded: this.startYear, power: 0, members: 0, rank: null, prevRank: null };
    }
    for (const x of this.heroes.concat(this.villains)) {
      const fixed = G.normalizeGen(x.name);
      if (fixed !== x.name) { this.usedNames.add(fixed); x.name = fixed; }
      if (x.oldNames) x.oldNames = x.oldNames.map(G.normalizeGen);
    }
    for (const h of this.heroes) if (!h.blood) Gen.profile(h);
    for (const h of this.heroes) { if (!h.ms) h.ms = []; if (h.t100 === undefined) h.t100 = 0; if (!h.buzz) h.buzz = 0; }
  };

  P.eraDef = function () { return D.eras.find((e) => e.key === this.era.key) || D.eras[0]; };
  P.mod = function (k) { const m = this.eraDef().mods[k]; return m === undefined ? 1 : m; };
  P.approve = function (d) { this.approval = clamp(this.approval + d, 5, 98); };

  // ---------- 毎日 ----------
  P.storyDaily = function (m, dd) {
    if (m === 1 && dd === 1) this.newYearStory();
    this.bossDaily(m, dd);
    // 宿敵との再戦
    for (const v of this.villains) {
      if (v.status !== 'free' || v.kind !== 'villain' || !v.saga || v.saga.closed || v.isBoss) continue;
      const h = this.heroes[v.saga.h];
      if (h.status === 'active' && !h.busy && R.chance(0.005)) this.incident('villain', { v, lead: h });
    }
    if (dd === 15) this.post('world', this.approval < 40 || this.approval > 80 ? 2 : 1, `今月の世論調査で、ヒーローを「信頼している」と答えた人は${Math.round(this.approval)}%だった。${this.approval < 40 ? '不祥事の続発が響いているとみられる。' : this.approval > 80 ? '歴代でも高い水準となっている。' : ''}`);
    if (--this.reformCool <= 0) {
      if (this.approval < 38) this.reformLaw();
      else if (this.approval > 86) {
        this.reformCool = 150;
        const top = this.ranked.slice(0, 20);
        top.forEach((h) => (h.fame += 10));
        this.post('world', 3, `ヒーローへの支持率が${Math.round(this.approval)}%に達し、過去最高水準となった。各地で感謝のイベントが開かれている。`);
        this.logRec('policy', { kind: '支持率最高', ap: Math.round(this.approval) });
      }
    }
    for (const h of this.ranked.slice(0, 30)) {
      if (h.birthday && h.birthday[0] === m && h.birthday[1] === dd && typeof h.age === 'number') {
        h.fame += 5;
        this.post('media', 1, fill(`今日は${H(h)}（${h.age}歳）の誕生日。[ファンから大量の${h.food}が届いたという。|SNSには祝福のメッセージがあふれた。|事務所でささやかなお祝い会が開かれた。]`), { h: [h] });
      }
    }
    if (m === 10 && dd === 1) this.tourneyStart();
    if ((m === 10 && (dd === 10 || dd === 17 || dd === 24)) || (m === 11 && dd === 3)) this.tourneyRound();
  };

  P.newYearStory = function () {
    if (this.year >= this.era.to) this.newEra();
    if (!this.boss && this.year >= this.bossNext) this.bossSpawn();
  };

  // ---------- 時代 ----------
  P.newEra = function () {
    const old = this.eraDef();
    const lowAp = this.approval < 45, highAp = this.approval > 75;
    const e = R.wpick(D.eras.filter((x) => x.key !== old.key), (x) => x.w * (lowAp && x.low ? 2.5 : 1) * (highAp && x.high ? 2.5 : 1));
    this.era = { key: e.key, from: this.year, to: this.year + R.int(2, 5) };
    this.post('world', 3, `【時代】${old.name}が終わり、「${e.name}」が始まった。${e.start}`);
    this.logRec('era', { key: e.key, name: e.name, prev: old.name });
    if (e.onStart === 'massEscape') {
      const jail = this.villains.filter((v) => v.status === 'captured' && v.kind === 'villain' && !v.sealed);
      const out = R.shuffle(jail).slice(0, Math.min(25, Math.ceil(jail.length * 0.35)));
      for (const v of out) { v.status = 'free'; v.jail = 0; }
      this.st.escapes += out.length;
      if (out.length) this.post('villain', 3, `大脱獄で${out.length}名のヴィランが野に放たれた。なかでも${G.joinNames(out.slice(0, 3).map(V))}の行方が警戒されている。`, { v: out.slice(0, 3) });
    }
  };

  // ---------- 世論と制度改革 ----------
  P.reformLaw = function () {
    const r = R.pick(D.reforms);
    this.reformCool = 150;
    let text = `ヒーローへの支持率が${Math.round(this.approval)}%まで落ち込んだことを受け、${r.text}`;
    const refs = [];
    if (r.key === 'audit') {
      const bad = this.ranked.filter((h) => h.status === 'active').sort((a, b) => a.stats.mor - b.stats.mor).slice(0, R.int(2, 4));
      text += `監査の結果、${G.joinNames(bad.map(H))}らの不正が次々と明るみに出た。`;
      this.post('world', 3, text, { h: bad });
      this.logRec('policy', { kind: '抜き打ち監査', ap: Math.round(this.approval) });
      for (const h of bad) this.scandal(h);
    } else {
      if (r.key === 'ethics') for (const h of this.heroes) h.stats.mor = Math.min(100, h.stats.mor + 4);
      if (r.key === 'pay') for (const h of this.heroes) h.points *= 0.9;
      this.post('world', 3, text, { h: refs });
      this.logRec('policy', { kind: r.key === 'ethics' ? '倫理研修の義務化' : '報酬制度の見直し', ap: Math.round(this.approval) });
    }
    this.approve(10);
  };

  // ---------- 黒幕 ----------
  P.bossSpawn = function () {
    const pref = Gen.pickPrefObj();
    const name = Gen.uniq(this, () => (R.chance(0.5) ? R.pick(D.bossPre) + R.pick(D.bossCore) : R.pick(D.bossKata)));
    const v = Gen.villain(this, { pref, talent: 97, tierBias: 4, name });
    v.isBoss = true;
    v.threat = 'S';
    v.notoriety = 100;
    v.motive = R.pick(['日本の支配', '全人類の能力者化', 'ヒーロー制度の完全な破壊', '世界の「再起動」']);
    for (const k of ['pow', 'tec', 'spd', 'men', 'int']) v.stats[k] = Math.max(v.stats[k], R.int(88, 99));
    this.boss = { v: v.id, year: this.year, since: this.year, united: [] };
    this.post('villain', 2, `【不穏】全国のヴィランたちの間で、ある名前がささやかれ始めている。「${V(v)}」。`, { v: [v] });
  };

  P.bossDaily = function (m, dd) {
    const b = this.boss;
    if (!b || b.year !== this.year) return;
    const v = this.villains[b.v];
    const ctx = { v: V(v) };
    if (m === 2 && dd === 10) {
      const t = b.since === this.year ? fill(R.pick(D.bossLines.shadow), ctx) : `昨年の「審判の日」を生き延びた${V(v)}が、再び動き出した。`;
      this.post('villain', 3, t, { v: [v] });
      this.approve(-3);
    }
    if ((m === 4 || m === 6) && dd === 15) {
      const o = R.pick(this.orgs.filter((x) => x.status === 'active' && !b.united.includes(x.id)));
      if (o) {
        b.united.push(o.id);
        o.strength = Math.min(100, o.strength + 15);
        this.post('villain', 3, fill(R.pick(D.bossLines.unite), { ...ctx, o: O(o) }), { v: [v], o });
      }
    }
    if (m === 8 && dd === 20) {
      this.post('big', 3, fill(R.pick(D.bossLines.strike), ctx), { v: [v] });
      this.approve(-5);
      const o = this.orgs[R.pick(b.united.length ? b.united : [-1])];
      if (o && o.status === 'active') {
        const ms = this.orgMembers(o).filter((x) => x.status === 'free');
        if (ms.length) this.incident('org', { o, v: R.pick(ms) });
      }
    }
    if ((m === 10 && dd === 20) || (m === 11 && dd === 20) || (m === 12 && dd === 10)) {
      this.post('villain', 2, fill(R.pick(D.bossLines.countdown), { n: dayOf(this.year, 12, 20) - this.day }), { v: [v] });
    }
    if (m === 12 && dd === 20) this.bossFinale();
  };

  P.bossFinale = function () {
    const b = this.boss;
    const v = this.villains[b.v];
    const def = D.finale;
    const pool = this.heroes.filter((h) => h.status === 'active');
    const hs = pool.slice().sort((a, c) => a.rank - c.rank).slice(0, 10);
    hs.push(...R.wsample(pool.filter((h) => !hs.includes(h)), 2, (h) => 1 + this.score(h) / 200));
    const united = b.united.map((id) => this.orgs[id]).filter((o) => o.status === 'active');
    const diff = G.eff(v, def.need) * 2.6 + united.reduce((s, o) => s + o.strength, 0) * 0.8;
    const order = hs.map((h) => [h, G.eff(h, def.need) * R.f(0.8, 1.2)]).sort((a, c) => c[1] - a[1]);
    const SH = [1, 0.75, 0.6, 0.5, 0.45, 0.4, 0.35, 0.3, 0.28, 0.25, 0.22, 0.2];
    const total = order.reduce((s, x, i) => s + x[1] * SH[i], 0);
    const ratio = (total * R.f(0.75, 1.3)) / (diff * R.f(0.85, 1.15));
    const out = ratio >= 1.4 ? 'great' : ratio >= 1.0 ? 'win' : ratio >= 0.75 ? 'fail' : 'bad';
    const lead = order[0][0];
    const all = order.map((x) => x[0]);
    const pref = this.prefObj(v.pref);
    const ctx = { v: V(v), pref: pref.name, h: H(lead), hs: G.joinNames(all.map(H)) };
    let text = fill(R.pick(def.intro), ctx) + fill(R.pick(def[out]), ctx);
    const deaths = [];
    if (out === 'great' || out === 'win') {
      this.capture(v, lead);
      v.sealed = true;
      for (const o of united) o.strength = Math.max(5, o.strength - 35);
      lead.titles.push({ y: this.year, title: '救国の英雄' });
      for (const h of all) { h.fame += 80 * this.mod('fame'); h.points += 150; h.yrec.pts += 150; }
      lead.fame += 120;
      this.approve(15);
      text += `${H(lead)}は「${this.line(lead, 'win')}」と語り、${H(all[1])}は「${this.line(all[1], 'ally', { p: H(lead) })}」と振り返った。`;
      text += `連行される${V(v)}は「${this.vline(v, 'caught')}」と言い残した。`;
      this.boss = null;
      this.bossNext = this.year + R.int(4, 6);
    } else {
      for (const h of all) {
        if (out === 'bad' && R.chance(0.1 * this.mod('death'))) { deaths.push(h); continue; }
        if (R.chance(out === 'bad' ? 0.6 : 0.3)) this.injure(h, R.int(15, 60));
      }
      this.approve(out === 'bad' ? -12 : -6);
      b.year = this.year + 1;
    }
    this.post('big', 3, text, { h: all, v: [v] });
    this.logRec('boss', { v: v.id, h: lead.id, res: out === 'great' || out === 'win' ? '撃破' : out === 'fail' ? '逃亡' : '敗北', heroes: all.map((h) => h.id) });
    for (const h of deaths) this.die(h, v);
    for (const h of all) h.busy = true;
  };

  // ---------- 事件のあと（宿敵・台詞・世論） ----------
  P.onIncident = function (type, v, out, all, big) {
    const won = out === 'great' || out === 'win';
    if (big) this.approve({ great: 2.5, win: 1.2, fail: -1.5, bad: -3.5 }[out]);
    else if (type === 'villain' && v && (v.threat === 'S' || v.threat === 'A')) this.approve({ great: 0.6, win: 0.3, fail: -0.4, bad: -0.8 }[out]);
    else this.approve({ great: 0.02, win: 0.01, fail: -0.04, bad: -0.08 }[out]);
    if (!v || v.kind !== 'villain' || v.nemesis === null) return '';
    const nh = all.find((h) => h.id === v.nemesis);
    if (!nh) return '';
    if (!v.saga || v.saga.h !== nh.id || v.saga.closed) v.saga = { h: nh.id, n: (v.saga && v.saga.h === nh.id ? v.saga.n : 0), w: 0, l: 0, since: this.year };
    const sg = v.saga;
    sg.n++;
    if (won) sg.w++; else sg.l++;
    const ctx = { hero: H(nh), v: V(v), n: sg.n, w: sg.w, l: sg.l, since: sg.since };
    if (won && sg.n >= 3 && all[0] === nh && R.chance(0.6)) {
      sg.closed = true;
      v.sealed = true;
      nh.nemesis = null;
      nh.titles.push({ y: this.year, title: `宿敵${v.name}に決着` });
      nh.fame += 60;
      this.pendingSaga = { h: nh.id, v: v.id, bouts: sg.n, w: sg.w, l: sg.l, since: sg.since, res: '決着' };
      return fill(R.pick(D.sagaLines.end), ctx);
    }
    return sg.n >= 2 ? fill(R.pick(D.sagaLines.count), ctx) : '';
  };

  P.sagaOnDeath = function (h, v) {
    if (!v || !v.saga || v.saga.h !== h.id || v.saga.closed) return '';
    v.saga.closed = true;
    this.pendingSagaDeath = { h: h.id, v: v.id, bouts: v.saga.n, w: v.saga.w, l: v.saga.l, since: v.saga.since, res: '悲劇' };
    return fill(R.pick(D.sagaLines.tragedy), { since: v.saga.since });
  };
  P.sagaOnRetire = function (h) {
    const v = this.villains.find((x) => x.saga && x.saga.h === h.id && !x.saga.closed && x.status !== 'dead');
    if (!v) return '';
    v.saga.closed = true;
    this.pendingSagaRetire = { h: h.id, v: v.id, bouts: v.saga.n, w: v.saga.w, l: v.saga.l, since: v.saga.since, res: '未決着' };
    return fill(R.pick(D.sagaLines.unresolved), { v: V(v) });
  };
  P.flushSaga = function () {
    for (const k of ['pendingSaga', 'pendingSagaDeath', 'pendingSagaRetire']) if (this[k]) { this.logRec('saga', this[k]); this[k] = null; }
  };

  P.duoQuote = function (lead, second, sit) {
    return `${H(lead)}は「${this.line(lead, sit || 'win')}」と語り、${H(second)}は「${this.line(second, 'ally', { p: H(lead) })}」と振り返った。`;
  };
  P.tribute = function (h, kind) {
    const pick = (ids) => ids.map((id) => this.heroes[id]).find((x) => x && x.status === 'active');
    const ap = pick(h.apprentices);
    const sp = h.spouse !== null ? pick([h.spouse]) : null;
    const rv = h.rival !== null ? pick([h.rival]) : null;
    const who = ap ? ['弟子の', ap] : rv ? ['ライバルの', rv] : sp ? ['伴侶の', sp] : null;
    if (!who) return '';
    const line = kind === 'death' ? this.line(who[1], 'tribute', { p: H(h) }) : fill(R.pick(D.tributeRetire), { p: H(h) });
    return `${who[0]}${H(who[1])}は「${line}」と語った。`;
  };

  // ---------- 節目 ----------
  P.milestone = function (h, key, n, imp) {
    if (h.ms.includes(key)) return;
    h.ms.push(key);
    const tpl = D.milestones[key] || D.milestones[key.replace(/\d+$/, '')];
    this.post('milestone', imp || (this.isTop(h, 10) ? 2 : 1), fill(tpl, { h: H(h), n }), { h: [h] });
    this.logRec('milestone', { h: h.id, key, num: n });
  };
  P.checkMilestones = function (h) {
    const r = h.rec;
    for (const n of [100, 300, 500, 1000]) if (r.cases >= n) this.milestone(h, 'cases' + n, n);
    for (const n of [50, 100, 200]) if (r.rescues >= n) this.milestone(h, 'rescues' + n, n);
  };
  P.checkCapture = function (h) {
    const c = h.rec.captures;
    if (c === 1 && h.career <= 2) this.milestone(h, 'cap1', 1);
    for (const n of [10, 30, 50, 100, 200]) if (c === n) this.milestone(h, 'cap' + n, n, n >= 50 ? 2 : undefined);
  };

  // ---------- 師弟の継承 ----------
  P.inherit = function (m) {
    for (const id of m.apprentices) {
      const a = this.heroes[id];
      if (a.status !== 'active' || a.mentor !== m.id || !R.chance(0.8)) continue;
      for (const k of R.wsample(['pow', 'tec', 'spd', 'int', 'men'], 2, () => 1)) a.stats[k] = Math.min(99, a.stats[k] + R.int(4, 8));
      if (a.power.el === m.power.el || R.chance(0.3)) a.tierBonus = Math.min(a.tierBonus + 1, 6 - a.power.tier);
      let text = `${m.status === 'dead' ? '殉職した' : '引退した'}師匠${H(m)}の技を、弟子の${H(a)}が受け継いだ。`;
      let second = G.succName(m.name);
      while (this.usedNames.has(second)) second = G.succName(second);
      if (!this.usedNames.has(second) && R.chance(0.4)) {
        a.oldNames.push(a.name);
        a.name = second;
        this.usedNames.add(second);
        text += `今後は「${second}」を名乗るという。`;
      }
      a.fame += 30;
      this.post('life', 2, text, { h: [a, m] });
      this.logRec('inherit', { h: a.id, m: m.id, renamed: a.name === second });
    }
  };

  // ---------- 週ごと ----------
  P.storyWeekly = function () {
    this.approval += (62 - this.approval) * 0.1 + R.gauss(0, 1.3);
    this.approval = clamp(this.approval, 5, 98);
    this.apHist.push([this.day, Math.round(this.approval * 10) / 10]);
    const top = this.ranked[0];
    if (top && !top.ms.includes('top1')) this.milestone(top, 'top1', 1, 3);
    // ライバルに抜かれた
    for (const h of this.ranked.slice(0, 50)) {
      if (h.rival === null) continue;
      const r = this.heroes[h.rival];
      if (r.rank === null || h.weekRank === null || r.weekRank === null) continue;
      if (h.weekRank < r.weekRank && h.rank > r.rank && r.rank <= 40) {
        this.post('life', this.impFor(1, [h, r]), `${H(r)}がライバルの${H(h)}を抜いて${r.rank}位に浮上した。抜かれた${H(h)}は「${this.line(h, 'rival', { p: H(r) })}」とコメントした。`, { h: [r, h] });
        break;
      }
    }
    this.weeklyCover();
  };

  P.weeklyCover = function () {
    let best = null, second = null;
    for (const h of this.heroes) {
      if (!h.buzz) continue;
      if (!best || h.buzz > best.buzz) { second = best; best = h; } else if (!second || h.buzz > second.buzz) second = h;
    }
    if (best) {
      let cat = 'case', imp = 0;
      for (let i = best.hist.length - 1; i >= 0 && i > best.hist.length - 30; i--) {
        const n = this.news[best.hist[i]];
        if (!n || n.y !== this.year || n.d < this.day - 7) continue;
        if (n.imp > imp) { imp = n.imp; cat = n.cat; }
      }
      const head = fill(R.pick(D.coverHeads[cat] || D.coverHeads.case), { n: best.name });
      const sub = second ? `${second.name}、${R.pick(['意外な私生活', '急上昇の理由', '今週の名場面', '独占インタビュー', '知られざる過去'])}` : '';
      const c = { y: this.year, d: this.day, vol: this.covers.length + 1, h: best.id, h2: second ? second.id : null, head, sub, cat };
      this.covers.push(c);
      best.fame += 6 * this.mod('fame');
      this.post('media', 1, `今週の「週刊ヒーロー」表紙は${H(best)}。見出しは「${head}」。`, { h: [best] });
      best.buzz = 0;
    }
    for (const h of this.heroes) h.buzz = 0;
  };

  // ---------- 事務所 ----------
  P.agencyOf = function (h) {
    if (h.agency === 'フリーランス') return null;
    if (!this.ag[h.agency]) this.ag[h.agency] = { name: h.agency, region: h.region, type: '自治体', status: 'active', founded: this.year, power: 0, members: 0, rank: null, prevRank: null };
    return this.ag[h.agency];
  };
  P.activeAgencies = function (region) {
    return Object.values(this.ag).filter((a) => a.status === 'active' && a.type !== '自治体' && (!region || a.region === null || a.region === region));
  };
  P.fixAgency = function (h) {
    const a = this.agencyOf(h);
    if (a && a.status !== 'active') {
      const cand = this.activeAgencies(h.region);
      h.agency = cand.length && R.chance(0.7) ? R.pick(cand).name : 'フリーランス';
    }
  };
  P.agencyStats = function () {
    for (const a of Object.values(this.ag)) { a.power = 0; a.members = 0; }
    for (const h of this.ranked) { const a = this.agencyOf(h); if (a) { a.power += this.score(h); a.members++; } }
    const list = Object.values(this.ag).filter((a) => a.status === 'active' && a.type !== '自治体').sort((x, y) => y.power - x.power);
    list.forEach((a, i) => { a.prevRank = a.rank; a.rank = i + 1; });
    return list;
  };
  P.moveHeroes = function (from, to) {
    for (const h of this.heroes) if (h.agency === from) h.agency = to;
  };

  P.storyMonthly = function (m) {
    const list = this.agencyStats();
    if (!list.length) return;
    // 倒産
    const weak = list.filter((a) => !['公務'].includes(a.type) && a.members <= 2);
    if (weak.length && R.chance(0.35)) {
      const a = R.pick(weak);
      a.status = 'bankrupt';
      a.ended = this.year;
      const dest = list.find((x) => x !== a && x.status === 'active' && (x.region === a.region || x.region === null));
      for (const h of this.heroes) if (h.agency === a.name) h.agency = dest && R.chance(0.6) ? dest.name : 'フリーランス';
      this.post('world', 2, `ヒーロー事務所「${a.name}」が経営難により倒産した。所属ヒーローは${dest ? '「' + dest.name + '」への移籍やフリーランスへの転身を' : 'フリーランスへの転身を'}余儀なくされる。`);
      this.logRec('agency', { kind: '倒産', a: a.name });
    }
    // 合併
    if (R.chance(0.07)) {
      const byRegion = {};
      for (const a of list) if (a.status === 'active' && a.region && a.type !== '公務') (byRegion[a.region] = byRegion[a.region] || []).push(a);
      const regs = Object.values(byRegion).filter((x) => x.length >= 2);
      if (regs.length) {
        const pair = R.pick(regs).sort((x, y) => x.power - y.power).slice(0, 2);
        const name = Gen.uniq(this, () => fill(R.pick(D.mergeNames), { r: pair[0].region }));
        this.ag[name] = { name, region: pair[0].region, type: '中堅', status: 'active', founded: this.year, power: 0, members: 0, rank: null, prevRank: null, from: pair.map((a) => a.name) };
        for (const a of pair) { a.status = 'merged'; a.mergedInto = name; a.ended = this.year; this.moveHeroes(a.name, name); }
        this.post('world', 2, `「${pair[0].name}」と「${pair[1].name}」が合併し、新事務所「${name}」が誕生した。`);
        this.logRec('agency', { kind: '合併', a: name, from: pair.map((a) => a.name) });
      }
    }
    // 独立
    if (R.chance(0.1)) {
      const cand = this.ranked.slice(0, 40).filter((h) => h.status === 'active' && !h.ownAgency && h.career >= 5);
      const h = R.wpick(cand, (x) => (x.traits.some((t) => ['野心家', '目立ちたがり', '一匹狼', 'ナルシスト'].includes(t)) ? 4 : 1));
      if (h) {
        const name = Gen.uniq(this, () => fill(R.pick(D.agencyNames), { n: h.name }));
        const old = h.agency;
        this.ag[name] = { name, region: h.region, type: '独立', status: 'active', founded: this.year, founder: h.id, power: 0, members: 0, rank: null, prevRank: null };
        h.agency = name;
        h.ownAgency = name;
        const followers = this.ranked.filter((x) => x !== h && x.agency === old && x.region === h.region && x.rank > 60).slice(0, R.int(0, 2));
        for (const f of followers) f.agency = name;
        this.post('life', this.impFor(2, [h]), fill(R.pick(D.agencyFound), { h: H(h), a: name }) + (followers.length ? `${G.joinNames(followers.map(H))}も移籍する。` : ''), { h: [h, ...followers] });
        this.logRec('agency', { kind: '独立', a: name, h: h.id });
      }
    }
    // 引き抜き
    if (R.chance(0.5)) {
      const big = R.pick(list.slice(0, 3));
      const target = R.pick(this.ranked.slice(15, 100).filter((h) => h.status === 'active' && h.agency !== big.name && !h.ownAgency && (!this.ag[h.agency] || (this.ag[h.agency].rank || 99) > big.rank)));
      if (big && target) {
        const from = target.agency;
        target.agency = big.name;
        this.post('life', this.impFor(1, [target]), `大手「${big.name}」が、${from === 'フリーランス' ? 'フリーランスの' : '「' + from + '」所属の'}${H(target)}を引き抜いた。${R.pick(['移籍金は数億円とうわさされる。', '古巣は「寝耳に水」とコメントした。', '本人は「新しい環境で挑戦したい」と語った。'])}`, { h: [target] });
        this.logRec('agency', { kind: '引き抜き', a: big.name, h: target.id, from });
      }
    }
    if (m === 1 || m === 4 || m === 7 || m === 10) {
      const t3 = this.agencyStats().slice(0, 3);
      this.post('rank', 2, `【事務所勢力ランキング】1位「${t3[0].name}」（所属${t3[0].members}名）、2位「${t3[1].name}」、3位「${t3[2].name}」。`);
    }
  };

  // ---------- 全国大会 ----------
  const SEED_ORDER = [1, 16, 8, 9, 5, 12, 4, 13, 6, 11, 3, 14, 7, 10, 2, 15];
  const ROUND = ['1回戦', '準々決勝', '準決勝', '決勝'];
  P.curTourney = function () { const t = this.tourneys[this.tourneys.length - 1]; return t && t.y === this.year ? t : null; };
  P.tourneyStart = function () {
    const seeds = this.ranked.filter((h) => h.status === 'active').slice(0, 16);
    if (seeds.length < 16) return;
    const t = { y: this.year, no: this.tourneys.length + 1, seeds: seeds.map((h) => h.id), rounds: [SEED_ORDER.map((i) => seeds[i - 1].id)], results: [], champ: null };
    this.tourneys.push(t);
    this.post('rank', 3, `【全国大会】第${t.no}回全国ヒーロー大会の出場16名が決まった。第1シードは${H(seeds[0])}、第2シードは${H(seeds[1])}。決勝は11月3日。`, { h: seeds.slice(0, 2) });
  };
  P.tourneyRound = function () {
    const t = this.curTourney();
    if (!t || t.champ !== null) return;
    const ri = t.results.length;
    const cur = t.rounds[ri];
    const next = [], res = [];
    const need = { f: 0.7, r: 0.05, i: 0.25 };
    for (let i = 0; i < cur.length; i += 2) {
      const a = this.heroes[cur[i]], b = this.heroes[cur[i + 1]];
      const okA = a.status === 'active' || a.status === 'off', okB = b.status === 'active' || b.status === 'off';
      let w, move;
      if (!okA || !okB) { w = okA ? a : b; move = '不戦勝'; }
      else {
        const ea = G.eff(a, need) * R.f(0.7, 1.3) * (a.status === 'off' ? 0.7 : 1);
        const eb = G.eff(b, need) * R.f(0.7, 1.3) * (b.status === 'off' ? 0.7 : 1);
        w = ea >= eb ? a : b;
        move = fill(R.pick(D.tourneyMoves), { pw: w.power.name });
      }
      const l = w === a ? b : a;
      const upset = t.seeds.indexOf(w.id) - t.seeds.indexOf(l.id) >= 5;
      res.push({ a: a.id, b: b.id, w: w.id, move, upset });
      next.push(w.id);
      w.fame += 6 + ri * 6;
    }
    t.results.push(res);
    t.rounds.push(next);
    if (next.length === 1) {
      const m = res[0];
      const w = this.heroes[m.w], l = this.heroes[m.w === m.a ? m.b : m.a];
      t.champ = w.id;
      t.runner = l.id;
      w.titles.push({ y: this.year, title: '全国ヒーロー大会優勝' });
      w.fame += 80 * this.mod('fame');
      w.points += 120;
      w.yrec.pts += 120;
      l.fame += 30;
      this.post('rank', 3, `【全国大会決勝】${H(w)}が${m.move === '不戦勝' ? '不戦勝で' : m.move}${H(l)}を破り、第${t.no}回全国ヒーロー大会を制した。${H(w)}は「${this.line(w, 'tourney')}」と語り、準優勝の${H(l)}は「${this.line(l, 'rival', { p: H(w) })}」と雪辱を誓った。`, { h: [w, l] });
      this.logRec('tourney', { h: w.id, runner: l.id, no: t.no });
      return;
    }
    const ups = res.filter((x) => x.upset);
    const ws = res.map((x) => this.heroes[x.w]);
    let text = `【全国大会${ROUND[ri]}】${ws.map(H).join('、')}が${ROUND[ri + 1]}へ進んだ。`;
    if (ri === 2) text = `【全国大会準決勝】${res.map((x) => `${H(this.heroes[x.w])}が${x.move === '不戦勝' ? '不戦勝で' : x.move}${H(this.heroes[x.w === x.a ? x.b : x.a])}を下した`).join('。')}。決勝は${H(ws[0])}対${H(ws[1])}。`;
    else if (ups.length) { const u = ups[0]; text += `${H(this.heroes[u.w])}が格上の${H(this.heroes[u.w === u.a ? u.b : u.a])}を破る番狂わせを演じた。`; }
    this.post('rank', ri >= 2 ? 3 : 2, text, { h: ws });
  };

  // ---------- 年末・年明け ----------
  P.storyYearEnd = function () {
    for (const h of this.heroes) {
      if (h.status !== 'active' && h.status !== 'off') continue;
      h.t100 = h.rank !== null && h.rank <= 100 ? h.t100 + 1 : 0;
      if ([5, 10, 15, 20].includes(h.t100)) this.milestone(h, 'streak' + h.t100, h.t100);
    }
    const champ = this.ranked[0];
    if (champ) {
      const n = champ.titles.filter((t) => t.title === '年間ランキング1位').length;
      const newEp = n >= 3 ? '永世王者' : n >= 2 ? '絶対王者' : null;
      if (newEp && champ.epithet !== newEp) {
        champ.epithet = newEp;
        this.post('rank', 3, `年間1位${n}回目の${H(champ)}は、以後「${newEp}」と呼ばれることになった。`, { h: [champ] });
      }
    }
    const tw = this.tourneys.length && this.tourneys[this.tourneys.length - 1].y === this.year ? this.heroes[this.tourneys[this.tourneys.length - 1].champ] : null;
    if (tw && tw.titles.filter((t) => t.title === '全国ヒーロー大会優勝').length === 2 && tw.epithet !== '永世王者' && tw.epithet !== '絶対王者') tw.epithet = '大会の覇者';
    const age = this.year - this.startYear + 1;
    if (age % 10 === 0) {
      const c = this.buildChronicle(this.year - 9, this.year);
      this.chronicles.push(c);
      this.post('world', 3, `【年代記】${c.from}年から${c.to}年までの10年間が年代記にまとめられた。この10年で最も多く頂点に立ったのは${H(this.heroes[c.dynasty.id])}（${c.dynasty.n}回）だった。`, { h: [this.heroes[c.dynasty.id]] });
    }
  };
  P.storyNewYear = function () {
    this.apHist = [[0, Math.round(this.approval * 10) / 10]];
    for (const h of this.heroes) {
      if (h.status !== 'active' && h.status !== 'off') continue;
      if ([10, 20, 30].includes(h.career)) {
        if (h.rank !== null && h.rank <= 150) this.milestone(h, 'career' + h.career, h.career);
        else h.ms.push('career' + h.career);
      }
    }
  };

  P.buildChronicle = function (from, to) {
    const inR = (y) => y >= from && y <= to;
    const aw = this.awards.filter((a) => inR(a.year));
    const champs = aw.map((a) => ({ y: a.year, id: a.champ, mvp: (a.list.find((x) => x.key === 'mvp') || {}).id }));
    const cnt = {};
    for (const c of champs) cnt[c.id] = (cnt[c.id] || 0) + 1;
    const dyn = Object.entries(cnt).sort((a, b) => b[1] - a[1])[0] || [champs[0] ? champs[0].id : 0, 0];
    const logs = (t) => this.log.filter((l) => l.t === t && inR(l.y));
    const sc = {};
    for (const l of logs('scandal')) sc[l.h] = (sc[l.h] || 0) + 1;
    const scKing = Object.entries(sc).sort((a, b) => b[1] - a[1])[0];
    const sum = (k) => aw.reduce((s, a) => s + (typeof a.stats[k] === 'number' ? a.stats[k] : 0), 0);
    return {
      from, to, champs, dynasty: { id: +dyn[0], n: dyn[1] },
      deaths: logs('death').map((l) => l.h), hof: logs('hof').map((l) => l.h), sagas: logs('saga'), bosses: logs('boss'), eras: logs('era'),
      tourneys: this.tourneys.filter((t) => inR(t.y) && t.champ !== null).map((t) => ({ y: t.y, id: t.champ })),
      scandalKing: scKing ? { id: +scKing[0], n: scKing[1] } : null, falls: logs('fallen').map((l) => l.h),
      totals: { inc: aw.reduce((s, a) => s + Object.values(a.stats.inc).reduce((x, y) => x + y, 0), 0), captures: sum('captures'), deaths: sum('deaths'), scandals: sum('scandals'), kaiju: sum('kaijuDown') },
    };
  };
})(globalThis.HG = globalThis.HG || {});
