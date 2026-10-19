// 教師モード：プレイヤーが養成校の担任になり、受け持ちクラスを指導する
(function (G) {
  'use strict';
  const { R, D, fill, clamp } = G;
  const P = G.Sim.prototype;
  const S = (s) => `⟦s${s.id}⟧`;
  const H = (h) => `⟦h${h.id}⟧`;
  const C = D.consult;

  const prep = (s) => { if (s.trust === undefined) s.trust = 40; if (s.mood === undefined) s.mood = 55; };
  const STAT_KEYS = ['pow', 'tec', 'spd', 'int', 'men', 'mor', 'cha'];

  // ---------- 着任と退任 ----------
  P.startTeaching = function (name, sc) {
    const first = this.enrolled(sc, 1)[0];
    this.teacher = { name: name || R.pick(D.teacherNames), school: sc, entry: first ? first.entry : this.schoolYear(), rep: 50, ap: 4, plan: 'balance', since: this.year, pending: [], log: [], cls: {}, terms: [], seq: 0 };
    this.markClass();
    const t = this.teacher;
    this.tLog(`${D.academies[sc].name}に着任し、${this.myGrade()}年生の担任になった。`);
    this.post('school', 1, `${D.academies[sc].name}に${t.name}先生が着任し、${this.myGrade()}年生の担任になった。`, { s: this.myClass().slice(0, 1) });
  };
  P.quitTeaching = function () {
    if (!this.teacher) return;
    this.post('school', 1, `${D.academies[this.teacher.school].name}の${this.teacher.name}先生が教壇を去った。`);
    this.teacher = null;
  };

  P.myClass = function () {
    const t = this.teacher;
    if (!t || t.entry === null) return [];
    return this.students.filter((s) => s.status === 'enrolled' && s.school === t.school && s.entry === t.entry);
  };
  P.myGrade = function () { const c = this.myClass(); return c.length ? c[0].grade : 0; };
  P.isMine = function (s) { const t = this.teacher; return !!t && this.teacherMode !== false && t.entry !== null && s.status === 'enrolled' && s.school === t.school && s.entry === t.entry; };
  P.markClass = function () { for (const s of this.myClass()) { s.taught = true; s.teacherName = this.teacher.name; prep(s); } };
  P.tLog = function (text) {
    const t = this.teacher;
    t.log.push({ y: this.year, d: this.day, t: text });
    if (t.log.length > 300) t.log.shift();
  };
  P.addRep = function (n) { this.teacher.rep = clamp(this.teacher.rep + n, 0, 100); };

  // ---------- 育成への影響（academy.js から呼ばれる） ----------
  P.tGrow = function (s, k) {
    if (!this.isMine(s)) return 1;
    const pl = D.plans[this.teacher.plan] || D.plans.balance;
    return (pl.g[k] || 1) * (0.75 + s.mood / 200) * (s.trust >= 70 ? 1.05 : 1);
  };
  P.tSports = function (s) { return this.isMine(s) ? (s.sports || 1) * (this.teacher.cls.sports || 1) : 1; };
  P.tExam = function (s) {
    if (!this.isMine(s)) return 0;
    const pl = D.plans[this.teacher.plan] || D.plans.balance;
    return (this.teacher.cls.exam || 0) + (pl.exam || 0) + (s.trust >= 70 ? 0.03 : 0) + (s.mood < 30 ? -0.05 : 0);
  };

  // ---------- 毎日 ----------
  P.teacherDaily = function (m, dd) {
    const t = this.teacher;
    if (!t) return;
    const now = this.abs();
    const cls = this.myClass();
    const dow = this.date.getDay();
    if (dow === 1) {
      t.ap = Math.min(6, t.ap + 2);
      if (cls.length && t.pending.length < 2 && R.chance(0.5)) this.genConsult();
    }
    if (dd === 1 && cls.length) {
      const pl = D.plans[t.plan] || D.plans.balance;
      this.markClass();
      for (const s of cls) {
        s.mood = clamp(s.mood + pl.mood + (55 - s.mood) * 0.1, 0, 100);
        s.trust = clamp(s.trust + (40 - s.trust) * 0.02, 0, 100);
        if (pl.hurt && !s.hurt && R.chance(pl.hurt)) { s.hurt = R.int(7, 14); this.tLog(`訓練中に${S(s)}がけがをした。`); }
        if (t.plan === 'rest' && s.hurt > 0) s.hurt = Math.max(0, s.hurt - 7);
      }
    }
    // 季節の相談
    const g = this.myGrade();
    if (m === 6 && dd === 2 && cls.length) this.queueConsult('sports', R.pick(cls.slice().sort((a, b) => this.studentRating(b) - this.studentRating(a)).slice(0, 2)));
    if (m === 11 && dd === 2 && cls.some((s) => s.lic === 0 && s.grade >= 2)) this.queueConsult('exam', null, null, { exam: '仮免許試験' });
    if (m === 1 && dd === 6 && g === 3) this.queueConsult('exam', null, null, { exam: 'ヒーロー資格試験' });
    if (m === 8 && dd === 20 && g >= 2) { const s = R.pick(cls); if (s) this.queueConsult('intern', s); }
    if (m === 12 && dd === 3 && g === 3) for (const s of R.shuffle(cls.filter((x) => x.lic >= 1)).slice(0, 2)) this.queueConsult('path', s, null, { alt: R.pick(C.pathAlt) });
    // 返事をしないまま3週間たった相談は、生徒が自分で決める
    for (const c of t.pending.slice()) if (now - c.abs > 21) this.resolveConsult(c.id, c.opts.length - 1, true);
    this.teacherCheck(m, dd);
  };

  // 行事のあとの評価
  P.teacherCheck = function (m, dd) {
    const t = this.teacher;
    const cls = this.myClass();
    const today = (s, kind) => s.ev.filter((e) => e.y === this.year && e.d === this.day && e.t === kind);
    if (m === 6 && dd === 21) {
      for (const s of cls) for (const h of s.honors.filter((x) => x.y === this.year && /体育祭/.test(x.t))) {
        const win = /優勝/.test(h.t) && !/準/.test(h.t);
        this.addRep(win ? 5 : 2);
        this.tLog(`体育祭で${S(s)}が${win ? '優勝' : '準優勝'}した。`);
      }
      t.cls.sports = 1;
      for (const s of cls) s.sports = 1;
    }
    if ((m === 11 && dd === 15) || (m === 1 && dd === 20)) {
      const kind = m === 11 ? '仮免許' : '資格試験';
      const took = cls.filter((s) => today(s, kind).length);
      if (took.length) {
        const pass = took.filter((s) => today(s, kind).some((e) => /合格/.test(e.x) && !/不合格/.test(e.x))).length;
        this.addRep(Math.round((pass / took.length - 0.6) * 12));
        this.tLog(`${kind === '仮免許' ? '仮免許試験' : 'ヒーロー資格試験'}の結果：${took.length}名中${pass}名が合格。`);
      }
      t.cls.exam = 0;
    }
    if (m === 2 && dd === 10 && cls.length && cls[0].grade === 3) {
      const nh = cls.filter((s) => s.plan === 'hero').length;
      this.tLog(`クラスの進路が決まった。${cls.length}名中${nh}名がプロヒーローになる。`);
    }
    if (m === 4 && dd === 1 && t.entry !== null) {
      const grads = this.students.filter((s) => s.taught && s.school === t.school && s.entry === t.entry && s.gradYear === this.year);
      if (grads.length) {
        const nh = grads.filter((s) => s.status === 'hero').length;
        this.addRep(nh * 2 - 2);
        t.terms.push({ entry: t.entry, school: t.school, total: grads.length, heroes: nh, y: this.year });
        this.tLog(`受け持ったクラスの${grads.length}名が巣立った。ヒーローになったのは${nh}名。`);
        t.entry = null;
      }
    }
    if (m === 4 && dd === 8 && (t.entry === null || !cls.length)) {
      const first = this.enrolled(t.school, 1)[0];
      if (first) {
        t.entry = first.entry; t.cls = {};
        this.markClass();
        this.tLog(`新しい1年生${this.myClass().length}名の担任になった。`);
      }
    }
  };

  // ---------- 相談 ----------
  P.queueConsult = function (k, s, s2, extra = {}) {
    const t = this.teacher;
    if (!t || t.pending.length >= 3) return false;
    if (t.pending.some((c) => c.k === k && c.s === (s ? s.id : null))) return false;
    const c = { id: t.seq++, k, s: s ? s.id : null, s2: s2 ? s2.id : null, y: this.year, d: this.day, abs: this.abs(), ...extra };
    if (k === 'intern') {
      const heroes = this.ranked.filter((h) => h.status === 'active');
      const top = R.pick(heroes.slice(0, 15));
      const local = R.pick(heroes.filter((h) => h.region === s.region && h !== top).slice(0, 60)) || R.pick(heroes.slice(15, 80));
      const mid = R.pick(heroes.slice(60, 200).filter((h) => h !== local && h.career >= 8)) || R.pick(heroes.slice(60, 200));
      c.heroes = [top, local, mid].filter(Boolean).map((h) => h.id);
    }
    c.opts = this.consultOpts(c).length;
    t.pending.push(c);
    return true;
  };

  P.consultOpts = function (c) {
    if (c.k === 'intern') {
      const tag = ['（ランキング上位）', '（地元の実力者）', '（面倒見のいいベテラン）'];
      return c.heroes.map((id, i) => ({ label: `${this.heroes[id].name}${tag[i]}の事務所に推薦する`, hero: id, eff: { trust: 4 }, res: `{s}の受け入れ先は${H(this.heroes[id])}に決まった。` }));
    }
    return C[c.k].opts;
  };
  P.consultText = function (c) {
    const s = c.s !== null ? this.students[c.s] : null, s2 = c.s2 !== null ? this.students[c.s2] : null;
    const base = c.k === 'intern' ? 'インターン先を決める時期になった。{s}をどの事務所に推薦するか決める。' : C[c.k].text;
    return fill(base, { s: s ? S(s) : '', s2: s2 ? S(s2) : '', alt: c.alt || '', exam: c.exam || '' });
  };

  P.genConsult = function () {
    const cls = this.myClass().filter((s) => !s.kidnapped);
    if (!cls.length) return;
    const s = R.pick(cls);
    const mate = R.pick(cls.filter((x) => x !== s));
    const opts = {
      doubt: s.mood < 45 ? 4 : 1.5,
      rival: s.rival !== null && this.students[s.rival].status === 'enrolled' ? 2 : 0,
      wild: s.power.tier >= 4 ? 1.5 : 0.6,
      rogue: s.stats.mor > 60 ? 0.8 : 0.3,
      love: s.crush !== null || s.partner !== null ? 1.5 : 0,
      home: 0.5,
      slump: s.slump > 0 ? 4 : 0,
      fight: mate ? 0.8 : 0,
    };
    const k = R.wpick(Object.keys(opts), (x) => opts[x]);
    if (!opts[k]) return;
    const s2 = k === 'rival' ? this.students[s.rival] : k === 'love' ? this.students[s.partner ?? s.crush] : k === 'fight' ? mate : null;
    this.queueConsult(k, s, s2);
  };

  // 効果を当てはめる
  P.applyEff = function (s, e) {
    if (!s || !e) return;
    prep(s);
    if (e.trust) s.trust = clamp(s.trust + e.trust, 0, 100);
    if (e.mood) s.mood = clamp(s.mood + e.mood, 0, 100);
    if (e.mor) s.stats.mor = clamp(s.stats.mor + e.mor, 0, 100);
    if (e.score) s.score += e.score;
    if (e.slump) s.slump = Math.max(0, s.slump + e.slump);
    if (e.st) for (const [k, v] of Object.entries(e.st)) s.stats[k] = Math.min(99, s.stats[k] + v);
    if (e.rep) this.addRep(e.rep);
  };

  P.resolveConsult = function (id, idx, auto) {
    const t = this.teacher;
    if (!t) return null;
    const i = t.pending.findIndex((c) => c.id === id);
    if (i < 0) return null;
    const c = t.pending[i];
    t.pending.splice(i, 1);
    const o = this.consultOpts(c)[idx];
    if (!o) return null;
    const s = c.s !== null ? this.students[c.s] : null, s2 = c.s2 !== null ? this.students[c.s2] : null;
    if (s && s.status !== 'enrolled') return null;
    const ok = o.p === undefined || R.chance(o.p);
    const e = ok ? o.eff : o.ng;
    this.applyEff(s, e);
    if (o.both) this.applyEff(s2, e);
    if (o.all) for (const x of this.myClass()) this.applyEff(x, o.all);
    if (o.cls) Object.assign(t.cls, o.cls);
    if (o.set && s) Object.assign(s, o.set);
    if (o.hero !== undefined && s) s.internPick = o.hero;
    const sp = ok ? o.special : o.ngSpecial || (o.special === 'dropIfNg' ? 'drop' : null);
    if (s && sp === 'drop') this.dropStudent(s);
    if (s && s2 && sp === 'couple' && s.partner === null && s2.partner === null && s2.status === 'enrolled' && R.chance(0.5)) { s.partner = s2.id; s2.partner = s.id; this.sEv(s, '交際', `${s2.real}と交際`); this.sEv(s2, '交際', `${s.real}と交際`); }
    if (s && s2 && sp === 'friend' && s.friend === null && s2.friend === null) { s.friend = s2.id; s2.friend = s.id; }
    if (s && s2 && sp === 'rival' && s.rival === null && s2.rival === null) { s.rival = s2.id; s2.rival = s.id; }
    if (s && sp === 'alt') s.altRoad = c.alt;
    const res = fill(ok ? o.res : o.ngres, { s: s ? S(s) : '', s2: s2 ? S(s2) : '' });
    this.tLog(`${this.consultText(c)}${auto ? '返事ができないうちに、生徒は自分で決めた。' : `（${o.label}）`}${auto ? '' : res}`);
    return auto ? '' : res;
  };

  P.dropStudent = function (s) {
    s.status = 'dropped'; s.road = R.pick(D.school.careers); s.gradYear = this.year;
    this.sEv(s, '退学', `${D.academies[s.school].name}を去る`);
    this.addRep(-3);
    this.post('school', 1, `${S(s)}が${D.academies[s.school].name}を退学した。担任の${this.teacher.name}先生は最後まで話を聞いたという。`, { s: [s] });
  };

  // ---------- 個別の指導（指導ポイントを使う） ----------
  const AREA = { f: { pow: 1.6, tec: 1, spd: 0.8 }, r: { men: 1.6, spd: 1, pow: 0.6 }, i: { int: 1.6, tec: 1 } };
  P.teacherAct = function (kind, sid, area) {
    const t = this.teacher;
    const s = this.students[sid];
    if (!t || !s || !this.isMine(s) || t.ap < 1) return null;
    prep(s);
    t.ap--;
    let msg = '';
    if (kind === 'teach') {
      const a = AREA[area] || AREA.f;
      for (const [k, v] of Object.entries(a)) s.stats[k] = Math.min(99, s.stats[k] + v * R.f(0.8, 1.3) * (0.8 + s.mood / 250));
      s.trust = clamp(s.trust + 2, 0, 100); s.mood = clamp(s.mood - 3, 0, 100); s.score += 0.5;
      msg = `${S(s)}に${area === 'f' ? '戦闘' : area === 'r' ? '救助' : '捜査'}の個別指導をした。`;
    } else if (kind === 'talk') {
      s.trust = clamp(s.trust + 7, 0, 100); s.mood = clamp(s.mood + 6, 0, 100);
      if (s.stats.mor < 45) s.stats.mor += 3;
      const pool = s.mood >= 60 ? D.talk.good : s.mood >= 35 ? D.talk.mid : D.talk.low;
      msg = `${S(s)}と面談した。「${fill(R.pick(pool), { dream: s.dream, club: s.club })}」`;
      if (s.slump > 0) msg += 'スランプに悩んでいることがわかった。';
      else if (s.hurt > 0) msg += 'けがの具合を気にしているようだ。';
    } else if (kind === 'praise') {
      s.mood = clamp(s.mood + 14, 0, 100); s.trust = clamp(s.trust + 2, 0, 100);
      msg = `${S(s)}をほめた。照れくさそうにしていた。`;
    }
    if (kind === 'talk') this.tLog(msg);
    return msg;
  };

  P.setPlan = function (k) {
    if (!this.teacher || !D.plans[k] || this.teacher.plan === k) return;
    this.teacher.plan = k;
    this.tLog(`指導方針を「${D.plans[k].label}」に変えた。`);
  };

  P.teacherTitle = function () {
    const r = this.teacher ? this.teacher.rep : 0;
    return D.teacherRank.filter(([v]) => r >= v).pop()[1];
  };
})(globalThis.HG = globalThis.HG || {});
