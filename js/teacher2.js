// 教師モード（本格版）：時間割・疲労・適性・能力熟練度と必殺技・団結・期末試験・予算と設備・教師の成長・絆・査定と昇進
(function (G) {
  'use strict';
  const { R, D, fill, clamp } = G;
  const P = G.Sim.prototype;
  const S = (s) => `⟦s${s.id}⟧`;
  const H = (h) => `⟦h${h.id}⟧`;
  const KEYS = ['pow', 'tec', 'spd', 'int', 'men'];

  // ---------- 準備 ----------
  P.ensureTeacher = function () {
    const t = this.teacher;
    if (!t) return;
    if (!t.tt) t.tt = (D.presets[t.plan] || D.presets.balance).slice();
    const def = { budget: 40, eq: {}, exp: 0, lv: 1, sp: 1, skills: {}, pos: 0, unity: 50, exams: [], evals: [], notes: [], campWeek: 0, items: 0, warn: 0, cls: {} };
    for (const [k, v] of Object.entries(def)) if (t[k] === undefined) t[k] = v;
  };
  // 生徒ごとの裏の数値
  P.prepStudent = function (s) {
    if (s.trust === undefined) s.trust = 40;
    if (s.mood === undefined) s.mood = 55;
    if (s.fat === undefined) s.fat = 10;
    if (!s.apt) { const a = () => Math.round(clamp(R.gauss(1, 0.2), 0.6, 1.5) * 100) / 100; s.apt = { f: a(), r: a(), i: a() }; }
    if (s.prof === undefined) s.prof = clamp(Math.round(R.gauss(6 + s.power.tier * 2, 5)), 0, 35);
    if (s.bond === undefined) s.bond = 0;
    if (s.weeks === undefined) s.weeks = 0;
    if (s.talks === undefined) s.talks = 0;
  };
  const baseMark = P.markClass;
  P.markClass = function () { baseMark.call(this); for (const s of this.myClass()) this.prepStudent(s); };
  const baseStart = P.startTeaching;
  P.startTeaching = function (name, sc) { baseStart.call(this, name, sc); this.ensureTeacher(); this.markClass(); };

  const skill = (t, k) => (t.skills && t.skills[k]) || 0;
  P.apMax = function () { const t = this.teacher; return 6 + skill(t, 'stamina') + D.positions[t.pos].ap; };
  P.posLabel = function () { return D.positions[this.teacher.pos].label; };
  P.addExp = function (n) {
    const t = this.teacher;
    t.exp += n;
    while (t.exp >= t.lv * 120) {
      t.exp -= t.lv * 120; t.lv++; t.sp++;
      this.tNote('成長', `教師としての経験を積み、レベル${t.lv}になった。技能ポイントを1つ得た。`);
    }
  };
  P.tNote = function (title, text) {
    const t = this.teacher;
    t.notes.push({ id: t.seq++, title, text, y: this.year, d: this.day });
    if (t.notes.length > 5) t.notes.shift();
    this.tLog(`【${title}】${text}`);
  };

  // ---------- 学園側への影響 ----------
  P.tGrow = function (s) { return this.isMine(s) ? 0 : 1; }; // 受け持ちの生徒は毎週の時間割で伸びる
  const baseExam = P.tExam;
  P.tExam = function (s) {
    if (!this.isMine(s)) return 0;
    const t = this.teacher;
    const lec = t.tt.filter((k) => k === 'lecture').length;
    return baseExam.call(this, s) + lec * 0.012 + (t.eq.lib ? 0.03 : 0) + (s.fat > 75 ? -0.08 : 0) + (t.unity - 50) / 1000;
  };
  P.tSports = function (s) {
    if (!this.isMine(s)) return 1;
    const t = this.teacher;
    return (s.sports || 1) * (t.cls.sports || 1) * (s.fat > 75 ? 0.9 : 1) * (1 + s.prof / 500);
  };

  // ---------- 毎日 ----------
  P.teacherDaily = function (m, dd) {
    const t = this.teacher;
    if (!t) return;
    this.ensureTeacher();
    const cls = this.myClass();
    if (this.date.getDay() === 1) {
      t.ap = Math.min(this.apMax(), t.ap + 2);
      this.markClass();
      if (cls.length) this.teacherWeek(this.myClass());
      if (cls.length && t.pending.length < 2 && R.chance(0.5)) this.genConsult();
    }
    if (dd === 1) { t.budget += D.positions[t.pos].budget + skill(t, 'network') * 5; t.rep = clamp(t.rep + (50 - t.rep) * 0.025, 0, 100); }
    const g = this.myGrade();
    if (m === 6 && dd === 2 && cls.length) this.queueConsult('sports', R.pick(cls.slice().sort((a, b) => this.studentRating(b) - this.studentRating(a)).slice(0, 2)));
    if (m === 7 && dd === 1 && cls.length) this.queueConsult('finals', null, null, { foe: R.pick(Object.keys(D.examFoe)) });
    if (m === 11 && dd === 2 && cls.some((s) => s.lic === 0 && s.grade >= 2)) this.queueConsult('exam', null, null, { exam: '仮免許試験' });
    if (m === 1 && dd === 6 && g === 3) this.queueConsult('exam', null, null, { exam: 'ヒーロー資格試験' });
    if (m === 8 && dd === 20 && g >= 2) for (const s of R.shuffle(cls.slice()).slice(0, 1 + skill(t, 'network'))) this.queueConsult('intern', s);
    if (m === 12 && dd === 3 && g === 3) for (const s of R.shuffle(cls.filter((x) => x.lic >= 1)).slice(0, 3)) this.queueConsult('path', s, null, { alt: R.pick(D.consult.pathAlt) });
    if (m === 7 && dd === 17 && cls.length) this.teacherFinals(cls);
    if (m === 3 && dd === 25) this.teacherEval();
    const now = this.abs();
    for (const c of t.pending.slice()) if (now - c.abs > 21) this.resolveConsult(c.id, this.consultOpts(c).length - 1, true);
    this.teacherCheck(m, dd);
  };

  // ---------- 1週間の授業 ----------
  P.teacherWeek = function (cls) {
    const t = this.teacher;
    const mult = (1 + skill(t, 'plan') * 0.06 + (t.eq.sim ? 0.1 : 0)) * (t.campWeek ? 2 : 1);
    let unity = -1.2;
    for (const k of t.tt) unity += (D.lessons[k].unity || 0) * 0.6;
    t.unity = clamp(t.unity + unity, 0, 100);
    for (const s of cls) {
      this.prepStudent(s);
      const gain = {}; let fat = -24 - (t.eq.med ? 6 : 0), mood = 0, prof = 0;
      for (const k of t.tt) {
        const L = D.lessons[k];
        const eqm = (L.area === 'f' || L.area === 'r') && t.eq.gym ? 1.15 : (L.area === 'i' || k === 'lecture') && t.eq.lib ? 1.2 : 1;
        for (const [st, v] of Object.entries(L.g)) gain[st] = (gain[st] || 0) + v * eqm;
        if (L.free) { const low = KEYS.slice().sort((a, b) => s.stats[a] - s.stats[b]).slice(0, 2); for (const st of low) gain[st] = (gain[st] || 0) + 0.3; }
        fat += L.fat; mood += L.mood || 0; prof += L.prof || 0;
      }
      if (t.campWeek) fat += 30;
      const apt = { pow: s.apt.f, spd: s.apt.f, tec: (s.apt.f + s.apt.i) / 2, men: s.apt.r, int: s.apt.i };
      const fm = s.fat > 80 ? 0.5 : s.fat > 60 ? 0.8 : 1;
      const mm = 0.6 + s.mood / 125;
      const hm = s.hurt > 0 ? 0.2 : 1;
      for (const [st, v] of Object.entries(gain)) s.stats[st] = Math.min(99, Math.round((s.stats[st] + v * apt[st] * 0.07 * s.grow * mult * fm * mm * hm) * 10) / 10);
      s.fat = clamp(s.fat + fat * (s.hurt > 0 ? 0.3 : 1) - (s.hurt > 0 ? 10 : 0), 0, 100);
      s.mood = clamp(s.mood + mood + (s.fat > 60 ? -5 : 0) + (s.fat > 85 ? -5 : 0) + (55 - s.mood) * 0.05, 0, 100);
      s.trust = clamp(s.trust + (40 - s.trust) * 0.01, 0, 100);
      s.prof = Math.min(100, s.prof + prof * (t.eq.sim ? 1.3 : 1) * ((s.apt.f + s.apt.r + s.apt.i) / 3) * (s.hurt > 0 ? 0.3 : 1));
      if (s.fat > 80 && !s.hurt && R.chance(0.15 * (t.eq.med ? 0.5 : 1))) { s.hurt = R.int(7, 20); s.mood = clamp(s.mood - 8, 0, 100); this.tLog(`疲れがたまっていた${S(s)}が、訓練中にけがをした。`); }
      s.weeks++;
      if (s.weeks >= 10) s.aptKnown = true;
      this.checkProf(s);
      const lv = s.trust >= 90 ? 3 : s.trust >= 70 ? 2 : s.trust >= 50 ? 1 : 0;
      if (lv > s.bond) { s.bond = lv; this.queueConsult('bond', s, null, { lv }); }
    }
    t.campWeek = 0;
    this.addExp(5);
  };

  // 能力熟練度：50で必殺技、100で覚醒
  P.checkProf = function (s) {
    if (s.prof >= 50 && !s.move) {
      const ew = D.elemWords[s.power.el] || D.elemWords.odd, Pf = D.profile;
      s.move = R.chance(0.5) ? `${R.pick(Pf.moveA)}・${R.pick(ew.k)}${R.pick(Pf.moveB)}` : R.pick(ew.j) + R.pick(Pf.moveJ);
      s.honors.push({ y: this.year, t: `必殺技「${s.move}」を習得` });
      this.sEv(s, '必殺技', `「${s.move}」を習得`);
      this.post('school', 1, `${S(s)}が必殺技「${s.move}」を編み出した。`, { s: [s] });
      if (this.isMine(s)) { this.addExp(10); this.tLog(`${S(s)}が必殺技「${s.move}」を身につけた。`); }
    }
    if (s.prof >= 100 && !s.tierBonus) {
      s.tierBonus = 1; s.score += 8; s.fame += 20;
      s.honors.push({ y: this.year, t: '能力の覚醒' });
      this.sEv(s, '覚醒', `「${s.power.name}」が大きく成長`);
      this.post('school', 2, `【覚醒】${S(s)}の「${s.power.name}」が、積み重ねた訓練の末に新たな段階へ達した。`, { s: [s] });
      this.logRec('school', { kind: '覚醒', s: s.id, sc: s.school });
      if (this.isMine(s)) { this.addRep(2); this.addExp(20); this.tNote('覚醒', `${S(s)}の能力が覚醒した。`); }
    }
  };

  // ---------- 期末実技試験 ----------
  P.teacherFinals = function (cls) {
    const t = this.teacher;
    const strat = t.cls.finals || 'head';
    const foeType = t.cls.foeType || R.pick(Object.keys(D.examFoe));
    const foe = this.teacherOf(t.school) || R.pick(this.ranked.slice(0, 60));
    const list = cls.filter((s) => !s.kidnapped).sort((a, b) => this.studentRating(b) - this.studentRating(a));
    const teams = [];
    while (list.length >= 2) teams.push([list.shift(), list.pop()]);
    if (list.length) { if (teams.length) teams[teams.length - 1].push(list.shift()); else teams.push([list.shift()]); }
    const need = { f: 0.45, r: 0.25, i: 0.3 };
    const powr = (team) => team.reduce((a, s) => a + G.eff(s, need) * (s.fat > 70 ? 0.85 : 1) * (s.hurt ? 0.6 : 1) * (1 + s.prof / 400), 0) / team.length * 2;
    const avg = teams.reduce((a, tm) => a + powr(tm), 0) / Math.max(1, teams.length);
    const st = D.examStrat[strat];
    let mul = st.beats === foeType ? 1.22 : st.loses === foeType ? 0.82 : 1;
    if (strat === 'combo') mul *= 0.85 + t.unity / 250;
    const res = teams.map((tm) => {
      const ok = (powr(tm) / avg) * mul * R.f(0.72, 1.28) > 0.92;
      for (const s of tm) {
        if (ok) { s.score += 3; s.mood = clamp(s.mood + 6, 0, 100); this.sEv(s, '期末試験', 'プロ相手の実技試験に合格'); }
        else { s.fat = clamp(s.fat + 10, 0, 100); s.mood = clamp(s.mood - 6, 0, 100); this.sEv(s, '期末試験', '実技試験で不合格・補習'); }
      }
      const [a, b] = tm;
      const text = fill(R.pick(ok ? D.examPlay.win : D.examPlay.lose), { a: S(a), b: S(b), foe: `${H(foe)}先生`, how: D.examPlay.how[strat] });
      return { ids: tm.map((s) => s.id), ok, text };
    });
    const pass = res.filter((r) => r.ok).length;
    t.exams.push({ y: this.year, strat, foeType, foe: foe.id, res });
    if (t.exams.length > 12) t.exams.shift();
    this.addRep(Math.round((pass / Math.max(1, res.length) - 0.6) * 15));
    t.unity = clamp(t.unity + (pass / Math.max(1, res.length) > 0.6 ? 4 : -2), 0, 100);
    this.addExp(15);
    this.tNote('期末実技試験', `相手は${H(foe)}先生（${D.examFoe[foeType]}）。作戦「${st.label}」で挑み、${res.length}組中${pass}組が合格した。\n` + res.map((r) => (r.ok ? '○ ' : '× ') + r.text).join('\n'));
    t.cls.finals = null; t.cls.foeType = null;
  };

  // ---------- 年度末の査定と昇進 ----------
  P.teacherEval = function () {
    const t = this.teacher;
    const last = t.evals.length ? t.evals[t.evals.length - 1].rep : 50;
    const years = this.year - t.since;
    let note = '';
    const nx = D.positions[t.pos + 1];
    if (nx && t.rep >= nx.rep && years >= nx.years) { t.pos++; note = `${nx.label}に昇進した。学級予算と指導ポイントの上限が増える。`; t.warn = 0; }
    else if (t.rep < 25) { t.warn++; note = t.warn >= 2 ? '校長から厳重注意を受けた。評判の立て直しが急務だ。' : '校長から「もう少し生徒に寄り添うように」と注意を受けた。'; }
    else if (t.rep >= last + 5) note = '校長から「この1年、よくやってくれた」とねぎらわれた。';
    else note = '校長との面談は穏やかに終わった。';
    t.evals.push({ y: this.year, rep: Math.round(t.rep), pos: t.pos, note });
    this.addExp(40);
    this.tNote('年度末の査定', `評判${Math.round(t.rep)}（前年度${Math.round(last)}）。${note}`);
  };

  // ---------- 相談（絆・期末試験の作戦を追加） ----------
  const baseOpts = P.consultOpts;
  P.consultOpts = function (c) {
    if (c.k === 'bond') return D.bond[c.lv - 1].opts;
    if (c.k === 'finals') return Object.entries(D.examStrat).map(([k, v]) => ({ label: `${v.label}：${v.desc}`, finals: k, eff: {}, res: `作戦は「${v.label}」に決まった。生徒たちは${v.label}の練習を始めた。` }));
    const s = c.s !== null ? this.students[c.s] : null;
    return baseOpts.call(this, c).map((o) => ({ ...o, label: fill(o.label, { s: s ? s.real : '' }) }));
  };
  const baseText = P.consultText;
  P.consultText = function (c) {
    const s = c.s !== null ? this.students[c.s] : null;
    if (c.k === 'bond') return fill(D.bond[c.lv - 1].text, { s: S(s), dream: s.dream, club: s.club, awaken: s.awaken, look: s.look, food: s.food });
    if (c.k === 'finals') return `期末実技試験は2人1組でプロの先生に挑む。担当の先生は${D.examFoe[c.foe]}だという情報が入った。クラスの作戦を決める。`;
    return baseText.call(this, c);
  };
  const baseEff = P.applyEff;
  P.applyEff = function (s, e) {
    baseEff.call(this, s, e);
    if (s && e && e.prof) { this.prepStudent(s); s.prof = Math.min(100, s.prof + e.prof); }
  };
  const baseResolve = P.resolveConsult;
  P.resolveConsult = function (id, idx, auto) {
    const t = this.teacher;
    const c = t && t.pending.find((x) => x.id === id);
    if (!c) return null;
    const o = this.consultOpts(c)[idx];
    if (c.k === 'finals') { t.cls.foeType = c.foe; t.cls.finals = o ? o.finals : 'head'; }
    const r = baseResolve.call(this, id, idx, auto);
    const s = c.s !== null ? this.students[c.s] : null;
    if (s && s.status === 'enrolled') {
      if (!auto) s.trust = clamp(s.trust + skill(t, 'counsel') * 2, 0, 100);
      if (o && o.special === 'awaken') s.prof = Math.min(100, s.prof + 10);
      if (s.recommend === true) s.recommend = 12 + skill(t, 'network') * 5;
      this.checkProf(s);
    }
    if (!auto) this.addExp(3);
    return r;
  };

  // ---------- 個別の指導 ----------
  const AREA = { f: { pow: 1.6, tec: 1, spd: 0.8 }, r: { men: 1.6, spd: 1, pow: 0.6 }, i: { int: 1.6, tec: 1 } };
  P.teacherAct = function (kind, sid, area) {
    const t = this.teacher;
    const s = this.students[sid];
    if (!t || !s || !this.isMine(s)) return null;
    this.prepStudent(s);
    if (kind === 'item') {
      if (t.items < 1) return null;
      t.items--; s.prof = Math.min(100, s.prof + 15);
      const msg = `${S(s)}に試作のサポートアイテムを渡した。能力の扱いが一段うまくなった。`;
      this.tLog(msg); this.checkProf(s); return msg;
    }
    if (t.ap < 1) return null;
    t.ap--;
    const coach = 1 + skill(t, 'coach') * 0.25;
    let msg = '';
    if (kind === 'teach') {
      if (area === 'q') {
        s.prof = Math.min(100, s.prof + R.f(3, 6) * coach);
        msg = `${S(s)}の能力訓練に付き合った。能力熟練度が上がった。`;
      } else {
        const a = AREA[area] || AREA.f;
        const apt = s.apt[area] || 1;
        for (const [k, v] of Object.entries(a)) s.stats[k] = Math.min(99, s.stats[k] + v * R.f(0.8, 1.3) * (0.8 + s.mood / 250) * coach * apt);
        msg = `${S(s)}に${area === 'f' ? '戦闘' : area === 'r' ? '救助' : '捜査'}の個別指導をした。`;
      }
      s.trust = clamp(s.trust + 2, 0, 100); s.fat = clamp(s.fat + 6, 0, 100); s.score += 0.5;
      this.checkProf(s);
    } else if (kind === 'talk') {
      s.talks++;
      s.trust = clamp(s.trust + 7 + skill(t, 'counsel') * 3, 0, 100); s.mood = clamp(s.mood + 6, 0, 100);
      if (s.stats.mor < 45) s.stats.mor += 3;
      const pool = s.mood >= 60 ? D.talk.good : s.mood >= 35 ? D.talk.mid : D.talk.low;
      msg = `${S(s)}と面談した。「${fill(R.pick(pool), { dream: s.dream, club: s.club })}」`;
      if (s.talks >= 2 && !s.aptKnown) { s.aptKnown = true; msg += `話を重ねるうちに、${S(s)}の得意不得意が見えてきた。`; }
      if (s.fat > 70) msg += 'かなり疲れているようだ。';
      if (s.slump > 0) msg += 'スランプに悩んでいることがわかった。';
      this.tLog(msg);
    } else if (kind === 'praise') {
      s.mood = clamp(s.mood + 14, 0, 100); s.trust = clamp(s.trust + 2, 0, 100);
      msg = `${S(s)}をほめた。照れくさそうにしていた。`;
    } else if (kind === 'rest') {
      s.fat = clamp(s.fat - 30, 0, 100); s.mood = clamp(s.mood + 4, 0, 100);
      msg = `${S(s)}に休むよう伝えた。疲れが少し抜けたようだ。`;
    }
    this.addExp(1);
    return msg;
  };

  // ---------- 時間割・買い物・技能 ----------
  P.setSlot = function (i, k) { const t = this.teacher; if (t && D.lessons[k] && i >= 0 && i < 10) t.tt[i] = k; };
  P.setPreset = function (k) {
    const t = this.teacher;
    if (!t || !D.presets[k]) return;
    t.tt = D.presets[k].slice(); t.plan = k;
    this.tLog(`時間割を「${D.plans[k].label}」の型に組み直した。`);
  };
  P.setPlan = P.setPreset;
  P.buy = function (k) {
    const t = this.teacher, it = D.shop[k];
    if (!t || !it || t.budget < it.price || (it.keep && t.eq[k])) return null;
    t.budget -= it.price;
    const cls = this.myClass();
    if (it.keep) t.eq[k] = true;
    else if (k === 'snack') for (const s of cls) s.mood = clamp(s.mood + 10, 0, 100);
    else if (k === 'camp') { t.campWeek = 1; }
    else if (k === 'item') t.items++;
    const msg = `学級予算で「${it.label}」を用意した（${it.price}万円）。`;
    this.tLog(msg);
    return msg;
  };
  P.learnSkill = function (k) {
    const t = this.teacher;
    if (!t || !D.tskills[k] || t.sp < 1 || skill(t, k) >= 3) return null;
    t.sp--; t.skills[k] = skill(t, k) + 1;
    const msg = `技能「${D.tskills[k].label}」が${t.skills[k]}段階になった。`;
    this.tLog(msg);
    return msg;
  };
  // 教え子がヒーローになったら必殺技を受け継ぐ
  const baseToHero = P.studentToHero;
  P.studentToHero = function (s) {
    const h = baseToHero.call(this, s);
    if (s.move) h.move = s.move;
    return h;
  };
})(globalThis.HG = globalThis.HG || {});
