// 画面：ニュース・概況・ランキング・記録・名鑑・詳細表示・自動保存
(function (G) {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const D = G.D;
  const SPEEDS = [0, 1500, 600, 150, 20];
  const CAT = { case: '事件', villain: 'ヴィラン', big: '大事件', scandal: 'スキャンダル', media: '芸能', life: '人間模様', rank: 'ランキング', world: '社会' };
  const STATUS = { active: '', off: '', retired: '引退', dead: '殉職', fallen: '闇堕ち' };
  const VSTATUS = { free: '逃亡中', captured: '収監中', dead: '撃破', retreated: '撤退', reformed: '改心' };
  const STAT_LABEL = [['pow', 'パワー'], ['tec', '技術'], ['spd', '機動力'], ['int', '知性'], ['cha', '人気'], ['men', '精神力'], ['mor', '正義感']];
  // 属性ごとの紋章（文字と色相）
  const EMB = {
    fire: ['炎', 14], ice: ['氷', 195], thunder: ['雷', 48], wind: ['風', 150], water: ['水', 212], earth: ['土', 32], light: ['光', 54],
    dark: ['闇', 268], metal: ['鋼', 222], beast: ['獣', 24], plant: ['樹', 112], mind: ['念', 305], time: ['刻', 240], space: ['宙', 256],
    body: ['体', 0], tech: ['機', 186], sound: ['音', 330], poison: ['毒', 285], luck: ['運', 70], gravity: ['重', 230], life: ['命', 345], odd: ['奇', 168],
  };
  const REC_TYPES = [
    ['death', '殉職'], ['retire', '引退'], ['scandal', 'スキャンダル'], ['hof', '殿堂入り'], ['legacy', '二世'], ['fallen', '闇堕ち'],
    ['reform', '改心'], ['kaiju', '怪獣'], ['org', '組織壊滅'], ['marry', '結婚'], ['awards', '歴代表彰'], ['months', '月間1位'],
  ];
  const ACT = { apology: '謝罪', deny: '否定', twist: '好感度上昇', suspend: '活動停止', arrest: '逮捕・免許はく奪' };
  const MAX_DAYS = 90;

  let sim = null;
  let timer = null;
  let skipping = false;
  let ticks = 0;
  let countdown = null;
  const ui = load({ speed: 2, tab: 'dash', cats: Object.keys(CAT), autoYear: true, recType: 'death', mapMetric: 'inc' });
  ui.rankLimit = 50; ui.rosterLimit = 60; ui.vLimit = 60; ui.recLimit = 80; ui.recYear = 'all'; ui.pref = null;

  function load(def) {
    try {
      const s = JSON.parse(localStorage.getItem('hero-ui') || 'null');
      if (s) for (const k of Object.keys(def)) if (s[k] !== undefined) def[k] = s[k];
    } catch (e) { /* 保存領域が使えない環境 */ }
    return def;
  }
  function save() {
    try { localStorage.setItem('hero-ui', JSON.stringify({ speed: ui.speed, tab: ui.tab, cats: ui.cats, autoYear: ui.autoYear, recType: ui.recType, mapMetric: ui.mapMetric })); } catch (e) { /* 無視 */ }
  }

  // ---------- 世界の保存（IndexedDB） ----------
  const Store = {
    db: null,
    open() {
      return new Promise((res) => {
        try {
          const r = indexedDB.open('hero-chronicle', 1);
          r.onupgradeneeded = () => r.result.createObjectStore('s');
          r.onsuccess = () => { this.db = r.result; res(true); };
          r.onerror = () => res(false);
          r.onblocked = () => res(false);
        } catch (e) { res(false); }
      });
    },
    get(k) {
      return new Promise((res) => {
        if (!this.db) return res(null);
        try { const q = this.db.transaction('s').objectStore('s').get(k); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); } catch (e) { res(null); }
      });
    },
    put(k, v) {
      return new Promise((res) => {
        if (!this.db) return res(false);
        try { const tx = this.db.transaction('s', 'readwrite'); tx.objectStore('s').put(v, k); tx.oncomplete = () => res(true); tx.onerror = () => res(false); } catch (e) { res(false); }
      });
    },
  };
  let saving = false;
  async function saveWorld() {
    if (!sim || saving || skipping) return;
    saving = true;
    let ok = false;
    try { ok = await Store.put('world', JSON.stringify(sim)); } catch (e) { ok = false; }
    saving = false;
    $('#saveLabel').textContent = ok ? `自動保存 ${G.fmtDate(sim.year, lastDay())}` : '';
  }

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ent = (k, id) => (k === 'h' ? sim.heroes[id] : k === 'v' ? sim.villains[id] : k === 'o' ? sim.orgs[id] : sim.teams[id]);
  function link(k, e) {
    if (!e) return '';
    const dead = k === 'h' && (e.status === 'dead' || e.status === 'retired' || e.status === 'fallen') ? ' dead' : '';
    return `<button type="button" class="nm ${k}${dead}" data-k="${k}" data-id="${e.id}">${esc(e.name)}</button>`;
  }
  function emblem(e, big) {
    const [ch, hue] = EMB[e.power.el] || EMB.odd;
    return `<span class="em${big ? ' big' : ''}" style="--hue:${hue}" title="${esc(D.elemLabel[e.power.el] || '')}系">${ch}</span>`;
  }
  const hlink = (h) => (h ? `<span class="hl">${emblem(h)}${link('h', h)}</span>` : '');
  const rich = (t) => esc(t).replace(/⟦([hvot])(\d+)⟧/g, (m, k, id) => link(k, ent(k, +id)));
  const num = (n) => Math.round(n).toLocaleString('ja-JP');
  const score = (h) => sim.score(h);
  const lastDay = () => (sim.ended ? sim.day : Math.max(0, sim.day - 1));
  const shortPref = (p) => (p === '北海道' ? '北海道' : p.replace(/[都府県]$/, ''));

  // ---------- 進行 ----------
  function newWorld(seed) {
    stop();
    cancelCountdown();
    sim = new G.Sim(seed || randomSeed());
    $('#seedLabel').textContent = sim.seed;
    $('#feed').innerHTML = '';
    setFlash('新しい世界が生まれました。登録ヒーロー' + sim.heroes.length + '名、ヴィラン組織' + sim.orgs.filter((o) => o.status === 'active').length + 'つ。一年が始まります。');
    renderHeader();
    renderSide(true);
    saveWorld();
    play();
  }
  function resumeWorld(s) {
    sim = s;
    $('#seedLabel').textContent = sim.seed;
    rebuildFeed();
    setFlash(`前回の続き（${G.fmtDate(sim.year, lastDay())}）から再開しました。`);
    $('#saveLabel').textContent = `保存データから再開`;
    renderHeader();
    renderSide(true);
    if (sim.ended) showYearEnd(); else play();
  }
  function randomSeed() {
    const a = ['朝焼け', '夕凪', '雷鳴', '桜吹雪', '流星', '鉄風', '紅葉', '霧雨', '白夜', '黄金', '群青', '月影'];
    return a[Math.floor(Math.random() * a.length)] + '-' + Math.floor(Math.random() * 9000 + 1000);
  }

  function play() {
    stop();
    updateSpeedButtons();
    if (ui.speed === 0 || sim.ended) return;
    const loop = () => {
      tick();
      if (!sim.ended && ui.speed > 0) timer = setTimeout(loop, SPEEDS[ui.speed]);
    };
    timer = setTimeout(loop, Math.min(400, SPEEDS[ui.speed]));
  }
  function stop() { if (timer) clearTimeout(timer); timer = null; }

  function tick() {
    const items = sim.step();
    ticks++;
    renderDay(lastDay(), items);
    renderHeader();
    const heavy = ui.speed >= 4 ? ticks % 7 === 0 : ui.speed === 3 ? ticks % 2 === 0 : true;
    if (heavy || sim.ended) renderSide(false);
    if (lastDay() % 7 === 0 || sim.ended) saveWorld();
    if (sim.ended) { stop(); updateSpeedButtons(); setTimeout(showYearEnd, 600); }
  }

  function skipToEnd() {
    if (skipping || sim.ended) return;
    stop();
    skipping = true;
    $('#skipBtn').textContent = '進行中…';
    const chunk = () => {
      for (let i = 0; i < 12 && !sim.ended; i++) sim.step();
      renderHeader();
      if (sim.ended) {
        skipping = false;
        $('#skipBtn').textContent = '年末まで';
        rebuildFeed();
        renderSide(true);
        const last = sim.news.filter((n) => n && n.imp === 3).pop();
        if (last) setFlash(rich(last.text), true);
        updateSpeedButtons();
        saveWorld();
        showYearEnd();
      } else setTimeout(chunk, 0);
    };
    chunk();
  }

  function nextYear() {
    cancelCountdown();
    closeModal();
    if (!sim.ended) return;
    sim.nextYear();
    $('#feed').innerHTML = '';
    const a = sim.awards[sim.awards.length - 1];
    setFlash(`${sim.year}年が始まりました。昨年の王者は${link('h', sim.heroes[a.champ])}。`, true);
    renderHeader();
    renderSide(true);
    saveWorld();
    if (ui.speed === 0) ui.speed = 2;
    play();
  }

  // ---------- ヘッダー ----------
  function renderHeader() {
    $('#dateLabel').textContent = `${sim.year - (sim.awards.length ? sim.awards[0].year : sim.year) + 1}年目　` + G.fmtDate(sim.year, lastDay(), true);
    const total = G.daysInYear(sim.year);
    $('#yearFill').style.width = ((sim.ended ? total : sim.day) / total) * 100 + '%';
  }
  function updateSpeedButtons() {
    document.querySelectorAll('.sp').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.sp === (sim && sim.ended ? 0 : ui.speed))));
  }
  function setFlash(html, isHtml) {
    $('#flashText').innerHTML = isHtml ? html : esc(html);
    const f = $('#flash');
    f.classList.remove('pulse');
    void f.offsetWidth;
    f.classList.add('pulse');
  }

  // ---------- ニュース ----------
  function renderFilters() {
    $('#filters').innerHTML = Object.entries(CAT).map(([k, v]) => `<button type="button" class="chip k-${k}" data-cat="${k}" aria-pressed="${ui.cats.includes(k)}">${v}</button>`).join('');
  }
  const visible = (n) => ui.cats.includes(n.cat);
  function dayHTML(day, items) {
    const vis = items.filter(visible);
    if (!vis.length) return '';
    return `<section class="day" data-day="${day}"><h3>${G.fmtDate(sim.year, day, true)}</h3><ol>${vis.map(itemHTML).join('')}</ol></section>`;
  }
  function itemHTML(n) {
    return `<li class="it i${n.imp} c-${n.cat}"><span class="tag k-${n.cat}">${CAT[n.cat]}</span><p>${rich(n.text)}</p></li>`;
  }
  function renderDay(day, items) {
    const top = items.filter((n) => n.imp === 3).pop();
    if (top) setFlash(rich(top.text), true);
    const html = dayHTML(day, items);
    if (!html) return;
    const feed = $('#feed');
    if (feed.firstElementChild && feed.firstElementChild.classList.contains('empty')) feed.innerHTML = '';
    feed.insertAdjacentHTML('afterbegin', html);
    while (feed.children.length > MAX_DAYS) feed.lastElementChild.remove();
  }
  function rebuildFeed() {
    const byDay = new Map();
    for (let i = sim.news.length - 1; i >= 0; i--) {
      const n = sim.news[i];
      if (!n) continue;
      if (n.y !== sim.year) break;
      if (!byDay.has(n.d)) { if (byDay.size >= MAX_DAYS) break; byDay.set(n.d, []); }
      byDay.get(n.d).unshift(n);
    }
    const html = [...byDay.entries()].map(([d, items]) => dayHTML(d, items)).join('');
    $('#feed').innerHTML = html || '<p class="empty">表示できるニュースがありません。上の分類を選んでください。</p>';
    $('#feed').querySelectorAll('.it').forEach((el) => (el.style.animation = 'none'));
  }

  // ---------- タブ ----------
  const isWide = () => window.matchMedia('(min-width: 900px)').matches;
  function currentPane() { return ui.tab === 'feed' ? (isWide() ? 'dash' : null) : ui.tab; }
  function setTab(tab) {
    ui.tab = tab;
    save();
    const pane = currentPane();
    $('.layout').dataset.view = tab;
    document.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === (tab === 'feed' && isWide() ? 'dash' : tab))));
    document.querySelectorAll('.pane').forEach((p) => (p.hidden = p.id !== 'pane-' + pane));
    renderSide(true);
  }
  function renderSide(force) {
    const p = currentPane();
    if (!p) return;
    if (p === 'rank') return renderRank();
    if (p === 'dash' && (force || ticks % 3 === 0)) return renderDash();
    if (!force && ticks % 5 !== 0) return;
    if (p === 'roster') renderRoster();
    if (p === 'villain') renderVillains();
    if (p === 'org') renderOrgs();
    if (p === 'records') renderRecords();
  }

  function moveHTML(h) {
    if (h.weekRank === null || h.weekRank === undefined) return '<span class="new">NEW</span>';
    const d = h.weekRank - h.rank;
    if (d > 0) return `<span class="up">▲${d}</span>`;
    if (d < 0) return `<span class="down">▼${-d}</span>`;
    return '<span class="same">―</span>';
  }
  function statusChip(h) {
    let s = '';
    if (h.status === 'off') s += `<span class="st${h.offReason === '謹慎' ? ' bad' : ''}">${h.offReason || '休養'}</span>`;
    else if (STATUS[h.status]) s += `<span class="st${h.status === 'fallen' ? ' bad' : ''}">${STATUS[h.status]}</span>`;
    if (h.hof) s += '<span class="st gold">殿堂</span>';
    if (h.parent !== null && h.parent !== undefined) s += '<span class="st">二世</span>';
    return s;
  }
  function heroRow(h, rankCell, right, barPct) {
    return `<tr><td class="rk">${rankCell}</td><td class="mv">${h.rank ? moveHTML(h) : ''}</td><td class="who"><div class="whoin">${emblem(h)}<div>${link('h', h)}${statusChip(h)}<small>${esc(h.power.name)}・${esc(h.pref)}・${esc(h.agency)}</small>${barPct !== undefined ? `<i class="bar"><b style="width:${barPct}%"></b></i>` : ''}</div></div></td><td class="sc">${right}</td></tr>`;
  }

  // ---------- 概況 ----------
  function renderDash() {
    const st = sim.st;
    const inc = Object.values(st.inc).reduce((a, b) => a + b, 0);
    const solved = st.out.great + st.out.win;
    const handled = solved + st.out.fail + st.out.bad;
    const freeV = sim.villains.filter((v) => v.status === 'free' && v.kind === 'villain').length;
    const orgs = sim.orgs.filter((o) => o.status === 'active').length;
    const k = (v, l, cls) => `<div class="kpi${cls ? ' ' + cls : ''}"><b>${v}</b><span>${l}</span></div>`;
    const events = sim.log.filter((l) => l.y === sim.year && ['death', 'hof', 'fallen', 'org', 'legacy', 'reform'].includes(l.t)).slice(-6).reverse();
    $('#pane-dash').innerHTML = `
      <h2>${sim.year}年の概況<small>${G.fmtDate(sim.year, lastDay())}時点</small></h2>
      <div class="kpis">${k(num(inc), '事件')}${k(handled ? Math.round((solved / handled) * 100) + '%' : '–', '解決率')}${k(st.captures, 'ヴィラン検挙')}${k(st.scandals, 'スキャンダル', 'warn')}${k(st.deaths, '殉職', st.deaths ? 'bad' : '')}${k(sim.ranked.length, '現役ヒーロー')}${k(freeV, '逃亡中ヴィラン')}${k(orgs, '活動中の組織')}</div>
      <div class="dash-grid">
        <figure class="fig">
          <figcaption><span>地域別の状況</span>
            <span class="seg sm" role="group" aria-label="地図の指標">${[['inc', '事件数'], ['hero', 'ヒーロー数'], ['villain', 'ヴィラン']].map(([m, l]) => `<button type="button" data-map="${m}" aria-pressed="${ui.mapMetric === m}">${l}</button>`).join('')}</span></figcaption>
          ${tileMap()}
        </figure>
        <figure class="fig">
          <figcaption><span>トップ4の順位推移（${sim.year}年）</span></figcaption>
          ${bumpChart()}
        </figure>
        <figure class="fig">
          <figcaption><span>月別の事件数</span><span class="legend"><i class="sw s1"></i>解決 <i class="sw s0"></i>未解決</span></figcaption>
          ${monthBars()}
        </figure>
        <figure class="fig">
          <figcaption><span>今年の大きな出来事</span><button type="button" class="linkbtn" data-goto="records">記録をすべて見る</button></figcaption>
          ${events.length ? `<ul class="timeline">${events.map((l) => `<li><span class="tl-tag t-${l.t}">${REC_TYPES.find((r) => r[0] === l.t)[1]}</span><span class="tl-date">${monthDay(l)}</span><div>${logSummary(l)}</div></li>`).join('')}</ul>` : '<p class="empty">まだ大きな出来事はありません。</p>'}
        </figure>
      </div>`;
  }
  function monthDay(l) { const d = G.dateOf(l.y, l.d); return `${d.getMonth() + 1}/${d.getDate()}`; }
  function logSummary(l) {
    const h = l.h !== undefined && l.h !== null ? sim.heroes[l.h] : null;
    switch (l.t) {
      case 'death': return `${hlink(h)}が殉職${l.v !== null ? `（${link('v', sim.villains[l.v])}戦）` : ''}`;
      case 'hof': return `${hlink(h)}が殿堂入り`;
      case 'fallen': return `${hlink(h)}が${link('v', sim.villains[l.v])}として闇堕ち`;
      case 'org': return `${link('o', sim.orgs[l.o])}が壊滅${h ? `（${link('h', h)}らの突入）` : ''}`;
      case 'legacy': return `${hlink(h)}がデビュー（親：${link('h', sim.heroes[l.parent])}）`;
      case 'reform': return `${link('v', sim.villains[l.v])}が改心し${hlink(h)}に`;
      default: return '';
    }
  }

  // 日本のタイル地図（1マス=1都道府県）
  const TILE = {
    北海道: [13, 0], 青森県: [13, 2], 秋田県: [12, 3], 岩手県: [13, 3], 山形県: [12, 4], 宮城県: [13, 4],
    石川県: [9, 5], 富山県: [10, 5], 新潟県: [11, 5], 福島県: [12, 5],
    福井県: [8, 6], 岐阜県: [9, 6], 長野県: [10, 6], 群馬県: [11, 6], 栃木県: [12, 6], 茨城県: [13, 6],
    島根県: [4, 7], 鳥取県: [5, 7], 兵庫県: [6, 7], 京都府: [7, 7], 滋賀県: [8, 7], 愛知県: [9, 7], 山梨県: [10, 7], 埼玉県: [11, 7], 東京都: [12, 7], 千葉県: [13, 7],
    山口県: [3, 8], 広島県: [4, 8], 岡山県: [5, 8], 大阪府: [6, 8], 奈良県: [7, 8], 三重県: [8, 8], 静岡県: [10, 8], 神奈川県: [11, 8],
    佐賀県: [1, 9], 福岡県: [2, 9], 愛媛県: [4, 9], 香川県: [5, 9], 徳島県: [6, 9], 和歌山県: [7, 9],
    長崎県: [0, 10], 熊本県: [1, 10], 大分県: [2, 10], 高知県: [5, 10],
    鹿児島県: [1, 11], 宮崎県: [2, 11], 沖縄県: [0, 12],
  };
  function prefValues() {
    const m = ui.mapMetric;
    const v = {};
    for (const p of D.prefs) v[p.name] = 0;
    if (m === 'inc') Object.assign(v, sim.st.pref);
    else if (m === 'hero') for (const h of sim.ranked) v[h.pref]++;
    else for (const x of sim.villains) if (x.status === 'free' && x.kind === 'villain') v[x.pref]++;
    return v;
  }
  function tileMap() {
    const vals = prefValues();
    const arr = Object.values(vals);
    const max = Math.max(1, ...arr);
    const hi = [0, 1, 2, 3, 4].map((b) => Math.ceil((max * b) / 4));
    const bin = (x) => (x <= 0 ? 0 : hi.findIndex((h, b) => b > 0 && x <= h));
    const C = 30, W = 14 * C, Hh = 13 * C;
    const unit = { inc: '件', hero: '名', villain: '名' }[ui.mapMetric];
    const cells = Object.entries(TILE).map(([p, [x, y]]) => {
      const b = bin(vals[p]);
      return `<g class="tile${ui.pref === p ? ' sel' : ''}" data-pref="${p}" tabindex="0" role="button" aria-label="${p} ${vals[p]}${unit}"><title>${p}：${vals[p]}${unit}</title><rect x="${x * C + 1}" y="${y * C + 1}" width="${C - 2}" height="${C - 2}" rx="4" class="b${b}"/><text x="${x * C + C / 2}" y="${y * C + C / 2 + 3.5}" text-anchor="middle" class="tb${b}">${shortPref(p).slice(0, 2)}</text></g>`;
    }).join('');
    const steps = [0, 1, 2, 3, 4].filter((b) => b === 0 || hi[b - 1] + 1 <= hi[b]).map((b) => `<span><i class="sw b${b}"></i>${b === 0 ? '0' : hi[b - 1] + 1 === hi[b] ? hi[b] : hi[b - 1] + 1 + '〜' + hi[b]}${unit}</span>`).join('');
    let detail = '<p class="mapnote">都道府県を選ぶと詳細が出ます。</p>';
    if (ui.pref) {
      const local = sim.ranked.filter((h) => h.pref === ui.pref);
      const vs = sim.villains.filter((v) => v.status === 'free' && v.kind === 'villain' && v.pref === ui.pref);
      detail = `<p class="mapnote"><b>${ui.pref}</b>　事件${sim.st.pref[ui.pref] || 0}件・ヒーロー${local.length}名・逃亡中ヴィラン${vs.length}名${local[0] ? `・地元の最上位 ${hlink(local[0])}（${local[0].rank}位）` : ''}</p>`;
    }
    return `<div class="mapwrap"><svg class="tilemap" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="都道府県別の${{ inc: '事件数', hero: 'ヒーロー数', villain: '逃亡中ヴィラン数' }[ui.mapMetric]}">${cells}</svg></div><div class="maplegend">${steps}</div>${detail}`;
  }

  function bumpChart() {
    const top = sim.ranked.slice(0, 4);
    if (!top.length) return '';
    const W = 420, Hh = 190, pl = 30, pr = 110, pt = 10, pb = 22;
    const days = G.daysInYear(sim.year);
    const series = top.map((h) => h.rankHist.concat(h.rank ? [[lastDay(), h.rank]] : []));
    const maxR = Math.min(40, Math.max(10, ...series.flat().map((p) => p[1])));
    const x = (d) => pl + (d / days) * (W - pl - pr);
    const y = (r) => pt + ((Math.min(r, maxR) - 1) / (maxR - 1)) * (Hh - pt - pb);
    const ticks = [1, Math.round(maxR / 2), maxR];
    const grid = ticks.map((r) => `<line class="gd" x1="${pl}" x2="${W - pr}" y1="${y(r)}" y2="${y(r)}"/><text class="ax" x="${pl - 6}" y="${y(r) + 3}" text-anchor="end">${r}位</text>`).join('');
    const months = [0, 3, 6, 9].map((m) => { const d = Math.round((new Date(sim.year, m, 1) - new Date(sim.year, 0, 1)) / 864e5); return `<text class="ax" x="${x(d)}" y="${Hh - 6}">${m + 1}月</text>`; }).join('');
    // ラベルの重なりを避ける
    const ends = top.map((h, i) => ({ i, y: y(h.rank) }));
    ends.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 14) ends[i].y = ends[i - 1].y + 14;
    const lines = series.map((pts, i) => {
      const p = pts.map(([d, r]) => `${x(d).toFixed(1)},${y(r).toFixed(1)}`).join(' ');
      const last = pts[pts.length - 1];
      const ly = ends.find((e) => e.i === i).y;
      const dots = pts.map(([d, r]) => `<circle class="hit" cx="${x(d).toFixed(1)}" cy="${y(r).toFixed(1)}" r="6"><title>${esc(top[i].name)}：${G.fmtDate(sim.year, d)} ${r}位</title></circle>`).join('');
      return `<g class="s${i + 1}"><polyline class="ln" points="${p}"/>${dots}<circle class="end" cx="${x(last[0])}" cy="${y(last[1])}" r="4"/><text class="lbl" x="${W - pr + 8}" y="${ly + 4}">${i + 1}. ${esc(top[i].name.length > 8 ? top[i].name.slice(0, 8) + '…' : top[i].name)}</text></g>`;
    }).join('');
    return `<svg class="chart" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="現在のトップ4の今年の週ごとの順位">${grid}${months}${lines}</svg>`;
  }

  function monthBars() {
    const ms = sim.st.monthly;
    const cur = sim.ended ? 11 : sim.date.getMonth();
    const W = 420, Hh = 150, pl = 30, pr = 6, pt = 10, pb = 22;
    const max = Math.max(50, ...ms.map((m) => m.inc));
    const nice = Math.ceil(max / 50) * 50;
    const bw = (W - pl - pr) / 12;
    const y = (v) => pt + (1 - v / nice) * (Hh - pt - pb);
    const grid = [0, nice / 2, nice].map((v) => `<line class="gd" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${pl - 6}" y="${y(v) + 3}" text-anchor="end">${v}</text>`).join('');
    const bars = ms.map((m, i) => {
      const x0 = pl + i * bw + 3, w = bw - 6;
      const un = m.inc - m.solved;
      const ySolved = y(m.solved), yTop = y(m.inc);
      return `<g class="mb${i === cur && !sim.ended ? ' now' : ''}"><title>${i + 1}月：事件${m.inc}件（解決${m.solved}・未解決${un}）・スキャンダル${m.sc}・殉職${m.dead}</title>
        <rect class="hitbox" x="${x0 - 2}" y="${pt}" width="${w + 4}" height="${Hh - pt - pb}"/>
        ${m.solved ? `<rect class="s1f" x="${x0}" y="${ySolved}" width="${w}" height="${Math.max(0, y(0) - ySolved)}" rx="2"/>` : ''}
        ${un ? `<rect class="s0f" x="${x0}" y="${yTop}" width="${w}" height="${Math.max(0, ySolved - yTop - 2)}" rx="2"/>` : ''}
        <text class="ax" x="${x0 + w / 2}" y="${Hh - 6}" text-anchor="middle">${i + 1}</text></g>`;
    }).join('');
    return `<svg class="chart" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="月別の事件数">${grid}${bars}</svg>`;
  }

  // ---------- ランキング ----------
  function renderRank() {
    const list = sim.ranked.slice(0, ui.rankLimit);
    const live = sim.ranked.length;
    const top = list[0] ? score(list[0]) : 1;
    const podium = list.slice(0, 3).map((h) => `<div class="pod p${h.rank}"><div class="pod-rk">${h.rank}<small>位</small></div>${emblem(h, true)}<div class="pod-name">${link('h', h)}</div><div class="pod-meta">${esc(h.power.name)}・${esc(shortPref(h.pref))}</div><div class="pod-sc">${num(score(h))}<span>${moveHTML(h)}</span></div>${statusChip(h)}</div>`).join('');
    $('#pane-rank').innerHTML = `<h2>ヒーローランキング<small>現役${live}名・矢印は先週比</small></h2>
      <div class="podium">${podium}</div>
      <table class="rk-table"><tbody>${list.slice(3).map((h) => heroRow(h, h.rank, num(score(h)), (score(h) / top) * 100)).join('')}</tbody></table>
      ${ui.rankLimit < live ? `<button type="button" class="more" data-more="rank">さらに50名を表示</button>` : ''}`;
  }

  // ---------- 記録 ----------
  function renderRecords() {
    const years = [...new Set(sim.log.map((l) => l.y).concat(sim.year))].sort((a, b) => b - a);
    const ys = $('#recYear');
    const opts = `<option value="all">全期間</option>` + years.map((y) => `<option value="${y}">${y}年</option>`).join('');
    if (ys.dataset.sig !== opts) { ys.innerHTML = opts; ys.dataset.sig = opts; }
    ys.value = ui.recYear;
    const inYear = (y) => ui.recYear === 'all' || String(y) === String(ui.recYear);
    const counts = {};
    for (const l of sim.log) if (inYear(l.y)) counts[l.t] = (counts[l.t] || 0) + 1;
    counts.awards = sim.awards.filter((a) => inYear(a.year)).length;
    counts.months = sim.monthTop.filter((m) => inYear(m.y)).length;
    $('#recTypes').innerHTML = REC_TYPES.map(([t, l]) => `<button type="button" data-rec="${t}" aria-pressed="${ui.recType === t}">${l}<b>${counts[t] || 0}</b></button>`).join('');
    const t = ui.recType;
    const body = $('#recBody');
    if (t === 'awards') {
      const list = sim.awards.filter((a) => inYear(a.year)).slice().reverse();
      body.innerHTML = list.length ? list.map((a) => `<section class="awyear"><h3>${a.year}年　年間1位 ${hlink(sim.heroes[a.champ])}</h3><ul class="awards">${a.list.map((x) => `<li><span class="k">${esc(x.title)}</span><span>${hlink(sim.heroes[x.id])}<small>${esc(x.note)}</small></span></li>`).join('')}</ul></section>`).join('') : '<p class="empty">年間表彰は12月31日に行われます。</p>';
      return;
    }
    if (t === 'months') {
      const list = sim.monthTop.filter((m) => inYear(m.y)).slice().reverse();
      const cnt = {};
      for (const m of sim.monthTop) cnt[m.id] = (cnt[m.id] || 0) + 1;
      body.innerHTML = list.length ? `<table class="rec"><thead><tr><th>月</th><th>1位</th><th>通算</th></tr></thead><tbody>${list.map((m) => `<tr><td class="dt">${m.y}年${m.m}月</td><td>${hlink(sim.heroes[m.id])}</td><td class="nu">${cnt[m.id]}回</td></tr>`).join('')}</tbody></table>` : '<p class="empty">月間ランキングは毎月1日に発表されます。</p>';
      return;
    }
    const rows = sim.log.filter((l) => l.t === t && inYear(l.y)).slice().reverse();
    if (!rows.length) { body.innerHTML = `<p class="empty">この期間の「${REC_TYPES.find((r) => r[0] === t)[1]}」の記録はありません。</p>`; return; }
    const H = (id) => (id === null || id === undefined ? '―' : hlink(sim.heroes[id]));
    const Vv = (id) => (id === null || id === undefined ? '―' : link('v', sim.villains[id]));
    const date = (l) => `<td class="dt">${G.fmtDate(l.y, l.d)}</td>`;
    const newsLine = (l) => { const n = l.n !== null && l.n !== undefined ? sim.news[l.n] : null; return n ? `<div class="rec-news">${rich(n.text)}</div>` : ''; };
    const sev = (n) => '<span class="sev">' + '●'.repeat(n) + '○'.repeat(3 - n) + '</span>';
    const cols = {
      death: ['日付', 'ヒーロー', '相手', '享年', '当時の順位', (l) => `${date(l)}<td>${H(l.h)}</td><td>${l.v !== null ? Vv(l.v) : '救助活動中'}</td><td class="nu">${typeof l.age === 'number' ? l.age + '歳' : '―'}</td><td class="nu">${l.rank ? l.rank + '位' : '―'}</td>`],
      retire: ['日付', 'ヒーロー', '理由', '活動年数', '最高順位', (l) => `${date(l)}<td>${H(l.h)}</td><td>${esc(l.reason)}</td><td class="nu">${l.career}年</td><td class="nu">${sim.heroes[l.h].bestRank ?? '―'}位</td>`],
      scandal: ['日付', 'ヒーロー', '深刻度', 'その後', '当時の順位', (l) => `${date(l)}<td>${H(l.h)}</td><td>${sev(l.sev)}</td><td>${ACT[l.act] || ''}</td><td class="nu">${l.rank ? l.rank + '位' : '―'}</td>`],
      hof: ['年', 'ヒーロー', '活動年数', '最高順位', '受賞', (l) => `<td class="dt">${l.y}年</td><td>${H(l.h)}</td><td class="nu">${l.career}年</td><td class="nu">${l.best}位</td><td class="nu">${sim.heroes[l.h].titles.length}回</td>`],
      legacy: ['日付', '二世ヒーロー', '親', '親の状態', '現在の順位', (l) => `${date(l)}<td>${H(l.h)}</td><td>${H(l.parent)}</td><td>${STATUS[sim.heroes[l.parent].status] || '現役'}</td><td class="nu">${sim.heroes[l.h].rank ? sim.heroes[l.h].rank + '位' : '―'}</td>`],
      fallen: ['日付', '元ヒーロー', 'ヴィラン名', '現在', '', (l) => `${date(l)}<td>${H(l.h)}</td><td>${Vv(l.v)}</td><td>${VSTATUS[sim.villains[l.v].status]}</td><td></td>`],
      reform: ['日付', '元ヴィラン', 'ヒーロー名', 'きっかけ', '', (l) => `${date(l)}<td>${Vv(l.v)}</td><td>${H(l.h)}</td><td>${l.by !== null ? H(l.by) : '―'}</td><td></td>`],
      kaiju: ['日付', '怪獣', '結果', '中心となったヒーロー', '', (l) => `${date(l)}<td>${Vv(l.v)}</td><td>${l.res === '撃破' ? '<span class="ok">撃破</span>' : '<span class="ng">撤退</span>'}</td><td>${H(l.h)}</td><td></td>`],
      org: ['日付', '組織', '', '突入を率いたヒーロー', '', (l) => `${date(l)}<td>${link('o', sim.orgs[l.o])}</td><td></td><td>${H(l.h)}</td><td></td>`],
      marry: ['日付', 'ヒーロー', 'お相手', '', '', (l) => `${date(l)}<td>${H(l.h)}</td><td>${H(l.h2)}</td><td></td><td></td>`],
    }[t];
    const head = cols.slice(0, 5).map((c) => `<th>${c}</th>`).join('');
    const shown = rows.slice(0, ui.recLimit);
    const withNews = t === 'scandal' || t === 'death';
    body.innerHTML = `<div class="tablewrap"><table class="rec"><thead><tr>${head}</tr></thead><tbody>${shown.map((l) => `<tr>${cols[5](l)}</tr>${withNews ? `<tr class="sub"><td></td><td colspan="4">${newsLine(l)}</td></tr>` : ''}`).join('')}</tbody></table></div>
      ${rows.length > shown.length ? `<button type="button" class="more" data-more="rec">さらに表示（残り${rows.length - shown.length}件）</button>` : ''}`;
  }

  // ---------- 名鑑・ヴィラン・組織 ----------
  function renderRoster() {
    const q = $('#rosterQ').value.trim();
    const sort = $('#rosterSort').value;
    const stf = $('#rosterStatus').value;
    let list = sim.heroes.filter((h) => (stf === 'live' ? h.rank !== null : stf === 'gone' ? h.rank === null : true));
    if (q) list = list.filter((h) => [h.name, h.power.name, h.pref, h.city, h.agency, h.real, ...h.traits, ...h.oldNames].join(' ').includes(q));
    const key = {
      rank: (h) => (h.rank === null ? 1e6 + h.id : h.rank), fame: (h) => -h.fame, captures: (h) => -h.rec.captures,
      scandals: (h) => -h.rec.scandals, age: (h) => -(typeof h.age === 'number' ? h.age : 0), debut: (h) => -h.id,
    }[sort];
    list.sort((a, b) => key(a) - key(b));
    const right = (h) => (sort === 'fame' ? '人気' + num(h.fame) : sort === 'captures' ? '検挙' + h.rec.captures : sort === 'scandals' ? '炎上' + h.rec.scandals : sort === 'age' ? h.age + '歳' : num(score(h)));
    const shown = list.slice(0, ui.rosterLimit);
    $('#rosterList').innerHTML = list.length
      ? `<table class="rk-table"><tbody>${shown.map((h) => heroRow(h, h.rank ?? '–', right(h))).join('')}</tbody></table>
        ${list.length > shown.length ? `<button type="button" class="more" data-more="roster">さらに表示（残り${list.length - shown.length}名）</button>` : ''}`
      : '<p class="empty">条件に合うヒーローはいません。</p>';
  }

  function renderVillains() {
    const f = $('#vStatus').value;
    const tw = { S: 4, A: 3, B: 2, C: 1 };
    const list = sim.villains.filter((v) => (f === 'kaiju' ? v.kind === 'kaiju' : f === 'all' ? true : v.kind === 'villain' && v.status === f));
    list.sort((a, b) => tw[b.threat] - tw[a.threat] || b.notoriety - a.notoriety);
    const shown = list.slice(0, ui.vLimit);
    $('#villainList').innerHTML = `<h2>ヴィラン${f === 'kaiju' ? '・怪獣' : ''}<small>${list.length}件</small></h2>` + (list.length
      ? `<table class="rk-table"><tbody>${shown.map((v) => `<tr><td class="rk"><span class="threat t${v.threat}">${v.threat}</span></td><td class="mv">${esc(VSTATUS[v.status] || '')}</td><td class="who">${link('v', v)}<small>${esc(v.power.name)}${v.org !== null ? '・' + esc(sim.orgs[v.org].name) + (v.orgRank === 'boss' ? '首領' : v.orgRank === 'exec' ? '幹部' : '') : ''}${v.nemesis !== null ? '・宿敵 ' + esc(sim.heroes[v.nemesis].name) : ''}</small></td><td class="sc">${v.kind === 'kaiju' ? '' : '悪名' + v.notoriety}</td></tr>`).join('')}</tbody></table>
        ${list.length > shown.length ? `<button type="button" class="more" data-more="villain">さらに表示</button>` : ''}`
      : '<p class="empty">該当するヴィランはいません。</p>');
  }

  function renderOrgs() {
    const act = sim.orgs.filter((o) => o.status === 'active');
    const gone = sim.orgs.filter((o) => o.status !== 'active');
    const orgCard = (o) => {
      const ms = sim.orgMembers(o);
      const boss = sim.villains[o.boss];
      return `<div class="card"><h3>${link('o', o)}</h3><p>${esc(o.desc)}</p><p>首領 ${link('v', boss)}${boss.status !== 'free' ? '（' + VSTATUS[boss.status] + '）' : ''}・構成員 ${ms.filter((v) => v.status === 'free').length}/${ms.length}名・拠点 ${esc(o.pref)}</p>
        <div class="meter red"><span>組織力</span><i><b style="width:${Math.min(100, o.strength)}%"></b></i><span>${Math.round(o.strength)}</span></div>
        <div class="meter blue"><span>捜査進捗</span><i><b style="width:${Math.min(100, o.intel)}%"></b></i><span>${Math.round(Math.min(100, o.intel))}</span></div></div>`;
    };
    const teams = sim.teams.filter((t) => t.active);
    $('#pane-org').innerHTML = `<h2>活動中のヴィラン組織<small>${act.length}組織・捜査進捗が100に達すると一斉摘発</small></h2>
      <div class="cards">${act.map(orgCard).join('') || '<p class="empty">現在、活動中の組織はありません。</p>'}</div>
      <div class="sec"><h2>ヒーローチーム<small>${teams.length}チーム</small></h2>
      <ul class="list">${teams.map((t) => `<li><span class="k">${link('t', t)}</span><span>${t.members.map((id) => link('h', sim.heroes[id])).join('、')}</span></li>`).join('')}</ul></div>
      ${gone.length ? `<div class="sec"><h2>壊滅した組織<small>${gone.length}組織</small></h2><ul class="list">${gone.slice().reverse().map((o) => `<li><span class="k">${link('o', o)}</span><span>${o.destroyedYear}年に壊滅</span></li>`).join('')}</ul></div>` : ''}`;
  }

  // ---------- 詳細 ----------
  function openModal(html) {
    $('#modalBody').innerHTML = html;
    $('#modal').hidden = false;
    $('#modalClose').focus();
  }
  function closeModal() { $('#modal').hidden = true; cancelCountdown(); }

  function spark(hist) {
    if (hist.length < 2) return '<p class="empty">ランキング推移は週ごとに記録されます。</p>';
    const W = 320, Hh = 90, pl = 30, pr = 8, pt = 8, pb = 16;
    const ranks = hist.map((x) => x[1]);
    const lo = Math.min(...ranks), hi = Math.max(...ranks, lo + 1);
    const days = G.daysInYear(sim.year);
    const x = (d) => pl + (d / days) * (W - pl - pr);
    const y = (r) => pt + ((r - lo) / (hi - lo)) * (Hh - pt - pb);
    const pts = hist.map(([d, r]) => `${x(d).toFixed(1)},${y(r).toFixed(1)}`).join(' ');
    const last = hist[hist.length - 1];
    return `<svg class="spark" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="今年のランキング推移">
      <line class="gd" x1="${pl}" x2="${W - pr}" y1="${y(lo)}" y2="${y(lo)}"/><line class="gd" x1="${pl}" x2="${W - pr}" y1="${y(hi)}" y2="${y(hi)}"/>
      <text x="${pl - 4}" y="${y(lo) + 3}" text-anchor="end">${lo}位</text><text x="${pl - 4}" y="${y(hi) + 3}" text-anchor="end">${hi}位</text>
      ${[0, 90, 181, 273].map((d, i) => `<text x="${x(d)}" y="${Hh - 3}">${i * 3 + 1}月</text>`).join('')}
      <polygon class="ar" points="${x(hist[0][0])},${y(hi)} ${pts} ${x(last[0])},${y(hi)}"/>
      <polyline class="ln" points="${pts}"/><circle class="dot" cx="${x(last[0])}" cy="${y(last[1])}" r="3.5"/></svg>`;
  }
  function radar(s, villain) {
    const R0 = 70, cx = 140, cy = 94, n = STAT_LABEL.length;
    const pt = (i, r) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
    const ring = (f) => STAT_LABEL.map((_, i) => pt(i, R0 * f).map((v) => v.toFixed(1)).join(',')).join(' ');
    const shape = STAT_LABEL.map(([k], i) => pt(i, (R0 * s[k]) / 100).map((v) => v.toFixed(1)).join(',')).join(' ');
    const labels = STAT_LABEL.map(([k, l], i) => { const [x, y] = pt(i, R0 + 16); return `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="${Math.abs(x - cx) < 5 ? 'middle' : x > cx ? 'start' : 'end'}">${l} <tspan class="v">${s[k]}</tspan></text>`; }).join('');
    return `<svg class="radar${villain ? ' vil' : ''}" viewBox="0 0 280 192" role="img" aria-label="能力値">${[0.25, 0.5, 0.75, 1].map((f) => `<polygon class="rg" points="${ring(f)}"/>`).join('')}
      ${STAT_LABEL.map((_, i) => { const [x, y] = pt(i, R0); return `<line class="rg" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"/>`; }).join('')}
      <polygon class="shape" points="${shape}"/>${labels}</svg>`;
  }
  function histList(e) {
    const items = e.hist.slice().reverse().map((id) => sim.news[id]).filter(Boolean).slice(0, 200);
    if (!items.length) return '<p class="empty">まだ記録はありません。</p>';
    return `<ul class="hist">${items.map((n) => `<li><span>${G.fmtDate(n.y, n.d)}</span><div>${rich(n.text)}</div></li>`).join('')}</ul>${e.hist.length > items.length ? '<p class="mapnote">古い小さな記事は保存容量のため省略しています。</p>' : ''}`;
  }
  const stars = (t) => '★'.repeat(Math.min(5, t)) + '☆'.repeat(Math.max(0, 5 - t)) + (t > 5 ? '+' : '');

  function showHero(h) {
    const rel = [];
    if (h.team !== null) rel.push(['チーム', link('t', sim.teams[h.team])]);
    if (h.rival !== null) rel.push(['ライバル', link('h', sim.heroes[h.rival])]);
    if (h.spouse !== null) rel.push(['伴侶', link('h', sim.heroes[h.spouse])]);
    if (h.partner !== null) rel.push(['交際中', link('h', sim.heroes[h.partner])]);
    if (h.mentor !== null) rel.push(['師匠', link('h', sim.heroes[h.mentor])]);
    if (h.apprentices.length) rel.push(['弟子', h.apprentices.map((id) => link('h', sim.heroes[id])).join('、')]);
    if (h.parent !== null && h.parent !== undefined) rel.push(['親', link('h', sim.heroes[h.parent])]);
    if (h.child !== null && h.child !== undefined) rel.push(['子', link('h', sim.heroes[h.child])]);
    if (h.nemesis !== null) rel.push(['宿敵', link('v', sim.villains[h.nemesis])]);
    if (h.villainId !== null) rel.push(['現在の姿', link('v', sim.villains[h.villainId])]);
    if (h.fromVillain !== null) rel.push(['ヴィラン時代', link('v', sim.villains[h.fromVillain])]);
    const r = h.rec;
    const tier = h.power.tier + h.tierBonus;
    const yrs = h.yearRanks || [];
    openModal(`
      <div class="pf-head">${emblem(h, true)}<h2 id="modalTitle">${esc(h.name)}</h2>${h.rank ? `<span class="rkbig">${h.rank}位</span>` : ''}${statusChip(h)}</div>
      <p class="pf-sub">本名 ${h.masked ? '非公開' : esc(h.real)}・${esc(h.gender)}・${h.age}歳・${esc(h.pref)}${esc(h.city)}・${esc(h.agency)}・活動${h.career}年目${h.bestRank ? '・最高' + h.bestRank + '位' : ''}${h.oldNames.length ? '・旧名 ' + h.oldNames.map(esc).join('、') : ''}</p>
      ${h.titles.length ? `<div class="titles">${h.titles.map((t) => `<span>${t.y} ${esc(t.title)}</span>`).join('')}</div>` : ''}
      <div class="pf-grid">
        <div>
          <div class="power"><b>${esc(h.power.name)}</b><span class="stars" title="能力の格">${stars(tier)}</span><p>${esc(h.power.desc)}（${esc(D.elemLabel[h.power.el] || '')}系）</p></div>
          <h4>経歴</h4>
          <p class="bio">${esc(h.job)}。${esc(h.origin)}。${esc(h.motive)}ヒーローになった。${esc(h.quirk)}。</p>
          <h4>性格</h4><div class="traits">${h.traits.map((t) => `<span>${esc(t)}</span>`).join('')}</div>
          ${rel.length ? `<h4>関係</h4><dl class="dl">${rel.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl>` : ''}
        </div>
        <div>
          <h4>能力値</h4>${radar(h.stats)}
          <h4>通算成績</h4>
          <div class="recs"><div><b>${r.cases}</b><span>出動</span></div><div><b>${r.captures}</b><span>検挙</span></div><div><b>${r.rescues}</b><span>救助</span></div><div><b>${r.scandals}</b><span>炎上</span></div></div>
        </div>
      </div>
      <div class="pf-grid">
        <div><h4>今年の順位推移・ポイント ${num(h.points)}・人気 ${num(h.fame)}</h4>${spark(h.rankHist)}</div>
        <div><h4>年度別の最終順位</h4>${yrs.length ? `<ol class="yrs">${yrs.slice().reverse().map(([y, rk]) => `<li><span>${y}</span><b>${rk}位</b></li>`).join('')}</ol>` : '<p class="empty">年末に記録されます。</p>'}</div>
      </div>
      <h4>活動記録</h4>${histList(h)}`);
  }

  function showVillain(v) {
    const rel = [];
    if (v.org !== null) rel.push(['所属', link('o', sim.orgs[v.org]) + (v.orgRank === 'boss' ? '（首領）' : v.orgRank === 'exec' ? '（幹部）' : '')]);
    if (v.formerOrg !== undefined && v.org === null) rel.push(['元所属', link('o', sim.orgs[v.formerOrg])]);
    if (v.nemesis !== null) rel.push(['宿敵', link('h', sim.heroes[v.nemesis])]);
    if (v.caughtBy.length) rel.push([v.kind === 'kaiju' ? '撃破' : '逮捕した', [...new Set(v.caughtBy)].map((id) => link('h', sim.heroes[id])).join('、')]);
    if (v.formerHero !== null) rel.push(['ヒーロー時代', link('h', sim.heroes[v.formerHero])]);
    if (v.heroId !== null && v.heroId !== undefined) rel.push(['改心後', link('h', sim.heroes[v.heroId])]);
    const isK = v.kind === 'kaiju';
    openModal(`
      <div class="pf-head"><span class="threat big t${v.threat}">${v.threat}</span><h2 id="modalTitle">${esc(v.name)}</h2><span class="st${v.status === 'free' ? ' bad' : ''}">${VSTATUS[v.status] || ''}</span></div>
      <p class="pf-sub">${isK ? '怪獣' : `本名 ${esc(v.real)}・${esc(v.gender)}・${v.age}歳`}・出現地 ${esc(v.pref)}</p>
      <div class="pf-grid">
        <div>
          <div class="power"><b>${esc(v.power.name)}</b>${isK ? '' : `<span class="stars">${stars(v.power.tier + (v.tierBonus || 0))}</span>`}<p>${esc(v.power.desc)}</p></div>
          ${isK ? '' : `<h4>素性</h4><p class="bio">${esc(v.origin)}。目的は「${esc(v.motive)}」。</p>`}
          ${rel.length ? `<h4>関係</h4><dl class="dl">${rel.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl>` : ''}
        </div>
        <div>
          ${isK ? `<h4>推定戦闘力</h4><p class="bio">${v.kpow}</p>` : `<h4>能力値</h4>${radar(v.stats, true)}`}
          <h4>記録</h4>
          <div class="recs"><div><b>${v.crimes}</b><span>犯行</span></div><div><b>${v.wins}</b><span>ヒーロー撃退</span></div><div><b>${v.escapes}</b><span>逃走</span></div><div><b>${v.notoriety}</b><span>悪名</span></div></div>
        </div>
      </div>
      <h4>記録された事件</h4>${histList(v)}`);
  }

  function showOrg(o) {
    const ms = sim.orgMembers(o).concat(sim.villains.filter((v) => v.formerOrg === o.id && v.org === null));
    openModal(`<div class="pf-head"><h2 id="modalTitle">${esc(o.name)}</h2><span class="st${o.status === 'active' ? ' bad' : ''}">${o.status === 'active' ? '活動中' : '壊滅'}</span></div>
      <p class="pf-sub">${esc(o.desc)}・拠点 ${esc(o.pref)}・${o.founded}年に確認</p>
      <div class="meter red"><span>組織力</span><i><b style="width:${Math.min(100, o.strength)}%"></b></i><span>${Math.round(o.strength)}</span></div>
      <div class="meter blue"><span>捜査進捗</span><i><b style="width:${Math.min(100, o.intel)}%"></b></i><span>${Math.round(Math.min(100, o.intel))}</span></div>
      <h4>構成員</h4><ul class="list">${ms.map((v) => `<li><span class="k">${v.id === o.boss ? '首領' : v.orgRank === 'exec' ? '幹部' : '構成員'}</span>${link('v', v)}<span class="st">${VSTATUS[v.status]}</span></li>`).join('')}</ul>
      <h4>組織の記録</h4>${histList(o)}`);
  }

  function showTeam(t) {
    const ms = t.members.map((id) => sim.heroes[id]);
    openModal(`<div class="pf-head"><h2 id="modalTitle">${esc(t.name)}</h2><span class="st">${t.active ? '活動中' : '解散'}</span></div>
      <p class="pf-sub">${esc(t.region)}を拠点とするヒーローチーム・${t.founded}年結成</p>
      <table class="rk-table"><tbody>${ms.map((h) => heroRow(h, h.rank ?? '–', num(score(h)))).join('')}</tbody></table>`);
  }

  // ---------- 年末 ----------
  function cancelCountdown() { if (countdown) clearInterval(countdown); countdown = null; }
  function showYearEnd() {
    const a = sim.awards[sim.awards.length - 1];
    if (!a || !sim.ended) return;
    const st = a.stats;
    const champ = sim.heroes[a.champ];
    const deaths = sim.log.filter((l) => l.y === a.year && l.t === 'death');
    const retires = sim.log.filter((l) => l.y === a.year && l.t === 'retire');
    const hofs = sim.log.filter((l) => l.y === a.year && l.t === 'hof');
    openModal(`<h2 class="yearend-title" id="modalTitle">${a.year}年 ヒーロー年間表彰</h2>
      <p class="pf-sub">事件${num(Object.values(st.inc).reduce((x, y) => x + y, 0))}件・ヴィラン検挙${st.captures}名・怪獣撃破${st.kaijuDown}体・スキャンダル${st.scandals}件・殉職${st.deaths}名・引退${retires.length}名</p>
      <div class="champ">${emblem(champ, true)}<div><span>年間ランキング1位</span><b>${link('h', champ)}</b><small>${esc(champ.power.name)}・${esc(champ.pref)}・${esc(champ.agency)}</small></div></div>
      <ul class="awards">${a.list.map((x) => `<li><span class="k">${esc(x.title)}</span><span>${hlink(sim.heroes[x.id])}<small>${esc(x.note)}</small></span></li>`).join('')}</ul>
      ${deaths.length ? `<h4>今年、殉職したヒーロー</h4><p class="bio">${deaths.map((l) => hlink(sim.heroes[l.h])).join('　')}</p>` : ''}
      ${hofs.length ? `<h4>今年の殿堂入り</h4><p class="bio">${hofs.map((l) => hlink(sim.heroes[l.h])).join('　')}</p>` : ''}
      <h4>年間ランキング トップ10</h4>
      <table class="rk-table"><tbody>${a.top10.map((id, i) => { const h = sim.heroes[id]; return `<tr><td class="rk">${i + 1}</td><td class="mv"></td><td class="who"><div class="whoin">${emblem(h)}<div>${link('h', h)}<small>${esc(h.power.name)}・${esc(h.pref)}</small></div></div></td><td class="sc">${num(score(h))}</td></tr>`; }).join('')}</tbody></table>
      <p class="countdown" id="countdown"></p>
      <div class="btnrow"><button type="button" class="btn" id="nextYearBtn">${a.year + 1}年へ進む</button><button type="button" class="btn alt" id="stayBtn">ここで止める</button><button type="button" class="btn alt" data-act="new">新しい世界で始める</button></div>
      <label class="check"><input type="checkbox" id="autoYear" ${ui.autoYear ? 'checked' : ''}> 毎年、自動で次の年へ進む</label>`);
    if (ui.autoYear && ui.speed > 0) {
      let left = 15;
      const upd = () => { const el = $('#countdown'); if (el) el.textContent = `${left}秒後に${a.year + 1}年へ自動で進みます。`; };
      upd();
      countdown = setInterval(() => { left--; if (left <= 0) nextYear(); else upd(); }, 1000);
    }
  }

  function showNewWorld() {
    cancelCountdown();
    openModal(`<h2 class="yearend-title" id="modalTitle">新しい世界を作る</h2>
      <p class="bio">今の世界（${esc(sim.seed)}・${sim.year}年）は上書きされ、元に戻せません。ヒーロー・ヴィラン・組織をすべて作り直して1年目から始めます。同じシードを入れると同じ顔ぶれの世界になります。</p>
      <div class="field"><input id="seedInput" type="text" value="${esc(randomSeed())}" aria-label="世界シード"><button type="button" class="btn" id="seedGo">この世界で始める</button></div>
      <div class="btnrow"><button type="button" class="btn alt" id="cancelNew">今の世界を続ける</button></div>`);
  }

  // ---------- イベント ----------
  function bind() {
    document.addEventListener('click', (e) => {
      const nm = e.target.closest('.nm');
      if (nm) {
        cancelCountdown();
        const x = ent(nm.dataset.k, +nm.dataset.id);
        if (nm.dataset.k === 'h') showHero(x); else if (nm.dataset.k === 'v') showVillain(x); else if (nm.dataset.k === 'o') showOrg(x); else showTeam(x);
        return;
      }
      const sp = e.target.closest('.sp');
      if (sp) {
        ui.speed = +sp.dataset.sp; save();
        if (sim.ended) { if (ui.speed > 0) nextYear(); return; }
        play(); return;
      }
      const tab = e.target.closest('.tab');
      if (tab) { setTab(tab.dataset.tab); return; }
      const go = e.target.closest('[data-goto]');
      if (go) { setTab(go.dataset.goto); return; }
      const chip = e.target.closest('.chip');
      if (chip) {
        const c = chip.dataset.cat;
        ui.cats = ui.cats.includes(c) ? ui.cats.filter((x) => x !== c) : [...ui.cats, c];
        save(); renderFilters(); rebuildFeed(); return;
      }
      const rec = e.target.closest('[data-rec]');
      if (rec) { ui.recType = rec.dataset.rec; ui.recLimit = 80; save(); renderRecords(); return; }
      const mp = e.target.closest('[data-map]');
      if (mp) { ui.mapMetric = mp.dataset.map; save(); renderDash(); return; }
      const tile = e.target.closest('.tile');
      if (tile) { ui.pref = ui.pref === tile.dataset.pref ? null : tile.dataset.pref; renderDash(); return; }
      const more = e.target.closest('.more');
      if (more) {
        const m = more.dataset.more;
        if (m === 'rank') { ui.rankLimit += 50; renderRank(); }
        if (m === 'roster') { ui.rosterLimit += 60; renderRoster(); }
        if (m === 'villain') { ui.vLimit += 60; renderVillains(); }
        if (m === 'rec') { ui.recLimit += 80; renderRecords(); }
        return;
      }
      const id = e.target.id;
      if (id === 'modalClose' || id === 'modal' || id === 'cancelNew') { closeModal(); return; }
      if (id === 'stayBtn') { cancelCountdown(); const el = $('#countdown'); if (el) el.textContent = '再生ボタンを押すと次の年へ進みます。'; return; }
      if (id === 'nextYearBtn') { nextYear(); return; }
      if (id === 'seedGo') { const s = $('#seedInput').value.trim(); closeModal(); newWorld(s || randomSeed()); return; }
      if (id === 'newBtn' || e.target.dataset.act === 'new') { showNewWorld(); return; }
      if (id === 'skipBtn') skipToEnd();
    });
    document.addEventListener('change', (e) => {
      if (e.target.id === 'autoYear') { ui.autoYear = e.target.checked; save(); if (!ui.autoYear) cancelCountdown(); }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('#modal').hidden) closeModal();
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('tile')) { e.preventDefault(); e.target.dispatchEvent(new MouseEvent('click', { bubbles: true })); }
    });
    $('#rosterQ').addEventListener('input', () => { ui.rosterLimit = 60; renderRoster(); });
    $('#rosterSort').addEventListener('change', () => { ui.rosterLimit = 60; renderRoster(); });
    $('#rosterStatus').addEventListener('change', () => { ui.rosterLimit = 60; renderRoster(); });
    $('#vStatus').addEventListener('change', () => { ui.vLimit = 60; renderVillains(); });
    $('#recYear').addEventListener('change', (e) => { ui.recYear = e.target.value; ui.recLimit = 80; renderRecords(); });
    window.matchMedia('(min-width: 900px)').addEventListener('change', () => setTab(ui.tab));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveWorld(); });
    window.addEventListener('pagehide', saveWorld);
  }

  async function start() {
    bind();
    renderFilters();
    if (ui.tab === 'almanac') ui.tab = 'dash';
    await Store.open();
    let saved = null;
    try { const raw = await Store.get('world'); if (raw) saved = G.Sim.fromJSON(JSON.parse(raw)); } catch (e) { saved = null; }
    if (saved) resumeWorld(saved); else newWorld(randomSeed());
    setTab(ui.tab);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})(globalThis.HG = globalThis.HG || {});
