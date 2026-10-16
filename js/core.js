// 共通ユーティリティ：シード付き乱数・テンプレート展開・日付
(function (G) {
  'use strict';

  function hashSeed(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  }

  const R = {
    s: 1,
    seed(str) { this.s = hashSeed(String(str)) || 1; },
    f(a, b) {
      let t = (this.s += 0x6d2b79f5);
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      if (a === undefined) return r;
      return a + r * (b - a);
    },
    int(a, b) { return a + Math.floor(this.f() * (b - a + 1)); },
    chance(p) { return this.f() < p; },
    pick(arr) { return arr[Math.floor(this.f() * arr.length)]; },
    wpick(arr, wfn) {
      let total = 0;
      const ws = arr.map((x) => { const w = Math.max(0, wfn(x)); total += w; return w; });
      if (total <= 0) return null;
      let r = this.f() * total;
      for (let i = 0; i < arr.length; i++) { r -= ws[i]; if (r <= 0) return arr[i]; }
      return arr[arr.length - 1];
    },
    // 重み付きで重複なしにn個選ぶ
    wsample(arr, n, wfn) {
      const pool = arr.slice();
      const out = [];
      while (out.length < n && pool.length) {
        const x = this.wpick(pool, wfn);
        if (!x) break;
        out.push(x);
        pool.splice(pool.indexOf(x), 1);
      }
      return out;
    },
    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(this.f() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },
    gauss(m, sd) {
      const u = 1 - this.f(), v = this.f();
      return m + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
  };

  // "[a|b|c]" を一つ選び、"{key}" を ctx[key] に置き換える
  function fill(t, ctx) {
    let s = t;
    let guard = 0;
    while (s.indexOf('[') >= 0 && guard++ < 20) {
      s = s.replace(/\[([^\[\]]*)\]/g, (m, body) => R.pick(body.split('|')));
    }
    return s.replace(/\{(\w+)\}/g, (m, k) => (ctx && ctx[k] !== undefined ? ctx[k] : m));
  }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  const WD = ['日', '月', '火', '水', '木', '金', '土'];
  function dateOf(year, day) { return new Date(year, 0, 1 + day); }
  function fmtDate(year, day, withWeek) {
    const d = dateOf(year, day);
    let s = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    if (withWeek) s += `（${WD[d.getDay()]}）`;
    return s;
  }
  function daysInYear(year) { return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365; }

  function joinNames(tokens) {
    if (tokens.length <= 1) return tokens.join('');
    if (tokens.length <= 3) return tokens.join('、');
    return tokens.slice(0, 3).join('、') + `ら${tokens.length}名`;
  }

  G.R = R;
  G.fill = fill;
  G.clamp = clamp;
  G.dateOf = dateOf;
  G.fmtDate = fmtDate;
  G.daysInYear = daysInYear;
  G.joinNames = joinNames;
})(globalThis.HG = globalThis.HG || {});
