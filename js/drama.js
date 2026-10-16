// 山場づくり：今週の注目・連続事件・記録・連勝・順位対決・関係のドラマ・ヴィランの加勢・海外・治安
(function (G) {
  'use strict';
  const { R, D, fill, clamp, Gen } = G;
  const P = G.Sim.prototype;
  const H = (h) => `⟦h${h.id}⟧`;
  const V = (v) => `⟦v${v.id}⟧`;
  const O = (o) => `⟦o${o.id}⟧`;
  const T = (t) => `⟦t${t.id}⟧`;
  const short = (p) => (p === '北海道' ? '北海道' : p.replace(/[都府県]$/, ''));
  const alive = (h) => h && (h.status === 'active' || h.status === 'off');

  P.abs = function () { return this.year * 400 + this.day; };

  P.ensureDrama = function () {
    if (!this.records) { this.records = {}; for (const k of Object.keys(D.records)) this.records[k] = { id: null, v: 0, y: null }; }
    if (!this.serials) this.serials = [];
    if (!this.duels) this.duels = [];
    if (this.watch === undefined) this.watch = null;
    if (this.lastTopId === undefined) this.lastTopId = null;
    for (const h of this.heroes) { if (h.streak === undefined) h.streak = 0; if (h.topWeeks === undefined) h.topWeeks = 0; if (!h.h2h) h.h2h = {}; }
  };

  // ---------- 記録 ----------
  P.checkRecord = function (key, h, val) {
    const r = this.records[key];
    const def = D.records[key];
    if (val <= r.v) return;
    const prevId = r.id;
    r.v = val; r.id = h.id; r.y = this.year;
    if (val >= def.min && prevId !== h.id) {
      const prev = prevId !== null ? this.heroes[prevId] : null;
      this.post('milestone', 3, `【新記録】${H(h)}が${def.label}の歴代記録を更新した（${val}${def.unit}）。${prev ? `これまでの記録保持者は${H(prev)}だった。` : ''}${H(h)}は「${this.line(h, 'award')}」と語った。`, { h: prev ? [h, prev] : [h] });
      this.logRec('record', { h: h.id, key, val, prev: prevId });
    }
  };

  // 事件のあと：連勝・記録
  P.afterIncident = function (type, out, all, lead) {
    const won = out === 'great' || out === 'win';
    if (won) {
      lead.streak = (lead.streak || 0) + 1;
      if ([25, 50, 75, 100, 150].includes(lead.streak)) this.post('milestone', lead.streak >= 50 ? 3 : 2, `${H(lead)}が出動${lead.streak}連勝を達成した。`, { h: [lead] });
      this.checkRecord('streak', lead, lead.streak);
    } else if (out === 'bad' || out === 'fail') {
      if (lead.streak >= 25) this.post('milestone', 2, `${H(lead)}の連勝が${lead.streak}でストップした。${H(lead)}は「${this.line(lead, 'lose')}」と語った。`, { h: [lead] });
      lead.streak = 0;
    }
    for (const h of all) {
      this.checkRecord('cases', h, h.rec.cases);
      this.checkRecord('captures', h, h.rec.captures);
      this.checkRecord('rescues', h, h.rec.rescues);
    }
  };

  // ---------- ヴィランの加勢 ----------
  P.villainAlly = function (type, hs) {
    if (!['kaiju', 'disaster', 'org'].includes(type)) return null;
    const cands = this.villains.filter((v) => v.status === 'free' && v.kind === 'villain' && !v.isBoss && v.nemesis !== null && hs.some((h) => h.id === v.nemesis));
    if (!cands.length || !R.chance(0.3)) return null;
    return R.pick(cands);
  };
  P.allyText = function (v, out) {
    const h = this.heroes[v.nemesis];
    v.allyCount = (v.allyCount || 0) + 1;
    v.notoriety = Math.max(0, v.notoriety - 10);
    this.pendingVAlly = { v: v.id, h: h.id };
    return `なんと、${H(h)}の宿敵${V(v)}が現れ、ヒーローたちに加勢した。${V(v)}は「${R.pick(D.vAlly)}」と言い放ち、${out === 'great' || out === 'win' ? '戦いが終わると姿を消した。' : '傷を負いながら去っていった。'}`;
  };
  P.afterVAlly = function () {
    if (!this.pendingVAlly) return;
    const v = this.villains[this.pendingVAlly.v];
    this.logRec('vally', this.pendingVAlly);
    this.pendingVAlly = null;
    if (v.allyCount >= 2 && R.chance(0.35) && v.status === 'free') this.reform(v);
  };

  // ---------- 連続事件 ----------
  P.startSerial = function () {
    if (this.serials.filter((s) => !s.done).length >= 2) return;
    const vs = this.villains.filter((v) => v.status === 'free' && v.kind === 'villain' && !v.isBoss && v.notoriety >= 20 && !this.serials.some((s) => !s.done && s.v === v.id));
    const v = R.wpick(vs, (x) => x.notoriety);
    if (!v) return;
    const pref = this.prefObj(v.pref);
    const hs = this.ranked.filter((h) => h.status === 'active' && h.rank <= 120);
    const h = R.wpick(hs, (x) => (x.region === pref.region ? 6 : 1) * (x.id === v.nemesis ? 8 : 1));
    if (!h) return;
    const title = `${short(pref.name)}連続${R.pick(D.serial.nouns)}事件`;
    const s = { id: this.serials.length, title, v: v.id, h: h.id, pref: pref.name, stage: 1, next: this.abs() + R.int(4, 7), y: this.year, start: this.day, done: false, res: null };
    this.serials.push(s);
    this.post('villain', 2, `【連続事件・第1話】『${title}』　` + fill(R.pick(D.serial.s1), { v: V(v), h: H(h), pref: pref.name, taunt: this.vline(v, 'taunt') }), { h: [h], v: [v] });
  };
  P.serialStep = function (s) {
    const v = this.villains[s.v];
    let h = this.heroes[s.h];
    const tag = (n) => `【連続事件・第${n}話】『${s.title}』　`;
    if (v.status !== 'free') {
      s.done = true; s.res = '別件逮捕';
      this.post('villain', 2, `【連続事件・完結】` + fill(R.pick(D.serial.over), { title: s.title, v: V(v) }), { v: [v] });
      this.logRec('serial', { h: s.h, v: s.v, title: s.title, res: s.res });
      return;
    }
    if (s.stage === 1) {
      s.stage = 2; s.next = this.abs() + R.int(5, 8);
      this.post('villain', 2, tag(2) + fill(R.pick(D.serial.s2), { v: V(v), h: H(h), pref: s.pref }), { h: [h], v: [v] });
    } else if (s.stage === 2) {
      s.stage = 3; s.next = this.abs() + R.int(6, 10);
      const k = R.pick(['trap', 'clue', 'ally']);
      let text, refs = [h];
      if (k === 'ally') {
        const a = R.pick(this.ranked.filter((x) => x.status === 'active' && x !== h && (x.id === h.rival || x.team === h.team || x.region === h.region)));
        if (a) { s.ally = a.id; refs.push(a); text = fill(R.pick(D.serial.s3ally), { h: H(h), v: V(v), a: H(a) }); }
      }
      if (!text && k === 'trap') { text = fill(R.pick(D.serial.s3trap), { h: H(h), v: V(v) }); if (h.status === 'active') { h.status = 'off'; h.off = R.int(2, 4); h.offReason = '負傷'; } }
      if (!text) text = fill(R.pick(D.serial.s3clue), { h: H(h), v: V(v) });
      this.post('villain', 2, tag(3) + text, { h: refs, v: [v] });
    } else {
      if (!alive(h) || h.status !== 'active') {
        const h2 = (s.ally !== undefined && this.heroes[s.ally].status === 'active' && this.heroes[s.ally]) || R.pick(this.ranked.filter((x) => x.status === 'active' && x.rank <= 60));
        if (!h2) { s.next = this.abs() + 2; return; }
        this.post('villain', 1, tag('最終') + fill(R.pick(D.serial.swap), { h: H(h), h2: H(h2) }), { h: [h, h2] });
        h = h2;
      }
      s.done = true;
      this.incident('villain', { v, lead: h, tag: `【連続事件・最終話】『${s.title}』　`, diffMul: 1.25 });
      const li = this.lastIncident || {};
      s.res = li.out === 'great' || li.out === 'win' ? '解決' : '逃走';
      s.hero = h.id;
      this.logRec('serial', { h: h.id, v: s.v, title: s.title, res: s.res });
      this.resolveWatch('serial', s.id, s.res === '解決' ? `${H(h)}が解決` : `${V(v)}は逃走`);
    }
  };

  // ---------- 今週の注目 ----------
  P.makeWatch = function () {
    // 先週の結果をまとめる
    if (this.watch) for (const it of this.watch.items) if (!it.res) this.finishWatch(it);
    const items = [];
    // 宿敵との再戦
    const sagas = this.villains.filter((v) => v.status === 'free' && v.kind === 'villain' && v.saga && !v.saga.closed && this.heroes[v.saga.h].status === 'active');
    if (sagas.length) {
      const v = R.pick(sagas), h = this.heroes[v.saga.h];
      const day = this.abs() + R.int(1, 6);
      this.duels.push({ v: v.id, h: h.id, day });
      items.push({ k: 'duel', id: v.id, a: h.id, text: `宿敵${V(v)}と${H(h)}、${v.saga.n + 1}度目の対決は近いか` });
    }
    // ライバルの順位争い
    const pairs = this.ranked.slice(0, 25).filter((h) => h.rival !== null && this.heroes[h.rival].rank !== null && h.id < h.rival && Math.abs(this.heroes[h.rival].rank - h.rank) <= 4);
    if (pairs.length) {
      const a = R.pick(pairs), b = this.heroes[a.rival];
      items.push({ k: 'race', a: a.id, b: b.id, text: `ライバル${H(a)}（${a.rank}位）と${H(b)}（${b.rank}位）の順位争い` });
    }
    // 記録への挑戦
    for (const [key, def] of Object.entries(D.records)) {
      if (!['captures', 'rescues', 'cases'].includes(key)) continue;
      const r = this.records[key];
      if (r.v < def.min) continue;
      const near = this.ranked.filter((h) => h.status === 'active' && h.id !== r.id && h.rec[key] >= r.v - Math.max(2, Math.round(r.v * 0.04)) && h.rec[key] <= r.v);
      if (near.length) { const h = near[0]; items.push({ k: 'record', a: h.id, key, base: r.v, text: `${H(h)}、${def.label}の歴代記録まであと${r.v - h.rec[key] + 1}${def.unit}` }); break; }
    }
    // 一斉摘発の気配
    const o = this.orgs.find((x) => x.status === 'active' && x.intel >= 75);
    if (o) items.push({ k: 'raid', id: o.id, text: `${O(o)}への一斉摘発が近いとの情報` });
    // 連続事件の決戦
    const s = this.serials.find((x) => !x.done && x.stage === 3 && x.next <= this.abs() + 7);
    if (s) items.push({ k: 'serial', id: s.id, text: `連続事件『${s.title}』、ついに決戦か` });
    const pick = R.shuffle(items).slice(0, 3);
    this.watch = { y: this.year, d: this.day, items: pick };
    if (pick.length) this.post('world', 2, `【今週の注目】${pick.map((x, i) => '①②③'[i] + x.text).join('　')}`, { h: pick.flatMap((x) => [x.a, x.b].filter((id) => id !== undefined).map((id) => this.heroes[id])) });
  };
  P.resolveWatch = function (k, id, res) {
    if (!this.watch) return;
    const it = this.watch.items.find((x) => x.k === k && x.id === id && !x.res);
    if (it) it.res = res;
  };
  P.finishWatch = function (it) {
    if (it.k === 'race') { const a = this.heroes[it.a], b = this.heroes[it.b]; const w = (a.rank ?? 999) < (b.rank ?? 999) ? a : b; it.res = `${H(w)}が上回った`; }
    else if (it.k === 'record') { const h = this.heroes[it.a]; it.res = this.records[it.key].id === h.id ? '記録を更新！' : '更新ならず'; }
    else if (it.k === 'raid') { const o = this.orgs[it.id]; it.res = o.status !== 'active' ? '壊滅した' : '動きなし'; }
    else if (it.k === 'duel') it.res = '対決は持ち越し';
    else if (it.k === 'serial') it.res = '決戦は持ち越し';
  };

  // ---------- 毎日 ----------
  P.dramaDaily = function (m, dd) {
    const now = this.abs();
    for (const d of this.duels.filter((x) => x.day <= now)) {
      const v = this.villains[d.v], h = this.heroes[d.h];
      if (v.status === 'free' && h.status === 'active') {
        this.incident('villain', { v, lead: h, tag: '【注目の対決】' });
        const li = this.lastIncident || {};
        this.resolveWatch('duel', v.id, li.out === 'great' || li.out === 'win' ? `${H(h)}の勝利` : `${V(v)}が逃走`);
      }
    }
    this.duels = this.duels.filter((x) => x.day > now);
    for (const s of this.serials) if (!s.done && s.next <= now) this.serialStep(s);
    if (R.chance(0.012)) this.startSerial();
    // 師弟の和解
    for (const h of this.heroes) {
      if (!h.feud || h.feud.until > now) continue;
      const m = this.heroes[h.feud.m];
      h.feud = null;
      if (alive(h) && alive(m)) {
        this.post('life', this.impFor(1, [h, m]), fill(R.pick(D.mentorMake), { a: H(h), m: H(m) }) + `${H(h)}は「${this.line(h, 'ally', { p: H(m) })}」と語った。`, { h: [h, m] });
        this.logRec('mentor', { h: h.id, m: m.id, kind: '和解' });
      }
    }
    // 海外
    if (R.chance(0.008)) this.foreignVisit();
    if (R.chance(0.003)) this.foreignVillain();
    if (m === 8 && dd === 20) this.worldCup();
  };

  P.foreignVisit = function () {
    const c = R.pick(D.countries);
    const h = R.wpick(this.ranked.slice(0, 40).filter((x) => x.status === 'active'), (x) => 41 - x.rank);
    if (!h) return;
    h.fame += 15;
    const f = R.pick(c.heroes);
    this.post('media', this.impFor(1, [h]), fill(R.pick(D.visitNews), { c: c.name, f, h: H(h) }) + `${H(h)}は「${this.line(h, 'ally', { p: f })}」と語った。`, { h: [h] });
  };
  P.foreignVillain = function () {
    const c = R.pick(D.countries);
    const name = R.pick(c.villains);
    if (this.usedNames.has(name)) return;
    this.usedNames.add(name);
    const v = Gen.villain(this, { name, talent: 75, tierBias: 1.5 });
    v.country = c.name;
    v.notoriety = 50;
    v.real = '不明';
    this.post('villain', 3, `【国際手配】${c.name}で指名手配中のヴィラン${V(v)}が日本に潜入したことがわかった。危険度${v.threat}。`, { v: [v] });
    this.logRec('foreign', { v: v.id, c: c.name });
  };
  P.worldCup = function () {
    const rep = this.ranked.find((h) => h.status === 'active');
    if (!rep) return;
    const e = G.eff(rep, { f: 0.6, r: 0.2, i: 0.2 });
    const place = clamp(Math.round(R.gauss(8 - e / 30, 1.8)), 1, 8);
    const c = R.shuffle(D.countries.slice());
    const winner = place === 1 ? '日本' : c[0].name;
    let text = `【世界大会】第${this.year - 2000}回ヒーロー世界大会が開かれ、日本代表の${H(rep)}は${place}位だった。`;
    if (place === 1) {
      rep.titles.push({ y: this.year, title: 'ヒーロー世界大会優勝' });
      rep.fame += 120;
      text = `【世界大会】日本代表の${H(rep)}が、ヒーロー世界大会で優勝した！　${H(rep)}は「${this.line(rep, 'tourney')}」と語った。`;
      this.approve(6);
    } else text += `優勝は${winner}代表の「${R.pick(c[0].heroes)}」。${H(rep)}は「${this.line(rep, 'rival', { p: '世界の強豪' })}」と語った。`;
    this.post('rank', 3, text, { h: [rep] });
    this.logRec('world', { h: rep.id, place });
  };

  // ---------- 毎週 ----------
  P.dramaWeekly = function () {
    // 連続1位
    const top = this.ranked[0];
    if (top) {
      top.topWeeks = top.id === this.lastTopId ? (top.topWeeks || 0) + 1 : 1;
      for (const h of this.ranked.slice(1, 3)) if (h.id !== top.id) h.topWeeks = 0;
      this.lastTopId = top.id;
      if ([5, 10, 20, 30, 52].includes(top.topWeeks)) this.post('rank', top.topWeeks >= 20 ? 3 : 2, `${H(top)}が${top.topWeeks}週連続でランキング1位を守っている。`, { h: [top] });
      this.checkRecord('topWeeks', top, top.topWeeks);
    }
    // ライバルの順位対決
    for (const h of this.ranked) {
      if (h.rival === null || h.id > h.rival) continue;
      const r = this.heroes[h.rival];
      if (r.rank === null) continue;
      if (!h.h2h) h.h2h = {};
      if (!r.h2h) r.h2h = {};
      const a = h.h2h[r.id] || [0, 0], b = r.h2h[h.id] || [0, 0];
      if (h.rank < r.rank) { a[0]++; b[1]++; } else { a[1]++; b[0]++; }
      h.h2h[r.id] = a; r.h2h[h.id] = b;
    }
    this.makeWatch();
  };

  // ---------- 毎月 ----------
  P.dramaMonthly = function (m) {
    // 師弟の衝突
    for (const a of this.ranked) {
      if (a.mentor === null || a.feud || a.status !== 'active') continue;
      const mt = this.heroes[a.mentor];
      if (mt.rank === null || a.rank >= mt.rank || !R.chance(0.15)) continue;
      a.feud = { m: mt.id, until: this.abs() + R.int(30, 120) };
      this.post('life', this.impFor(1, [a, mt]), fill(R.pick(D.mentorFeud), { a: H(a), m: H(mt) }) + `${H(mt)}は「${this.line(mt, 'rival', { p: H(a) })}」と語った。`, { h: [a, mt] });
      this.logRec('mentor', { h: a.id, m: mt.id, kind: '衝突' });
      break;
    }
    // チームのドラマ
    for (const t of this.teams) {
      if (!t.active || !R.chance(0.1)) continue;
      const ms = t.members.map((id) => this.heroes[id]).filter((h) => h.status === 'active' || h.status === 'off');
      if (t.leader === undefined) t.leader = t.members[0];
      const k = R.wpick(['join', 'leave', 'leader', 'combo'], (x) => ({ join: ms.length < 5 ? 3 : 0, leave: ms.length > 2 ? 1.5 : 0, leader: 1, combo: ms.length >= 2 ? 2 : 0 })[x]);
      if (k === 'join') {
        const h = R.pick(this.ranked.filter((x) => x.status === 'active' && x.team === null && x.region === t.region));
        if (!h) continue;
        t.members.push(h.id); h.team = t.id;
        this.post('life', this.impFor(1, [h]), fill(R.pick(D.teamDrama.join), { t: T(t), h: H(h) }) + `${H(h)}は「${this.line(h, 'debut')}」と意気込んだ。`, { h: [h] });
      } else if (k === 'leave') {
        const h = R.pick(ms.filter((x) => x.id !== t.leader));
        if (!h) continue;
        this.leaveTeam(h);
        this.post('life', this.impFor(1, [h]), fill(R.pick(D.teamDrama.leave), { t: T(t), h: H(h) }), { h: [h] });
      } else if (k === 'leader') {
        const h = ms.filter((x) => x.id !== t.leader && x.rank !== null).sort((a, b) => a.rank - b.rank)[0];
        if (!h) continue;
        t.leader = h.id;
        this.post('life', this.impFor(1, [h]), fill(R.pick(D.teamDrama.leader), { t: T(t), h: H(h) }), { h: [h] });
      } else if (k === 'combo') {
        const [a, b] = R.shuffle(ms.slice()).slice(0, 2);
        if (!b) continue;
        a.fame += 10; b.fame += 10;
        this.post('media', this.impFor(1, [a, b]), fill(R.pick(D.teamDrama.combo), { t: T(t), a: H(a), b: H(b) }) + `${H(a)}は「${this.line(a, 'ally', { p: H(b) })}」と語った。`, { h: [a, b] });
      }
    }
    // 治安ランキング（3か月ごと）
    if ([4, 7, 10].includes(m)) {
      const rows = D.prefs.map((p) => [p.name, (this.st.pref[p.name] || 0) / p.w]).sort((a, b) => b[1] - a[1]);
      this.post('world', 2, `【治安ランキング】人口あたりの事件がもっとも多かったのは${rows[0][0]}、次いで${rows[1][0]}、${rows[2][0]}。もっとも平和だったのは${rows[rows.length - 1][0]}だった。`);
    }
  };

  // ---------- 年末 ----------
  P.dramaYearEnd = function () {
    for (const h of this.heroes) {
      this.checkRecord('champ', h, h.titles.filter((t) => t.title === '年間ランキング1位').length);
      this.checkRecord('tourney', h, h.titles.filter((t) => t.title === '全国ヒーロー大会優勝').length);
    }
  };
})(globalThis.HG = globalThis.HG || {});
