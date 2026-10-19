// ヒーロー養成校：入学・行事・インターン・資格試験・卒業と進路
(function (G) {
  'use strict';
  const { R, D, fill, clamp, Gen } = G;
  const P = G.Sim.prototype;
  const H = (h) => `⟦h${h.id}⟧`;
  const V = (v) => `⟦v${v.id}⟧`;
  const S = (s) => `⟦s${s.id}⟧`;
  const E = D.schoolEv, L = D.schoolLife;
  const alive = (h) => h && (h.status === 'active' || h.status === 'off');

  // ---------- 準備 ----------
  P.ensureAcademy = function () {
    if (!this.students) this.students = [];
    if (this.academy) return;
    this.academy = { schools: D.academies.map((d, i) => ({ id: i, teachers: [], cups: 0, heroes: 0, grads: 0 })), kidnap: null };
    for (const sc of this.academy.schools) {
      for (let k = 0; k < 2; k++) this.newTeacher(sc);
      // 1〜3年生をそろえる（1年生もすでに夏を越えているので、ヒーロー名は決まっている）
      for (let g = 1; g <= 3; g++) {
        const n = R.int(D.academies[sc.id].size - 2, D.academies[sc.id].size + 2);
        for (let i = 0; i < n; i++) { const s = this.newStudent(sc, g, (g - 1) * 12 + 9); this.nameStudent(s); }
      }
    }
    // 2・3年生は前年の秋に仮免許試験を終えている
    for (const s of this.enrolled()) if (s.grade >= 2 && R.chance(clamp(0.45 + s.talent / 200, 0.5, 0.9))) s.lic = 1;
    this.pairUp(40);
  };

  P.newTeacher = function (sc) {
    const d = D.academies[sc.id];
    const h = Gen.hero(this, { age: R.int(44, 66), pref: R.chance(0.6) ? this.prefObj(d.pref) : undefined });
    h.status = 'retired'; h.retireReason = '引退'; h.endYear = this.year - R.int(1, 8);
    h.after = `${d.short}の教員`; h.rank = null; h.streak = 0; h.topWeeks = 0; h.h2h = {}; h.teach = sc.id;
    sc.teachers.push(h.id);
    return h;
  };

  P.newStudent = function (sc, grade, months) {
    const d = D.academies[sc.id];
    const gender = R.chance(0.03) ? '不明' : R.chance(0.46) ? '女' : '男';
    const pref = R.chance(0.45) ? this.prefObj(d.pref) : Gen.pickPrefObj();
    const power = Gen.pickPower(0.2 + (d.prestige - 50) / 30);
    const rn = Gen.realName(gender);
    const talent = clamp(R.gauss(d.prestige, 13), 20, 97);
    const traits = Gen.pickTraits();
    const stats = Gen.makeStats(talent * 0.72);
    const morBase = traits.reduce((m, t) => m + (Gen.traitObj(t) ? Gen.traitObj(t).mor : 0), 0);
    stats.mor = Math.round(clamp(R.gauss(64, 16) + morBase, 5, 100));
    const g = gender === '男' ? 172 : gender === '女' ? 159 : 165;
    const s = {
      kind: 'student', id: this.students.length, real: typeof rn === 'string' ? rn : rn.full, gender, age: 14 + grade,
      pref: pref.name, city: R.pick(pref.cities), region: pref.region, school: sc.id, grade, entry: this.schoolYear() - grade + 1,
      power, tierBonus: 0, traits, stats, talent, grow: clamp(R.gauss(talent / 55, 0.25), 0.3, 2), job: '高校生',
      hname: null, status: 'enrolled', score: R.int(0, 5), fame: R.int(0, 8), lic: 0, intern: null, internHist: [],
      friend: null, rival: null, crush: null, partner: null, heroId: null, villainId: null, road: '', plan: null, gradYear: null,
      hist: [], quotes: [], ev: [], honors: [], hurt: 0, slump: 0,
      dream: R.pick(D.school.dreams), club: R.pick(D.school.clubs), awaken: R.pick(D.school.awaken), look: R.pick(D.school.looks),
      birthday: [R.int(1, 12), R.int(1, 28)], height: Math.round(clamp(R.gauss(g, 7), 140, 200)), food: R.pick(D.profile.foods), motive: R.pick(D.motives),
    };
    // 上の学年ほど訓練を積んでいる
    const mo = months ?? (grade - 1) * 12 + Math.max(0, this.month - 3);
    for (let m = 0; m < mo; m++) this.growStudent(s, true);
    if (G.assignVoice) G.assignVoice(s);
    this.students.push(s);
    return s;
  };

  P.schoolYear = function () { return this.day < 90 ? this.year - 1 : this.year; };
  P.nameStudent = function (s) {
    const pref = this.prefObj(s.pref);
    const sur = D.surnames.find((x) => x[0] === s.real.split(' ')[0]);
    s.hname = Gen.uniq(this, () => Gen.heroNameRaw(s.gender, s.power, pref, sur ? sur[1] : null, true));
  };
  P.growStudent = function (s, quiet) {
    const d = D.academies[s.school];
    const bias = { pow: d.focus.f, tec: (d.focus.f + d.focus.i) / 2, spd: (d.focus.f + d.focus.r) / 2, int: d.focus.i, men: d.focus.r };
    for (const k of Object.keys(bias)) {
      const v = s.grow * R.f(0.2, 1.1) * (0.7 + bias[k]) * (s.slump > 0 ? 0.3 : 1) * (this.teacher ? this.tGrow(s, k) : 1);
      s.stats[k] = Math.min(99, Math.round((s.stats[k] + v) * 10) / 10);
    }
    if (!quiet && s.slump > 0) s.slump--;
  };
  const rating = (s) => G.eff(s, D.academies[s.school].focus) + s.score * 0.6;
  P.studentRating = rating;
  P.enrolled = function (sc, grade) {
    return this.students.filter((s) => s.status === 'enrolled' && (sc === undefined || sc === null || s.school === sc) && (!grade || s.grade === grade));
  };
  P.teacherOf = function (sc) {
    const ts = this.academy.schools[sc].teachers.map((id) => this.heroes[id]).filter((h) => h.status === 'retired');
    return ts.length ? R.pick(ts) : null;
  };
  // 学園年表に残す
  P.sEv = function (s, t, x) { s.ev.push({ y: this.year, d: this.day, t, x }); if (s.ev.length > 40) s.ev.shift(); };
  const scName = (sc) => D.academies[sc].name;

  // 同じ学校の生徒どうしの親友・ライバル
  P.pairUp = function (n) {
    for (let i = 0; i < n; i++) {
      const a = R.pick(this.enrolled());
      if (!a) return;
      const b = R.pick(this.enrolled(a.school, a.grade).filter((x) => x !== a));
      if (!b) continue;
      if (a.friend === null && b.friend === null && R.chance(0.6)) { a.friend = b.id; b.friend = a.id; } else if (a.rival === null && b.rival === null) { a.rival = b.id; b.rival = a.id; }
    }
  };

  // ---------- 毎日 ----------
  P.academyDaily = function (m, dd) {
    const ac = this.academy;
    for (const s of this.students) if (s.status === 'enrolled' && s.hurt > 0) s.hurt--;
    if (dd === 1) for (const s of this.enrolled()) this.growStudent(s);
    if (m === 1 && dd === 20) this.licenseExam();
    if (m === 2 && dd === 10) this.decidePaths();
    if (m === 3 && dd === 1) this.graduation();
    if (m === 4 && dd === 8) this.entrance();
    if (m === 4 && dd === 22) this.fitnessTest();
    if (m === 6 && dd === 3) this.namingDay();
    if (m === 6 && dd === 21) this.sportsFestival();
    if (m === 7 && dd === 17) this.finalExam();
    if (m === 8 && dd === 4) this.summerCamp();
    if (m === 9 && dd === 1) this.startIntern();
    if (m === 10 && dd === 26) this.schoolFest();
    if (m === 11 && dd === 15) this.karimen();
    if (ac.kidnap && this.abs() >= ac.kidnap.due) this.rescueStudent();
    if (m >= 9 && m <= 11 && R.chance(0.3)) this.internEvent();
    if (!(m === 8 && dd > 10) && R.chance(0.42)) this.schoolLife();
    if (R.chance(0.012)) this.obEvent();
    if (this.teacher && this.teacherMode !== false) this.teacherDaily(m, dd);
  };

  // ---------- 行事 ----------
  P.entrance = function () {
    // 進級
    for (const s of this.enrolled()) { if (s.grade < 3) s.grade++; }
    for (const sc of this.academy.schools) {
      const d = D.academies[sc.id];
      const n = R.int(d.size - 2, d.size + 2);
      const fresh = [];
      for (let i = 0; i < n; i++) fresh.push(this.newStudent(sc, 1));
      const top = fresh.slice().sort((a, b) => rating(b) - rating(a))[0];
      top.honors.push({ y: this.year, t: '入試首席' });
      for (const s of fresh) this.sEv(s, '入学', `${scName(sc.id)}に入学`);
      this.post('school', 1, fill(R.pick(E.enter), { sc: scName(sc.id), n, pw: top.power.name, s: S(top) }), { s: [top] });
    }
    this.pairUp(12);
  };

  P.fitnessTest = function () {
    const ones = this.enrolled(null, 1);
    if (!ones.length) return;
    const top = ones.slice().sort((a, b) => G.eff(b, { f: 0.5, r: 0.3, i: 0.2 }) - G.eff(a, { f: 0.5, r: 0.3, i: 0.2 }))[0];
    top.score += 3; top.fame += 5;
    this.sEv(top, '能力測定', '学年トップの成績');
    this.post('school', 1, fill(R.pick(E.test), { sc: scName(top.school), s: S(top) }), { s: [top] });
  };

  P.namingDay = function () {
    const ones = this.enrolled(null, 1).filter((s) => !s.hname);
    for (const s of ones) { this.nameStudent(s); this.sEv(s, 'ヒーロー名', `「${s.hname}」に決定`); }
    const shown = R.shuffle(ones.slice()).slice(0, 3);
    for (const [i, s] of shown.entries()) {
      const t = i === 2 && R.chance(0.6) ? R.pick(E.namingFunny) : R.pick(E.naming);
      this.post('school', 1, fill(t, { sc: scName(s.school), s: S(s), hn: s.hname, why: R.pick(E.namingWhy) }), { s: [s] });
    }
  };

  P.sportsFestival = function () {
    for (let g = 1; g <= 3; g++) {
      const pool = this.enrolled(null, g).filter((s) => s.hurt === 0).map((s) => [s, rating(s) * R.f(0.8, 1.2) * (this.teacher ? this.tSports(s) : 1)]).sort((a, b) => b[1] - a[1]);
      if (pool.length < 2) continue;
      const [w, r] = [pool[0][0], pool[1][0]];
      w.score += 10; w.fame += 30; r.score += 5; r.fame += 15;
      for (const [s] of pool.slice(2, 8)) { s.score += 2; s.fame += 6; }
      this.academy.schools[w.school].cups++;
      w.honors.push({ y: this.year, t: `体育祭 ${g}年の部 優勝` });
      r.honors.push({ y: this.year, t: `体育祭 ${g}年の部 準優勝` });
      this.sEv(w, '体育祭', `${g}年の部で優勝`); this.sEv(r, '体育祭', `${g}年の部で準優勝`);
      let text = fill(R.pick(E.sports), { g, sc: scName(w.school), s: S(w), sc2: scName(r.school), s2: S(r) });
      if (g === 3) { text += fill(R.pick(E.sportsScout), { s: S(w) }); w.score += 5; }
      text += `${S(w)}は「${this.line(w, 'tourney')}」と語った。`;
      this.post('school', g === 3 ? 3 : 2, text, { s: [w, r] });
      this.logRec('school', { kind: '体育祭', s: w.id, s2: r.id, g, sc: w.school });
      if (w.rival === r.id && R.chance(0.6)) this.post('school', 1, `決勝で敗れた${S(r)}は「${this.line(r, 'lose')}」と悔しさをにじませた。ライバル${S(w)}との差は、まだ縮まっていない。`, { s: [r, w] });
    }
  };

  P.finalExam = function () {
    for (const sc of this.academy.schools) {
      const list = this.enrolled(sc.id).filter((s) => !(this.teacher && this.isMine(s)));
      if (!list.length) continue;
      const sorted = list.slice().sort((a, b) => rating(a) - rating(b));
      const fails = sorted.slice(0, Math.max(1, Math.round(list.length * 0.12)));
      for (const s of list) if (!fails.includes(s)) s.score += 2;
      for (const s of fails) this.sEv(s, '期末試験', '実技試験で不合格・補習');
      if (R.chance(0.5)) {
        const t = this.teacherOf(sc.id) || R.pick(this.ranked.slice(0, 80));
        const s = R.pick(sorted.slice(-Math.ceil(list.length / 3)));
        s.score += 3;
        this.sEv(s, '期末試験', 'プロ相手の実技試験に合格');
        this.post('school', 1, fill(R.pick(E.exam), { sc: scName(sc.id), s: S(s), t: H(t), h: H(t) }), { s: [s], h: [t] });
      } else if (R.chance(0.4)) {
        const s = R.pick(fails);
        this.post('school', 1, fill(R.pick(E.examFail), { sc: scName(sc.id), s: S(s) }), { s: [s] });
      }
    }
  };

  P.summerCamp = function () {
    const sc = R.pick(this.academy.schools);
    const t = this.teacherOf(sc.id);
    if (t) this.post('school', 1, fill(R.pick(E.camp), { sc: scName(sc.id), t: H(t) }), { h: [t] });
    for (const x of this.academy.schools) if (R.chance(0.09)) { this.campRaid(x); break; }
  };

  P.campRaid = function (sc) {
    const vs = this.villains.filter((v) => v.kind === 'villain' && v.status === 'free' && (v.threat === 'B' || v.threat === 'A'));
    const v = R.pick(vs);
    const list = this.enrolled(sc.id).filter((s) => s.hurt === 0).sort((a, b) => rating(b) - rating(a));
    if (!v || list.length < 3) return;
    const t = this.teacherOf(sc.id);
    const top = list.slice(0, 3);
    const power = top.reduce((a, s) => a + G.eff(s, D.inc.villain.need), 0) * 0.45;
    const roll = power / (power + G.eff(v, D.inc.villain.need)) + R.f(-0.25, 0.25);
    const [a, b] = top;
    const ctx = { sc: scName(sc.id), v: V(v), s: S(a), s2: S(b), t: t ? H(t) : 'プロヒーロー' };
    let text = fill(E.raid, ctx), res;
    if (roll > 0.55) {
      text += fill(R.pick(E.raidWin), ctx) + `${S(a)}は「${this.line(a, 'win')}」と語った。`;
      v.status = 'captured'; v.jail = R.int(60, 200);
      for (const s of top) { s.score += 8; s.fame += 40; this.sEv(s, '林間合宿', `${v.name}の襲撃を撃退`); }
      res = '生徒が撃退';
    } else if (roll > 0.3 || !t) {
      text += fill(R.pick(E.raidTeacher), ctx);
      if (t) t.fame += 20;
      v.status = 'captured'; v.jail = R.int(60, 200);
      for (const s of top) { s.score += 3; this.sEv(s, '林間合宿', `${v.name}の襲撃に遭う`); }
      res = '教員が撃退';
    } else if (roll > 0.12 || this.academy.kidnap) {
      text += fill(R.pick(E.raidHurt), ctx);
      a.hurt = R.int(20, 45); a.fame += 20;
      this.sEv(a, '林間合宿', `仲間をかばって重傷`);
      res = '負傷者';
    } else {
      const s = R.pick(list.slice(0, 6));
      ctx.s = S(s);
      text += fill(R.pick(E.raidTaken), ctx);
      s.kidnapped = true; s.fame += 30;
      this.sEv(s, '林間合宿', `${v.name}に連れ去られる`);
      this.academy.kidnap = { s: s.id, v: v.id, due: this.abs() + R.int(4, 12) };
      res = '連れ去り';
    }
    v.notoriety = (v.notoriety || 0) + 15;
    this.post('school', 3, text, { s: res === '連れ去り' ? [this.students[this.academy.kidnap.s]] : top, v: [v], h: t ? [t] : [] });
    this.logRec('school', { kind: '学園襲撃', s: a.id, v: v.id, sc: sc.id, res });
    this.approve(res === '生徒が撃退' ? 1 : -2);
  };

  P.rescueStudent = function () {
    const k = this.academy.kidnap;
    this.academy.kidnap = null;
    const s = this.students[k.s], v = this.villains[k.v];
    s.kidnapped = false;
    const hs = this.ranked.filter((h) => h.status === 'active').slice(0, 12);
    const h = R.pick(hs.slice(0, 5)) || this.ranked[0];
    if (!h) return;
    if (v.status === 'free') { v.status = 'captured'; v.jail = R.int(120, 300); v.caughtBy.push(h.id); h.rec.captures++; h.yrec.captures++; }
    h.points += 60; h.fame += 40; s.score += 4;
    this.sEv(s, '救出', `${h.name}らに救出される`);
    this.post('big', 3, fill(R.pick(E.rescue), { v: V(v), s: S(s), h: H(h) }) + `${H(h)}は「${this.line(h, 'rescue')}」と語った。`, { s: [s], h: [h], v: [v] });
    this.logRec('school', { kind: '救出', s: s.id, h: h.id, v: v.id, sc: s.school });
  };

  P.startIntern = function () {
    const heroes = this.ranked.filter((h) => h.status === 'active');
    if (heroes.length < 30) return;
    for (const sc of this.academy.schools) {
      const list = this.enrolled(sc.id).filter((s) => s.grade >= 2).sort((a, b) => rating(b) - rating(a));
      list.forEach((s, i) => {
        const q = i / Math.max(1, list.length);
        const pool = q < 0.25 ? heroes.slice(0, 40) : q < 0.6 ? heroes.slice(30, 160) : heroes.slice(120);
        const local = pool.filter((h) => h.region === s.region);
        const pk = s.internPick != null ? this.heroes[s.internPick] : null;
        delete s.internPick;
        const h = pk && pk.status === 'active' ? pk : R.pick(local.length && R.chance(0.5) ? local : pool) || R.pick(heroes);
        s.intern = h.id;
        if (!s.internHist.includes(h.id)) s.internHist.push(h.id);
        this.sEv(s, 'インターン', `${h.name}の事務所でインターン`);
      });
      const s = list[0];
      if (s) this.post('school', 1, fill(R.pick(E.intern), { sc: scName(sc.id), g: s.grade, s: S(s), h: H(this.heroes[s.intern]), line: this.line(s, 'debut') }), { s: [s], h: [this.heroes[s.intern]] });
    }
  };

  P.internEvent = function () {
    const s = R.pick(this.enrolled().filter((x) => x.intern !== null && x.grade >= 2 && x.hurt === 0 && !x.kidnapped));
    if (!s) return;
    const h = this.heroes[s.intern];
    if (!alive(h)) return;
    s.score += 1; s.fame += 2; s.stats.tec = Math.min(99, s.stats.tec + 0.5);
    this.post('school', 1, fill(R.pick(E.internEv), { s: S(s), h: H(h), pref: h.pref }), { s: [s], h: [h] });
  };

  P.schoolFest = function () {
    const sc = R.pick(this.academy.schools);
    const s = R.pick(this.enrolled(sc.id));
    const ob = this.heroes.filter((h) => alive(h) && h.sid !== undefined && this.students[h.sid] && this.students[h.sid].school === sc.id);
    if (!s) return;
    const t = ob.length && R.chance(0.5) ? E.fest[2] : R.pick(E.fest.slice(0, 2));
    const h = ob.length ? R.pick(ob) : null;
    this.post('school', 1, fill(t, { sc: scName(sc.id), s: S(s), h: h ? H(h) : '' }), { s: [s], h: h ? [h] : [] });
  };

  // 仮免許試験（2年生と、まだ持っていない3年生）
  P.karimen = function () {
    for (const sc of this.academy.schools) {
      const list = this.enrolled(sc.id).filter((s) => s.lic === 0 && s.grade >= 2);
      if (!list.length) continue;
      const avg = list.reduce((a, s) => a + rating(s), 0) / list.length;
      let p = 0;
      const failed = [];
      for (const s of list) {
        const ch = clamp(0.62 + ((rating(s) - avg) / avg) * 2.2 - (s.hurt ? 0.3 : 0) + (this.teacher ? this.tExam(s) : 0), 0.08, 0.97);
        if (R.chance(ch)) { s.lic = 1; p++; this.sEv(s, '仮免許', '仮免許試験に合格'); } else { failed.push(s); this.sEv(s, '仮免許', '仮免許試験に不合格'); }
      }
      this.post('school', 1, fill(R.pick(E.karimen), { sc: scName(sc.id), n: list.length, p }));
      const f = failed.sort((a, b) => rating(b) - rating(a))[0];
      if (f && R.chance(0.5)) this.post('school', 1, fill(R.pick(E.karimenFail), { s: S(f) }), { s: [f] });
    }
  };

  // ヒーロー資格試験（3年生）
  P.licenseExam = function () {
    for (const sc of this.academy.schools) {
      const list = this.enrolled(sc.id, 3);
      if (!list.length) continue;
      const avg = list.reduce((a, s) => a + rating(s), 0) / list.length;
      let p = 0;
      for (const s of list) {
        const ch = s.lic === 0 ? 0.05 : clamp(0.6 + ((rating(s) - avg) / avg) * 2 + (D.academies[sc.id].prestige - 50) / 60 + (this.teacher ? this.tExam(s) : 0), 0.1, 0.96);
        if (R.chance(ch)) { s.lic = 2; p++; this.sEv(s, '資格試験', 'ヒーロー資格試験に合格'); } else this.sEv(s, '資格試験', 'ヒーロー資格試験に不合格');
      }
      this.post('school', 1, fill(R.pick(E.license), { sc: scName(sc.id), n: list.length, p }));
    }
  };

  // 進路決定：資格を取った3年生のうち、事務所の採用枠に入った人がヒーローになる
  P.decidePaths = function () {
    const act = this.rankedHeroes().length;
    const need = clamp(Math.round(((370 - act) / 2 + 14) * this.mod('debut')), 6, 34);
    const quota = clamp(Math.round(need * 0.9), 18, 30);
    const third = this.enrolled(null, 3);
    const ok = third.filter((s) => s.lic === 2).sort((a, b) => (rating(b) + s2(b)) - (rating(a) + s2(a)));
    function s2(s) { return s.fame * 0.1 + (s.recommend === true ? 12 : s.recommend || 0); }
    let taken = 0;
    for (const s of ok) {
      if (taken < quota && !s.wantOther && !(s.stats.mor < 25 && R.chance(0.5)) && R.chance(0.95)) { s.plan = 'hero'; taken++; continue; }
      s.plan = 'other';
      s.road = s.wantOther && s.altRoad ? `${s.altRoad}道を選んだ` : R.pick(D.school.careers);
      s.why = s.wantOther ? '担任に背中を押され、自分で決めた。' : taken >= quota ? '事務所からの声がかからなかった。' : '資格は取ったが、別の道を選んだ。';
    }
    for (const s of third.filter((x) => x.lic !== 2)) { s.plan = 'other'; s.road = R.pick(D.school.careers); s.why = R.pick(['ヒーロー資格試験に届かなかった。', '「ほかの形で人を助けたい」と語った。', '「もう一度自分を見つめ直したい」と話した。']); }
    for (const sc of this.academy.schools) {
      const mine = third.filter((s) => s.school === sc.id);
      if (!mine.length) continue;
      const nh = mine.filter((s) => s.plan === 'hero').length;
      this.post('school', 1, `${scName(sc.id)}の3年生${mine.length}名の進路が決まった。プロヒーローになるのは${nh}名。${nh === mine.length ? '全員がヒーローの道へ進む。' : `残る${mine.length - nh}名はそれぞれ別の道へ進む。`}`);
      for (const s of mine) this.sEv(s, '進路', s.plan === 'hero' ? 'プロヒーローとして事務所に内定' : `${s.why}${s.road}`);
    }
  };

  P.graduation = function () {
    for (const sc of this.academy.schools) {
      const mine = this.enrolled(sc.id, 3);
      if (!mine.length) continue;
      const top = mine.slice().sort((a, b) => rating(b) - rating(a))[0];
      top.honors.push({ y: this.year, t: '首席卒業' });
      this.post('school', 2, fill(R.pick(E.gradDay), { sc: scName(sc.id), s: S(top), n: mine.length, line: this.line(top, 'award') }), { s: [top] });
      for (const s of mine) this.sEv(s, '卒業', `${scName(sc.id)}を卒業`);
    }
  };

  // 4月1日：卒業生がヒーローとしてデビュー、または別の道へ
  P.academyGraduate = function () {
    const out = [];
    const third = this.enrolled(null, 3);
    for (const s of third) {
      s.gradYear = this.year;
      const sc = this.academy.schools[s.school];
      sc.grads++;
      if (s.plan === 'hero') { const h = this.studentToHero(s); out.push(h); sc.heroes++; this.logRec('grad', { s: s.id, h: h.id, sc: s.school, noNews: true }); }
      else { s.status = 'other'; if (!s.road) s.road = R.pick(D.school.careers); this.logRec('grad', { s: s.id, h: null, sc: s.school, career: s.road, noNews: true }); }
    }
    // 在学中の関係はプロになっても続く
    for (const s of third) {
      if (s.status !== 'hero') continue;
      const h = this.heroes[s.heroId];
      const r = s.rival !== null ? this.students[s.rival] : null;
      if (r && r.status === 'hero' && h.rival === null && this.heroes[r.heroId].rival === null) { h.rival = r.heroId; this.heroes[r.heroId].rival = h.id; }
      const p = s.partner !== null ? this.students[s.partner] : null;
      if (p && p.status === 'hero' && h.partner === null && this.heroes[p.heroId].partner === null) { h.partner = p.heroId; this.heroes[p.heroId].partner = h.id; }
    }
    for (const sc of this.academy.schools) {
      const hs = out.filter((h) => this.students[h.sid].school === sc.id).sort((a, b) => G.eff(b, { f: 0.5, r: 0.25, i: 0.25 }) - G.eff(a, { f: 0.5, r: 0.25, i: 0.25 }));
      if (hs[0]) { const s = this.students[hs[0].sid]; this.post('life', 1, fill(R.pick(E.gradHero), { sc: scName(sc.id), s: S(s), hn: hs[0].name }) + `${H(hs[0])}は「${this.line(hs[0], 'debut')}」と語った。`, { h: [hs[0]], s: [s] }); }
    }
    return out;
  };

  P.studentToHero = function (s) {
    const d = D.academies[s.school];
    const st = {}; for (const k of Object.keys(s.stats)) st[k] = Math.round(s.stats[k]);
    if (!s.hname) this.nameStudent(s);
    const h = Gen.hero(this, { rookie: true, age: s.age, gender: s.gender, name: s.hname, real: s.real, pref: this.prefObj(s.pref), city: s.city, power: s.power, traits: s.traits, stats: st, job: '学生' });
    Object.assign(h, { school: d.name, sid: s.id, tone: s.tone, fp: s.fp, birthday: s.birthday, height: s.height, food: s.food, motive: s.motive, tierBonus: s.tierBonus });
    h.quotes = s.quotes.slice(-6);
    h.ms = []; h.t100 = 0; h.buzz = 0; h.streak = 0; h.topWeeks = 0; h.h2h = {};
    h.fame = Math.round(10 + s.fame * 0.8 + st.cha * 0.2);
    h.points = Math.round(s.score * 2);
    const m = s.intern !== null ? this.heroes[s.intern] : null;
    if (m && m.status === 'active' && R.chance(0.55)) {
      h.agency = m.agency;
      if (m.apprentices.length < 3 && R.chance(0.6)) { h.mentor = m.id; m.apprentices.push(h.id); }
    }
    this.fixAgency(h);
    h.debutYear = this.year;
    this.st.debuts++;
    s.status = 'hero'; s.heroId = h.id;
    return h;
  };

  // ---------- 学園生活 ----------
  P.schoolLife = function () {
    const all = this.enrolled().filter((s) => !s.kidnapped);
    const s = R.pick(all);
    if (!s) return;
    const sc = s.school;
    const same = all.filter((x) => x !== s && x.school === sc);
    const mate = R.pick(same.filter((x) => x.grade === s.grade)) || R.pick(same);
    const t = this.teacherOf(sc);
    const k = R.wpick(Object.keys(L), (x) => ({ train: 6, friend: 2, rival: 1.6, crush: 1.2, couple: 0.5, awaken: 0.8, slump: 1, hurt: 0.8, redmark: 1.2, rogue: 0.6, club: 1.4, help: 1.4, guest: 1.4, wild: 1, buzz: 1, drop: 0.15, transfer: 0.15, study: 1.2, tired: 0.8 })[x] || 1);
    const ctx = { s: S(s), sc: scName(sc), pw: s.power.name, club: s.club, t: t ? H(t) : '担任', g: s.grade };
    const refs = { s: [s], h: t ? [t] : [] };
    let text = '';
    switch (k) {
      case 'train': text = fill(R.pick(L.train), ctx); s.score += 0.5; break;
      case 'friend':
        if (!mate || s.friend !== null || mate.friend !== null) return;
        s.friend = mate.id; mate.friend = s.id; ctx.s2 = S(mate); refs.s.push(mate);
        text = fill(R.pick(L.friend), ctx); this.sEv(s, '親友', `${mate.real}と親友に`); this.sEv(mate, '親友', `${s.real}と親友に`); break;
      case 'rival':
        if (!mate || s.rival !== null || mate.rival !== null) return;
        s.rival = mate.id; mate.rival = s.id; ctx.s2 = S(mate); refs.s.push(mate);
        text = fill(R.pick(L.rival), ctx) + `${S(mate)}は「${this.line(mate, 'rival', { p: s.real.split(' ')[0] })}」と返した。`;
        this.sEv(s, 'ライバル', `${mate.real}とライバルに`); this.sEv(mate, 'ライバル', `${s.real}とライバルに`); break;
      case 'crush':
        if (!mate || s.crush !== null || s.partner !== null || mate.partner !== null) return;
        s.crush = mate.id; ctx.s2 = S(mate); refs.s.push(mate); text = fill(R.pick(L.crush), ctx); break;
      case 'couple': {
        const c = s.crush !== null ? this.students[s.crush] : null;
        if (!c || c.status !== 'enrolled' || c.partner !== null || s.partner !== null) return;
        s.partner = c.id; c.partner = s.id; ctx.s2 = S(c); refs.s.push(c);
        text = fill(R.pick(L.couple), ctx); this.sEv(s, '交際', `${c.real}と交際`); this.sEv(c, '交際', `${s.real}と交際`); break;
      }
      case 'awaken':
        if (s.tierBonus >= 1) return;
        s.tierBonus = 1; s.score += 8; s.fame += 20; text = fill(R.pick(L.awaken), ctx);
        s.honors.push({ y: this.year, t: '能力の覚醒' }); this.sEv(s, '覚醒', `「${s.power.name}」が大きく成長`);
        this.logRec('school', { kind: '覚醒', s: s.id, sc }); break;
      case 'slump': s.slump = R.int(2, 4); text = fill(R.pick(L.slump), ctx); break;
      case 'hurt': s.hurt = R.int(10, 30); text = fill(R.pick(L.hurt), ctx); break;
      case 'redmark': text = fill(R.pick(L.redmark), ctx); break;
      case 'rogue': s.fame += 15; s.score -= 2; text = fill(R.pick(L.rogue), ctx); this.sEv(s, '処分', '無許可の能力使用で処分'); break;
      case 'club': text = fill(R.pick(L.club), ctx); break;
      case 'help': s.fame += 5; text = fill(R.pick(L.help), ctx); break;
      case 'guest': {
        const ob = this.ranked.filter((h) => h.status === 'active' && h.sid !== undefined && this.students[h.sid].school === sc);
        const h = ob.length && R.chance(0.6) ? R.pick(ob) : R.pick(this.ranked.slice(0, 60));
        if (!h) return;
        ctx.h = H(h); refs.h = [h];
        text = fill(ob.includes(h) ? L.guest[1] : L.guest[0], ctx); s.score += 1; break;
      }
      case 'wild': text = fill(R.pick(L.wild), ctx); break;
      case 'buzz': s.fame += 25; text = fill(R.pick(L.buzz), ctx); break;
      case 'drop':
        if (s.grade === 3) return;
        if (this.teacher && this.isMine(s)) { this.queueConsult('drop', s); return; }
        s.status = 'dropped'; s.road = R.pick(D.school.careers); s.gradYear = this.year;
        text = fill(R.pick(L.drop), ctx); this.sEv(s, '退学', `${scName(sc)}を去る`); break;
      case 'transfer': {
        const n = this.newStudent(this.academy.schools[sc], s.grade);
        if (s.grade > 1 || this.month >= 5) this.nameStudent(n);
        ctx.s = S(n); ctx.pw = n.power.name; refs.s = [n];
        this.sEv(n, '転入', `${scName(sc)}に転入`);
        text = fill(R.pick(L.transfer), ctx); break;
      }
      case 'study': text = fill(R.pick(L.study), ctx); break;
      case 'tired': text = fill(R.pick(L.tired), ctx); break;
      default: return;
    }
    if (text) this.post('school', 1, text, refs);
  };

  // ---------- 卒業後 ----------
  P.obEvent = function () {
    const obs = this.students.filter((s) => s.status === 'other' && s.gradYear && s.gradYear < this.year);
    const s = R.pick(obs);
    if (!s) return;
    const sc = s.school;
    const mates = this.heroes.filter((h) => alive(h) && h.sid !== undefined && this.students[h.sid].school === sc && Math.abs(this.students[h.sid].entry - s.entry) <= 1);
    const ctx = { s: S(s), sc: scName(sc), career: s.road.replace(/。$/, '') };
    if (s.stats.mor < 30 && R.chance(0.2) && !(s.taught && s.trust >= 60)) {
      const v = Gen.villain(this, { pref: this.prefObj(s.pref), power: s.power, talent: clamp(s.talent + 8, 30, 95) });
      v.real = s.real; v.fromStudent = s.id; v.age = s.age;
      s.status = 'villain'; s.villainId = v.id; ctx.v = V(v);
      this.post('villain', 3, fill(E.obVillain, ctx), { s: [s], v: [v] });
      this.logRec('school', { kind: '闇堕ち', s: s.id, v: v.id, sc });
      return;
    }
    if (s.lic === 2 && s.age < 30 && R.chance(0.15)) {
      if (!s.hname) this.nameStudent(s);
      const h = this.studentToHero(s);
      h.debutYear = this.year;
      ctx.hn = h.name;
      this.post('life', 2, fill(R.pick(E.obLate), ctx) + `${H(h)}は「${this.line(h, 'debut')}」と語った。`, { s: [s], h: [h] });
      this.logRec('school', { kind: '遅咲きデビュー', s: s.id, h: h.id, sc });
      return;
    }
    const h = R.pick(mates);
    if (!h) return;
    ctx.h = H(h);
    this.post('life', 1, fill(R.pick(E.obNews), ctx), { s: [s], h: [h] });
  };

  // 引退したヒーローが教員になる
  const baseRetire = P.onRetireBond;
  P.onRetireBond = function (h) {
    baseRetire.call(this, h);
    if (!this.academy || !(h.career >= 8) || !R.chance(0.07)) return;
    const sc = this.academy.schools.slice().sort((a, b) => a.teachers.filter((id) => this.heroes[id].status === 'retired').length - b.teachers.filter((id) => this.heroes[id].status === 'retired').length)[0];
    if (sc.teachers.filter((id) => this.heroes[id].status === 'retired').length >= 4) return;
    sc.teachers.push(h.id);
    h.teach = sc.id;
    h.after = `${D.academies[sc.id].short}の教員`;
    this.post('school', 2, fill(R.pick(E.teacher), { h: H(h), sc: scName(sc.id) }), { h: [h] });
    this.logRec('school', { kind: '教員就任', h: h.id, sc: sc.id });
  };

  // 年が明けたら1つ年をとる。昔の卒業生の記録は軽くする
  P.academyNewYear = function () {
    for (const s of this.students) {
      if (s.status === 'enrolled' || s.status === 'other' || s.status === 'dropped') s.age++;
      if (s.status !== 'enrolled' && s.gradYear && this.year - s.gradYear > 6) {
        s.quotes = []; if (s.hist.length > 12) s.hist = s.hist.slice(-12);
      }
    }
  };
})(globalThis.HG = globalThis.HG || {});
