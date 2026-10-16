// 素材の数を数える: node tools/count.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const files = ['core', 'data_names', 'data_world', 'data_powers', 'data_people', 'data_events', 'data_story', 'data_more'];
if (fs.existsSync(path.join(__dirname, '..', 'js', 'data_more2.js'))) files.push('data_more2');
for (const f of files) vm.runInThisContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'));
const D = globalThis.HG.D, I = D.inc;
const sum = (o) => Object.values(o).reduce((s, a) => s + a.length, 0);
const rows = {
  名字: D.surnames.length, 下の名前: D.givenM.length + D.givenF.length + D.givenN.length, 外国名: D.foreignNames.M.length + D.foreignNames.F.length,
  属性語: Object.values(D.elemWords).reduce((s, e) => s + e.k.length + e.j.length, 0), 接頭接尾: sum(D.kSuffix) + sum(D.kPrefix) + sum(D.jSuffix),
  固有ヒーロー名: D.uniqueHeroNames.length, 能力: D.powers.length, 能力を得た経緯: D.origins.length + D.skillOrigins.length, 動機: D.motives.length,
  趣味特徴: D.quirks.length, 前職: D.jobs.length, 性格: D.traits.length, ヴィラン名部品: D.vPrefix.length + D.vCore.length + D.vKanji.length + D.vKanjiSuffix.length + D.kaijinAnimals.length + D.vEpithet.length + D.vUnique.length,
  ヴィラン動機経緯: D.villainMotives.length + D.villainOrigins.length, 怪獣: D.kaijuA.length + D.kaijuB.length + D.kaijuC.length + D.kaijuDesc.length,
  犯人: D.perpAdj.length + D.perpNoun.length, 事件の導入文: Object.values(I).reduce((s, t) => s + t.intro.length, 0),
  事件の結末文: Object.values(I).reduce((s, t) => s + t.great.length + t.win.length + t.fail.length + t.bad.length, 0),
  スキャンダル: D.scandals.length, 芸能: D.media.length, 私生活: sum(D.life), 引退: D.retireLines.length, 社会ニュース: D.worldNews.length,
  年中行事: D.calendar.length, ヴィラン組織: D.orgs.length, 地名スポット: D.spots.length, 台詞: D.allyLines.length + D.rivalLines.length + D.tributeRetire.length + D.tributeDeath.length + D.traits.reduce((s, t) => s + t.win.length + t.lose.length, 0),
  週刊誌見出し: sum(D.coverHeads), 事件の前置き・目撃談: D.timePhrases ? D.timePhrases.length + D.witness.good.length + D.witness.bad.length : 0, プロフィール素材: Object.entries(D.profile).reduce((s, [k, v]) => s + (Array.isArray(v) ? v.length : k === 'regionNick' ? 0 : Object.values(v).reduce((a, b) => a + b.length, 0)), 0),
};
let total = 0;
for (const [k, v] of Object.entries(rows)) { console.log(k.padEnd(10, '　'), v); total += v; }
console.log('合計', total);
