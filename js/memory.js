// 記憶と因果（雪辱・命の恩人・救われた子ども・命日）と、主要人物の認定
(function (G) {
  'use strict';
  const { R, D, fill } = G;
  const P = G.Sim.prototype;
  const H = (h) => `⟦h${h.id}⟧`;
  const V = (v) => `⟦v${v.id}⟧`;
  const S = (s) => `⟦s${s.id}⟧`;
  const alive = (h) => h && (h.status === 'active' || h.status === 'off');

  P.ensureMemory = function () {
    if (!this.cast) this.cast = [];
    if (!this.anniv) this.anniv = [];
    if (!this.kids) this.kids = [];
    for (const h of this.heroes) if (!h.mem) h.mem = [];
  };
  const baseEnsure = P.ensureAcademy;
  P.ensureAcademy = function () { baseEnsure.call(this); this.ensureMemory(); };

  // 記憶を残す（o は相手の id、k は相手の種類）
  P.remember = function (h, t, o, k, extra = {}) {
    if (!h.mem) h.mem = [];
    h.mem.push({ t, y: this.year, d: this.day, o, k, ...extra });
    if (h.mem.length > 40) h.mem.shift();
  };

  // ---------- 事件のあと ----------
  const baseOn = P.onIncident;
  P.onIncident = function (type, v, out, all, big) {
    let text = baseOn.call(this, type, v, out, all, big);
    for (const h of all) if (!h.mem) h.mem = [];
    const won = out === 'great' || out === 'win';
    const lead = all[0];
    if (v && v.kind === 'villain') {
      if (!won && !lead.mem.some((m) => m.t === 'lost' && m.o === v.id && !m.done)) this.remember(lead, 'lost', v.id, 'v');
      if (won) for (const h of all) {
        const m = h.mem.find((x) => x.t === 'lost' && x.o === v.id && !x.done && (x.y < this.year || this.day - x.d > 60));
        if (!m) continue;
        m.done = true;
        this.remember(h, 'revenge', v.id, 'v', { since: m.y });
        text += `${H(h)}にとっては、${m.y === this.year ? '今年' : m.y + '年に'}敗れた${V(v)}への雪辱だった。`;
        if (m.y <= this.year - 2 && (v.threat === 'A' || v.threat === 'S' || v.nemesis === h.id)) this.addCast(h, 'revenge', { o: V(v) });
        break;
      }
    }
    // 命の恩人
    if (won && all.length >= 2 && (big || (v && (v.threat === 'A' || v.threat === 'S'))) && R.chance(0.12)) {
      const w = all[all.length - 1];
      if (w !== lead && !w.mem.some((m) => m.t === 'savedBy' && m.o === lead.id)) {
        this.remember(w, 'savedBy', lead.id, 'h'); this.remember(lead, 'saved', w.id, 'h');
        text += `窮地に陥った${H(w)}を、${H(lead)}が間一髪で救い出す場面もあった。`;
      }
    }
    // 再会と恩返し
    for (const h of all) {
      for (const m of h.mem) {
        if (m.t !== 'savedBy' && m.t !== 'child') continue;
        if (m.y === this.year || m.call === this.year || !all.some((x) => x.id === m.o)) continue;
        if (!R.chance(0.6)) continue;
        m.call = this.year;
        const o = this.heroes[m.o];
        text += m.t === 'child' ? `幼いころ自分を救ってくれた${H(o)}と同じ現場に立った${H(h)}は、終わったあと深く頭を下げた。` : `${m.y}年に命を救われた${H(o)}と、${H(h)}は再び肩を並べた。`;
        break;
      }
    }
    // 救われた子ども（何年かあとにヒーローとしてデビューすることがある）
    if (won && (type === 'rescue' || type === 'disaster') && this.kids.length < 30 && R.chance(big ? 0.08 : 0.01)) this.kids.push({ h: lead.id, y: this.year, pref: lead.pref });
    return text;
  };

  // ---------- デビュー ----------
  P.childHero = function (h) {
    const i = this.kids.findIndex((k) => k.y <= this.year - 7);
    if (i < 0 || !R.chance(0.4)) return;
    const k = this.kids.splice(i, 1)[0];
    const sv = this.heroes[k.h];
    this.remember(h, 'child', sv.id, 'h', { since: k.y });
    this.remember(sv, 'savedChild', h.id, 'h', { since: k.y });
    h.motive = `幼いころ${sv.name}に救われ、自分もそうなりたいと思って`;
    this.post('life', 2, `新人の${H(h)}は、${k.y}年に${k.pref}で${H(sv)}に救われた子どもだった。「${this.line(h, 'debut')}」と語った${H(h)}の目標は、今も${H(sv)}だという。`, { h: [h, sv] });
    if (alive(sv)) this.addCast(h, 'child', { o: H(sv) });
  };
  const baseDebut = P.debut;
  P.debut = function (batch) { const h = baseDebut.call(this, batch); h.mem = h.mem || []; this.childHero(h); return h; };
  const baseToHero = P.studentToHero;
  P.studentToHero = function (s) {
    const h = baseToHero.call(this, s);
    h.mem = h.mem || [];
    if (s.cast) { h.cast = s.cast; const se = this.cast.find((e) => e.k === 's' && e.id === s.id); if (se) se.to = h.id; this.cast.push({ k: 'h', id: h.id, reason: s.cast, y: this.year, d: this.day, from: s.id }); }
    this.childHero(h);
    return h;
  };

  // ---------- 殉職：残された人の記憶と命日 ----------
  const baseDie = P.die;
  P.die = function (h, v) {
    baseDie.call(this, h, v);
    const add = (x, kind) => {
      if (!alive(x)) return;
      this.anniv.push({ day: this.day, y: this.year, h: x.id, o: h.id, kind });
      this.remember(x, kind === 'mentor' ? 'lostMentor' : kind === 'spouse' ? 'lostSpouse' : 'lostRival', h.id, 'h');
    };
    for (const id of h.apprentices) add(this.heroes[id], 'mentor');
    if (h.spouse !== null) add(this.heroes[h.spouse], 'spouse');
    for (const x of this.heroes) if (x.lateSpouse === h.id && !this.anniv.some((a) => a.h === x.id && a.o === h.id)) add(x, 'spouse');
    if (h.rival !== null) add(this.heroes[h.rival], 'rival');
    if (v) for (const x of this.heroes) if (alive(x) && x.nemesis === v.id && x.id !== h.id && !x.mem.some((m) => m.t === 'avenge' && m.o === v.id)) this.remember(x, 'avenge', v.id, 'v', { for: h.id });
  };

  // ---------- 毎日 ----------
  const baseBond = P.bondDaily;
  P.bondDaily = function () {
    baseBond.call(this);
    this.ensureMemory();
    // 命日
    for (const a of this.anniv) {
      if (a.day !== this.day || a.y >= this.year) continue;
      const x = this.heroes[a.h], o = this.heroes[a.o];
      if (!alive(x) || x.status !== 'active') continue;
      if (!R.chance(x.cast ? 0.9 : 0.4)) continue;
      this.post('life', x.cast ? 2 : 1, fill(R.pick(D.anniv[a.kind]), { h: H(x), o: H(o), line: this.line(x, 'tribute', { p: H(o) }) }), { h: [x, o] });
      if (a.kind === 'spouse') this.addCast(x, 'grief', { o: H(o) });
    }
    this.anniv = this.anniv.filter((a) => a.y >= this.year - 15 && alive(this.heroes[a.h]));
    // 主要人物の日常
    if (R.chance(0.12)) {
      const c = R.pick(this.cast.filter((e) => !e.to && (e.k === 'h' ? this.heroes[e.id].status === 'active' : this.students[e.id].status === 'enrolled')));
      if (c) {
        const x = c.k === 'h' ? this.heroes[c.id] : this.students[c.id];
        const tok = c.k === 'h' ? H(x) : S(x);
        const list = D.castScenes[c.reason];
        if (list) this.post(c.k === 'h' ? 'life' : 'school', 1, fill(R.pick(list), { h: tok, o: c.o || '' }), c.k === 'h' ? { h: [x] } : { s: [x] });
      }
    }
    if (this.date.getDay() === 1) this.castWeekly();
  };

  // ---------- 主要人物 ----------
  P.activeCast = function () {
    return this.cast.filter((e) => !e.to && (e.k === 'h' ? alive(this.heroes[e.id]) : this.students[e.id].status === 'enrolled'));
  };
  P.addCast = function (x, reason, ctx = {}, k = 'h') {
    if (x.cast) return false;
    // 出来事がきっかけの認定（雪辱・恩返し・喪失）は上限を気にしない
    if (!['revenge', 'child', 'grief'].includes(reason) && this.activeCast().length >= 36) return false;
    x.cast = reason;
    const e = { k, id: x.id, reason, y: this.year, d: this.day, o: ctx.o || '' };
    this.cast.push(e);
    const tok = k === 'h' ? H(x) : S(x);
    const why = fill(D.castReasons[reason].why, { h: tok, o: ctx.o || '', n: ctx.n || '', a: ctx.a || '', p: ctx.p || '' });
    this.post(k === 'h' ? 'life' : 'school', 2, `【この人に注目】${why}`, k === 'h' ? { h: [x] } : { s: [x] });
    this.logRec('cast', { [k]: x.id, reason });
    if (k === 'h') this.remember(x, 'cast', null, null, { reason });
    return true;
  };

  P.castWeekly = function () {
    let added = 0;
    const inherit = new Map();
    for (const l of this.log) if (l.t === 'inherit') inherit.set(l.h, l.m);
    const tryAdd = (x, reason, ctx, k) => { if (added < 1 && this.addCast(x, reason, ctx, k)) added++; };
    for (const h of this.heroes) {
      if (added || h.status !== 'active' || h.cast) continue;
      const r = h.rec;
      if (h.rank === 1 && (h.topWeeks || 0) >= 4) tryAdd(h, 'top');
      else if (h.stats.mor >= 92 && r.rescues >= 25) tryAdd(h, 'justice');
      else if (h.nemesis !== null && this.villains[h.nemesis].saga && this.villains[h.nemesis].saga.h === h.id && !this.villains[h.nemesis].saga.closed && this.villains[h.nemesis].saga.n >= 4) tryAdd(h, 'fate', { o: V(this.villains[h.nemesis]), n: this.villains[h.nemesis].saga.n });
      else if (inherit.has(h.id) && h.rank !== null && h.rank <= 40) tryAdd(h, 'heir', { o: H(this.heroes[inherit.get(h.id)]) });
      else if (h.parent !== null && h.parent !== undefined && this.heroes[h.parent].hof && h.rank !== null && h.rank <= 60) tryAdd(h, 'legacy', { o: H(this.heroes[h.parent]) });
      else if (r.kaiju >= 5) tryAdd(h, 'savior', { n: r.kaiju });
      else if ((r.scandals >= 2 || h.comebacks) && h.rank !== null && h.rank <= 20) tryAdd(h, 'redemption');
      else if (h.fromVillain !== null && h.rank !== null && h.rank <= 60) tryAdd(h, 'reformed');
      else if (typeof h.age === 'number' && h.age >= 40 && h.career <= 6 && h.rank !== null && h.rank <= 30) tryAdd(h, 'late', { a: h.age });
      else if (h.career >= 25 && h.rank !== null && h.rank <= 40) tryAdd(h, 'iron', { n: h.career });
      else if (h.power.tier <= 1 && !h.tierBonus && h.rank !== null && h.rank <= 40) tryAdd(h, 'underdog', { p: h.power.name });
      else if (h.sid !== undefined && this.students[h.sid].taught && h.rank !== null && h.rank <= 40) tryAdd(h, 'pupil');
      else if (r.rescues >= 60 && h.traits.some((t) => ['お人好し', '世話焼き', '面倒見がいい', '子ども好き', '情に厚い'].includes(t))) tryAdd(h, 'kind', { n: r.rescues });
      else if (r.scandals >= 4 && h.rank !== null && h.rank <= 50) tryAdd(h, 'rogue');
    }
    if (!added && this.students) {
      for (const s of this.students) {
        if (s.status !== 'enrolled' || s.cast) continue;
        if (s.honors.some((x) => x.t === '体育祭 3年の部 優勝') || (s.tierBonus && s.honors.length >= 3)) { tryAdd(s, 'star', {}, 's'); if (added) break; }
      }
    }
  };
})(globalThis.HG = globalThis.HG || {});
