// ランダム生成：ヒーロー・ヴィラン・怪獣・組織・チーム
(function (G) {
  'use strict';
  const { R, D, clamp, fill } = G;

  const gKey = (gender) => (gender === '男' ? 'M' : gender === '女' ? 'F' : 'N');
  const sfx = (tbl, g) => (R.chance(0.35) && tbl[g] && g !== 'N' ? R.pick(tbl[g]) : R.pick(tbl.N));
  const pfx = (tbl, g) => (R.chance(0.3) && g !== 'N' ? R.pick(tbl[g]) : R.pick(tbl.N));

  function pickPrefObj() { return R.wpick(D.prefs, (p) => p.w); }

  function realName(gender) {
    if (R.chance(0.04)) return R.pick(D.foreignNames[gender === '女' ? 'F' : 'M']);
    const s = R.pick(D.surnames);
    const pool = gender === '男' ? D.givenM : gender === '女' ? D.givenF : D.givenN;
    const given = R.chance(0.12) ? R.pick(D.givenN) : R.pick(pool);
    return { full: s[0] + ' ' + given, sur: s };
  }

  function heroNameRaw(gender, power, pref) {
    const g = gKey(gender);
    const ew = D.elemWords[power.el] || D.elemWords.odd;
    const any = () => D.elemWords[R.pick(Object.keys(D.elemWords))];
    const p = R.f();
    if (p < 0.24) return R.pick(ew.k) + sfx(D.kSuffix, g);
    if (p < 0.38) return pfx(D.kPrefix, g) + R.pick(ew.k);
    if (p < 0.56) return R.pick(ew.j) + sfx(D.jSuffix, g);
    if (p < 0.64) return R.pick(ew.k) + '・' + R.pick(R.chance(0.5) ? ew.k : any().k);
    if (p < 0.70) return R.pick(D.cuteWords) + R.pick(D.cuteSuffix);
    if (p < 0.77) return R.pick(pref.sp) + R.pick(D.gotochiSuffix);
    if (p < 0.83) return R.pick(D.uniqueHeroNames);
    if (p < 0.89) return R.pick(ew.j) + R.pick(any().j) + R.pick(['', '', ...D.jSuffix.N]);
    if (p < 0.94) return R.pick(['キャプテン・', 'ミスター・', 'ドクター・', 'マスクド・', '']) + R.pick(D.surnames)[1] + R.pick(['', '・ザ・グレート', 'マスク', 'Z', '・ジャスティス']);
    return R.pick(['ザ・', 'ネオ', 'スーパー', '']) + R.pick(ew.k) + R.pick(['・ワン', 'MkⅡ', '・ゼロ', '7', 'X', 'Ω', '']);
  }

  function uniq(sim, gen) {
    for (let i = 0; i < 30; i++) {
      const n = gen();
      if (!sim.usedNames.has(n)) { sim.usedNames.add(n); return n; }
      if (i > 20) {
        const n2 = R.pick(['二代目', '三代目', 'ネオ', '真・']) + n;
        if (!sim.usedNames.has(n2)) { sim.usedNames.add(n2); return n2; }
      }
    }
    const n = gen() + sim.usedNames.size;
    sim.usedNames.add(n);
    return n;
  }

  function pickPower(tierBias) {
    const tw = [0, 10, 24, 36, 20, 10];
    if (tierBias) for (let t = 1; t <= 5; t++) tw[t] *= Math.pow(t, tierBias);
    const tier = R.wpick([1, 2, 3, 4, 5], (t) => tw[t]);
    return R.pick(D.powers.filter((p) => p.tier === tier));
  }

  function pickTraits() {
    const a = R.pick(D.traits);
    let b = R.pick(D.traits);
    while (b === a) b = R.pick(D.traits);
    return [a.name, b.name];
  }
  const traitObj = (name) => D.traits.find((t) => t.name === name);

  function pickJob(age) {
    const ok = D.jobs.filter((j) => age >= j[1] && age <= j[2]);
    return R.pick(ok.length ? ok : D.jobs)[0];
  }

  function pickAgency(pref, gotochi) {
    if (gotochi) return pref.name.replace(/[都道府県]$/, '') + '観光課';
    return R.wpick(D.agencies, (a) => (a.type === 'フリー' ? 2.5 : a.region === pref.region ? 3 : a.region === null ? 1.2 : 0.05)).name;
  }

  function makeStats(talent) {
    const s = () => Math.round(clamp(talent + R.gauss(0, 12), 12, 99));
    return { pow: s(), tec: s(), spd: s(), int: s(), cha: Math.round(clamp(R.gauss(55, 18), 10, 99)), men: s(), mor: 0 };
  }

  function hero(sim, opts = {}) {
    const gender = R.chance(0.05) ? '不明' : R.chance(0.42) ? '女' : '男';
    const age = opts.age || (opts.rookie ? R.int(15, 28) : clamp(Math.round(R.gauss(32, 10)), 16, 78));
    const pref = opts.pref || pickPrefObj();
    const power = opts.power || pickPower(opts.tierBias || 0);
    const rn = realName(gender);
    const traits = opts.traits || pickTraits();
    const talent = clamp(R.gauss(opts.talent || 52, 14), 18, 96);
    const stats = makeStats(talent);
    const morBase = traits.reduce((m, t) => m + (traitObj(t) ? traitObj(t).mor : 0), 0);
    stats.mor = Math.round(clamp(R.gauss(66, 14) + morBase, 5, 100));
    const career = opts.rookie ? 0 : R.int(0, clamp(age - 16, 0, 35));
    const gotochiName = R.chance(0.07);
    const name = uniq(sim, () => (gotochiName ? R.pick(pref.sp) + R.pick(D.gotochiSuffix) : heroNameRaw(gender, power, pref)));
    const originT = power.skill ? R.pick(D.skillOrigins) : R.pick(D.origins);
    const h = {
      kind: 'hero', id: sim.heroes.length, name, oldNames: [],
      real: typeof rn === 'string' ? rn : rn.full, masked: R.chance(0.18) || gender === '不明',
      gender, age, pref: pref.name, city: R.pick(pref.cities), region: pref.region,
      power, tierBonus: 0, stats, traits,
      origin: fill(originT, { power: `「${power.name}」` }), motive: R.pick(D.motives), quirk: R.pick(D.quirks),
      job: opts.job || pickJob(age), agency: pickAgency(pref, gotochiName),
      status: 'active', off: 0, offReason: '', slump: 0,
      career, debutYear: sim.year - career, xp: 0,
      points: 0, fame: 0, rank: null, weekRank: null, startRank: null,
      rec: newRec(), yrec: newRec(),
      rival: null, partner: null, spouse: null, team: null, mentor: null, apprentices: [], nemesis: null,
      hist: [], rankHist: [], busy: false, villainId: null, fromVillain: opts.fromVillain ?? null,
      titles: [], yearRanks: [], bestRank: null, hof: null, parent: null, child: null,
    };
    if (!opts.rookie) {
      const e = G.eff(h, { f: 0.5, r: 0.25, i: 0.25 });
      h.points = Math.round(e * (1 + career * 0.12) * R.f(0.4, 1.6) * 2.2);
      h.fame = Math.round(clamp(career * 5 + stats.cha * 0.8 + R.gauss(0, 25), 0, 400) * R.f(0.5, 1.4));
    } else {
      h.fame = Math.round(R.f(0, 25) + stats.cha * 0.2);
    }
    sim.heroes.push(h);
    return h;
  }

  function newRec() {
    return { cases: 0, wins: 0, captures: 0, rescues: 0, losses: 0, scandals: 0, media: 0, kaiju: 0, pts: 0 };
  }

  function villainNameRaw(power) {
    const ew = D.elemWords[power.el] || D.elemWords.dark;
    const p = R.f();
    if (p < 0.22) return R.pick(D.vPrefix) + R.pick(D.vCore);
    if (p < 0.36) return R.pick(D.vCore);
    if (p < 0.52) return R.pick(D.vKanji) + R.pick(D.vKanjiSuffix);
    if (p < 0.64) return '怪人' + R.pick(D.kaijinAnimals) + R.pick(['男', '女', '']);
    if (p < 0.76) return R.pick(D.vPrefix) + R.pick(ew.k);
    if (p < 0.86) return R.pick(ew.j) + R.pick(D.vKanji) + R.pick(D.vKanjiSuffix);
    if (p < 0.94) return R.pick(D.vEpithet) + '「' + R.pick(D.vCore.concat(ew.k)) + '」';
    return R.pick(D.vUnique);
  }

  function threatOf(e) { return e < 50 ? 'C' : e < 80 ? 'B' : e < 115 ? 'A' : 'S'; }

  function villain(sim, opts = {}) {
    const gender = R.chance(0.08) ? '不明' : R.chance(0.35) ? '女' : '男';
    const age = clamp(Math.round(R.gauss(36, 13)), 15, 300);
    const pref = opts.pref || pickPrefObj();
    const power = opts.power || pickPower(opts.tierBias || 0.4);
    const rn = realName(gender);
    const talent = clamp(R.gauss(opts.talent || 52, 15), 20, 99);
    const stats = makeStats(talent);
    stats.mor = Math.round(clamp(R.gauss(20, 12), 0, 60));
    const v = {
      kind: 'villain', id: sim.villains.length, name: opts.name || uniq(sim, () => villainNameRaw(power)),
      real: R.chance(0.45) ? '不明' : typeof rn === 'string' ? rn : rn.full,
      gender, age, pref: pref.name, region: pref.region, power, tierBonus: 0, stats, career: R.int(0, 15),
      origin: fill(R.pick(D.villainOrigins), { power: `「${power.name}」` }), motive: R.pick(D.villainMotives), quirk: R.pick(D.quirks),
      status: 'free', org: null, orgRank: null, notoriety: R.int(0, 30), crimes: 0, escapes: 0, wins: 0, caughtBy: [],
      nemesis: null, formerHero: opts.formerHero ?? null, heroId: null, hist: [], jail: 0, debutYear: sim.year,
    };
    v.threat = threatOf(G.eff(v, D.inc.villain.need));
    sim.villains.push(v);
    return v;
  }

  function kaiju(sim) {
    const name = uniq(sim, () => R.pick(D.kaijuA) + R.pick(D.kaijuB) + R.pick(D.kaijuC));
    const pref = pickPrefObj();
    const v = {
      kind: 'kaiju', id: sim.villains.length, name, real: '―', gender: '―', age: R.pick([1, 100, 3000, 65000000, '不明']),
      pref: pref.name, region: pref.region, power: { name: '怪獣', desc: R.pick(D.kaijuDesc), el: 'beast', f: 5, r: 0, i: 0, tier: 5 },
      kpow: R.int(150, 330), stats: null, status: 'free', threat: 'S', notoriety: 50, crimes: 0, escapes: 0, wins: 0, caughtBy: [],
      origin: '', motive: '不明', quirk: '', nemesis: null, hist: [], org: null, debutYear: sim.year,
    };
    sim.villains.push(v);
    return v;
  }

  function org(sim, tpl) {
    const pref = pickPrefObj();
    const o = { id: sim.orgs.length, name: tpl.name, desc: tpl.desc, type: tpl.type, pref: pref.name, boss: null, strength: R.int(30, 70), intel: R.int(0, 30), status: 'active', founded: sim.year, hist: [] };
    sim.orgs.push(o);
    const boss = villain(sim, { pref, talent: 82, tierBias: 1.5 });
    join(o, boss, 'boss');
    const nExec = R.int(1, 3), nMem = R.int(2, 6);
    for (let i = 0; i < nExec; i++) join(o, villain(sim, { pref: R.chance(0.6) ? pref : undefined, talent: 66, tierBias: 0.8 }), 'exec');
    for (let i = 0; i < nMem; i++) join(o, villain(sim, { talent: 46 }), 'member');
    return o;
  }

  function join(o, v, rank) {
    v.org = o.id;
    v.orgRank = rank;
    if (rank === 'boss') o.boss = v.id;
  }

  function teamName() {
    const p = R.f();
    if (p < 0.25) return 'チーム・' + R.pick(D.teamWords);
    if (p < 0.45) return R.pick(D.teamWords) + R.pick(['ズ', 'ーズ', '・フォース', '・ユニット', 'レンジャーズ']);
    if (p < 0.65) return R.pick(D.teamKanji) + R.pick(['隊', '組', '団', '会', '衆']);
    if (p < 0.8) return R.pick(D.teamWords) + '・' + R.pick(['ナイツ', 'エンジェルズ', 'セブン', 'アベンジ', 'リーグ', 'ファイブ']);
    return R.pick(D.teamKanji) + R.pick(D.teamWords);
  }

  G.Gen = { hero, villain, kaiju, org, join, teamName, heroNameRaw, villainNameRaw, uniq, pickPrefObj, threatOf, traitObj, newRec };
})(globalThis.HG = globalThis.HG || {});
