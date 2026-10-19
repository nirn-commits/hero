// ヴィランの掘り下げ：プロフィール・懸賞金・目撃情報・ヒーローとの対戦成績・語録・復讐・暗躍
(function (G) {
  'use strict';
  const { R, D, fill } = G;
  const P = G.Sim.prototype;
  const H = (h) => `⟦h${h.id}⟧`;
  const V = (v) => `⟦v${v.id}⟧`;
  const VP = D.vprof;

  function assignVProfile(v) {
    if (v.kind !== 'villain' || v.mo) return;
    const g = v.gender === '男' ? 'M' : v.gender === '女' ? 'F' : 'N';
    v.mo = R.pick(VP.mo);
    v.sign = R.pick(VP.sign);
    const a = R.pick(VP.traits); let b = R.pick(VP.traits); while (b === a) b = R.pick(VP.traits);
    v.vtraits = [a, b];
    v.alias = fill(R.pick(VP.alias), { pref: v.pref.replace(/[都府県]$/, ''), who: R.pick(VP.who[g]) });
    v.hideout = R.pick(VP.hideout);
    v.likes = R.pick(VP.likes);
    v.vweak = R.pick(VP.weak);
    if (!v.vs) v.vs = {};
    if (!v.quotes) v.quotes = [];
  }
  G.assignVProfile = assignVProfile;

  // 新しく生まれるヴィランにもプロフィールを
  const baseGen = G.Gen.villain;
  G.Gen.villain = function (sim, opts) { const v = baseGen(sim, opts); assignVProfile(v); return v; };

  const baseEnsure = P.ensureAcademy;
  P.ensureAcademy = function () { baseEnsure.call(this); for (const v of this.villains) assignVProfile(v); };

  // 懸賞金（万円）
  P.bounty = function (v) {
    if (v.kind !== 'villain') return 0;
    const base = { C: 50, B: 300, A: 1500, S: 8000 }[v.threat] || 100;
    return Math.round((base + v.notoriety * 25 + v.crimes * 15 + v.escapes * 200 + (v.isBoss ? 30000 : 0) + (v.orgRank === 'boss' ? 3000 : v.orgRank === 'exec' ? 800 : 0)) / 10) * 10;
  };

  // 台詞を語録に残す
  const baseVline = P.vline;
  P.vline = function (v, sit) {
    const t = baseVline.call(this, v, sit);
    if (t && v.kind === 'villain') {
      if (!v.quotes) v.quotes = [];
      v.quotes.push({ y: this.year, d: this.day, s: sit, t });
      if (v.quotes.length > 12) v.quotes.shift();
    }
    return t;
  };

  // 事件のたびに目撃情報と対戦成績を記録する
  const baseOn = P.onIncident;
  P.onIncident = function (type, v, out, all, big) {
    const text = baseOn.call(this, type, v, out, all, big);
    if (v && v.kind === 'villain') {
      v.lastSeen = { y: this.year, d: this.day, pref: this.lastIncPref || v.pref };
      if (!v.vs) v.vs = {};
      const won = out === 'great' || out === 'win';
      for (const h of all) { const r = v.vs[h.id] || (v.vs[h.id] = [0, 0]); r[won ? 1 : 0]++; }
    }
    return text;
  };

  // 捕まえたヒーローを覚えている
  const baseOut = P.villainOutcome;
  P.villainOutcome = function (type, v, o, out, lead, all) {
    const r = baseOut.call(this, type, v, o, out, lead, all);
    if (v && v.kind === 'villain' && v.status === 'captured' && lead) { v.grudge = lead.id; v.vowed = false; }
    return r;
  };

  // ---------- 毎日：復讐・暗躍 ----------
  const baseBond = P.bondDaily;
  P.bondDaily = function () {
    baseBond.call(this);
    for (const v of this.villains) {
      if (v.kind !== 'villain' || v.status !== 'free' || v.grudge === undefined || v.grudge === null) continue;
      const h = this.heroes[v.grudge];
      if (!h || (h.status !== 'active' && h.status !== 'off')) { v.grudge = null; continue; }
      if (!v.vowed) {
        v.vowed = true;
        this.post('villain', 2, fill(R.pick(D.vRevenge.vow), { v: V(v), h: H(h) }), { v: [v], h: [h] });
        continue;
      }
      if (h.status === 'active' && !h.busy && R.chance(0.004)) {
        v.grudge = null;
        this.incident('villain', { v, lead: h, tag: D.vRevenge.tag });
      }
    }
    if (R.chance(0.07)) {
      const free = this.villains.filter((v) => v.kind === 'villain' && v.status === 'free' && (v.notoriety >= 25 || v.threat === 'A' || v.threat === 'S'));
      const v = R.pick(free);
      if (v) {
        if (!v.hideout) assignVProfile(v);
        v.notoriety += 2;
        const b = this.bounty(v);
        this.post('villain', 1, fill(R.pick(D.vScheme), { v: V(v), pref: R.chance(0.6) ? v.pref : R.pick(D.prefs).name, hide: v.hideout, bounty: b >= 10000 ? `${(b / 10000).toFixed(1)}億円` : `${b}万円` }), { v: [v] });
      }
    }
  };
})(globalThis.HG = globalThis.HG || {});
