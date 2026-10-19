// 世代をまたぐ物語・ヴィラン側の物語・街と人々・教え子のその後・ヒーロー白書
(function (G) {
  'use strict';
  const { R, D, fill } = G;
  const P = G.Sim.prototype;
  const H = (h) => `⟦h${h.id}⟧`;
  const V = (v) => `⟦v${v.id}⟧`;
  const O = (o) => `⟦o${o.id}⟧`;
  const alive = (h) => h && (h.status === 'active' || h.status === 'off');
  const freeV = (v) => v && v.kind === 'villain' && v.status === 'free';
  const isPupil = (sim, h) => h.sid !== undefined && sim.students[h.sid] && sim.students[h.sid].taught;

  const baseEnsure = P.ensureAcademy;
  P.ensureAcademy = function () {
    baseEnsure.call(this);
    if (!this.feuds) this.feuds = [];
    if (!this.varcs) this.varcs = [];
    if (!this.citizens) this.citizens = [];
    if (!this.towns) this.towns = {};
    if (!this.whitepapers) this.whitepapers = [];
  };
  P.town = function (p) { return this.towns[p] || (this.towns[p] = { guardian: null, gy: 0, statues: [], honors: [], legends: [] }); };

  // ============ 1. 世代をまたぐ物語 ============
  const baseCtx = P.arcCtx;
  P.arcCtx = function (a, sit) {
    const c = baseCtx.call(this, a, sit);
    c.n = a.since ? Math.max(1, this.year - a.since) : '';
    c.rel = a.rel || '仲間';
    return c;
  };
  P.startArcWith = function (h, type, o, v, extra = {}) {
    const a = { id: this.arcs.length, h: h.id, type, o: o ? o.id : null, v: v.id, stage: 0, next: this.abs(), title: '', y: this.year, d: this.day, news: [], done: false, res: null, ...extra };
    a.title = fill(R.pick(D.arcs[type].titles), { n: a.since ? Math.max(1, this.year - a.since) : '' });
    this.arcs.push(a);
    if (!h.arcs) h.arcs = [];
    h.arcs.push(a.id);
    h.lastArc = this.abs();
    this.arcStep(a);
    return a;
  };
  P.heirsOf = function (vid) {
    return this.heroes.filter((x) => x.status === 'active' && (x.parent === vid || x.mentor === vid || x.lateSpouse === vid || (x.mem || []).some((m) => (['lostMentor', 'lostSpouse', 'lostRival'].includes(m.t) && m.o === vid) || (m.t === 'avenge' && m.for === vid))));
  };
  P.generationalWeekly = function () {
    const now = this.abs();
    const busy = new Set(this.ongoingArcs().map((a) => a.h));
    const ok = (x) => !busy.has(x.id) && (!x.lastArc || now - x.lastArc > 200);
    for (const f of this.feuds) {
      if (f.done || this.year - f.y < 1) continue;
      const v = this.villains[f.v];
      if (!freeV(v)) continue;
      const heirs = this.heirsOf(f.h).filter(ok);
      if (heirs.length && R.chance(0.12)) { this.startArcWith(R.pick(heirs), 'avenge', this.heroes[f.h], v, { since: f.y, feud: this.feuds.indexOf(f) }); return; }
    }
    for (const v of this.villains) {
      if (!freeV(v) || v.formerHero === null || v.formerHero === undefined) continue;
      const fh = this.heroes[v.formerHero];
      const rel = (x) => (x.rival === fh.id ? 'ライバル' : x.spouse === fh.id || x.partner === fh.id || x.lateSpouse === fh.id ? '伴侶' : x.mentor === fh.id ? '師匠' : fh.mentor === x.id ? '弟子' : fh.parent === x.id ? '子' : x.parent === fh.id ? '親' : null);
      const cand = this.heroes.filter((x) => x.status === 'active' && ok(x) && rel(x));
      if (cand.length && R.chance(0.08)) { const x = R.pick(cand); this.startArcWith(x, 'fallenFriend', fh, v, { rel: rel(x) }); return; }
    }
  };
  const baseEnd = P.endArc;
  P.endArc = function (a, res) {
    baseEnd.call(this, a, res);
    if (res !== '成就') return;
    if (a.type === 'avenge') { if (a.feud !== undefined && this.feuds[a.feud]) this.feuds[a.feud].done = true; this.logRec('classic', { h: a.h, v: a.v, o: a.o, kind: '世代をまたぐ因縁', title: a.title, n: this.year - a.since, noNews: true }); }
    if (a.type === 'fallenFriend') {
      this.logRec('classic', { h: a.h, v: a.v, o: a.o, kind: 'かつての友との決着', title: a.title, noNews: true });
      const v = this.villains[a.v];
      if (v.status === 'captured' && R.chance(0.3)) this.reform(v);
    }
  };
  const baseLog = P.logRec;
  P.logRec = function (t, o = {}) {
    baseLog.call(this, t, o);
    if (t === 'saga' && o.res === '決着' && o.bouts >= 5) baseLog.call(this, 'classic', { h: o.h, v: o.v, kind: '宿敵との決着', n: o.bouts, title: `${o.bouts}度の激突` });
  };

  // ============ 3. ヴィラン側の物語 ============
  P.ongoingVarcs = function () { return this.varcs.filter((a) => !a.done); };
  P.startVarc = function () {
    const free = this.villains.filter(freeV);
    const busy = new Set(this.ongoingVarcs().flatMap((a) => [a.v, a.o]));
    const pool = free.filter((v) => !busy.has(v.id) && !v.isBoss);
    for (const type of R.shuffle(Object.keys(D.varcs))) {
      let v = null, o = null;
      if (type === 'coup') { v = R.pick(pool.filter((x) => x.orgRank === 'exec' && x.org !== null && freeV(this.villains[this.orgs[x.org].boss]) && this.orgs[x.org].boss !== x.id)); if (v) o = this.villains[this.orgs[v.org].boss]; }
      if (type === 'rise') v = R.pick(pool.filter((x) => (x.threat === 'C' || x.threat === 'B') && x.notoriety < 40 && x.org === null));
      if (type === 'vmentor') v = R.pick(pool.filter((x) => typeof x.age === 'number' && x.age >= 45 && x.notoriety >= 15));
      if (type === 'vrival') { v = R.pick(pool.filter((x) => x.threat !== 'C')); if (v) o = R.pick(pool.filter((x) => x !== v && x.threat !== 'C' && (x.org === null || x.org !== v.org))); if (!o) v = null; }
      if (type === 'temptation') v = R.pick(pool.filter((x) => (x.vtraits || []).some((t) => ['情に弱い', '子ども好き', '孤独', '寡黙'].includes(t)) && x.org === null));
      if (type === 'heist') v = R.pick(pool.filter((x) => x.threat === 'A' || x.threat === 'S' || x.orgRank === 'boss'));
      if (!v) continue;
      const a = { id: this.varcs.length, v: v.id, o: o ? o.id : null, type, stage: 0, next: this.abs(), title: R.pick(D.varcs[type].titles), y: this.year, d: this.day, news: [], done: false, res: null };
      this.varcs.push(a);
      (v.varcs || (v.varcs = [])).push(a.id);
      v.scheming = true; if (o) o.scheming = true;
      this.varcStep(a);
      return a;
    }
    return null;
  };
  P.varcCtx = function (a) {
    const v = this.villains[a.v], o = a.o !== null ? this.villains[a.o] : null;
    return { v: V(v), o: o ? V(o) : '', org: v.org !== null ? O(this.orgs[v.org]) : '', pref: v.pref, hide: v.hideout || '隠れ家', sign: v.sign || '', title: a.title };
  };
  P.varcStep = function (a) {
    const v = this.villains[a.v];
    const T = D.varcs[a.type];
    if (!freeV(v)) return this.endVarc(a, '中断');
    if (a.type === 'vmentor' && a.stage === 0) {
      const ap = G.Gen.villain(this, { pref: this.prefObj(v.pref), talent: 50 });
      ap.vmentor = v.id; ap.age = Math.min(typeof ap.age === 'number' ? ap.age : 22, 24); ap.scheming = true;
      a.o = ap.id;
    }
    if (a.stage < T.stages.length) {
      const refs = [v]; if (a.o !== null) refs.push(this.villains[a.o]);
      const n = this.post('villain', 2, `【悪の系譜：${a.title}　第${a.stage + 1}話】${fill(R.pick(T.stages[a.stage]), this.varcCtx(a))}`, { v: refs, o: v.org !== null ? this.orgs[v.org] : undefined });
      a.news.push(n.id);
      a.stage++;
      a.next = this.abs() + R.int(12, 24);
      return;
    }
    // 結末
    const E = D.varcEnd, ctx = this.varcCtx(a);
    const o = a.o !== null ? this.villains[a.o] : null;
    let res = '', text = '';
    if (a.type === 'coup') {
      const org = this.orgs[v.org];
      if (!o || !freeV(o) || !org) return this.endVarc(a, '中断');
      if (R.chance(G.eff(v, D.inc.villain.need) / (G.eff(v, D.inc.villain.need) + G.eff(o, D.inc.villain.need)) + 0.05)) {
        o.formerOrg = org.id; o.org = null; o.orgRank = null; v.orgRank = 'boss'; org.boss = v.id; v.notoriety += 20;
        text = fill(E.coupWin, ctx); res = '成就';
      } else { v.formerOrg = org.id; v.org = null; v.orgRank = null; v.status = 'captured'; text = fill(E.coupLose, ctx); res = '失敗'; }
    } else if (a.type === 'rise' || a.type === 'heist') {
      this.incident('villain', { v, tag: a.type === 'heist' ? `【悪の系譜：${a.title}・最終話】` : `【悪の系譜：${a.title}・最終話】`, diffMul: a.type === 'heist' ? 1.35 : 1.1 });
      const li = this.lastIncident;
      if (li && li.n !== undefined) a.news.push(li.n);
      const heroesWon = li && (li.out === 'great' || li.out === 'win');
      if (!heroesWon) {
        v.notoriety += a.type === 'heist' ? 40 : 30;
        if (a.type === 'rise') { for (const k of ['pow', 'tec', 'spd', 'int', 'men']) v.stats[k] = Math.min(99, v.stats[k] + 6); v.threat = G.Gen.threatOf(G.eff(v, D.inc.villain.need)); }
        text = fill(a.type === 'heist' ? E.heistWin : E.riseWin, ctx); res = '成就';
      } else { text = fill(a.type === 'heist' ? E.heistLose : E.riseLose, ctx); res = '失敗'; }
    } else if (a.type === 'vmentor') {
      if (!o || !freeV(o)) return this.endVarc(a, '中断');
      text = fill(E.mentor, { ...ctx, sign: o.sign || '' });
      this.post('villain', 2, text, { v: [v, o] });
      a.news.push(this.news.length - 1);
      this.incident('villain', { v: o });
      return this.endVarc(a, '成就');
    } else if (a.type === 'vrival') {
      if (!o || !freeV(o)) return this.endVarc(a, '中断');
      const vw = R.chance(G.eff(v, D.inc.villain.need) / (G.eff(v, D.inc.villain.need) + G.eff(o, D.inc.villain.need)));
      const [w, l] = vw ? [v, o] : [o, v];
      l.status = 'captured'; w.notoriety += 15;
      text = fill(E.rivalWin, { ...ctx, v: V(w), o: V(l) }); res = vw ? '成就' : '失敗';
    } else if (a.type === 'temptation') {
      if (R.chance(0.5)) { text = fill(E.tempt, ctx); res = '成就'; this.post('villain', 3, text, { v: [v] }); a.news.push(this.news.length - 1); v.status = 'captured'; this.reform(v); return this.endVarc(a, res); }
      text = fill(E.temptNo, ctx); res = '失敗';
    }
    const n = this.post('villain', res === '成就' ? 3 : 2, text, { v: o ? [v, o] : [v] });
    a.news.push(n.id);
    this.endVarc(a, res);
  };
  P.endVarc = function (a, res) {
    a.done = true; a.res = res; a.ey = this.year; a.ed = this.day;
    for (const id of [a.v, a.o]) if (id !== null && this.villains[id]) this.villains[id].scheming = false;
    if (res !== '中断') this.logRec('varc', { v: a.v, o: a.o, type: a.type, title: a.title, res, noNews: true });
  };

  // ============ 5. 街と人々 ============
  P.newCitizen = function (h) {
    const C = D.citizen;
    const [job, lo, hi] = R.pick(C.jobs);
    const sur = R.pick(D.surnames)[0];
    const c = { id: this.citizens.length, name: sur, job, age: R.int(lo, hi), pref: h.pref, savedBy: h.id, y: this.year, d: this.day, n: 0 };
    this.citizens.push(c);
    return c;
  };

  // ============ 事件のあと（市民・教え子） ============
  const baseOn = P.onIncident;
  P.onIncident = function (type, v, out, all, big) {
    let text = baseOn.call(this, type, v, out, all, big);
    const won = out === 'great' || out === 'win';
    const lead = all[0];
    if (won && ['rescue', 'disaster', 'villain', 'kaiju'].includes(type) && this.citizens.length < 400 && R.chance(big ? 0.08 : 0.008)) {
      const c = this.newCitizen(lead);
      text += `助けられた${c.job}の${c.name}さん（${c.age}）は「${R.pick(D.citizen.thanks)}」と話した。`;
    }
    const pupils = all.filter((h) => isPupil(this, h));
    if (pupils.length >= 2 && R.chance(0.5)) {
      const [a, b] = pupils;
      text += fill(D.pupil.together, { t: this.students[a.sid].teacherName || '担任の', a: H(a), b: H(b) });
    }
    return text;
  };

  // ============ 殉職・引退 ============
  const baseDie = P.die;
  P.die = function (h, v) {
    baseDie.call(this, h, v);
    if (v && v.kind === 'villain') this.feuds.push({ v: v.id, h: h.id, y: this.year, done: false });
    const c = this.citizens.find((x) => x.savedBy === h.id);
    if (c && R.chance(0.7)) this.post('life', 1, fill(D.citizen.mourn, { y: c.y, h: H(h), job: c.job, name: c.name }), { h: [h] });
    this.townHonors(h, true);
    if (isPupil(this, h) && this.teacher && this.teacherMode) this.tNote('訃報', `教え子だった${H(h)}が殉職した。`);
  };
  const baseRetire = P.onRetireBond;
  P.onRetireBond = function (h) {
    baseRetire.call(this, h);
    const c = this.citizens.find((x) => x.savedBy === h.id);
    if (c && R.chance(0.6)) this.post('life', 1, fill(D.citizen.retire, { h: H(h), job: c.job, name: c.name }), { h: [h] });
    this.townHonors(h, false);
    if (isPupil(this, h) && h.teach === undefined && R.chance(0.4)) {
      const s = this.students[h.sid];
      const sc = this.academy.schools[s.school];
      sc.teachers.push(h.id); h.teach = sc.id; h.after = `${D.academies[sc.id].short}の教員`;
      this.post('school', 2, fill(D.pupil.teacher, { h: H(h), sc: D.academies[sc.id].name, t: s.teacherName || '' }), { h: [h] });
      if (this.teacher && this.teacherMode) this.tNote('教え子が教師に', `教え子だった${H(h)}が、母校の教壇に立つことになった。`);
    }
  };
  // 銅像と名誉県民
  P.townHonors = function (h, dead) {
    const t = this.town(h.pref);
    if ((h.guard || 0) >= 4 || (h.hof && h.career >= 10)) {
      t.statues.push({ h: h.id, y: this.year });
      this.post('life', 2, fill(D.town.statue, { pref: h.pref, city: h.city || '', h: H(h) }), { h: [h] });
    }
    if (!dead && (h.guard || 0) >= 3) {
      t.honors.push({ h: h.id, y: this.year });
      this.post('life', 1, fill(D.town.honor, { pref: h.pref, h: H(h) }), { h: [h] });
    }
  };

  // ============ 毎日・毎週 ============
  const baseBond = P.bondDaily;
  P.bondDaily = function () {
    baseBond.call(this);
    const now = this.abs();
    for (const a of this.ongoingVarcs()) if (now >= a.next) this.varcStep(a);
    const dow = this.date.getDay();
    if (dow === 2) this.generationalWeekly();
    if (dow === 4 && this.ongoingVarcs().length < 2 && R.chance(0.35)) this.startVarc();
    // 市民のその後
    if (R.chance(0.05)) {
      const c = R.pick(this.citizens.filter((x) => alive(this.heroes[x.savedBy]) && x.y < this.year));
      if (c) { c.n++; const h = this.heroes[c.savedBy]; this.post('life', 1, fill(R.pick(D.citizen.later), { y: c.y, h: H(h), pref: c.pref, job: c.job, name: c.name, age: c.age, gift: R.pick(D.citizen.gifts) }), { h: [h] }); }
    }
    // 教え子の再会・訪問
    if (dow === 5) {
      const pupils = this.heroes.filter((h) => h.status === 'active' && isPupil(this, h));
      if (pupils.length >= 2 && R.chance(0.04)) {
        const a = R.pick(pupils);
        const b = R.pick(pupils.filter((x) => x !== a && this.students[x.sid].entry === this.students[a.sid].entry && this.students[x.sid].school === this.students[a.sid].school));
        if (b) this.post('life', 1, fill(R.pick(D.pupil.reunion), { t: this.students[a.sid].teacherName || '', a: H(a), b: H(b) }), { h: [a, b] });
      }
      if (this.teacher && this.teacherMode) {
        const h = R.pick(pupils.filter((x) => (this.students[x.sid].trust || 0) >= 65));
        if (h && R.chance(0.03)) this.tNote('教え子の訪問', fill(D.pupil.visit, { h: H(h), q: this.line(h, 'back') }));
      }
    }
  };

  // ============ 6. 引き抜きの打診 ============
  const baseEval = P.teacherEval;
  P.teacherEval = function () {
    baseEval.call(this);
    const t = this.teacher;
    if (t.rep >= 72 && (this.myGrade() === 3 || !this.myClass().length) && R.chance(0.5)) {
      const to = R.pick(this.academy.schools.filter((s) => s.id !== t.school));
      this.queueConsult('scout', null, null, { to: to.id });
    }
  };
  const baseOpts = P.consultOpts;
  P.consultOpts = function (c) {
    if (c.k === 'scout') return D.scout.opts.map((o, i) => ({ ...o, label: fill(o.label, { to: D.academies[c.to].short }), eff: {}, scout: i }));
    return baseOpts.call(this, c);
  };
  const baseText = P.consultText;
  P.consultText = function (c) {
    if (c.k === 'scout') return fill(D.scout.text, { to: D.academies[c.to].name });
    return baseText.call(this, c);
  };
  const baseResolve = P.resolveConsult;
  P.resolveConsult = function (id, idx, auto) {
    const t = this.teacher;
    const c = t && t.pending.find((x) => x.id === id);
    if (c && c.k === 'scout') {
      const i = auto ? 1 : idx;
      if (i === 0) t.moveTo = c.to;
      if (i === 1) this.addRep(2);
      if (i === 2) t.budget += 60;
      const r = baseResolve.call(this, id, i, auto);
      return r ? fill(r, { to: D.academies[c.to].short }) : r;
    }
    return baseResolve.call(this, id, idx, auto);
  };
  const baseTD = P.teacherDaily;
  P.teacherDaily = function (m, dd) {
    const t = this.teacher;
    if (t && t.moveTo !== undefined && m === 4 && dd === 2) {
      const from = t.school;
      t.school = t.moveTo; delete t.moveTo; t.entry = null; t.cls = {};
      this.tLog(`${D.academies[from].name}を離れ、${D.academies[t.school].name}に移った。`);
      this.post('school', 1, `${D.academies[from].name}の${t.name}先生が、${D.academies[t.school].name}に移ることになった。`);
    }
    baseTD.call(this, m, dd);
  };

  // ============ 年末：守護者・教え子・白書 ============
  const baseYE = P.dramaYearEnd;
  P.dramaYearEnd = function () {
    baseYE.call(this);
    // 地元の守護者
    const byPref = {};
    for (const h of this.ranked) if (h.status === 'active' && (!byPref[h.pref] || h.yrec.pts > byPref[h.pref].yrec.pts)) byPref[h.pref] = h;
    for (const [p, h] of Object.entries(byPref)) {
      const t = this.town(p);
      if (t.guardian === h.id) t.gy++; else { t.guardian = h.id; t.gy = 1; }
      h.guard = (h.guard || 0) + 1;
      if (t.gy === 6 && h.rank !== null && h.rank <= 150) {
        const title = fill(R.pick(D.town.legendTitles), { p: p.replace(/[都府県]$/, '') });
        t.legends.push({ h: h.id, y: this.year, title });
        h.legendTitle = title;
        this.post('life', 2, fill(D.town.legend, { pref: p, n: 6, h: H(h), title }), { h: [h] });
      }
    }
    // 教え子の活躍
    if (this.teacher && this.teacherMode) {
      const st = this.heroes.filter((h) => alive(h) && isPupil(this, h) && h.titles.some((x) => x.y === this.year));
      if (st.length) this.tNote('教え子の活躍', `今年、教え子の${st.map((h) => `${H(h)}（${h.titles.filter((x) => x.y === this.year).map((x) => x.title).join('・')}）`).join('、')}が表彰された。`);
    }
    this.buildWhitepaper();
  };

  // ============ 7. ヒーロー白書 ============
  P.buildWhitepaper = function () {
    const st = this.st;
    const top = this.ranked.slice(0, 50);
    const el = {};
    for (const h of top) el[h.power.el] = (el[h.power.el] || 0) + 1;
    const ap = this.apHist && this.apHist.length ? this.apHist.reduce((a, x) => a + x[1], 0) / this.apHist.length : this.approval;
    const grads = this.log.filter((l) => l.t === 'grad' && l.y === this.year);
    const ages = this.ranked.slice(0, 100).map((h) => h.age).filter((a) => typeof a === 'number');
    this.whitepapers.push({
      y: this.year, era: this.eraDef().name,
      inc: { ...st.inc }, total: Object.values(st.inc).reduce((a, b) => a + b, 0), out: { ...st.out },
      captures: st.captures, deaths: st.deaths, scandals: st.scandals, debuts: st.debuts, retired: st.retired, kaiju: st.kaijuDown, escapes: st.escapes, fallen: st.fallen, reformed: st.reformed,
      pref: Object.entries(st.pref).sort((a, b) => b[1] - a[1]).slice(0, 5),
      calm: Object.keys(D.prefs.reduce((m, p) => ((m[p.name] = 1), m), {})).filter((p) => !st.pref[p]).slice(0, 5),
      el, ap: Math.round(ap), apEnd: Math.round(this.approval),
      freeV: this.villains.filter(freeV).length, newV: this.villains.filter((v) => v.kind === 'villain' && v.debutYear === this.year).length,
      orgs: this.orgs.filter((o) => o.status === 'active').length,
      gradH: grads.filter((l) => l.h !== null).length, grads: grads.length,
      cast: this.log.filter((l) => l.t === 'cast' && l.y === this.year).length,
      arcs: this.arcs.filter((a) => a.done && a.ey === this.year && a.res === '成就').length,
      varcs: this.varcs.filter((a) => a.done && a.ey === this.year && a.res === '成就').length,
      age: ages.length ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : 0,
      champ: this.ranked[0] ? this.ranked[0].id : null, active: this.ranked.length,
    });
  };
})(globalThis.HG = globalThis.HG || {});
