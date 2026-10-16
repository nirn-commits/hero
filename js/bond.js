// 引退後の消息と現役復帰
(function (G) {
  'use strict';
  const { R, D, fill } = G;
  const P = G.Sim.prototype;
  const H = (h) => `⟦h${h.id}⟧`;

  P.bondDaily = function () {
    for (const h of this.heroes) {
      if (h.status !== 'retired' || h.retireReason !== '引退') continue;
      if (!h.after) h.after = R.pick(D.afterlife);
      if (R.chance(0.0003)) {
        this.post('life', 1, fill(R.pick(D.afterNews), { h: H(h), after: h.after }), { h: [h] });
        this.logRec('after', { h: h.id, after: h.after });
      } else if (typeof h.age === 'number' && h.age < 62 && this.year - (h.endYear || this.year) >= 1 && R.chance(0.00012)) this.comeback(h);
    }
  };

  P.comeback = function (h) {
    const years = this.year - (h.endYear || this.year);
    h.status = 'active';
    h.retireReason = '';
    h.comebacks = (h.comebacks || 0) + 1;
    h.fame += 80;
    h.points += 200;
    this.post('life', 3, fill(R.pick(D.comeback), { h: H(h), years: Math.max(1, years) }) + `${H(h)}は「${this.line(h, 'comeback')}」と語った。`, { h: [h] });
    this.logRec('comeback', { h: h.id, years, after: h.after || '' });
  };

  P.onRetireBond = function (h) { h.after = R.pick(D.afterlife); };
})(globalThis.HG = globalThis.HG || {});
