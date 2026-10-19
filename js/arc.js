// 連載の物語（アーク）：推しや中心人物を主人公に、数話かけて進むエピソード。最終話は実際の事件で結末が決まる
(function (G) {
  'use strict';
  const { R, D, fill } = G;
  const P = G.Sim.prototype;
  const H = (h) => `⟦h${h.id}⟧`;
  const V = (v) => `⟦v${v.id}⟧`;
  const alive = (h) => h && (h.status === 'active' || h.status === 'off');

  const baseEnsure = P.ensureAcademy;
  P.ensureAcademy = function () {
    baseEnsure.call(this);
    if (!this.arcs) this.arcs = [];
    if (this.teacher && this.teacherMode === undefined) this.teacherMode = true;
  };
  // 推しはブラウザ側の情報なので保存しない
  const baseJSON = P.toJSON;
  P.toJSON = function () { const o = baseJSON.call(this); delete o.favHint; return o; };

  P.ongoingArcs = function () { return (this.arcs || []).filter((a) => !a.done); };

  const strongVillain = (sim, avoid) => {
    const vs = sim.villains.filter((v) => v.kind === 'villain' && v.status === 'free' && !v.isBoss && v.orgRank !== 'boss' && (v.threat === 'A' || v.threat === 'B') && v !== avoid);
    return vs.length ? R.pick(vs) : null;
  };

  // ---------- 始まり ----------
  P.arcTypes = function (h) {
    const w = { fall: 1, home: 0.8 };
    const nv = h.nemesis !== null ? this.villains[h.nemesis] : null;
    if (nv && nv.status === 'free' && nv.kind === 'villain') w.nemesis = 3;
    const mm = (h.mem || []).find((m) => m.t === 'lostMentor');
    const inh = this.log.find((l) => l.t === 'inherit' && l.h === h.id);
    if (mm || inh || (h.parent !== null && h.parent !== undefined && this.heroes[h.parent].hof)) w.heir = 2;
    if (h.apprentices.some((id) => this.heroes[id].status === 'active')) w.mentor = 1.5;
    if (h.partner !== null && alive(this.heroes[h.partner]) && !h.married && !this.heroes[h.partner].married) w.love = 3;
    if ((h.mem || []).some((m) => (m.t === 'savedBy' || m.t === 'child') && this.heroes[m.o].status === 'active')) w.debt = 2.5;
    if ((h.mem || []).some((m) => m.t === 'lost' && !m.done && this.villains[m.o].status === 'free')) w.fall += 0.8;
    return w;
  };

  P.startArc = function (h) {
    const w = this.arcTypes(h);
    const type = R.wpick(Object.keys(w), (k) => w[k]);
    const A = D.arcs[type];
    let o = null, v = null;
    if (type === 'nemesis') v = this.villains[h.nemesis];
    if (type === 'fall') { const m = (h.mem || []).filter((x) => x.t === 'lost' && !x.done && this.villains[x.o].status === 'free').pop(); v = m ? this.villains[m.o] : null; }
    if (type === 'heir') {
      const mm = (h.mem || []).find((m) => m.t === 'lostMentor');
      const inh = this.log.find((l) => l.t === 'inherit' && l.h === h.id);
      o = mm ? this.heroes[mm.o] : inh ? this.heroes[inh.m] : this.heroes[h.parent];
    }
    if (type === 'mentor') o = this.heroes[R.pick(h.apprentices.filter((id) => this.heroes[id].status === 'active'))];
    if (type === 'love') o = this.heroes[h.partner];
    if (type === 'debt') { const m = (h.mem || []).filter((x) => (x.t === 'savedBy' || x.t === 'child') && this.heroes[x.o].status === 'active').pop(); o = this.heroes[m.o]; }
    if (!v) v = strongVillain(this);
    if (!v) return null;
    const a = { id: this.arcs.length, h: h.id, type, o: o ? o.id : null, v: v.id, stage: 0, next: this.abs(), title: R.pick(A.titles), y: this.year, d: this.day, news: [], done: false, res: null };
    this.arcs.push(a);
    if (!h.arcs) h.arcs = [];
    h.arcs.push(a.id);
    h.lastArc = this.abs();
    this.arcStep(a);
    return a;
  };

  P.arcCtx = function (a, sit) {
    const h = this.heroes[a.h], o = a.o !== null ? this.heroes[a.o] : null, v = this.villains[a.v];
    const pref = this.prefObj(h.pref);
    return {
      h: H(h), o: o ? H(o) : '', v: V(v), pref: h.pref, city: h.city ? `${h.pref}${h.city}` : h.pref,
      move: h.move || h.power.name, food: h.food || 'おにぎり', motto: h.motto || '一歩ずつ', fp: h.fp,
      q: sit ? this.line(h, sit, { p: o ? H(o) : V(v) }) : '', _pref: pref,
    };
  };

  // ---------- 進行 ----------
  P.arcStep = function (a) {
    const h = this.heroes[a.h];
    const A = D.arcs[a.type];
    if (!alive(h)) { this.endArc(a, '中断'); return; }
    if (a.stage < A.stages.length) {
      const st = A.stages[a.stage];
      const tpl = R.pick(st.t);
      const ctx = this.arcCtx(a, /\{q\}/.test(tpl) ? st.q || 'back' : null);
      const o = a.o !== null ? this.heroes[a.o] : null;
      const n = this.post('life', 2, `【${a.title}　第${a.stage + 1}話】${fill(tpl, ctx)}`, { h: o ? [h, o] : [h], v: [this.villains[a.v]] });
      a.news.push(n.id);
      const e = st.eff || {};
      if (e.slump) h.slump = Math.max(h.slump, e.slump);
      if (e.st) for (const [k, val] of Object.entries(e.st)) h.stats[k] = Math.min(99, h.stats[k] + val);
      if (e.newMove) { h.move = (h.move ? h.move.replace(/・(継承|真打|夜明け|ふたたび|遺志)$/, '') : h.power.name) + R.pick(D.arcMoveSfx); }
      if (e.mentorBoost && o) { o.stats.tec = Math.min(99, o.stats.tec + 3); o.stats.men = Math.min(99, o.stats.men + 3); }
      a.stage++;
      a.next = this.abs() + R.int(10, 20);
      return;
    }
    // 最終話：実際の事件で結末が決まる
    if (h.status !== 'active' || h.busy) { a.next = this.abs() + 3; return; }
    let v = this.villains[a.v];
    if (v.status !== 'free') { v = strongVillain(this); if (!v) { this.endArc(a, '中断'); return; } a.v = v.id; }
    const pre = fill(A.finale.pre, this.arcCtx(a));
    this.incident('villain', { v, lead: h, tag: `【${a.title}・最終話】${pre}`, diffMul: 1.1, ...(a.type === 'home' ? { pref: this.prefObj(h.pref), fixPref: true } : {}) });
    const li = this.lastIncident;
    if (li && li.lead === h.id && li.n !== undefined) a.news.push(li.n);
    const win = !!li && li.lead === h.id && (li.out === 'great' || li.out === 'win');
    const tpl = R.pick(win ? A.finale.win : A.finale.lose);
    const ctx = this.arcCtx(a, /\{q\}/.test(tpl) ? (win ? (a.type === 'love' ? 'marry' : 'win') : 'lose') : null);
    const o = a.o !== null ? this.heroes[a.o] : null;
    const n2 = this.post('life', win ? 3 : 2, `【${a.title}・終】${fill(tpl, ctx)}`, { h: o ? [h, o] : [h], v: [this.villains[a.v]] });
    a.news.push(n2.id);
    if (win) {
      h.fame += 50; h.points += 120; h.stats.mor = Math.min(100, h.stats.mor + 3); h.slump = 0;
      if (a.type === 'love' && o && h.partner === o.id && !h.married && !o.married && h.spouse === null && o.spouse === null) {
        h.spouse = o.id; o.spouse = h.id; h.married = o.married = true; h.partner = o.partner = null;
        this.logRec('marry', { h: h.id, h2: o.id, noNews: true });
      }
    } else if (a.type === 'fall') h.slump = Math.max(h.slump, 10);
    this.endArc(a, win ? '成就' : '未完');
  };

  P.endArc = function (a, res) {
    a.done = true; a.res = res; a.ey = this.year; a.ed = this.day;
    const h = this.heroes[a.h];
    if (res !== '中断') {
      this.logRec('arc', { h: a.h, title: a.title, type: a.type, res, o: a.o, v: a.v, noNews: true });
      if (h.mem) this.remember(h, 'arc', a.id, 'a', { title: a.title, res });
    }
  };

  // ---------- 毎日 ----------
  const baseBond = P.bondDaily;
  P.bondDaily = function () {
    baseBond.call(this);
    if (!this.arcs) this.arcs = [];
    const now = this.abs();
    for (const a of this.ongoingArcs()) if (now >= a.next) this.arcStep(a);
    if (this.date.getDay() === 3 && this.ongoingArcs().length < 3 && R.chance(0.45)) {
      const fav = new Set(this.favHint || []);
      const pool = this.heroes.filter((h) => h.status === 'active' && (h.cast || fav.has(h.id)) && !this.ongoingArcs().some((a) => a.h === h.id) && (!h.lastArc || now - h.lastArc > 400));
      const h = R.wpick(pool, (x) => (fav.has(x.id) ? 3 : 1) * (x.cast ? 1.5 : 1));
      if (h) this.startArc(h);
    }
  };
})(globalThis.HG = globalThis.HG || {});
