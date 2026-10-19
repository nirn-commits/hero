// ヴィランや災害による被害（被害額・負傷者）の記録
(function (G) {
  'use strict';
  const { R } = G;
  const P = G.Sim.prototype;

  const baseNew = P.newStats;
  P.newStats = function () {
    const st = baseNew.call(this);
    st.dmg = { m: 0, inj: 0 };
    st.dmgM = Array.from({ length: 12 }, () => ({ m: 0, inj: 0 }));
    st.dmgPref = {};
    st.dmgV = {};
    st.dmgType = {};
    return st;
  };
  P.ensureDmg = function () {
    const st = this.st;
    if (!st.dmg) { st.dmg = { m: 0, inj: 0 }; st.dmgM = Array.from({ length: 12 }, () => ({ m: 0, inj: 0 })); st.dmgPref = {}; st.dmgV = {}; st.dmgType = {}; }
  };

  // 被害額は億円単位
  const BASE = { petty: [0.005, 0.1], rescue: [0.02, 0.5], mystery: [0.01, 0.2], weird: [0.02, 0.6], villain: null, kaiju: [40, 300], disaster: [20, 200], org: [8, 80], raid: [1, 10] };
  const VBASE = { C: [0.05, 0.6], B: [0.3, 3], A: [2, 15], S: [8, 60] };
  const OUT = { great: 0.25, win: 0.6, fail: 1.3, bad: 2.2 };
  const INJ = { great: [0, 1], win: [0, 3], fail: [2, 15], bad: [6, 40] };

  P.fmtDamage = function (m) { return m >= 1 ? `${m >= 100 ? Math.round(m) : m.toFixed(1)}億円` : `${Math.max(1, Math.round(m * 10000))}万円`; };

  const baseOn = P.onIncident;
  P.onIncident = function (type, v, out, all, big) {
    let text = baseOn.call(this, type, v, out, all, big);
    this.ensureDmg();
    const range = type === 'villain' && v && v.threat ? VBASE[v.threat] : BASE[type] || [0.01, 0.2];
    const m = Math.round(R.f(range[0], range[1]) * OUT[out] * 100) / 100;
    const inj = Math.round(R.f(INJ[out][0], INJ[out][1]) * (big ? 8 : 1));
    const st = this.st, mon = st.dmgM[this.month];
    st.dmg.m += m; st.dmg.inj += inj; mon.m += m; mon.inj += inj;
    const pref = this.lastIncPref || (v && v.pref) || '不明';
    const dp = st.dmgPref[pref] || (st.dmgPref[pref] = { m: 0, inj: 0 }); dp.m += m; dp.inj += inj;
    const dt = st.dmgType[type] || (st.dmgType[type] = { m: 0, inj: 0 }); dt.m += m; dt.inj += inj;
    if (v) {
      const dv = st.dmgV[v.id] || (st.dmgV[v.id] = { m: 0, inj: 0 }); dv.m += m; dv.inj += inj;
      if (!v.dmg) v.dmg = { m: 0, inj: 0, y: {} };
      v.dmg.m += m; v.dmg.inj += inj;
      const yy = v.dmg.y[this.year] || (v.dmg.y[this.year] = [0, 0]); yy[0] += m; yy[1] += inj;
    }
    this.lastDmg = { m, inj };
    if ((big || m >= 5) && (out === 'fail' || out === 'bad' || big)) text += `被害総額は推定${this.fmtDamage(m)}、負傷者は${inj}名にのぼった。`;
    else if (m >= 1 && R.chance(0.3)) text += `被害額は${this.fmtDamage(m)}と見られている。`;
    return text;
  };

  // 白書に被害を加える
  const baseWP = P.buildWhitepaper;
  P.buildWhitepaper = function () {
    baseWP.call(this);
    this.ensureDmg();
    const w = this.whitepapers[this.whitepapers.length - 1];
    const st = this.st;
    w.dmg = { m: Math.round(st.dmg.m * 10) / 10, inj: st.dmg.inj };
    w.dmgV = Object.entries(st.dmgV).sort((a, b) => b[1].m - a[1].m).slice(0, 5).map(([id, d]) => [+id, Math.round(d.m * 10) / 10, d.inj]);
    w.dmgPref = Object.entries(st.dmgPref).sort((a, b) => b[1].m - a[1].m).slice(0, 5).map(([p, d]) => [p, Math.round(d.m * 10) / 10]);
  };
  const baseJSON = P.toJSON;
  P.toJSON = function () { const o = baseJSON.call(this); delete o.lastDmg; return o; };
})(globalThis.HG = globalThis.HG || {});
