// Node で1年分を実行して結果を確認するツール: node tools/headless.js [seed] [years]
const fs = require('fs');
const path = require('path');
const vm = require('vm');
for (const f of ['core', 'data_names', 'data_world', 'data_powers', 'data_people', 'data_events', 'data_story', 'data_more', 'data_more2', 'data_bond', 'data_voice', 'data_voice2', 'data_drama', 'generator', 'sim', 'story', 'bond', 'voice', 'drama']) {
  vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), { filename: f + '.js' });
}
const G = globalThis.HG;
const seed = process.argv[2] || 'test';
const years = Number(process.argv[3] || 1);
const sim = new G.Sim(seed);
const plain = (t) => t.replace(/⟦([hvot])(\d+)⟧/g, (m, k, id) => {
  const e = k === 'h' ? sim.heroes[id] : k === 'v' ? sim.villains[id] : k === 'o' ? sim.orgs[id] : sim.teams[id];
  return k === 'h' ? e.name : k === 'v' ? `〈${e.name}〉` : k === 'o' ? `『${e.name}』` : `「${e.name}」`;
});
const t0 = Date.now();
for (let y = 0; y < years; y++) {
  if (y > 0) sim.nextYear();
  while (!sim.ended) sim.step();
  const act = sim.rankedHeroes().length, free = sim.villains.filter((v) => v.status === 'free' && v.kind === 'villain').length;
  console.log(`year ${sim.year}: active ${act} freeV ${free} orgs ${sim.orgs.filter((o) => o.status === 'active').length} champ ${sim.ranked[0].name} hof ${sim.log.filter((l) => l.t === 'hof' && l.y === sim.year).length} legacy ${sim.log.filter((l) => l.t === 'legacy' && l.y === sim.year).length} deaths ${sim.st.deaths} retired ${sim.st.retired} save ${(JSON.stringify(sim).length / 1e6).toFixed(2)}MB era ${sim.eraDef().name} ap ${Math.round(sim.approval)} apMin ${Math.round(Math.min(...sim.apHist.map((x) => x[1])))} apMax ${Math.round(Math.max(...sim.apHist.map((x) => x[1])))} boss ${sim.log.filter((l) => l.t === 'boss' && l.y === sim.year).map((l) => l.res).join('/')} tourney ${sim.tourneys.length} ag ${Object.values(sim.ag).filter((a) => a.status === 'active').length}`);
}
console.log('log types', JSON.stringify(sim.log.reduce((m, l) => ((m[l.t] = (m[l.t] || 0) + 1), m), {})));
console.log(`time ${Date.now() - t0}ms  news ${sim.news.length}  heroes ${sim.heroes.length}  villains ${sim.villains.length}`);
console.log('stats', JSON.stringify(sim.st));
const cats = {};
for (const n of sim.news.filter(Boolean)) cats[n.cat] = (cats[n.cat] || 0) + 1;
console.log('cats', JSON.stringify(cats));
console.log('imp3', sim.news.filter((n) => n && n.imp === 3).length);
console.log('--- TOP 10');
sim.ranked.slice(0, 10).forEach((h) => console.log(h.rank, h.name, h.power.name, Math.round(sim.score(h)), h.pref, h.agency));
console.log('--- awards');
for (const a of sim.awards.at(-1).list) console.log(a.title, sim.heroes[a.id].name, a.note);
console.log('--- sample news');
const pick = sim.news.filter((n, i) => n && n.y === sim.year && i % 120 === 0);
for (const n of pick) console.log(G.fmtDate(n.y, n.d), `[${n.cat}${n.imp}]`, plain(n.text));
console.log('--- status', JSON.stringify(sim.heroes.reduce((m, h) => ((m[h.status] = (m[h.status] || 0) + 1), m), {})));
console.log('--- orgs', sim.orgs.map((o) => `${o.name}:${o.status}:${Math.round(o.strength)}:${Math.round(o.intel)}`).join(' / '));
const bad = sim.news.filter((n) => n && /\{|\[|undefined|NaN/.test(n.text));
console.log('broken', bad.length, bad.slice(0, 5).map((n) => n.text));
