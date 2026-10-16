// シミュレーション本体：1日ずつ世界を進める
(function (G) {
  'use strict';
  const { R, D, clamp, fill, Gen } = G;

  const TIER_M = [0.5, 0.65, 0.85, 1.0, 1.2, 1.45, 1.7];
  const SHARE = [1, 0.75, 0.6, 0.5, 0.45, 0.4, 0.35, 0.3, 0.28, 0.25];
  const BIG = { kaiju: 1, disaster: 1, org: 1, raid: 1 };

  // 能力の実効値。need = {f:戦闘, r:救助, i:捜査} の重み
  G.eff = function eff(x, need) {
    if (x.kind === 'kaiju') return x.kpow;
    const s = x.stats, p = x.power;
    const fight = s.pow * 0.45 + s.tec * 0.3 + s.spd * 0.25;
    const rescue = s.spd * 0.35 + s.men * 0.35 + s.pow * 0.3;
    const intel = s.int * 0.6 + s.tec * 0.4;
    let v = need.f * fight * (0.55 + 0.15 * p.f) + need.r * rescue * (0.55 + 0.15 * p.r) + need.i * intel * (0.55 + 0.15 * p.i);
    v *= TIER_M[clamp(p.tier + (x.tierBonus || 0), 0, 6)];
    v *= 1 + Math.min(x.career || 0, 20) * 0.015;
    if (x.age > 50 && typeof x.age === 'number' && x.kind === 'hero') v *= Math.max(0.55, 1 - (x.age - 50) * 0.015);
    if (x.slump > 0) v *= 0.75;
    return v;
  };

  const H = (h) => `⟦h${h.id}⟧`;
  const V = (v) => `⟦v${v.id}⟧`;
  const O = (o) => `⟦o${o.id}⟧`;
  const T = (t) => `⟦t${t.id}⟧`;

  class Sim {
    constructor(seed, opts = {}) {
      this.seed = String(seed);
      R.seed(this.seed);
      this.year = opts.year || 2027;
      this.day = 0;
      this.heroes = [];
      this.villains = [];
      this.orgs = [];
      this.teams = [];
      this.news = [];
      this.today = [];
      this.usedNames = new Set();
      this.usedOrgNames = new Set();
      this.monthTop = [];
      this.awards = [];
      this.log = [];
      this.legacy = [];
      this.ended = false;
      this.st = this.newStats();
      this.build(opts.heroes || 340, opts.villains || 90);
      this.ensureStory();
      this.agencyStats();
      if (this.ranked[0]) this.ranked[0].ms.push('top1');
    }

    newStats() {
      return { monthly: Array.from({ length: 12 }, () => ({ inc: 0, solved: 0, sc: 0, dead: 0 })), pref: {}, inc: {}, out: { great: 0, win: 0, fail: 0, bad: 0 }, captures: 0, deaths: 0, scandals: 0, debuts: 0, retired: 0, kaijuDown: 0, fallen: 0, reformed: 0, escapes: 0, orgsDown: 0 };
    }

    build(nHero, nVillain) {
      for (let i = 0; i < nHero; i++) Gen.hero(this);
      const tpls = R.shuffle(D.orgs.slice());
      for (let i = 0; i < 7; i++) { this.usedOrgNames.add(tpls[i].name); Gen.org(this, tpls[i]); }
      while (this.villains.length < nVillain) Gen.villain(this);
      // 一部はすでに収監中
      for (const v of this.villains) if (!v.org && R.chance(0.3)) { v.status = 'captured'; }
      // 初期の因縁
      for (let i = 0; i < 25; i++) {
        const v = R.pick(this.villains.filter((x) => x.status === 'free' && x.nemesis === null));
        const h = R.pick(this.heroes.filter((x) => x.nemesis === null && x.career > 3));
        if (v && h) { v.nemesis = h.id; h.nemesis = v.id; }
      }
      // 初期チーム
      for (let i = 0; i < 10; i++) this.formTeam(true);
      this.computeRanks();
      for (const h of this.heroes) { h.weekRank = h.rank; h.startRank = h.rank; h.rankHist.push([0, h.rank]); }
    }

    // ---------- 共通 ----------
    get date() { return G.dateOf(this.year, this.day); }
    dateStr(withWeek) { return G.fmtDate(this.year, this.day, withWeek); }

    post(cat, imp, text, refs = {}) {
      const n = { id: this.news.length, y: this.year, d: this.day, cat, imp, text: fill(text) };
      this.news.push(n);
      this.today.push(n);
      const hs = (refs.h || []).filter(Boolean);
      if (hs.length) n.h = hs.map((h) => h.id);
      const bz = [0, 1, 3, 8][imp] * (cat === 'scandal' ? 1.5 : 1);
      for (const h of hs) { h.hist.push(n.id); h.buzz = (h.buzz || 0) + bz; }
      for (const v of refs.v || []) if (v) v.hist.push(n.id);
      if (refs.o) refs.o.hist.push(n.id);
      return n;
    }

    // 記録（殉職・引退・スキャンダルなどの一覧用）
    logRec(t, o = {}) {
      const n = this.news[this.news.length - 1];
      this.log.push({ t, y: this.year, d: this.day, n: o.noNews ? null : n ? n.id : null, ...o });
    }
    get month() { return this.date.getMonth(); }

    activeHeroes() { return this.heroes.filter((h) => h.status === 'active'); }
    rankedHeroes() { return this.heroes.filter((h) => h.status === 'active' || h.status === 'off'); }
    score(h) { return h.points + h.fame * 0.4; }
    isTop(h, n) { return h.rank !== null && h.rank <= n; }
    impFor(base, heroes) { return Math.min(3, base + (heroes.some((h) => this.isTop(h, 10)) ? 1 : 0)); }
    quote(h, win) {
      const t = Gen.traitObj(R.pick(h.traits));
      if (!t) return '';
      return `「${R.pick(win ? t.win : t.lose)}」`;
    }

    computeRanks() {
      const list = this.rankedHeroes().sort((a, b) => this.score(b) - this.score(a));
      for (const h of this.heroes) h.rank = null;
      list.forEach((h, i) => { h.rank = i + 1; if (h.bestRank === null || h.rank < h.bestRank) h.bestRank = h.rank; });
      this.ranked = list;
      return list;
    }

    pickPref(region) {
      const pool = region ? D.prefs.filter((p) => p.region === region) : D.prefs;
      return R.wpick(pool, (p) => p.w);
    }
    prefObj(name) { return D.prefs.find((p) => p.name === name); }
    loc(pref) { return `${pref.name}${R.pick(pref.cities)}の${R.pick(D.spots)}`; }

    // ---------- 1日の進行 ----------
    step() {
      if (this.ended) return [];
      this.today = [];
      const dt = this.date;
      const m = dt.getMonth() + 1, dd = dt.getDate(), dow = dt.getDay();

      this.upkeep();
      this.calendar(m, dd);
      this.storyDaily(m, dd);
      this.incidents(m);
      this.heroEvents();
      this.villainEvents();
      this.orgEvents();
      this.relationEvents();
      if (R.chance(0.05)) this.post('world', 1, fill(R.pick(D.worldNews), { pct: Math.round(this.approval), num: R.int(800, 4200) }));
      if (!(m === 4 && dd === 1) && R.chance(0.06 * this.mod('debut')) && this.ranked.length < 360) this.debut();
      this.populationControl();

      this.computeRanks();
      if (dow === 1) this.weekly();
      if (dd === 1 && this.day > 0) { this.monthly(m); this.storyMonthly(m); }
      if (m === 6 && dd === 30) this.halfYear();
      if (this.day === G.daysInYear(this.year) - 1) this.yearEnd();
      else this.day++;
      return this.today;
    }

    upkeep() {
      for (const h of this.heroes) {
        h.busy = false;
        if (h.slump > 0) h.slump--;
        if (h.status === 'off' && --h.off <= 0) {
          h.status = 'active';
          const reason = h.offReason;
          h.offReason = '';
          if (reason === '謹慎' && h.stats.mor < 35 && R.chance(0.35)) { this.fall(h, '謹慎期間中に姿を消し'); continue; }
          if (reason === '負傷' || reason === '謹慎' || reason === '休業') {
            const t = reason === '負傷' ? `${H(h)}がけがから回復し、活動を再開した。` : reason === '謹慎' ? `${H(h)}が謹慎を終え、活動を再開した。[「一から出直します」と語った。|ファンの反応は賛否両論だ。|]` : `${H(h)}が休業を終え、活動に復帰した。`;
            this.post('life', this.isTop(h, 20) ? 2 : 1, fill(t), { h: [h] });
          }
        }
      }
      for (const v of this.villains) {
        if (v.status !== 'captured' || v.kind === 'kaiju' || v.sealed) continue;
        const mult = { C: 0.6, B: 1, A: 1.6, S: 2.6 }[v.threat];
        if (v.jail > 0) { v.jail--; continue; }
        if (R.chance(0.0007 * mult * this.mod('escape'))) {
          v.status = 'free';
          this.st.escapes++;
          const how = R.pick(['看守を能力で操り', '面会者に変装した仲間の手引きで', '能力抑制装置の故障に乗じて', '刑務所の壁を内側から破壊して', '移送中の護送車を襲撃され', '模範囚を装い続けた末に']);
          const sg = v.saga && !v.saga.closed && this.heroes[v.saga.h].status === 'active' ? this.heroes[v.saga.h] : null;
          this.post('villain', sg || v.threat === 'S' || v.threat === 'A' ? 2 : 1, `収監中のヴィラン${V(v)}が${how}脱獄した。` + (sg ? fill(R.pick(D.sagaLines.escape), { hero: H(sg) }) : ''), { v: [v], h: sg ? [sg] : [] });
        }
      }
    }

    calendar(m, dd) {
      const ev = D.calendar.find((c) => c[0] === m && c[1] === dd);
      if (ev) this.post('world', 2, ev[2]);
      if (m === 4 && dd === 1) {
        const rookies = [];
        const act = this.rankedHeroes().length;
        for (let i = 0, n = clamp(Math.round(((370 - act) / 2 + 14) * this.mod('debut')), 6, 34); i < n; i++) rookies.push(this.debut(true));
        this.legacyDebuts();
        const best = rookies.slice().sort((a, b) => G.eff(b, { f: 0.5, r: 0.25, i: 0.25 }) - G.eff(a, { f: 0.5, r: 0.25, i: 0.25 }))[0];
        this.post('world', 3, `今年の新人は${rookies.length}名。中でも「${best.power.name}」を操る${H(best)}は首席卒業の逸材として注目を集めている。`, { h: [best] });
      }
      if (m === 2 && dd === 14) {
        const top = this.rankedHeroes().sort((a, b) => b.fame * R.f(0.7, 1.3) - a.fame * R.f(0.7, 1.3)).slice(0, 3);
        top.forEach((h) => (h.fame += 15));
        this.post('media', 2, `バレンタインのチョコ獲得数1位は${H(top[0])}。2位${H(top[1])}、3位${H(top[2])}と続いた。`, { h: top });
      }
      if (m === 7 && dd === 15) this.election();
      if (m === 12 && dd === 30) {
        const singers = this.rankedHeroes().filter((h) => h.yrec.media >= 2).sort((a, b) => b.fame - a.fame).slice(0, 3);
        if (singers.length) this.post('media', 2, `年末の歌番組に${G.joinNames(singers.map(H))}がヒーロー枠で出場し、大きな話題となった。`, { h: singers });
      }
    }

    election() {
      const list = this.rankedHeroes().map((h) => ({ h, v: (h.fame + h.stats.cha * 3) * R.f(0.7, 1.3) })).sort((a, b) => b.v - a.v).slice(0, 5);
      const total = R.int(800, 1500);
      list.forEach((x, i) => { x.h.fame += [80, 50, 35, 25, 20][i]; });
      const w = list[0].h;
      this.post('rank', 3, `第${this.year - 1990}回ヒーロー総選挙の結果発表。総投票数${total}万票の頂点に立ったのは${H(w)}。2位${H(list[1].h)}、3位${H(list[2].h)}、4位${H(list[3].h)}、5位${H(list[4].h)}。${H(w)}は「${R.pick(['応援してくれた皆さんのおかげです', 'この順位に恥じない活躍をします', '信じられない……本当にありがとう！', '来年もここに立ちます'])}」と喜びを語った。`, { h: list.map((x) => x.h) });
    }

    // ---------- 事件 ----------
    incidents(m) {
      let n = R.int(5, 9);
      const free = this.villains.filter((v) => v.status === 'free' && v.kind === 'villain');
      const w = {
        petty: 40 * this.mod('petty'), rescue: (22 + (m >= 7 && m <= 8 ? 8 : 0) + (m === 1 || m === 2 ? 5 : 0)) * this.mod('rescue'), mystery: 10,
        villain: (10 + free.length * 0.25) * this.mod('villain'), weird: 3.5,
      };
      const types = Object.keys(w);
      for (let i = 0; i < n; i++) this.incident(R.wpick(types, (t) => w[t]));
      let dp = 0.01;
      if (m === 9 || m === 8) dp *= 3;
      if (m === 6 || m === 7) dp *= 1.8;
      if (R.chance(dp * this.mod('disaster'))) this.incident('disaster');
      if (R.chance(0.03 * this.mod('kaiju'))) this.incident('kaiju');
    }

    incident(type, extra = {}) {
      const def = D.inc[type];
      this.st.inc[type] = (this.st.inc[type] || 0) + 1;
      let pref = extra.pref || this.pickPref();
      let v = extra.v || null, o = extra.o || null, diff;
      const ctx = { perp: R.pick(D.perpAdj) + R.pick(D.perpNoun) };

      if (type === 'villain') {
        if (!v) {
          const free = this.villains.filter((x) => x.status === 'free' && x.kind === 'villain' && !x.isBoss && (!x.org || x.orgRank === 'member'));
          if (!free.length) return this.incident('petty');
          v = R.wpick(free, (x) => 10 + x.notoriety);
        }
        if (R.chance(0.7)) pref = this.prefObj(v.pref);
        diff = G.eff(v, def.need) * R.f(0.85, 1.15);
      } else if (type === 'kaiju') {
        const back = this.villains.filter((x) => x.kind === 'kaiju' && x.status === 'retreated');
        v = back.length && R.chance(0.35) ? R.pick(back) : Gen.kaiju(this);
        v.status = 'free';
        diff = v.kpow * R.f(0.9, 1.1);
      } else if (type === 'disaster') {
        diff = R.int(130, 320);
      } else if (type === 'org') {
        pref = R.chance(0.5) ? this.prefObj(o.pref) : pref;
        diff = G.eff(v, def.need) * 1.2 + o.strength * 1.3;
      } else if (type === 'raid') {
        pref = this.prefObj(o.pref);
        diff = G.eff(v, def.need) * 1.1 + o.strength * 1.6;
      } else {
        const base = { petty: [15, 55], rescue: [20, 80], mystery: [25, 90], weird: [30, 120] }[type];
        diff = R.int(base[0], base[1]);
        if (R.chance(0.08)) diff *= 1.8;
      }
      ctx.pref = pref.name;
      ctx.loc = this.loc(pref);
      ctx.city = pref.name + R.pick(pref.cities);
      if (v) ctx.v = V(v);
      if (o) ctx.o = O(o);
      const intro = fill(R.pick(def.intro), ctx);

      // 出動ヒーロー
      let count = { petty: R.chance(0.2) ? 2 : 1, rescue: R.int(1, 2), mystery: R.int(1, 2), weird: R.int(1, 2), villain: 1 + (v && (v.threat === 'A' || v.threat === 'S') ? R.int(0, 2) : R.chance(0.25) ? 1 : 0), kaiju: R.int(4, 7), disaster: R.int(4, 8), org: R.int(3, 6), raid: R.int(4, 7) }[type];
      const hs = this.responders(type, pref, count, v, def.need, diff, extra.lead);
      if (!hs.length) {
        this.post('case', BIG[type] ? 3 : 1, intro + 'しかし近くに出動できるヒーローがおらず、警察が対応にあたった。');
        if (v && type === 'villain') { v.notoriety += 3; v.crimes++; }
        return;
      }

      // 判定
      const effs = hs.map((h) => G.eff(h, def.need) * R.f(0.8, 1.2));
      const order = hs.map((h, i) => [h, effs[i]]).sort((a, b) => b[1] - a[1]);
      const total = order.reduce((s, x, i) => s + x[1] * (SHARE[i] || 0.2), 0);
      const ratio = (total * R.f(0.75, 1.3)) / (diff * R.f(0.8, 1.2));
      const out = ratio >= 1.5 ? 'great' : ratio >= 1.0 ? 'win' : ratio >= 0.72 ? 'fail' : 'bad';
      this.st.out[out]++;
      this.st.pref[pref.name] = (this.st.pref[pref.name] || 0) + 1;
      const mo = this.st.monthly[this.month];
      mo.inc++;
      if (out === 'great' || out === 'win') mo.solved++;
      const lead = order[0][0];
      const all = [lead, ...order.slice(1).map((x) => x[0])];
      ctx.h = H(lead);
      ctx.hs = G.joinNames(all.map(H));
      let text = intro + fill(R.pick(def[out]), ctx);

      // 因縁
      const big0 = !!BIG[type];
      text += this.onIncident(type, v, out, all, big0);

      // 報酬・記録
      const big = !!BIG[type];
      const pm = { great: 0.55, win: 0.4, fail: 0.06, bad: -0.05 }[out];
      const fm = { great: 0.16, win: 0.09, fail: -0.03, bad: -0.07 }[out] * (big ? 1.8 : 1);
      all.forEach((h, i) => {
        const share = i === 0 ? 1 : 0.6;
        const pts = diff * pm * share * (big ? 1.4 : 1);
        h.points = Math.max(0, h.points + pts);
        h.fame = Math.max(0, h.fame + diff * fm * share);
        h.yrec.pts += pts;
        h.rec.pts += pts;
        for (const r of [h.rec, h.yrec]) {
          r.cases++;
          if (out === 'great' || out === 'win') { r.wins++; if (type === 'rescue' || type === 'disaster') r.rescues++; if (type === 'kaiju') r.kaiju++; } else if (out === 'bad') r.losses++;
        }
        this.checkMilestones(h);
        h.xp += diff * 0.12;
        while (h.xp >= 100) { h.xp -= 100; const k = R.pick(['pow', 'tec', 'spd', 'int', 'men']); h.stats[k] = Math.min(99, h.stats[k] + R.int(1, 3)); }
      });

      // 負傷・殉職
      const deaths = [];
      if (out === 'bad') {
        for (const h of all) {
          if (R.chance((big || (v && v.threat === 'S') ? 0.035 : 0.004) * this.mod('death'))) { deaths.push(h); continue; }
          if (R.chance(0.55)) this.injure(h, R.int(5, big ? 60 : 30));
        }
      } else if (out === 'win' && ratio < 1.15 && R.chance(0.3)) this.injure(lead, R.int(3, 20));
      else if (big && out !== 'great') for (const h of all) if (R.chance(0.25)) this.injure(h, R.int(7, 35));

      // ヴィラン側の処理
      if (v) this.villainOutcome(type, v, o, out, lead, all);
      if (o && type === 'org') {
        if (out === 'great' || out === 'win') { o.strength = Math.max(5, o.strength - 15); o.intel += 12; } else o.strength = Math.min(100, o.strength + 8);
      }
      if (o && type === 'raid') text += this.raidOutcome(o, out, lead);

      if (out === 'great' && lead.move && R.chance(big ? 0.45 : 0.12)) text += `決め手は${H(lead)}の必殺技「${lead.move}」だった。`;
      if ((out === 'great' || (out === 'win' && R.chance(0.4))) && R.chance(big ? 0.6 : 0.18)) text += all.length >= 2 && R.chance(0.35) ? this.duoQuote(lead, all[1]) : `${H(lead)}は${this.quote(lead, true)}と語った。`;
      else if (out === 'bad' && R.chance(0.25) && !deaths.includes(lead)) text += `${H(lead)}は${this.quote(lead, false)}と悔しさをにじませた。`;

      const cat = big ? 'big' : type === 'villain' ? 'villain' : 'case';
      let imp = big ? 3 : type === 'villain' ? (v.threat === 'S' || v.threat === 'A' ? 2 : 1) : out === 'great' && diff > 70 ? 2 : 1;
      if (type === 'weird') imp = Math.max(imp, 2);
      if (this.pendingSaga) imp = 3;
      imp = this.impFor(imp, all);
      if (type === 'disaster' || type === 'kaiju') text = `【${D.bigHeadlines[type]}】` + text;
      this.post(cat, imp, text, { h: all, v: v ? [v] : [], o });
      this.flushSaga();
      if (this.pendingKaiju) { this.logRec('kaiju', this.pendingKaiju); this.pendingKaiju = null; }
      if (this.pendingOrgDown) { this.logRec('org', { o: this.pendingOrgDown, h: lead.id }); this.pendingOrgDown = null; }

      for (const h of deaths) this.die(h, v);
      for (const h of all) h.busy = true;
    }

    responders(type, pref, count, v, need, diff, forced) {
      const big = !!BIG[type];
      const pool = this.heroes.filter((h) => h.status === 'active' && !h.busy);
      if (!pool.length) return [];
      const avg = pool.reduce((s, h) => s + this.score(h), 0) / pool.length + 1;
      const near = D.regionNear[pref.region] || [];
      const wfn = (h) => {
        let loc = h.pref === pref.name ? 10 : h.region === pref.region ? 3 : near.includes(h.region) ? (big ? 2 : 0.4) : big ? 0.5 : 0.04;
        const rel = this.score(h) / avg;
        let q = big ? Math.pow(rel, 0.9) + 0.3 : 0.6 + 0.4 * Math.min(rel, 3);
        q *= clamp(G.eff(h, need) / Math.max(30, diff * 0.6), 0.3, 2.5);
        if (v && v.nemesis === h.id) q *= 12;
        return loc * q;
      };
      const lead = forced && pool.includes(forced) ? forced : R.wpick(pool, wfn);
      if (!lead) return [];
      const out = [lead];
      // チームメイト・弟子の同行
      if (count > 1 || type !== 'petty') {
        const t = lead.team !== null ? this.teams[lead.team] : null;
        if (t && t.active) for (const id of t.members) { const m = this.heroes[id]; if (m !== lead && m.status === 'active' && !m.busy && R.chance(0.55)) out.push(m); }
        for (const id of lead.apprentices) { const a = this.heroes[id]; if (a.status === 'active' && !a.busy && !out.includes(a) && R.chance(0.35)) out.push(a); }
      }
      const rest = pool.filter((h) => !out.includes(h));
      if (out.length < count) out.push(...R.wsample(rest, count - out.length, wfn));
      return out;
    }

    villainOutcome(type, v, o, out, lead, all) {
      v.crimes++;
      if (v.kind === 'kaiju') {
        if (out === 'great' || out === 'win') { v.status = 'dead'; v.caughtBy.push(lead.id); this.st.kaijuDown++; }
        else { v.status = 'retreated'; v.wins++; v.escapes++; }
        this.pendingKaiju = { v: v.id, h: lead.id, res: v.status === 'dead' ? '撃破' : '撤退', heroes: all.map((x) => x.id) };
        return;
      }
      if (out === 'great' || out === 'win') {
        this.capture(v, lead);
      } else {
        v.notoriety += out === 'bad' ? 12 : 5;
        v.escapes++;
        if (out === 'bad') v.wins++;
        if (v.nemesis === null && R.chance(0.35) && lead.nemesis === null) {
          v.nemesis = lead.id; lead.nemesis = v.id; v.nemCount = 1;
        }
        // 悪名が上がるとヴィランも成長
        if (v.notoriety > 60 && R.chance(0.2)) {
          const k = R.pick(['pow', 'tec', 'spd']);
          v.stats[k] = Math.min(99, v.stats[k] + R.int(2, 5));
          v.threat = Gen.threatOf(G.eff(v, D.inc.villain.need));
        }
      }
    }

    capture(v, h) {
      v.status = 'captured';
      v.jail = R.int(30, 120);
      v.caughtBy.push(h.id);
      h.rec.captures++;
      h.yrec.captures++;
      this.st.captures++;
      this.checkCapture(h);
      if (v.org !== null) {
        const o = this.orgs[v.org];
        if (o.status === 'active') o.intel += v.orgRank === 'exec' ? 14 : 5;
      }
    }

    raidOutcome(o, out, lead) {
      const members = this.orgMembers(o);
      const boss = this.villains[o.boss];
      if (out === 'great') {
        for (const m of members) if (m.status === 'free' && (m === boss || R.chance(0.85))) this.capture(m, lead);
        this.dissolveOrg(o);
        this.pendingOrgDown = o.id;
        lead.fame += 60;
        return `${O(o)}は事実上の壊滅となった。`;
      }
      if (out === 'win') {
        for (const m of members) if (m.status === 'free' && m !== boss && R.chance(0.6)) this.capture(m, lead);
        o.strength = Math.max(5, o.strength - 40);
        o.intel = 30;
        return '';
      }
      o.intel = out === 'fail' ? 25 : 0;
      o.strength = Math.min(100, o.strength + 10);
      return '';
    }

    injure(h, days) {
      if (h.status !== 'active') return;
      h.status = 'off';
      h.off = Math.max(h.off, days);
      h.offReason = '負傷';
    }

    die(h, v) {
      h.status = 'dead';
      h.endYear = this.year;
      this.st.deaths++;
      this.st.monthly[this.month].dead++;
      this.leaveTeam(h);
      const by = v ? `${V(v)}との戦いで` : '救助活動中に';
      const sagaT = this.sagaOnDeath(h, v);
      this.approve(-1);
      this.post('big', 3, `【訃報】${sagaT}${H(h)}が${by}殉職した。${typeof h.age === 'number' ? '享年' + h.age + '。' : ''}${R.pick(['葬儀には全国から多くのファンが参列した。', '現場には献花が絶えない。', '同僚ヒーローたちは悲しみに暮れている。', 'ヒーローたちは黙とうを捧げた。'])}${this.tribute(h, 'death')}`, { h: [h], v: v ? [v] : [] });
      this.flushSaga();
      this.logRec('death', { h: h.id, v: v ? v.id : null, age: h.age, rank: h.rank, career: h.career });
      this.afterCareer(h);
      if (h.spouse !== null && this.heroes[h.spouse].status === 'active') {
        const s = this.heroes[h.spouse];
        s.stats.men = Math.min(99, s.stats.men + 10);
        this.post('life', 2, `${H(s)}は伴侶である${H(h)}の死を受け、「あの人の分まで戦う」と誓った。`, { h: [s, h] });
      }
      if (h.rival !== null) {
        const r = this.heroes[h.rival];
        if (r.status === 'active') this.post('life', 2, `ライバルの${H(h)}を失った${H(r)}は、そのマントを形見として受け継いだ。「${fill(R.pick(D.tributeDeath), { p: H(h) })}」`, { h: [r, h] });
      }
      if (v && v.kind === 'villain' && R.chance(0.6)) {
        const avenger = this.heroes.filter((x) => x.status === 'active' && x.nemesis === null && (x.rival === h.id || x.region === h.region))[0];
        if (avenger) { avenger.nemesis = v.id; if (v.nemesis === null) v.nemesis = avenger.id; }
      }
    }

    // ---------- ヒーロー個人のイベント ----------
    heroEvents() {
      for (const h of this.heroes) {
        if (h.status !== 'active' && h.status !== 'off') continue;
        const tr = h.traits.map(Gen.traitObj);
        const sc = tr.reduce((m, t) => m * t.sc, 1), md = tr.reduce((m, t) => m * t.md, 1);
        if (R.chance(0.00028 * sc * this.mod('scandal') * (1 + h.fame / 400) * (1 + (60 - h.stats.mor) / 100))) { this.scandal(h); continue; }
        if (h.status !== 'active') continue;
        if (R.chance(0.0009 * md * this.mod('media') * (0.5 + h.stats.cha / 100) * (1 + Math.min(h.fame, 600) / 300))) { this.mediaEvent(h); continue; }
        if (R.chance(0.0006)) { this.lifeEvent(h); continue; }
        const ap = (typeof h.age === 'number' && h.age > 35 ? 0.00008 * Math.pow(h.age - 35, 1.35) : 0.00002) + (h.career > 12 ? 0.00004 * (h.career - 12) : 0);
        if (R.chance(ap)) this.retire(h);
      }
    }

    scandal(h) {
      const tags = new Set(h.traits.flatMap((t) => Gen.traitObj(t).tags));
      const s = R.wpick(D.scandals, (x) => (x.tag === 'secret' ? (h.masked ? 4 : 0) : tags.has(x.tag) ? 6 : x.tag === 'any' ? 1.5 : 0.6));
      let text = fill(s.t, { h: H(h) });
      if (s.tag === 'secret') h.masked = false;
      h.rec.scandals++;
      h.yrec.scandals++;
      this.st.scandals++;
      this.st.monthly[this.month].sc++;
      const sev = s.sev;
      let act = 'apology';
      h.fame = Math.max(0, h.fame - [0, 20, 45, 90][sev] * R.f(0.7, 1.3));
      h.points *= 1 - [0, 0.03, 0.08, 0.16][sev];
      const Rx = D.scandalReact;
      if (sev === 1) {
        const ap = R.chance(0.7);
        if (!ap) act = 'deny';
        text += fill(R.pick(ap ? Rx.apology : Rx.deny), { h: H(h) });
        if (R.chance(0.15)) { text += R.pick(Rx.twist); h.fame += 40; act = 'twist'; }
      } else if (sev === 2) {
        text += fill(R.pick(Rx.apology), { h: H(h) });
        if (R.chance(Math.min(0.9, 0.4 * this.mod('suspend')))) { text += fill(R.pick(Rx.suspend), { h: H(h) }); this.suspend(h, R.int(14, 45)); act = 'suspend'; }
        else if (R.chance(0.1)) { text += R.pick(Rx.twist); h.fame += 50; act = 'twist'; }
      } else {
        const r = R.f();
        if (r < 0.25) {
          text += fill(R.pick(Rx.arrest), { h: H(h) });
          act = 'arrest';
          if (h.stats.mor < 40 && R.chance(0.5)) { this.post('scandal', 3, text, { h: [h] }); this.logRec('scandal', { h: h.id, sev, act }); this.fall(h, '有罪判決を受けて表舞台から消え'); return; }
          h.status = 'retired';
          h.retireReason = '免許はく奪';
          h.endYear = this.year;
          this.leaveTeam(h);
        } else if (r < 0.75) {
          text += fill(R.pick(Rx.suspend), { h: H(h) });
          this.suspend(h, R.int(45, 120));
          act = 'suspend';
        } else { text += fill(R.pick(Rx.deny), { h: H(h) }); act = 'deny'; }
      }
      h.stats.mor = Math.max(0, h.stats.mor - sev * 2);
      this.post('scandal', Math.min(3, sev + (this.isTop(h, 30) ? 1 : 0)), text, { h: [h] });
      this.logRec('scandal', { h: h.id, sev, act, rank: h.rank });
      this.approve(-sev * 1.3);
      if (act === 'arrest') this.logRec('retire', { h: h.id, reason: '免許はく奪', career: h.career, noNews: false });
    }

    suspend(h, days) {
      h.status = 'off';
      h.off = Math.max(h.off, days);
      h.offReason = '謹慎';
    }

    mediaEvent(h) {
      const ctx = { h: H(h), pref: h.pref, title: R.pick(D.bookTitles) };
      h.fame += R.int(8, 30) * this.mod('fame');
      h.rec.media++;
      h.yrec.media++;
      this.post('media', this.isTop(h, 10) ? 2 : 1, fill(R.pick(D.media), ctx), { h: [h] });
    }

    lifeEvent(h) {
      const L = D.life;
      const type = R.wpick(Object.keys(L), (k) => ({ train: 5, awaken: 1.6, slump: 2, costume: 3, marry: h.spouse === null && h.age > 23 ? 2 : 0, baby: h.spouse !== null || h.married ? 1.5 : 0, move: 2, rename: 0.8, injury: 2, family: 1, secret: 1, hobby: 3 })[k]);
      const ctx = { h: H(h), power: `「${h.power.name}」`, quirk: h.quirk };
      let imp = 1;
      switch (type) {
        case 'train': { for (const k of R.wsample(['pow', 'tec', 'spd', 'int', 'men'], 2, () => 1)) h.stats[k] = Math.min(99, h.stats[k] + R.int(3, 7)); break; }
        case 'awaken': { if (h.power.tier + h.tierBonus >= 6) return; h.tierBonus++; imp = 2; h.fame += 25; break; }
        case 'slump': { h.slump = R.int(30, 70); break; }
        case 'costume': { h.fame += 5; break; }
        case 'marry': { h.married = true; h.fame += 20; break; }
        case 'baby': { h.fame += 10; break; }
        case 'move': {
          const ag = R.pick([...this.activeAgencies(h.region), { name: 'フリーランス' }].filter((a) => a.name !== h.agency));
          if (!ag) return;
          h.agency = ag.name; ctx.agency = ag.name;
          if (ag.name === 'フリーランス') { this.post('life', 1, `${H(h)}が事務所を退所し、フリーランスとして独立した。`, { h: [h] }); return; }
          break;
        }
        case 'rename': {
          const old = h.name;
          h.name = Gen.uniq(this, () => Gen.heroNameRaw(h.gender, h.power, this.prefObj(h.pref)));
          h.oldNames.push(old);
          this.post('life', this.isTop(h, 30) ? 2 : 1, `${old}がヒーロー名を「${h.name}」に改名すると発表した。${R.pick(['心機一転を図るためという。', '占い師の助言だという。', '商標トラブルが原因とみられる。', '子どもに読めないと言われたのがきっかけだという。'])}`, { h: [h] });
          return;
        }
        case 'injury': { h.status = 'off'; h.off = R.int(10, 50); h.offReason = '負傷'; break; }
        case 'family': { h.status = 'off'; h.off = R.int(14, 60); h.offReason = '休業'; break; }
        default: break;
      }
      this.post('life', Math.max(imp, this.isTop(h, 10) ? 2 : 1), fill(R.pick(L[type]), ctx), { h: [h] });
    }

    retire(h) {
      h.status = 'retired';
      h.retireReason = '引退';
      h.endYear = this.year;
      this.st.retired++;
      this.leaveTeam(h);
      const text = fill(R.pick(D.retireLines), { h: H(h), years: Math.max(1, h.career) }) + this.sagaOnRetire(h) + this.tribute(h, 'retire');
      this.post('life', this.isTop(h, 50) || h.career > 20 ? 3 : 2, text, { h: [h] });
      this.logRec('retire', { h: h.id, reason: '引退', career: h.career, age: h.age, best: h.bestRank });
      this.flushSaga();
      this.afterCareer(h);
      for (const id of h.apprentices) { const a = this.heroes[id]; if (a.mentor === h.id) a.mentor = null; }
    }

    fall(h, how) {
      h.status = 'fallen';
      h.endYear = this.year;
      this.st.fallen++;
      this.leaveTeam(h);
      const v = Gen.villain(this, { pref: this.prefObj(h.pref), power: h.power, name: Gen.uniq(this, () => R.pick(['ダーク', 'ブラック・', 'カオス・', '堕天', 'ネオ・']) + h.name), formerHero: h.id });
      v.stats = { ...h.stats, mor: 10 };
      v.tierBonus = h.tierBonus;
      v.career = h.career;
      v.real = h.real;
      v.gender = h.gender;
      v.age = h.age;
      v.notoriety = 60;
      v.motive = R.pick(['ヒーロー社会への復讐', '「本当の正義」の実現', '自分を見捨てた世間への報復', '力こそが正義だと証明するため']);
      v.threat = Gen.threatOf(G.eff(v, D.inc.villain.need));
      h.villainId = v.id;
      if (h.rival !== null) { const r = this.heroes[h.rival]; if (r.status === 'active') { v.nemesis = r.id; r.nemesis = v.id; } }
      this.post('villain', 3, `【衝撃】元ヒーローの${H(h)}が${how}、ヴィラン${V(v)}として活動を始めたことが確認された。${R.pick(['かつてのファンは言葉を失っている。', '超常対策庁は最重要警戒対象に指定した。', '「信じられない」と元同僚は語った。'])}`, { h: [h], v: [v] });
      this.logRec('fallen', { h: h.id, v: v.id });
      this.approve(-6);
    }

    debut(batch) {
      const h = Gen.hero(this, { rookie: true });
      h.ms = []; h.t100 = 0; h.buzz = 0;
      this.fixAgency(h);
      h.debutYear = this.year;
      this.st.debuts++;
      if (!batch) this.post('life', 1, `新人ヒーロー${H(h)}が${h.pref}でデビュー。「${h.power.name}」の使い手で、${h.motive}ヒーローを志したという。`, { h: [h] });
      return h;
    }

    populationControl() {
      const act = this.rankedHeroes().length;
      if (act < 300 && R.chance(0.5)) this.debut();
      const free = this.villains.filter((v) => v.status === 'free' && v.kind === 'villain').length;
      if (free < 40 && R.chance(0.5)) this.newVillain();
    }

    // ---------- ヴィラン ----------
    villainEvents() {
      const free0 = this.villains.filter((v) => v.status === 'free' && v.kind === 'villain').length;
      if (R.chance(free0 < 70 ? 0.3 : 0.08)) this.newVillain();
      const free = this.villains.filter((v) => v.status === 'free' && v.kind === 'villain' && !v.isBoss);
      if (free.length > 2 && R.chance(0.025)) {
        const [a, b] = R.wsample(free, 2, (x) => 1 + x.notoriety);
        const [w, l] = G.eff(a, D.inc.villain.need) * R.f(0.7, 1.3) > G.eff(b, D.inc.villain.need) * R.f(0.7, 1.3) ? [a, b] : [b, a];
        w.notoriety += 10;
        const outcome = R.chance(0.5) ? `敗れた${V(l)}は駆けつけた警察に逮捕された。` : `${V(l)}は重傷を負って姿を消した。`;
        if (outcome.includes('逮捕')) { l.status = 'captured'; l.jail = R.int(30, 90); }
        this.post('villain', 1, `${V(a)}と${V(b)}が${R.pick(['縄張り', '盗品の分け前', '「最強」の座', '同じヒーローへの復讐の順番'])}をめぐって抗争。${V(w)}が勝利し、${outcome}`, { v: [a, b] });
      }
      if (free.length && R.chance(0.006)) this.reform(R.wpick(free, (x) => (x.orgRank === 'boss' ? 0 : 100 - x.notoriety)));
      if (free.length && R.chance(0.01)) {
        const v = R.pick(free);
        v.notoriety += 15;
        this.post('villain', 1, fill(`${V(v)}が[SNSに犯行予告動画を投稿し、再生数が急増|ネット上で熱狂的なファンを獲得|テレビ局に挑戦状を送りつけ]、[社会問題になっている|ヒーローたちを挑発している]。`), { v: [v] });
      }
    }

    newVillain() {
      const v = Gen.villain(this);
      this.post('villain', v.threat === 'S' ? 2 : 1, `新たなヴィラン${V(v)}の出現が確認された。「${v.power.name}」を操り、動機は「${v.motive}」とみられる。危険度${v.threat}。`, { v: [v] });
      return v;
    }

    reform(v) {
      if (!v) return;
      v.status = 'reformed';
      this.st.reformed++;
      if (v.org !== null) v.org = null;
      const h = Gen.hero(this, { rookie: true, power: v.power, pref: this.prefObj(v.pref), job: '元ヴィラン', fromVillain: v.id });
      h.ms = []; h.t100 = 0; h.buzz = 0;
      this.fixAgency(h);
      h.stats = { ...v.stats, mor: 55, cha: h.stats.cha };
      h.age = v.age;
      h.real = v.real;
      h.career = 0;
      h.motive = 'かつてヴィランとして犯した罪を償うため';
      h.origin = v.origin;
      v.heroId = h.id;
      const savior = v.caughtBy.length ? this.heroes[v.caughtBy[v.caughtBy.length - 1]] : v.nemesis !== null ? this.heroes[v.nemesis] : null;
      const why = savior ? `${H(savior)}との戦いを通じて改心したという。` : R.pick(['ある少女に命を救われたのがきっかけだという。', '服役中に読んだ一冊の本が転機になったという。']);
      this.post('villain', 2, `【改心】ヴィラン${V(v)}が罪を償った上で、ヒーロー${H(h)}として再出発することを発表した。${why}`, { v: [v], h: savior ? [h, savior] : [h] });
      this.logRec('reform', { v: v.id, h: h.id, by: savior ? savior.id : null });
    }

    // ---------- 組織 ----------
    orgMembers(o) { return this.villains.filter((v) => v.org === o.id); }

    orgEvents() {
      const active = this.orgs.filter((o) => o.status === 'active');
      let raided = false;
      for (const o of active) {
        o.strength = Math.min(100, o.strength + 0.08);
        const members = this.orgMembers(o).filter((v) => v.status === 'free');
        let boss = this.villains[o.boss];
        if (boss.status !== 'free') {
          const cand = members.filter((v) => v.orgRank === 'exec');
          if (cand.length) {
            const nb = R.wpick(cand, (v) => G.eff(v, D.inc.villain.need));
            boss.orgRank = 'exec';
            nb.orgRank = 'boss';
            o.boss = nb.id;
            boss = nb;
            this.post('villain', 2, `${O(o)}で、幹部の${V(nb)}が新たな首領の座に就いた。`, { v: [nb], o });
          } else if (members.length && R.chance(0.3)) {
            const nb = R.wpick(members, (v) => G.eff(v, D.inc.villain.need));
            boss.orgRank = 'exec';
            nb.orgRank = 'boss';
            o.boss = nb.id;
            boss = nb;
            this.post('villain', 2, `${O(o)}で、構成員だった${V(nb)}がのし上がり、首領を名乗り始めた。`, { v: [nb], o });
          } else if (!members.length) {
            this.dissolveOrg(o);
            this.post('villain', 2, `首領を失った${O(o)}が解散状態となったと超常対策庁が発表した。`, { o });
            this.logRec('org', { o: o.id, h: null });
            continue;
          }
        }
        if (!raided && o.intel >= 100 && boss.status === 'free') { raided = true; this.incident('raid', { o, v: boss }); continue; }
        if (members.length && R.chance((0.006 + o.strength / 6000) * this.mod('org'))) {
          const lt = R.wpick(members, (v) => (v.orgRank === 'exec' ? 5 : v.orgRank === 'boss' ? 0.4 : 1));
          this.incident('org', { o, v: lt });
        }
        if (R.chance(0.03)) {
          const rec = this.villains.filter((v) => v.status === 'free' && v.kind === 'villain' && v.org === null && v.formerHero === null && !v.isBoss);
          if (rec.length) {
            const v = R.wpick(rec, (x) => x.notoriety + 5);
            Gen.join(o, v, R.chance(0.2) ? 'exec' : 'member');
            o.strength = Math.min(100, o.strength + 4);
            this.post('villain', 1, `ヴィラン${V(v)}が${O(o)}に加わったとの情報。${v.orgRank === 'exec' ? '幹部待遇とみられる。' : ''}`, { v: [v], o });
          }
        }
        if (R.chance(0.01)) {
          const v = Gen.villain(this, { pref: this.prefObj(o.pref), talent: 60 });
          Gen.join(o, v, 'member');
          this.post('villain', 1, `${O(o)}が新たな改造兵士${V(v)}を投入したとの情報。`, { v: [v], o });
        }
      }
      if (active.length < 6 && R.chance(active.length === 0 ? 0.1 : active.length < 4 ? 0.04 : 0.012)) {
        let tpl = R.pick(D.orgs.filter((t) => !this.usedOrgNames.has(t.name)));
        if (!tpl) {
          const base = R.pick(D.orgs);
          const name = R.pick(['新生', 'ネオ', '真・', '第二次']) + base.name;
          if (!this.usedOrgNames.has(name)) tpl = { ...base, name, desc: `壊滅した「${base.name}」の残党が再結成した組織` };
        }
        if (tpl) {
          this.usedOrgNames.add(tpl.name);
          const o = Gen.org(this, tpl);
          const boss = this.villains[o.boss];
          this.post('villain', 3, `【新組織】${tpl.desc}「${O(o)}」が活動を開始。首領は${V(boss)}。超常対策庁は警戒を強めている。`, { v: [boss], o });
        }
      }
    }

    dissolveOrg(o) {
      if (o.status !== 'active') return;
      o.status = 'destroyed';
      o.destroyedYear = this.year;
      this.st.orgsDown++;
      for (const v of this.orgMembers(o)) { v.formerOrg = o.id; v.org = null; v.orgRank = null; }
    }

    // ---------- 人間関係 ----------
    relationEvents() {
      if (!R.chance(0.3)) return;
      const k = R.wpick(['rival', 'team', 'break', 'romance', 'mentor', 'feud', 'teamwin'], (t) => ({ rival: 3, team: 2.2, break: 0.9, romance: 1.6, mentor: 3, feud: 1, teamwin: 1 })[t]);
      const act = this.activeHeroes();
      if (act.length < 10) return;
      if (k === 'rival') {
        const a = R.pick(act.filter((h) => h.rival === null && h.rank <= 80));
        if (!a) return;
        const b = R.pick(act.filter((h) => h !== a && h.rival === null && Math.abs(h.rank - a.rank) <= 6));
        if (!b) return;
        a.rival = b.id; b.rival = a.id;
        this.post('life', this.impFor(1, [a, b]), fill(`${H(a)}が${H(b)}を「[生涯のライバル|超えるべき壁|最大の好敵手]」と公言。[ランキングで競り合う両者の今後に注目が集まる。|${H(b)}も受けて立つ構えだ。|ファンの間でも論争が起きている。]`), { h: [a, b] });
      } else if (k === 'team') this.formTeam(false);
      else if (k === 'break') {
        const t = R.pick(this.teams.filter((x) => x.active));
        if (!t) return;
        t.active = false;
        const ms = t.members.map((id) => this.heroes[id]);
        for (const m of ms) if (m.team === t.id) m.team = null;
        this.post('life', this.impFor(1, ms), `ヒーローチーム${T(t)}が解散を発表した。${R.pick(['方向性の違いが理由とされる。', 'メンバー間の不和がうわさされている。', '「それぞれの道を歩む」とのコメントが出された。', 'メンバーの一人が金銭トラブルを起こしたのがきっかけとみられる。'])}`, { h: ms });
      } else if (k === 'romance') {
        const pair = act.filter((h) => h.partner !== null && h.spouse === null);
        if (pair.length && R.chance(0.45)) {
          const a = R.pick(pair), b = this.heroes[a.partner];
          a.partner = b.partner = null;
          if (b.status === 'active' && R.chance(0.5)) {
            a.spouse = b.id; b.spouse = a.id; a.married = b.married = true;
            a.fame += 40; b.fame += 40;
            this.post('media', this.impFor(2, [a, b]), `交際中だった${H(a)}と${H(b)}が結婚を発表！[ヒーロー界のビッグカップル誕生に祝福の声が相次いだ。|式は二人が初めて共闘した現場の近くで挙げるという。]`, { h: [a, b] });
            this.logRec('marry', { h: a.id, h2: b.id });
          } else {
            this.post('life', this.impFor(1, [a, b]), `${H(a)}と${H(b)}の破局が報じられた。${R.pick(['すれ違いの生活が原因とみられる。', '現在はよき戦友に戻ったという。', '出動先の取り合いがきっかけだったとの証言も。'])}`, { h: [a, b] });
          }
          return;
        }
        const free = act.filter((h) => h.partner === null && h.spouse === null && !h.married && typeof h.age === 'number' && h.age >= 20);
        const a = R.pick(free);
        if (!a) return;
        const b = R.pick(free.filter((h) => h !== a && Math.abs(h.age - a.age) < 15));
        if (!b) return;
        a.partner = b.id; b.partner = a.id;
        a.fame += 10; b.fame += 10;
        this.post('media', this.impFor(1, [a, b]), `${H(a)}と${H(b)}の熱愛が発覚。[週刊誌が二人で夜の街を飛ぶ姿を撮影した。|共闘をきっかけに交際が始まったという。|ファンの間では以前から「あやしい」とうわさされていた。]`, { h: [a, b] });
      } else if (k === 'mentor') {
        const m = R.pick(act.filter((h) => h.career >= 8 && h.apprentices.length < 3));
        if (!m) return;
        const a = R.pick(act.filter((h) => h.career <= 1 && h.mentor === null && h.region === m.region));
        if (!a) return;
        a.mentor = m.id; m.apprentices.push(a.id);
        for (const s of ['tec', 'men']) a.stats[s] = Math.min(99, a.stats[s] + R.int(2, 6));
        this.post('life', this.impFor(1, [m]), fill(`新人の${H(a)}がベテラン${H(m)}に弟子入りした。[「あの人の背中を見て育ちたい」と語った。|${H(m)}が弟子をとるのは初めてだという。|厳しい修行の日々が始まる。]`), { h: [a, m] });
      } else if (k === 'feud') {
        const a = R.pick(act.filter((h) => h.rank <= 120));
        const b = a && R.pick(act.filter((h) => h !== a && h.region === a.region));
        if (!a || !b) return;
        a.fame += 8; b.fame += 8;
        this.post('life', this.impFor(1, [a, b]), fill(`${H(a)}と${H(b)}が[SNS上で激しい口論|生放送中に言い争い|現場での手柄をめぐって対立]。[ネットでは両陣営のファンが論争を繰り広げている。|のちに二人は焼肉店で和解したと報じられた。|事務所が仲裁に入る事態となった。]`), { h: [a, b] });
      } else if (k === 'teamwin') {
        const t = R.pick(this.teams.filter((x) => x.active));
        if (!t) return;
        const ms = t.members.map((id) => this.heroes[id]).filter((h) => h.status === 'active');
        if (!ms.length) return;
        ms.forEach((h) => (h.fame += 12));
        this.post('media', this.impFor(1, ms), fill(`ヒーローチーム${T(t)}が[合同記者会見を開き、結成以来の検挙数を報告した。|チームのテーマソングを発表した。|地域の防災イベントに全員で参加した。|公式ファンブックを発売した。]`), { h: ms });
      }
    }

    formTeam(silent) {
      if (this.teams.filter((t) => t.active).length >= 28) return;
      const pool = this.activeHeroes().filter((h) => h.team === null && !h.traits.includes('一匹狼'));
      const a = R.pick(pool);
      if (!a) return;
      const mates = R.wsample(pool.filter((h) => h !== a && h.region === a.region), R.int(1, 4), (h) => (h.agency === a.agency ? 4 : 1));
      if (!mates.length) return;
      const ms = [a, ...mates];
      const t = { id: this.teams.length, name: Gen.uniq(this, Gen.teamName), members: ms.map((h) => h.id), active: true, founded: this.year, region: a.region };
      this.teams.push(t);
      ms.forEach((h) => (h.team = t.id));
      if (!silent) this.post('life', this.impFor(1, ms), `${G.joinNames(ms.map(H))}がヒーローチーム${T(t)}を結成した。${R.pick(['リーダーは' + H(a) + 'が務める。', a.region + 'を拠点に活動するという。', 'チームの連携に期待が集まる。'])}`, { h: ms });
    }

    leaveTeam(h) {
      if (h.team === null) return;
      const t = this.teams[h.team];
      h.team = null;
      t.members = t.members.filter((id) => id !== h.id);
      if (t.members.filter((id) => this.heroes[id].status === 'active' || this.heroes[id].status === 'off').length < 2) {
        t.active = false;
        for (const id of t.members) if (this.heroes[id].team === t.id) this.heroes[id].team = null;
      }
    }

    // ---------- ランキング ----------
    weekly() {
      for (const h of this.heroes) {
        h.points *= 0.965;
        h.fame *= 0.99;
      }
      this.computeRanks();
      const prevTop = this.ranked.find((h) => h.weekRank === 1);
      const top = this.ranked[0];
      if (prevTop && top !== prevTop && this.day > 0) {
        this.post('rank', 3, `【ランキング】ヒーローランキングの首位が交代。${H(top)}が${H(prevTop)}を抜いて1位に浮上した。`, { h: [top, prevTop] });
      }
      this.storyWeekly();
      const jumpers = this.ranked.filter((h) => h.rank <= 10 && h.weekRank !== null && h.weekRank > 10);
      if (jumpers.length && this.day > 0) this.post('rank', 2, `【ランキング】${G.joinNames(jumpers.map(H))}がトップ10入りを果たした。`, { h: jumpers });
      for (const h of this.heroes) {
        h.weekRank = h.rank;
        if (h.rank !== null) h.rankHist.push([this.day, h.rank]);
      }
    }

    monthly(m) {
      const prev = m === 1 ? 12 : m - 1;
      const top5 = this.ranked.slice(0, 5);
      this.monthTop.push({ y: this.year, m: prev, id: top5[0].id });
      const climbers = this.ranked.filter((h) => h.monthRank).map((h) => [h, h.monthRank - h.rank]).sort((a, b) => b[1] - a[1]);
      let t = `【${prev}月度ヒーローランキング】1位${H(top5[0])}、2位${H(top5[1])}、3位${H(top5[2])}、4位${H(top5[3])}、5位${H(top5[4])}。`;
      if (climbers.length && climbers[0][1] > 10) t += `急上昇は${H(climbers[0][0])}（${climbers[0][0].monthRank}位→${climbers[0][0].rank}位）。`;
      this.post('rank', 3, t, { h: top5 });
      for (const h of this.heroes) h.monthRank = h.rank;
    }

    halfYear() {
      const best = this.rankedHeroes().sort((a, b) => b.yrec.pts - a.yrec.pts).slice(0, 3);
      this.post('rank', 3, `【上半期総括】上半期にもっとも活躍したヒーローは${H(best[0])}。${H(best[1])}、${H(best[2])}が続いた。`, { h: best });
    }

    yearEnd() {
      this.computeRanks();
      const pool = this.rankedHeroes();
      const by = (f, filt) => pool.filter(filt || (() => true)).sort((a, b) => f(b) - f(a))[0];
      const A = D.awardNames;
      const aw = [];
      const add = (key, h, note) => { if (h) aw.push({ key, title: A[key], id: h.id, note }); };
      const mvp = by((h) => h.yrec.pts);
      add('mvp', mvp, `年間獲得ポイント ${Math.round(mvp.yrec.pts)}`);
      const rk = by((h) => h.yrec.pts, (h) => h.debutYear === this.year);
      if (rk) add('rookie', rk, `年間獲得ポイント ${Math.round(rk.yrec.pts)}`);
      const rs = by((h) => h.yrec.rescues);
      add('rescue', rs, `救助件数 ${rs.yrec.rescues}`);
      const cp = by((h) => h.yrec.captures);
      add('capture', cp, `検挙数 ${cp.yrec.captures}`);
      const md = by((h) => h.yrec.media * 10 + h.fame * 0.01);
      add('media', md, `メディア露出 ${md.yrec.media}回`);
      const cb = by((h) => (h.startRank || 400) - h.rank, (h) => h.startRank !== null);
      if (cb) add('comeback', cb, `${cb.startRank}位 → ${cb.rank}位`);
      const kj = by((h) => h.yrec.kaiju, (h) => h.yrec.kaiju > 0);
      if (kj) add('kaiju', kj, `怪獣撃破 ${kj.yrec.kaiju}体`);
      const sc = this.heroes.filter((h) => h.yrec.scandals > 0).sort((a, b) => b.yrec.scandals - a.yrec.scandals || b.fame - a.fame)[0];
      if (sc) add('scandal', sc, `スキャンダル ${sc.yrec.scandals}件`);
      for (const a of aw) {
        const h = this.heroes[a.id];
        if (a.key !== 'scandal') h.fame += 30;
        h.titles.push({ y: this.year, title: a.title });
      }
      const champ = this.ranked[0];
      champ.titles.push({ y: this.year, title: '年間ランキング1位' });
      this.monthTop.push({ y: this.year, m: 12, id: champ.id });
      for (const h of this.ranked) h.yearRanks.push([this.year, h.rank]);
      this.awards.push({ year: this.year, champ: champ.id, list: aw, top10: this.ranked.slice(0, 10).map((h) => h.id), stats: { ...this.st } });
      const t = aw.map((a) => `${a.title}は${H(this.heroes[a.id])}`).join('、');
      this.awards[this.awards.length - 1].approval = Math.round(this.approval);
      this.awards[this.awards.length - 1].era = this.eraDef().name;
      this.post('rank', 3, `【${this.year}年 ヒーロー年間表彰】${t}。そして年間ランキング1位に輝いたのは${H(this.ranked[0])}だった。`, { h: aw.map((a) => this.heroes[a.id]) });
      this.storyYearEnd();
      this.ended = true;
    }

    // 引退・殉職したヒーローの殿堂入りと、子どもの将来のデビュー
    afterCareer(h) {
      this.inherit(h);
      const v = h.rec.pts + h.titles.length * 900 + (h.bestRank === 1 ? 1500 : h.bestRank !== null && h.bestRank <= 5 ? 600 : 0);
      if (v >= 4500 && h.career >= 5) {
        h.hof = this.year;
        this.post('rank', 3, `【殿堂入り】${H(h)}がヒーロー殿堂入りを果たした。活動${h.career}年、最高順位${h.bestRank}位、通算検挙${h.rec.captures}名。${h.titles.length ? '受賞歴' + h.titles.length + '回。' : ''}`, { h: [h] });
        this.logRec('hof', { h: h.id, career: h.career, best: h.bestRank });
      }
      if ((h.career >= 8 || h.married || h.spouse !== null) && R.chance(0.35)) this.legacy.push({ parent: h.id, year: this.year + 1 + R.int(0, 4) });
    }

    legacyDebuts() {
      const due = this.legacy.filter((l) => l.year <= this.year);
      this.legacy = this.legacy.filter((l) => l.year > this.year);
      for (const l of due) {
        const p = this.heroes[l.parent];
        const sameEl = D.powers.filter((x) => x.el === p.power.el);
        const power = R.chance(0.55) ? p.power : R.pick(sameEl.length ? sameEl : D.powers);
        const h = Gen.hero(this, { rookie: true, power, pref: this.prefObj(p.pref), age: R.int(16, 24), talent: 60 });
        h.ms = []; h.t100 = 0; h.buzz = 0;
        this.fixAgency(h);
        let second = G.succName(p.name);
        while (this.usedNames.has(second)) second = G.succName(second);
        if (!this.usedNames.has(second) && R.chance(0.6)) { this.usedNames.delete(h.name); h.name = second; this.usedNames.add(second); }
        const sur = String(p.real).split(' ')[0];
        if (p.real !== '不明' && String(p.real).includes(' ')) h.real = sur + ' ' + String(h.real).split(' ').pop();
        h.parent = p.id;
        p.child = h.id;
        h.debutYear = this.year;
        h.motive = p.status === 'dead' ? '殉職した親の遺志を継ぐため' : '偉大な親を超えるため';
        h.fame += 60;
        this.st.debuts++;
        this.post('life', 3, `【二世ヒーロー】${p.status === 'dead' ? '殉職した' : '元'}${H(p)}の子、${H(h)}がデビューした。${power === p.power ? '親と同じ「' + power.name + '」を受け継いでいる。' : '能力は「' + power.name + '」。'}`, { h: [h, p] });
        this.logRec('legacy', { h: h.id, parent: p.id });
      }
    }

    nextYear() {
      this.year++;
      this.day = 0;
      this.ended = false;
      this.st = this.newStats();
      for (const h of this.heroes) {
        if (typeof h.age === 'number') h.age++;
        if (h.status === 'active' || h.status === 'off') h.career++;
        h.yrec = Gen.newRec();
        h.points *= 0.7;
        h.startRank = h.rank;
        h.rankHist = h.rank !== null ? [[0, h.rank]] : [];
      }
      this.storyNewYear();
      for (const v of this.villains) if (typeof v.age === 'number') v.age++;
      // 2年以上前の小さなニュースは捨てて、保存容量を抑える
      for (let i = 0; i < this.news.length; i++) {
        const n = this.news[i];
        if (n && ((n.y < this.year - 1 && n.imp === 1) || (n.y < this.year - 5 && n.imp === 2))) this.news[i] = null;
      }
    }

    // ---------- 保存 ----------
    toJSON() {
      const { ranked, today, ...rest } = this;
      return { ...rest, usedNames: [...this.usedNames], usedOrgNames: [...this.usedOrgNames], rng: R.s, ver: 3 };
    }

    static fromJSON(o) {
      if (!o || (o.ver !== 2 && o.ver !== 3)) return null;
      const s = Object.create(Sim.prototype);
      Object.assign(s, o);
      s.usedNames = new Set(o.usedNames);
      s.usedOrgNames = new Set(o.usedOrgNames);
      s.today = [];
      R.s = o.rng;
      s.computeRanks();
      s.ensureStory();
      return s;
    }
  }

  G.Sim = Sim;
})(globalThis.HG = globalThis.HG || {});
