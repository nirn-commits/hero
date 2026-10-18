// 画面：ニュース・概況・ランキング・記録・名鑑・詳細表示・自動保存
(function (G) {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const D = G.D;
  const SPEEDS = [0, 1500, 600, 150, 20];
  const CAT = { case: '事件', villain: 'ヴィラン', big: '大事件', scandal: 'スキャンダル', media: '芸能', life: '人間模様', rank: 'ランキング', milestone: '節目', world: '社会', school: '学園' };
  const STATUS = { active: '', off: '', retired: '引退', dead: '殉職', fallen: '闇堕ち' };
  const VSTATUS = { free: '逃亡中', captured: '収監中', dead: '撃破', retreated: '撤退', reformed: '改心' };
  const STAT_LABEL = [['pow', 'パワー'], ['tec', '技術'], ['spd', '機動力'], ['int', '知性'], ['cha', '人気'], ['men', '精神力'], ['mor', '正義感']];
  // 属性ごとの紋章（文字と色相）
  const EMB = {
    fire: ['炎', 14], ice: ['氷', 195], thunder: ['雷', 48], wind: ['風', 150], water: ['水', 212], earth: ['土', 32], light: ['光', 54],
    dark: ['闇', 268], metal: ['鋼', 222], beast: ['獣', 24], plant: ['樹', 112], mind: ['念', 305], time: ['刻', 240], space: ['宙', 256],
    body: ['体', 0], tech: ['機', 186], sound: ['音', 330], poison: ['毒', 285], luck: ['運', 70], gravity: ['重', 230], life: ['命', 345], odd: ['奇', 168],
  };
  const REC_GROUPS = [
    ['ヒーロー', [['death', '殉職'], ['retire', '引退'], ['scandal', 'スキャンダル'], ['hof', '殿堂入り'], ['legacy', '二世'], ['inherit', '継承'], ['milestone', '節目'], ['comeback', '現役復帰'], ['after', '引退後の消息'], ['record', '新記録'], ['mentor', '師弟']]],
    ['物語', [['saga', '宿敵の決着'], ['boss', '黒幕'], ['fallen', '闇堕ち'], ['reform', '改心'], ['kaiju', '怪獣'], ['org', '組織壊滅'], ['serial', '連続事件'], ['vally', 'ヴィランの加勢']]],
    ['社会', [['era', '時代'], ['policy', '世論・制度'], ['agency', '事務所'], ['marry', '結婚'], ['world', '世界大会'], ['foreign', '国際手配']]],
    ['学園', [['grad', '卒業と進路'], ['school', '学園の出来事']]],
    ['年表', [['records', '歴代記録'], ['chronicle', '年代記'], ['awards', '歴代表彰'], ['tourney', '全国大会'], ['months', '月間1位'], ['cover', '週刊誌の表紙']]],
  ];
  const REC_TYPES = REC_GROUPS.flatMap((g) => g[1]);
  const MS_LABEL = { cap1: '初検挙', cap: '検挙', cases: '出動', rescues: '救助', top1: '初の1位', career: '活動年数', streak: '連続トップ100' };
  const ACT = { apology: '謝罪', deny: '否定', twist: '好感度上昇', suspend: '活動停止', arrest: '逮捕・免許はく奪' };
  const MAX_DAYS = 90;

  let sim = null;
  let timer = null;
  let skipping = false;
  let ticks = 0;
  let countdown = null;
  const ui = load({ speed: 2, tab: 'dash', cats: Object.keys(CAT), autoYear: true, recType: 'death', mapMetric: 'inc', size: 'm', noExtra: false, catsV: 1, slot: 1, consultStop: true });
  // 「学園」の分類が増えた版より前の設定には、学園を足しておく
  if (ui.catsV < 2) { if (!ui.cats.includes('school')) ui.cats.push('school'); ui.catsV = 2; }
  ui.favs = new Set(); ui.favOnly = false; ui.sfavs = new Set(); ui.sfavDone = new Set();
  ui.school = 0; ui.sgrade = 1;
  ui.rankLimit = 50; ui.rosterLimit = 60; ui.vLimit = 60; ui.recLimit = 80; ui.recYear = 'all'; ui.pref = null;

  function load(def) {
    try {
      const s = JSON.parse(localStorage.getItem('hero-ui') || 'null');
      if (s) for (const k of Object.keys(def)) if (s[k] !== undefined) def[k] = s[k];
    } catch (e) { /* 保存領域が使えない環境 */ }
    return def;
  }
  function save() {
    try { localStorage.setItem('hero-ui', JSON.stringify({ speed: ui.speed, tab: ui.tab, cats: ui.cats, autoYear: ui.autoYear, recType: ui.recType, mapMetric: ui.mapMetric, size: ui.size, noExtra: ui.noExtra, catsV: ui.catsV, slot: ui.slot, consultStop: ui.consultStop })); } catch (e) { /* 無視 */ }
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
    del(k) {
      return new Promise((res) => {
        if (!this.db) return res(false);
        try { const tx = this.db.transaction('s', 'readwrite'); tx.objectStore('s').delete(k); tx.oncomplete = () => res(true); tx.onerror = () => res(false); } catch (e) { res(false); }
      });
    },
  };
  // セーブスロット（スロット1は以前からの保存場所をそのまま使う）
  const SLOTS = [1, 2, 3];
  if (!SLOTS.includes(ui.slot)) ui.slot = 1;
  const slotKey = (n) => (n === 1 ? 'world' : 'world' + n);
  const metaKey = (n) => 'meta' + n;
  function slotMeta() {
    const top = sim.ranked && sim.ranked[0];
    return { seed: sim.seed, year: sim.year, day: lastDay(), years: sim.year - (sim.startYear ?? sim.year) + 1, champ: top ? top.name : '', heroes: sim.ranked ? sim.ranked.length : 0, era: sim.eraDef ? sim.eraDef().name : '', at: Date.now() };
  }
  let saving = false;
  async function saveWorld() {
    if (!sim || saving || skipping) return;
    saving = true;
    let ok = false;
    try { ok = await Store.put(slotKey(ui.slot), JSON.stringify(sim)); if (ok) await Store.put(metaKey(ui.slot), JSON.stringify(slotMeta())); } catch (e) { ok = false; }
    saving = false;
    $('#saveLabel').textContent = ok ? `スロット${ui.slot}・自動保存 ${G.fmtDate(sim.year, lastDay())}` : '';
  }
  async function flushSave() {
    for (let i = 0; i < 100 && saving; i++) await new Promise((r) => setTimeout(r, 30));
    await saveWorld();
  }
  function updateSlotBtn() { $('#slotBtn').textContent = `スロット${ui.slot}`; }
  async function showSlots() {
    cancelCountdown();
    const metas = {};
    for (const n of SLOTS) {
      if (n === ui.slot) { metas[n] = slotMeta(); continue; }
      try { const m = await Store.get(metaKey(n)); metas[n] = m ? JSON.parse(m) : null; } catch (e) { metas[n] = null; }
    }
    const card = (n) => {
      const m = metas[n], cur = n === ui.slot;
      const body = m ? `<dl class="dl"><dt>世界シード</dt><dd>${esc(m.seed)}</dd><dt>日付</dt><dd>${m.years}年目　${G.fmtDate(m.year, m.day)}</dd><dt>時代</dt><dd>${esc(m.era)}</dd><dt>ランキング1位</dt><dd>${esc(m.champ)}</dd><dt>現役ヒーロー</dt><dd>${m.heroes}名</dd>${cur ? '' : `<dt>最後に遊んだ日</dt><dd>${new Date(m.at).toLocaleString('ja-JP', { dateStyle: 'medium', timeStyle: 'short' })}</dd>`}</dl>` : '<p class="empty">空き</p>';
      const btns = cur ? '<p class="mapnote">遊んでいるスロットです。作り直すときは「新しい世界」を押してください。</p>'
        : `<div class="btnrow"><button type="button" class="btn" data-slotgo="${n}">${m ? 'この世界を遊ぶ' : 'ここで新しい世界を始める'}</button>${m ? `<button type="button" class="btn alt" data-slotdel="${n}">消す</button>` : ''}</div>`;
      return `<section class="slotcard${cur ? ' cur' : ''}"><h3>スロット${n}${cur ? '<span class="st ok-st">使用中</span>' : ''}</h3>${body}${btns}</section>`;
    };
    openModal(`<h2 class="yearend-title" id="modalTitle">セーブスロット</h2>
      <p class="bio">3つの世界を別々に保存できます。切り替えると、いまの世界は自動で保存されます。</p>
      <div class="slots">${SLOTS.map(card).join('')}</div>
      <p class="mapnote">推し・予想・目標は世界シードごとに記録されるため、同じシードの世界どうしでは共有されます。</p>`);
  }
  async function switchSlot(n) {
    if (skipping || n === ui.slot) return;
    stop(); cancelCountdown(); closeExtra(false);
    await flushSave();
    ui.slot = n; save();
    closeModal();
    let s2 = null;
    try { const raw = await Store.get(slotKey(n)); if (raw) s2 = G.Sim.fromJSON(JSON.parse(raw)); } catch (e) { s2 = null; }
    $('#feed').innerHTML = '';
    updateSlotBtn();
    if (s2) resumeWorld(s2); else newWorld(randomSeed());
  }

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ent = (k, id) => (k === 'h' ? sim.heroes[id] : k === 'v' ? sim.villains[id] : k === 'o' ? sim.orgs[id] : k === 's' ? sim.students[id] : sim.teams[id]);
  function link(k, e) {
    if (!e) return '';
    const dead = (k === 'h' && (e.status === 'dead' || e.status === 'retired' || e.status === 'fallen')) || (k === 's' && (e.status === 'dropped' || e.status === 'villain')) ? ' dead' : '';
    return `<button type="button" class="nm ${k}${dead}" data-k="${k}" data-id="${e.id}">${esc(k === 's' ? e.real : e.name)}</button>`;
  }
  function emblem(e, big) {
    const [ch, hue] = EMB[e.power.el] || EMB.odd;
    return `<span class="em${big ? ' big' : ''}" style="--hue:${hue}" title="${esc(D.elemLabel[e.power.el] || '')}系">${ch}</span>`;
  }
  const hlink = (h) => (h ? `<span class="hl">${emblem(h)}${link('h', h)}</span>` : '');
  const rich = (t) => esc(t).replace(/⟦([hvots])(\d+)⟧/g, (m, k, id) => link(k, ent(k, +id)));
  const num = (n) => Math.round(n).toLocaleString('ja-JP');
  const score = (h) => sim.score(h);
  const lastDay = () => (sim.ended ? sim.day : Math.max(0, sim.day - 1));
  const shortPref = (p) => (p === '北海道' ? '北海道' : p.replace(/[都府県]$/, ''));

  // ---------- 予想と推しの目標（ブラウザに保存） ----------
  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch (e) { return {}; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 無視 */ } }
  const predKey = () => 'hero-pred-' + sim.seed;
  const goalKey = () => 'hero-goal-' + sim.seed;
  function goalsFor(year) {
    const all = lsGet(goalKey());
    const g = all[year] || {};
    let changed = false;
    for (const id of ui.favs) {
      if (g[id]) continue;
      const h = sim.heroes[id];
      if (!h || h.rank === null) continue;
      const t = h.rank > 50 ? 50 : h.rank > 10 ? 10 : h.rank > 3 ? 3 : 1;
      g[id] = { t, from: h.rank };
      changed = true;
    }
    if (changed) { all[year] = g; lsSet(goalKey(), all); }
    return g;
  }
  const goalLabel = (t) => (t === 1 ? '年間1位' : `年末にトップ${t}入り`);
  function finalRank(h, year) { const r = (h.yearRanks || []).find((x) => x[0] === year); return r ? r[1] : null; }

  // ---------- 推し ----------
  function loadFavs() {
    ui.favs = new Set();
    try { const a = JSON.parse(localStorage.getItem('hero-favs-' + sim.seed) || '[]'); for (const id of a) ui.favs.add(id); } catch (e) { /* 無視 */ }
  }
  function saveFavs() { try { localStorage.setItem('hero-favs-' + sim.seed, JSON.stringify([...ui.favs])); } catch (e) { /* 無視 */ } }
  const favBtn = (h) => `<button type="button" class="fav-btn" data-fav="${h.id}" aria-pressed="${ui.favs.has(h.id)}" aria-label="${esc(h.name)}を推しに${ui.favs.has(h.id) ? '登録済み' : '登録'}" title="推しに登録">${ui.favs.has(h.id) ? '★' : '☆'}</button>`;
  const isFavNews = (n) => (n.h && n.h.some((id) => ui.favs.has(id))) || (n.s && n.s.some((id) => ui.sfavs.has(id)));
  // 推しの生徒
  function loadSFavs() {
    ui.sfavs = new Set(); ui.sfavDone = new Set();
    const o = lsGet('hero-sfavs-' + sim.seed);
    for (const id of o.s || []) ui.sfavs.add(id);
    for (const id of o.done || []) ui.sfavDone.add(id);
  }
  function saveSFavs() { lsSet('hero-sfavs-' + sim.seed, { s: [...ui.sfavs], done: [...ui.sfavDone] }); }
  const sfavBtn = (s) => `<button type="button" class="fav-btn" data-sfav="${s.id}" aria-pressed="${ui.sfavs.has(s.id)}" aria-label="${esc(s.real)}を推しに${ui.sfavs.has(s.id) ? '登録済み' : '登録'}" title="推しに登録">${ui.sfavs.has(s.id) ? '★' : '☆'}</button>`;
  // 推しの生徒がヒーローになったら、ヒーローとしても推しに加える
  function followGrads() {
    for (const id of ui.sfavs) {
      const st = sim.students[id];
      if (!st || st.heroId === null || ui.sfavDone.has(id)) continue;
      ui.sfavDone.add(id);
      ui.favs.add(st.heroId);
      saveFavs(); saveSFavs();
      toast(`推しの生徒${link('s', st)}がヒーロー${link('h', sim.heroes[st.heroId])}としてデビューしました。推しのヒーローにも登録しました。`);
    }
  }
  function toast(html) {
    const box = $('#toasts');
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span class="toast-tag">★ 推しの動き</span><p>${html}</p>`;
    box.prepend(el);
    while (box.children.length > (isWide() ? 3 : 1)) box.lastElementChild.remove();
    setTimeout(() => el.remove(), 7000);
  }

  // ---------- 進行 ----------
  function newWorld(seed) {
    stop();
    cancelCountdown();
    sim = new G.Sim(seed || randomSeed());
    loadFavs(); loadSFavs();
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
    loadFavs(); loadSFavs();
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
    if (ui.speed === 0 || sim.ended || !$('#extra').hidden) return;
    const loop = () => {
      tick();
      if (!sim.ended && ui.speed > 0 && $('#extra').hidden) timer = setTimeout(loop, SPEEDS[ui.speed]);
    };
    timer = setTimeout(loop, Math.min(400, SPEEDS[ui.speed]));
  }
  function stop() { if (timer) clearTimeout(timer); timer = null; }

  function tick() {
    const items = sim.step();
    ticks++;
    renderDay(lastDay(), items);
    checkConsult();
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
    $('#dateLabel').textContent = `${sim.year - sim.startYear + 1}年目　` + G.fmtDate(sim.year, lastDay(), true);
    $('#eraLabel').textContent = sim.eraDef().name + (sim.boss && sim.boss.year === sim.year ? '・黒幕出現中' : '');
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
    $('#filters').innerHTML = `<button type="button" class="chip k-fav" data-favonly="1" aria-pressed="${ui.favOnly}">★ 推しのみ</button>` + Object.entries(CAT).map(([k, v]) => `<button type="button" class="chip k-${k}" data-cat="${k}" aria-pressed="${ui.cats.includes(k)}">${v}</button>`).join('');
  }
  const visible = (n) => ui.cats.includes(n.cat) && (!ui.favOnly || isFavNews(n));
  function dayHTML(day, items) {
    const vis = items.filter(visible);
    if (!vis.length) return '';
    return `<section class="day" data-day="${day}"><h3>${G.fmtDate(sim.year, day, true)}</h3><ol>${vis.map(itemHTML).join('')}</ol></section>`;
  }
  function itemHTML(n) {
    const fav = isFavNews(n);
    return `<li class="it i${n.imp} c-${n.cat}${fav ? ' fav' : ''}"><span class="tag k-${n.cat}">${fav ? '★' : ''}${CAT[n.cat] || ''}</span><p>${rich(n.text)}</p></li>`;
  }
  // ---------- 号外 ----------
  const EXTRA = [
    [/【訃報】/, (n) => `${n}殉職`], [/【審判の日】/, () => '審判の日　最終決戦'], [/【決着】/, () => '宿敵との因縁に決着'],
    [/【時代】/, (n, t) => `「${(t.match(/「([^」]+)」/) || [, '新時代'])[1]}」到来`], [/首位が交代/, (n) => `首位交代　${n}が1位に`], [/【新組織】/, () => '新たなヴィラン組織が出現'],
    [/【衝撃】/, (n) => `${n}、闇に堕ちる`], [/【復活】/, (n) => `${n}、現役復帰`], [/【全国大会決勝】/, (n) => `${n}、全国大会を制す`], [/【新記録】/, (n) => `${n}、歴代記録を更新`],
    [/【世界大会】.*優勝した/, (n) => `${n}、世界一に`], [/【不穏】/, () => '謎の黒幕、出現か'], [/【殿堂入り】/, (n) => `${n}、殿堂入り`], [/【連続事件・最終話】/, () => '連続事件、ついに決戦'],
    [/【学園襲撃】/, () => '養成校の合宿をヴィランが襲撃'], [/【救出】/, () => '連れ去られた生徒、無事に救出'],
  ];
  let extraTimer = null, lastExtra = -99;
  function checkExtra(items) {
    if (ui.noExtra || skipping) return;
    // 号外は続けて出さない（最低2週間あける）
    const now = sim.year * 400 + sim.day;
    if (now - lastExtra < 14) return;
    for (const n of items) {
      const m = EXTRA.find(([re]) => re.test(n.text));
      if (!m) continue;
      const tok = n.text.match(/⟦h(\d+)⟧/);
      const name = tok ? sim.heroes[+tok[1]].name : '';
      lastExtra = now;
      showExtra(m[1](name, n.text), n);
      return;
    }
  }
  function showExtra(title, n) {
    const wasPlaying = !!timer;
    stop();
    const box = $('#extra');
    box.innerHTML = `<div class="extra-box" role="dialog" aria-modal="true" aria-labelledby="extraTitle">
      <div class="extra-mast"><span class="extra-stamp">号外</span><span>超人日報　${G.fmtDate(n.y, n.d, true)}</span></div>
      <h2 id="extraTitle">${esc(title)}</h2>
      <p class="extra-body">${rich(n.text)}</p>
      <p class="mapnote" id="extraCount"></p>
      <div class="btnrow"><button type="button" class="btn" id="extraGo">続きを見る</button><button type="button" class="btn alt" id="extraStay">ここで止める</button></div>
      <label class="check"><input type="checkbox" id="noExtra" ${ui.noExtra ? 'checked' : ''}> 号外を出さない</label></div>`;
    box.hidden = false;
    $('#extraGo').focus();
    box.dataset.resume = wasPlaying ? '1' : '';
    let left = 10;
    const upd = () => { const el = $('#extraCount'); if (el) el.textContent = wasPlaying ? `${left}秒後に自動で再開します。` : ''; };
    upd();
    clearInterval(extraTimer);
    if (wasPlaying) extraTimer = setInterval(() => { left--; if (left <= 0) closeExtra(true); else upd(); }, 1000);
  }
  function closeExtra(resume) {
    clearInterval(extraTimer);
    const box = $('#extra');
    if (box.hidden) return;
    box.hidden = true;
    if (resume && box.dataset.resume && !sim.ended) play();
    else updateSpeedButtons();
  }

  function renderDay(day, items) {
    checkExtra(items);
    if (ui.sfavs.size) followGrads();
    const top = items.filter((n) => n.imp === 3).pop();
    if (top) setFlash(rich(top.text), true);
    if (ui.favs.size) for (const n of items) if (isFavNews(n) && (n.imp >= 2 || ['milestone', 'scandal', 'big', 'rank'].includes(n.cat))) toast(rich(n.text));
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
    if (ui.sfavs.size && sim) followGrads();
    const p = currentPane();
    if (!p) return;
    if (p === 'rank') return renderRank();
    if (p === 'fav' && (force || ticks % 3 === 0)) return renderFav();
    if (p === 'dash' && (force || ticks % 3 === 0)) return renderDash();
    if (!force && ticks % 5 !== 0) return;
    if (p === 'roster') renderRoster();
    if (p === 'villain') renderVillains();
    if (p === 'org') renderOrgs();
    if (p === 'school') renderSchool();
    if (p === 'teach') renderTeach();
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
    return `<tr><td class="rk">${rankCell}</td><td class="mv">${h.rank ? moveHTML(h) : ''}</td><td class="who"><div class="whoin">${emblem(h)}<div>${link('h', h)}${favBtn(h)}${statusChip(h)}<small>${esc(h.power.name)}・${esc(h.pref)}・${esc(h.agency)}</small>${barPct !== undefined ? `<i class="bar"><b style="width:${barPct}%"></b></i>` : ''}</div></div></td><td class="sc">${right}</td></tr>`;
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
    const events = sim.log.filter((l) => l.y === sim.year && ['death', 'hof', 'fallen', 'org', 'legacy', 'reform', 'saga', 'boss', 'era', 'tourney', 'inherit', 'policy'].includes(l.t)).slice(-8).reverse();
    const t = sim.curTourney();
    $('#pane-dash').innerHTML = `
      <h2>${sim.year}年の概況<small>${G.fmtDate(sim.year, lastDay())}時点</small></h2>
      ${banners()}
      <div class="kpis">${k(Math.round(sim.approval) + '%', 'ヒーロー支持率', sim.approval < 40 ? 'bad' : '')}${k(num(inc), '事件')}${k(handled ? Math.round((solved / handled) * 100) + '%' : '–', '解決率')}${k(st.captures, 'ヴィラン検挙')}${k(st.scandals, 'スキャンダル', 'warn')}${k(st.deaths, '殉職', st.deaths ? 'bad' : '')}${k(sim.ranked.length, '現役ヒーロー')}${k(freeV, '逃亡中ヴィラン')}${k(orgs, '活動中の組織')}</div>
      <div class="dash-grid">
        ${frontPage()}
        ${predictCard()}
        <div class="duo">${watchCard()}${serialCard()}</div>
        <div class="duo">${coverCard()}${favPanel()}</div>
        ${schoolCard()}
        ${t ? `<figure class="fig"><figcaption><span>第${t.no}回 全国ヒーロー大会</span><span class="legend">${t.champ !== null ? '優勝 ' + link('h', sim.heroes[t.champ]) : '決勝は11月3日'}</span></figcaption>${bracket(t)}</figure>` : ''}
        <figure class="fig">
          <figcaption><span>ヒーロー支持率の推移（${sim.year}年）</span><span class="legend">38%を下回ると制度改革</span></figcaption>
          ${approvalChart()}
        </figure>
        <figure class="fig">
          <figcaption><span>地域別の状況</span>
            <span class="seg sm" role="group" aria-label="地図の指標">${[['inc', '事件数'], ['hero', 'ヒーロー数'], ['villain', 'ヴィラン']].map(([m, l]) => `<button type="button" data-map="${m}" aria-pressed="${ui.mapMetric === m}">${l}</button>`).join('')}</span></figcaption>
          ${tileMap()}
        </figure>
        ${safetyCard()}
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
  function frontPage() {
    const d = lastDay();
    const items = sim.news.filter((n) => n && n.y === sim.year && n.d === d).sort((a, b) => b.imp - a.imp || ['big', 'villain', 'rank', 'scandal'].indexOf(b.cat) - ['big', 'villain', 'rank', 'scandal'].indexOf(a.cat));
    if (!items.length) return '';
    const [main, ...rest] = items;
    const head = (t) => { const m = t.match(/^【[^】]+】/); return m ? m[0] : ''; };
    return `<section class="front"><div class="front-mast"><b>超人日報</b><span>${G.fmtDate(sim.year, d, true)}</span></div>
      <p class="front-head">${head(main.text) ? `<span>${esc(head(main.text))}</span>` : ''}${rich(main.text.replace(/^【[^】]+】/, ''))}</p>
      ${rest.length ? `<ul class="front-sub">${rest.slice(0, 2).map((n) => `<li>${rich(n.text.length > 90 ? n.text.slice(0, 88).replace(/⟦[hvot]\d*$/, '') + '…' : n.text)}</li>`).join('')}</ul>` : ''}</section>`;
  }
  function watchCard() {
    const w = sim.watch;
    if (!w || !w.items.length) return '<div class="favpanel"><h3 class="wt">今週の注目</h3><p class="mapnote">毎週月曜日に、その週の見どころが発表されます。</p></div>';
    return `<div class="favpanel"><h3 class="wt">今週の注目<small>${G.fmtDate(w.y, w.d)}発表</small></h3><ol class="watch">${w.items.map((it) => `<li><div>${rich(it.text)}</div>${it.res ? `<span class="wres">${rich(it.res)}</span>` : '<span class="wres wait">結果待ち</span>'}</li>`).join('')}</ol></div>`;
  }
  function serialCard() {
    const list = sim.serials.filter((s) => !s.done || s.y === sim.year).slice(-4).reverse();
    if (!list.length) return '<div class="favpanel"><h3 class="wt">連続事件</h3><p class="mapnote">数週間かけて進む事件が、ときどき起こります。</p></div>';
    return `<div class="favpanel"><h3 class="wt">連続事件</h3><ul class="serials">${list.map((s) => `<li><b>『${esc(s.title)}』</b><div class="dots">${[1, 2, 3, 4].map((i) => `<i class="${s.done || s.stage > i ? 'on' : s.stage === i ? 'now' : ''}"></i>`).join('')}<span>${s.done ? esc(s.res || '') : `第${s.stage}話まで`}</span></div><small>${link('v', sim.villains[s.v])} 対 ${link('h', sim.heroes[s.hero ?? s.h])}</small></li>`).join('')}</ul></div>`;
  }
  function predictCard() {
    const all = lsGet(predKey());
    const p = all[sim.year];
    const top10 = sim.ranked.slice(0, 10), top16 = sim.ranked.slice(0, 16);
    const hits = Object.entries(all).filter(([y]) => +y < sim.year).reduce((a, [y, pr]) => { const r = judge(+y, pr); return [a[0] + r.filter((x) => x.ok === true).length, a[1] + r.filter((x) => x.ok !== null).length]; }, [0, 0]);
    if (!p) {
      if (lastDay() > 90) return '';
      const opt = (list) => list.map((h) => `<option value="${h.id}">${h.rank}位 ${esc(h.name)}</option>`).join('');
      return `<section class="predict"><h3>${sim.year}年の予想<small>年末に答え合わせ</small></h3>
        <div class="pgrid"><label>年間1位<select id="pChamp">${opt(top10)}</select></label><label>全国大会の優勝<select id="pTour">${opt(top16)}</select></label>
        <label>殉職者は<select id="pDeath"><option value="no">出ない</option><option value="yes">出る</option></select></label></div>
        <div class="btnrow"><button type="button" class="btn" id="predGo">この予想で決める</button>${hits[1] ? `<span class="mapnote">これまでの的中 ${hits[0]}／${hits[1]}</span>` : ''}</div></section>`;
    }
    const res = judge(sim.year, p);
    return `<section class="predict done"><h3>${sim.year}年のあなたの予想${hits[1] ? `<small>これまでの的中 ${hits[0]}／${hits[1]}</small>` : ''}</h3><ul class="plist">${res.map((r) => `<li><span class="k">${r.label}</span><span>${r.pick}</span>${r.ok === null ? '<span class="pj">結果待ち</span>' : r.ok ? '<span class="pj ok">的中</span>' : '<span class="pj ng">はずれ</span>'}</li>`).join('')}</ul></section>`;
  }
  function judge(year, p) {
    const aw = sim.awards.find((a) => a.year === year);
    const tt = sim.tourneys.find((t) => t.y === year && t.champ !== null);
    const deaths = sim.log.filter((l) => l.t === 'death' && l.y === year).length;
    const nm = (id) => (sim.heroes[id] ? link('h', sim.heroes[id]) : '―');
    return [
      { label: '年間1位', pick: nm(p.champ), ok: aw ? aw.champ === p.champ : null },
      { label: '全国大会', pick: nm(p.tour), ok: tt ? tt.champ === p.tour : null },
      { label: '殉職者', pick: p.death === 'yes' ? '出る' : '出ない', ok: aw ? (deaths > 0) === (p.death === 'yes') : deaths > 0 && p.death === 'yes' ? true : deaths > 0 ? false : null },
    ];
  }
  function safetyCard() {
    const rows = D.prefs.map((p) => ({ p: p.name, v: (sim.st.pref[p.name] || 0) / p.w })).sort((a, b) => b.v - a.v);
    const max = rows[0].v || 1;
    const bar = (r) => `<li><span class="k">${esc(r.p)}</span><i class="bar"><b style="width:${(r.v / max) * 100}%"></b></i><span class="nu">${(r.v * 10).toFixed(1)}</span></li>`;
    return `<figure class="fig"><figcaption><span>治安ランキング（${sim.year}年）</span><span class="legend">人口10万人あたりの事件数の目安</span></figcaption>
      <div class="safety"><div><h5>事件が多い県</h5><ol class="srank">${rows.slice(0, 5).map(bar).join('')}</ol></div><div><h5>平和な県</h5><ol class="srank">${rows.slice(-5).reverse().map(bar).join('')}</ol></div></div></figure>`;
  }

  function banners() {
    const e = sim.eraDef();
    let html = `<div class="banner era"><span class="banner-tag">時代</span><div><b>${esc(e.name)}</b><small>${sim.era.from}年から・${esc(e.start)}</small></div></div>`;
    const b = sim.boss;
    if (b && b.year === sim.year) {
      const v = sim.villains[b.v];
      const left = Math.round((new Date(sim.year, 11, 20) - new Date(sim.year, 0, 1)) / 864e5) - lastDay();
      const stage = left > 0 && lastDay() >= 40 ? `「審判の日」（12月20日）まであと${left}日` : left > 0 ? '正体不明の脅威がうごめいている' : '決戦は終わった';
      html += `<div class="banner boss"><span class="banner-tag">黒幕</span><div><b>${lastDay() >= 40 || b.since !== sim.year ? link('v', v) : '？？？'}</b><small>${stage}${b.united.length ? '・傘下の組織 ' + b.united.map((id) => link('o', sim.orgs[id])).join('、') : ''}</small></div></div>`;
    }
    return html;
  }
  function coverCard() {
    const c = sim.covers[sim.covers.length - 1];
    if (!c) return '<div class="cover empty-cover"><div class="cover-mast">週刊ヒーロー</div><p class="mapnote">毎週月曜日に、その週いちばん話題になったヒーローが表紙を飾ります。</p></div>';
    const h = sim.heroes[c.h];
    return `<div class="cover"><div class="cover-mast">週刊ヒーロー<span>Vol.${c.vol}・${G.fmtDate(c.y, c.d)}号</span></div>
      <div class="cover-body">${emblem(h, true)}<div><p class="cover-head">${esc(c.head)}</p><div>${link('h', h)}${favBtn(h)}</div>${c.sub ? `<small>ほか：${esc(c.sub)}</small>` : ''}</div></div></div>`;
  }
  function favPanel() {
    const list = [...ui.favs].map((id) => sim.heroes[id]).filter(Boolean);
    return `<div class="favpanel"><h3>★ 推しヒーロー</h3>${list.length ? `<ul class="list">${list.map((h) => `<li>${hlink(h)}${favBtn(h)}<span class="k">${h.rank ? h.rank + '位' : STATUS[h.status] || ''}</span>${statusChip(h)}</li>`).join('')}</ul>` : '<p class="mapnote">名前の横の☆を押すと推しに登録できます。推しが関わるニュースは目立つ色で流れ、大きな出来事があると画面の隅でお知らせします。</p>'}</div>`;
  }
  function approvalChart() {
    const pts = sim.apHist.concat([[lastDay(), Math.round(sim.approval * 10) / 10]]);
    const W = 420, Hh = 130, pl = 30, pr = 10, pt = 8, pb = 20;
    const days = G.daysInYear(sim.year);
    const x = (d) => pl + (d / days) * (W - pl - pr);
    const y = (v) => pt + (1 - v / 100) * (Hh - pt - pb);
    const grid = [0, 50, 100].map((v) => `<line class="gd" x1="${pl}" x2="${W - pr}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${pl - 6}" y="${y(v) + 3}" text-anchor="end">${v}%</text>`).join('');
    const ref = `<line class="ref" x1="${pl}" x2="${W - pr}" y1="${y(38)}" y2="${y(38)}"/>`;
    const months = [0, 3, 6, 9].map((m) => `<text class="ax" x="${x(Math.round((new Date(sim.year, m, 1) - new Date(sim.year, 0, 1)) / 864e5))}" y="${Hh - 5}">${m + 1}月</text>`).join('');
    const line = pts.map(([d, v]) => `${x(d).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    const last = pts[pts.length - 1];
    const dots = pts.map(([d, v]) => `<circle class="hit" cx="${x(d).toFixed(1)}" cy="${y(v).toFixed(1)}" r="6"><title>${G.fmtDate(sim.year, d)}：${Math.round(v)}%</title></circle>`).join('');
    return `<svg class="chart" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="今年のヒーロー支持率の推移">${grid}${ref}${months}<g class="s1"><polyline class="ln" points="${line}"/>${dots}<circle class="end" cx="${x(last[0])}" cy="${y(last[1])}" r="4"/><text class="lbl" x="${Math.min(x(last[0]) + 6, W - 34)}" y="${y(last[1]) - 7}">${Math.round(last[1])}%</text></g></svg>`;
  }
  function bracket(t) {
    const names = ['1回戦', '準々決勝', '準決勝', '決勝'];
    const slot = (id, win, lose) => {
      if (id === undefined) return '<div class="slot tbd">未定</div>';
      const h = sim.heroes[id];
      return `<div class="slot${win ? ' win' : ''}${lose ? ' lose' : ''}"><span class="bseed">${t.seeds.indexOf(id) + 1}</span>${emblem(h)}${link('h', h)}</div>`;
    };
    let cols = '';
    for (let r = 0; r < 4; r++) {
      const ids = t.rounds[r] || [];
      const nxt = t.rounds[r + 1];
      const n = 16 >> r;
      let ms = '';
      for (let i = 0; i < n; i += 2) {
        const a = ids[i], b = ids[i + 1], w = nxt ? nxt[i / 2] : undefined;
        const res = t.results[r] ? t.results[r][i / 2] : null;
        ms += `<div class="match"${res ? ` title="${esc(res.move)}"` : ''}>${slot(a, w !== undefined && w === a, w !== undefined && w !== a)}${slot(b, w !== undefined && w === b, w !== undefined && w !== b)}${res && res.upset ? '<span class="upset">番狂わせ</span>' : ''}</div>`;
      }
      cols += `<div class="bcol"><h5>${names[r]}</h5><div class="bms">${ms}</div></div>`;
    }
    const ch = t.champ !== null ? sim.heroes[t.champ] : null;
    cols += `<div class="bcol champcol"><h5>優勝</h5><div class="bms">${ch ? `<div class="match champ-slot">${emblem(ch, true)}${link('h', ch)}</div>` : '<div class="match"><div class="slot tbd">未定</div></div>'}</div></div>`;
    return `<div class="bracket-wrap"><div class="bracket">${cols}</div></div>`;
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
      case 'saga': return `${hlink(h)}と${link('v', sim.villains[l.v])}の因縁${l.res === '決着' ? 'に決着' : l.res === '悲劇' ? 'が悲劇で幕' : 'は未決着のまま'}（${l.bouts}戦）`;
      case 'boss': return `黒幕${link('v', sim.villains[l.v])}との決戦：${l.res === '撃破' ? `${hlink(h)}らが勝利` : l.res === '逃亡' ? '取り逃がす' : '敗北'}`;
      case 'era': return `「${esc(l.name)}」が始まる`;
      case 'tourney': return `全国大会で${hlink(h)}が優勝`;
      case 'inherit': return `${hlink(h)}が師匠${link('h', sim.heroes[l.m])}の技を継承`;
      case 'policy': return `${esc(l.kind)}（支持率${l.ap}%）`;
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
      const bad = sim.villains.filter((v) => v.kind === 'villain' && v.pref === ui.pref).sort((a, b) => b.crimes - a.crimes)[0];
      detail = `<p class="mapnote"><b>${ui.pref}</b>　事件${sim.st.pref[ui.pref] || 0}件・ヒーロー${local.length}名・逃亡中ヴィラン${vs.length}名${local[0] ? `・地元の守護者 ${hlink(local[0])}（${local[0].rank}位）` : ''}${bad && bad.crimes ? `・ご当地の悪 ${link('v', bad)}（犯行${bad.crimes}回）` : ''}</p>`;
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
    const podium = list.slice(0, 3).map((h) => `<div class="pod p${h.rank}"><div class="pod-rk">${h.rank}<small>位</small></div>${emblem(h, true)}<div class="pod-name">${link('h', h)}${favBtn(h)}</div><div class="pod-meta">${esc(h.power.name)}・${esc(shortPref(h.pref))}</div><div class="pod-sc">${num(score(h))}<span>${moveHTML(h)}</span></div>${statusChip(h)}</div>`).join('');
    $('#pane-rank').innerHTML = `<h2>ヒーローランキング<small>現役${live}名・矢印は先週比</small></h2>
      <div class="podium">${podium}</div>
      <table class="rk-table"><thead><tr><th>順位</th><th>先週比</th><th>ヒーロー</th><th>ポイント</th></tr></thead><tbody>${list.slice(3).map((h) => heroRow(h, h.rank, num(score(h)), (score(h) / top) * 100)).join('')}</tbody></table>
      ${ui.rankLimit < live ? `<button type="button" class="more" data-more="rank">さらに50名を表示</button>` : ''}`;
  }

  // ---------- 推し ----------
  function renderFav() {
    const list = [...ui.favs].map((id) => sim.heroes[id]).filter(Boolean)
      .sort((a, b) => (a.rank ?? 1e6) - (b.rank ?? 1e6));
    const pane = $('#pane-fav');
    const slist = [...ui.sfavs].map((id) => sim.students[id]).filter((s) => s && s.status !== 'hero');
    if (!list.length && !slist.length) {
      pane.innerHTML = `<h2>推しヒーロー</h2><div class="fav-empty"><p><b>まだ推しが登録されていません。</b></p><p>ランキングや名鑑、ニュースに出てくる名前の横の☆を押すと、ここに推しのヒーローが並びます。順位の動き、今年の成績、最近のニュースをまとめて追いかけられます。</p><p>学園タブの生徒も☆で推しにできます。推しの生徒がヒーローになると、自動でヒーローとしても推しに加わります。</p><div class="btnrow"><button type="button" class="btn" data-goto="rank">ランキングから選ぶ</button><button type="button" class="btn alt" data-goto="school">学園から選ぶ</button></div></div>`;
      return;
    }
    const goals = goalsFor(sim.year);
    const st = (h) => h.status === 'active' ? '<span class="st ok-st">活動中</span>' : statusChip(h);
    const cards = list.map((h) => {
      const news = h.hist.slice().reverse().map((id) => sim.news[id]).filter(Boolean).slice(0, 3);
      const goal = goals[h.id];
      const gOk = goal && h.rank !== null && h.rank <= goal.t;
      const y = h.yrec;
      return `<article class="favcard">
        <header>${emblem(h, true)}<div class="fc-title"><div>${link('h', h)}${favBtn(h)}</div><small>${h.epithet ? '「' + esc(h.epithet) + '」・' : ''}${esc(h.power.name)}・${esc(h.pref)}</small></div>
          <div class="fc-rank">${h.rank ? `<b>${h.rank}</b><small>位</small><span>${moveHTML(h)}</span>` : ''}</div></header>
        <div class="fc-stats"><div><b>${h.bestRank ?? '―'}</b><span>最高位</span></div><div><b>${y.cases}</b><span>出動</span></div><div><b>${y.captures}</b><span>検挙</span></div><div><b>${y.rescues}</b><span>救助</span></div><div><b>${num(h.fame)}</b><span>人気</span></div></div><p class="fc-note">出動・検挙・救助は${sim.year}年の数字</p>
        ${h.rank ? spark(h.rankHist.concat([[lastDay(), h.rank]])) : ''}
        ${goal ? `<div class="goal${gOk ? ' ok' : ''}"><span>今年の目標</span><b>${goalLabel(goal.t)}</b><em>${h.rank !== null ? `いま${h.rank}位` : '活動休止中'}${gOk ? '・達成圏内' : ''}</em></div>` : ''}
        <div class="fc-status">${st(h)}${h.titles.length ? `<span class="st gold">受賞${h.titles.length}回</span>` : ''}${h.team !== null ? `<span class="st">${esc(sim.teams[h.team].name)}</span>` : ''}${h.nemesis !== null ? `<span class="st bad">宿敵 ${esc(sim.villains[h.nemesis].name)}</span>` : ''}</div>
        <ul class="fc-news">${news.map((n) => `<li><span>${G.fmtDate(n.y, n.d)}</span><div>${rich(n.text)}</div></li>`).join('') || '<li><div class="mapnote">まだニュースはありません。</div></li>'}</ul>
      </article>`;
    }).join('');
    const feed = [];
    for (let i = sim.news.length - 1; i >= 0 && feed.length < 30; i--) { const n = sim.news[i]; if (n && isFavNews(n)) feed.push(n); }
    const scards = slist.map((s) => {
      const news = s.hist.slice().reverse().map((id) => sim.news[id]).filter(Boolean).slice(0, 3);
      const gr = gradeRank(s);
      const d = D.academies[s.school];
      return `<article class="favcard stu" style="--sc:${d.color}">
        <header><span class="em big sch" style="--sc:${d.color}">${esc(d.short.slice(0, 1))}</span><div class="fc-title"><div>${link('s', s)}${sfavBtn(s)}</div><small>${s.hname ? `「${esc(s.hname)}」・` : ''}${esc(d.short)}${s.status === 'enrolled' ? ` ${s.grade}年` : ''}・${esc(s.power.name)}</small></div>
          <div class="fc-rank">${gr ? `<b>${gr[0]}</b><small>/${gr[1]}</small><span>学年順位</span>` : ''}</div></header>
        <div class="fc-stats"><div><b>${s.status === "enrolled" ? Math.round(sim.studentRating(s)) : "―"}</b><span>評価</span></div><div><b>${Math.round(s.fame)}</b><span>注目度</span></div><div><b>${s.lic === 2 ? '済' : s.lic === 1 ? '仮' : '―'}</b><span>資格</span></div><div><b>${s.honors.length}</b><span>受賞</span></div><div><b>${s.tierBonus ? '済' : '―'}</b><span>覚醒</span></div></div>
        <div class="fc-status">${sStatus(s)}${s.status === 'enrolled' && s.plan ? `<span class="st${s.plan === 'hero' ? ' ok-st' : ''}">${s.plan === 'hero' ? 'ヒーロー内定' : '別の道へ'}</span>` : ''}${s.intern !== null ? `<span class="st">インターン ${esc(sim.heroes[s.intern].name)}</span>` : ''}</div>
        ${s.status !== 'enrolled' ? `<p class="fc-note" style="text-align:left">${esc(s.road || '')}</p>` : ''}
        <ul class="fc-news">${news.map((n) => `<li><span>${G.fmtDate(n.y, n.d)}</span><div>${rich(n.text)}</div></li>`).join('') || '<li><div class="mapnote">まだニュースはありません。</div></li>'}</ul>
      </article>`;
    }).join('');
    pane.innerHTML = `${list.length ? `<h2>推しヒーロー<small>${list.length}名・順位順</small></h2>
      <div class="favgrid">${cards}</div>` : ''}
      ${slist.length ? `<div class="sec"><h2>推しの生徒<small>${slist.length}名・ヒーローになると上に移ります</small></h2><div class="favgrid">${scards}</div></div>` : ''}
      <div class="sec"><h2>推しの最新ニュース<small>新しい順に30件</small></h2>
      ${feed.length ? `<ul class="hist">${feed.map((n) => `<li><span>${G.fmtDate(n.y, n.d)}</span><div>${rich(n.text)}</div></li>`).join('')}</ul>` : '<p class="empty">まだニュースはありません。</p>'}</div>`;
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
    counts.tourney = sim.tourneys.filter((x) => inYear(x.y)).length;
    counts.cover = sim.covers.filter((c) => inYear(c.y)).length;
    counts.chronicle = sim.chronicles.length;
    counts.records = Object.values(sim.records).filter((r) => r.id !== null).length;
    $('#recTypes').innerHTML = REC_GROUPS.map(([g, items]) => `<div class="recgroup"><span class="recg">${g}</span>${items.map(([t, l]) => `<button type="button" data-rec="${t}" aria-pressed="${ui.recType === t}">${l}<b>${counts[t] || 0}</b></button>`).join('')}</div>`).join('');
    const t = ui.recType;
    const body = $('#recBody');
    if (t === 'chronicle') {
      const startDecade = sim.startYear + sim.chronicles.length * 10;
      const live = sim.buildChronicle(startDecade, sim.year);
      body.innerHTML = `<section class="chron live"><h3>${startDecade}年〜（進行中の10年）</h3>${chronicleHTML(live)}</section>` + sim.chronicles.slice().reverse().map((c) => `<section class="chron"><h3>${c.from}〜${c.to}年の年代記</h3>${chronicleHTML(c)}</section>`).join('');
      return;
    }
    if (t === 'tourney') {
      const list = sim.tourneys.filter((x) => inYear(x.y)).slice().reverse();
      body.innerHTML = list.length ? list.map((x) => `<section class="awyear"><h3>第${x.no}回（${x.y}年）${x.champ !== null ? '　優勝 ' + hlink(sim.heroes[x.champ]) : '　開催中'}</h3>${bracket(x)}</section>`).join('') : '<p class="empty">全国大会は毎年10月に開かれます。</p>';
      return;
    }
    if (t === 'cover') {
      const list = sim.covers.filter((c) => inYear(c.y)).slice().reverse().slice(0, ui.recLimit);
      const cnt = {};
      for (const c of sim.covers) cnt[c.h] = (cnt[c.h] || 0) + 1;
      body.innerHTML = list.length ? `<div class="tablewrap"><table class="rec"><thead><tr><th>号</th><th>表紙</th><th>見出し</th><th>通算</th></tr></thead><tbody>${list.map((c) => `<tr><td class="dt">Vol.${c.vol}<br>${G.fmtDate(c.y, c.d)}</td><td>${hlink(sim.heroes[c.h])}</td><td>${esc(c.head)}</td><td class="nu">${cnt[c.h]}回</td></tr>`).join('')}</tbody></table></div>` : '<p class="empty">週刊ヒーローは毎週月曜日に発売されます。</p>';
      return;
    }
    if (t === 'records') {
      body.innerHTML = `<table class="rec"><thead><tr><th>記録</th><th>保持者</th><th>記録</th><th>樹立</th></tr></thead><tbody>${Object.entries(D.records).map(([k, d]) => { const r = sim.records[k]; return `<tr><td>${esc(d.label)}</td><td>${r.id !== null ? hlink(sim.heroes[r.id]) : '―'}</td><td class="nu">${r.v}${d.unit}</td><td class="dt">${r.y ?? '―'}年</td></tr>`; }).join('')}</tbody></table><p class="mapnote">記録が一定の水準を超えてから塗り替えられると、【新記録】のニュースになります。</p>`;
      return;
    }
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
      comeback: ['日付', 'ヒーロー', '引退期間', '引退中の暮らし', '現在の順位', (l) => `${date(l)}<td>${H(l.h)}</td><td class="nu">${l.years}年</td><td>${esc(l.after || '―')}</td><td class="nu">${sim.heroes[l.h].rank ? sim.heroes[l.h].rank + '位' : '―'}</td>`],
      after: ['日付', '元ヒーロー', '近況', '現役時代の最高順位', '', (l) => `${date(l)}<td>${H(l.h)}</td><td>${esc(l.after)}</td><td class="nu">${sim.heroes[l.h].bestRank ?? '―'}位</td><td></td>`],
      record: ['日付', 'ヒーロー', '記録', '数値', 'それまでの保持者', (l) => `${date(l)}<td>${H(l.h)}</td><td>${esc(D.records[l.key].label)}</td><td class="nu">${l.val}${D.records[l.key].unit}</td><td>${l.prev !== null ? H(l.prev) : '―'}</td>`],
      mentor: ['日付', '弟子', '師匠', '出来事', '', (l) => `${date(l)}<td>${H(l.h)}</td><td>${H(l.m)}</td><td>${l.kind === '和解' ? '<span class="ok">和解</span>' : '<span class="ng">衝突</span>'}</td><td></td>`],
      serial: ['日付', '事件名', '犯人', '担当ヒーロー', '結末', (l) => `${date(l)}<td>『${esc(l.title)}』</td><td>${Vv(l.v)}</td><td>${H(l.h)}</td><td>${l.res === '解決' ? '<span class="ok">解決</span>' : `<span class="ng">${esc(l.res)}</span>`}</td>`],
      vally: ['日付', 'ヴィラン', '宿敵のヒーロー', '', '', (l) => `${date(l)}<td>${Vv(l.v)}</td><td>${H(l.h)}</td><td></td><td></td>`],
      world: ['年', '日本代表', '順位', '', '', (l) => `<td class="dt">${l.y}年</td><td>${H(l.h)}</td><td class="nu">${l.place === 1 ? '<span class="ok">優勝</span>' : l.place + '位'}</td><td></td><td></td>`],
      foreign: ['日付', 'ヴィラン', '出身国', '現在', '', (l) => `${date(l)}<td>${Vv(l.v)}</td><td>${esc(l.c)}</td><td>${VSTATUS[sim.villains[l.v].status] || ''}</td><td></td>`],
      marry: ['日付', 'ヒーロー', 'お相手', '', '', (l) => `${date(l)}<td>${H(l.h)}</td><td>${H(l.h2)}</td><td></td><td></td>`],
      inherit: ['日付', '弟子', '師匠', '師匠の状態', '改名', (l) => `${date(l)}<td>${H(l.h)}</td><td>${H(l.m)}</td><td>${STATUS[sim.heroes[l.m].status] || '現役'}</td><td>${l.renamed ? '二代目を襲名' : '―'}</td>`],
      milestone: ['日付', 'ヒーロー', '節目', '', '', (l) => `${date(l)}<td>${H(l.h)}</td><td>${MS_LABEL[l.key.replace(/\d+$/, '')] || MS_LABEL[l.key] || ''}${l.key === 'top1' || l.key === 'cap1' ? '' : ' ' + l.num + (l.key.startsWith('career') || l.key.startsWith('streak') ? '年' : l.key.startsWith('cap') ? '人' : '件')}</td><td></td><td></td>`],
      saga: ['日付', 'ヒーロー', '宿敵', '結末', '戦績', (l) => `${date(l)}<td>${H(l.h)}</td><td>${Vv(l.v)}</td><td>${l.res === '決着' ? '<span class="ok">決着</span>' : l.res === '悲劇' ? '<span class="ng">殉職</span>' : '未決着'}</td><td class="nu">${l.since}年〜・${l.bouts}戦${l.w}勝${l.l}敗</td>`],
      boss: ['日付', '黒幕', '結果', '最後の一撃', '参戦', (l) => `${date(l)}<td>${Vv(l.v)}</td><td>${l.res === '撃破' ? '<span class="ok">撃破</span>' : `<span class="ng">${esc(l.res)}</span>`}</td><td>${H(l.h)}</td><td class="nu">${l.heroes.length}名</td>`],
      era: ['年', '新しい時代', 'それまで', '', '', (l) => `<td class="dt">${l.y}年</td><td><b>${esc(l.name)}</b></td><td>${esc(l.prev)}</td><td></td><td></td>`],
      policy: ['日付', '出来事', '支持率', '', '', (l) => `${date(l)}<td>${esc(l.kind)}</td><td class="nu">${l.ap}%</td><td></td><td></td>`],
      grad: ['卒業', '生徒', '学校', '進路', '現在', (l) => { const st = sim.students[l.s]; const hh = l.h !== null ? sim.heroes[l.h] : null; return `<td class="dt">${l.y}年</td><td>${slinkFull(st)}</td><td>${esc(D.academies[l.sc].short)}</td><td>${hh ? '<span class="ok">ヒーロー</span>' : esc(l.career || st.road || '')}</td><td>${hh ? `${hlink(hh)}${hh.rank ? ` ${hh.rank}位` : statusChip(hh)}` : st.status === 'villain' ? `<span class="ng">ヴィラン</span> ${link('v', sim.villains[st.villainId])}` : st.status === 'hero' ? hlink(sim.heroes[st.heroId]) : ''}</td>`; }],
      school: ['日付', '出来事', '生徒・人物', '学校', '結果', (l) => `${date(l)}<td>${esc(l.kind)}</td><td>${l.s !== undefined ? slinkFull(sim.students[l.s]) : l.h !== undefined ? H(l.h) : '―'}</td><td>${esc(D.academies[l.sc].short)}</td><td>${l.res ? esc(l.res) : l.g ? `${l.g}年の部` : ''}</td>`],
      agency: ['日付', '出来事', '事務所', '関係者', '', (l) => `${date(l)}<td>${esc(l.kind)}</td><td>${esc(l.a)}${l.from && Array.isArray(l.from) ? '<br><small>' + l.from.map(esc).join('＋') + '</small>' : l.from ? '<br><small>移籍元 ' + esc(l.from) + '</small>' : ''}</td><td>${l.h !== undefined ? H(l.h) : '―'}</td><td></td>`],
    }[t];
    const head = cols.slice(0, 5).map((c) => `<th>${c}</th>`).join('');
    const shown = rows.slice(0, ui.recLimit);
    const withNews = ['scandal', 'death', 'saga', 'boss', 'policy', 'serial', 'vally', 'record', 'school'].includes(t);
    body.innerHTML = `<div class="tablewrap"><table class="rec"><thead><tr>${head}</tr></thead><tbody>${shown.map((l) => `<tr>${cols[5](l)}</tr>${withNews ? `<tr class="sub"><td></td><td colspan="4">${newsLine(l)}</td></tr>` : ''}`).join('')}</tbody></table></div>
      ${rows.length > shown.length ? `<button type="button" class="more" data-more="rec">さらに表示（残り${rows.length - shown.length}件）</button>` : ''}`;
  }

  function chronicleHTML(c) {
    const H = (id) => hlink(sim.heroes[id]);
    const k = (v, l) => `<div class="kpi"><b>${v}</b><span>${l}</span></div>`;
    const sec = (title, body) => (body ? `<h4>${title}</h4>${body}` : '');
    return `<div class="kpis">${k(num(c.totals.inc), '事件')}${k(num(c.totals.captures), '検挙')}${k(c.totals.kaiju, '怪獣撃破')}${k(c.totals.scandals, 'スキャンダル')}${k(c.totals.deaths, '殉職')}</div>
      ${c.champs.length ? `<p class="bio">この期間で最も多く頂点に立ったのは${H(c.dynasty.id)}（年間1位${c.dynasty.n}回）。</p>` : '<p class="mapnote">まだ年間表彰は行われていません。</p>'}
      ${sec('歴代の年間1位', c.champs.length ? `<ul class="list">${c.champs.map((x) => `<li><span class="k">${x.y}年</span>${H(x.id)}${x.mvp !== undefined && x.mvp !== x.id ? `<small class="mapnote">MVP ${link('h', sim.heroes[x.mvp])}</small>` : ''}</li>`).join('')}</ul>` : '')}
      ${sec('時代の移り変わり', c.eras.length ? `<ul class="list">${c.eras.map((l) => `<li><span class="k">${l.y}年</span>${esc(l.name)}</li>`).join('')}</ul>` : '')}
      ${sec('黒幕との戦い', c.bosses.length ? `<ul class="list">${c.bosses.map((l) => `<li><span class="k">${l.y}年</span>${logSummary(l)}</li>`).join('')}</ul>` : '')}
      ${sec('決着した因縁', c.sagas.length ? `<ul class="list">${c.sagas.map((l) => `<li><span class="k">${l.y}年</span>${logSummary(l)}</li>`).join('')}</ul>` : '')}
      ${sec('全国大会の優勝者', c.tourneys.length ? `<ul class="list">${c.tourneys.map((x) => `<li><span class="k">${x.y}年</span>${H(x.id)}</li>`).join('')}</ul>` : '')}
      ${sec('殿堂入り', c.hof.length ? `<p class="bio">${c.hof.map(H).join('　')}</p>` : '')}
      ${sec('殉職したヒーロー', c.deaths.length ? `<p class="bio">${c.deaths.map(H).join('　')}</p>` : '')}
      ${sec('闇に堕ちたヒーロー', c.falls.length ? `<p class="bio">${c.falls.map(H).join('　')}</p>` : '')}
      ${c.scandalKing ? `<h4>最もスキャンダルの多かったヒーロー</h4><p class="bio">${H(c.scandalKing.id)}（${c.scandalKing.n}件）</p>` : ''}`;
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
      ? `<table class="rk-table"><thead><tr><th>順位</th><th>先週比</th><th>ヒーロー</th><th>${{ fame: '人気', captures: '検挙', scandals: '炎上', age: '年齢' }[sort] || 'ポイント'}</th></tr></thead><tbody>${shown.map((h) => heroRow(h, h.rank ?? '–', right(h))).join('')}</tbody></table>
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
      ? `<table class="rk-table"><thead><tr><th>危険度</th><th>状態</th><th>ヴィラン</th><th>悪名</th></tr></thead><tbody>${shown.map((v) => `<tr><td class="rk"><span class="threat t${v.threat}">${v.threat}</span></td><td class="mv">${esc(VSTATUS[v.status] || '')}</td><td class="who">${link('v', v)}<small>${esc(v.power.name)}${v.org !== null ? '・' + esc(sim.orgs[v.org].name) + (v.orgRank === 'boss' ? '首領' : v.orgRank === 'exec' ? '幹部' : '') : ''}${v.nemesis !== null ? '・宿敵 ' + esc(sim.heroes[v.nemesis].name) : ''}</small></td><td class="sc">${v.kind === 'kaiju' ? '' : '悪名' + v.notoriety}</td></tr>`).join('')}</tbody></table>
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
    const ags = sim.agencyStats();
    const topP = ags.length ? ags[0].power : 1;
    const agMove = (a) => (a.prevRank === null || a.prevRank === undefined ? '<span class="new">NEW</span>' : a.prevRank > a.rank ? `<span class="up">▲${a.prevRank - a.rank}</span>` : a.prevRank < a.rank ? `<span class="down">▼${a.rank - a.prevRank}</span>` : '<span class="same">―</span>');
    const agLog = sim.log.filter((l) => l.t === 'agency').slice(-5).reverse();
    $('#pane-org').innerHTML = `<h2>事務所の勢力ランキング<small>所属ヒーローのポイント合計・矢印は前月比</small></h2>
      <table class="rk-table"><thead><tr><th>順位</th><th>前月比</th><th>事務所</th><th>勢力</th></tr></thead><tbody>${ags.slice(0, 15).map((a) => `<tr><td class="rk">${a.rank}</td><td class="mv">${agMove(a)}</td><td class="who"><b>${esc(a.name)}</b><span class="st">${esc(a.type)}</span>${a.founder !== undefined ? `<span class="st gold">${esc(sim.heroes[a.founder].name)}が設立</span>` : ''}<small>${a.region || '全国'}・所属${a.members}名</small><i class="bar"><b style="width:${(a.power / topP) * 100}%"></b></i></td><td class="sc">${num(a.power)}</td></tr>`).join('')}</tbody></table>
      ${agLog.length ? `<ul class="list ag-log">${agLog.map((l) => `<li><span class="k">${l.y}年${monthDay(l)}</span>${esc(l.kind)}：${esc(l.a)}${l.h !== undefined ? '（' + link('h', sim.heroes[l.h]) + '）' : ''}</li>`).join('')}</ul>` : ''}
      <div class="sec"><h2>活動中のヴィラン組織<small>${act.length}組織・捜査進捗が100に達すると一斉摘発</small></h2>
      <div class="cards">${act.map(orgCard).join('') || '<p class="empty">現在、活動中の組織はありません。</p>'}</div></div>
      <div class="sec"><h2>ヒーローチーム<small>${teams.length}チーム</small></h2>
      <ul class="list">${teams.map((t) => `<li><span class="k">${link('t', t)}</span><span>${t.members.map((id) => link('h', sim.heroes[id])).join('、')}</span></li>`).join('')}</ul></div>
      ${gone.length ? `<div class="sec"><h2>壊滅した組織<small>${gone.length}組織</small></h2><ul class="list">${gone.slice().reverse().map((o) => `<li><span class="k">${link('o', o)}</span><span>${o.destroyedYear}年に壊滅</span></li>`).join('')}</ul></div>` : ''}`;
  }

  // ---------- 学園 ----------
  const SCAL = [[1, 20, 'ヒーロー資格試験'], [2, 10, '進路決定'], [3, 1, '卒業式'], [4, 1, '卒業生のデビュー'], [4, 8, '入学式'], [4, 22, '能力測定'], [6, 3, 'ヒーロー名発表会'], [6, 21, '全国高校ヒーロー体育祭'], [7, 17, '期末実技試験'], [8, 4, '林間合宿'], [9, 1, 'インターン開始'], [10, 26, '学園祭'], [11, 15, '仮免許試験']];
  const SSTATUS = { enrolled: '在学中', hero: 'ヒーロー', other: '別の道へ', dropped: '退学', villain: 'ヴィラン' };
  function nextSchoolEvent() {
    const dt = G.dateOf(sim.year, lastDay());
    const m = dt.getMonth() + 1, d = dt.getDate();
    const ev = SCAL.find(([mm, dd]) => mm > m || (mm === m && dd > d)) || SCAL[0];
    return `${ev[0]}月${ev[1]}日　${ev[2]}`;
  }
  const scShort = (s) => D.academies[s.school].short;
  function gradeRank(s) {
    if (s.status !== 'enrolled') return null;
    const list = sim.enrolled(s.school, s.grade).sort((a, b) => sim.studentRating(b) - sim.studentRating(a));
    return [list.indexOf(s) + 1, list.length];
  }
  function slinkFull(s) {
    if (!s) return '―';
    return `<span class="hl"><span class="em sch" style="--sc:${D.academies[s.school].color}">${esc(scShort(s).slice(0, 1))}</span>${link('s', s)}</span>`;
  }
  function sStatus(s) {
    let x = '';
    if (s.status === 'enrolled') {
      if (s.kidnapped) x += '<span class="st bad">行方不明</span>';
      else if (s.hurt > 0) x += '<span class="st bad">負傷</span>';
      if (s.lic === 2) x += '<span class="st ok-st">資格</span>'; else if (s.lic === 1) x += '<span class="st">仮免</span>';
      if (s.tierBonus) x += '<span class="st gold">覚醒</span>';
    } else x += `<span class="st${s.status === 'hero' ? ' ok-st' : s.status === 'villain' ? ' bad' : ''}">${SSTATUS[s.status]}</span>`;
    return x;
  }
  function schoolCard() {
    if (!sim.academy) return '';
    const items = [];
    for (let i = sim.news.length - 1; i >= 0 && items.length < 4; i--) { const n = sim.news[i]; if (n && n.cat === 'school') items.push(n); }
    return `<figure class="fig"><figcaption><span>学園だより</span><button type="button" class="linkbtn" data-goto="school">学園を見る</button></figcaption>
      <p class="mapnote">次の行事：<b>${nextSchoolEvent()}</b></p>
      ${items.length ? `<ul class="hist">${items.map((n) => `<li><span>${G.fmtDate(n.y, n.d)}</span><div>${rich(n.text)}</div></li>`).join('')}</ul>` : '<p class="empty">まだ学園のニュースはありません。</p>'}</figure>`;
  }
  function studentRow(s, i) {
    const d = D.academies[s.school];
    const r = sim.studentRating(s);
    const top = Math.max(...sim.enrolled(s.school).map(sim.studentRating), 1);
    const right = s.status === 'enrolled' ? `<b class="sscore">${Math.round(r)}</b>` : '';
    let sub = `${esc(s.power.name)}・${esc(s.pref)}出身`;
    if (s.hname) sub = `「${esc(s.hname)}」・` + sub;
    let after = '';
    if (s.status === 'hero') { const h = sim.heroes[s.heroId]; after = `<small class="sto">→ ヒーロー ${link('h', h)}${h.rank ? `（${h.rank}位）` : statusChip(h)}</small>`; }
    else if (s.status === 'villain') after = `<small class="sto">→ ヴィラン ${link('v', sim.villains[s.villainId])}</small>`;
    else if (s.status === 'other' || s.status === 'dropped') after = `<small class="sto">→ ${esc(s.road)}</small>`;
    else if (s.intern !== null && sim.month >= 8 && sim.month <= 10) after = `<small class="sto">インターン先 ${link('h', sim.heroes[s.intern])}</small>`;
    return `<tr><td class="rk">${s.status === 'enrolled' ? i + 1 : `<small>${s.gradYear ?? ''}</small>`}</td><td class="who"><div>${link('s', s)}${sfavBtn(s)}${sStatus(s)}<small>${sub}</small>${after}${s.status === 'enrolled' ? `<i class="bar"><b style="width:${Math.min(100, (r / top) * 100)}%;background:${d.color}"></b></i>` : ''}</div></td><td class="sc">${right}</td></tr>`;
  }
  function renderSchool() {
    const ac = sim.academy;
    const cur = ac.schools[ui.school] ? ui.school : 0;
    const d = D.academies[cur], sc = ac.schools[cur];
    const tabs = ac.schools.map((x) => {
      const dd = D.academies[x.id];
      const n = sim.enrolled(x.id).length;
      return `<button type="button" class="schtab" data-school="${x.id}" aria-pressed="${x.id === cur}" style="--sc:${dd.color}"><b>${esc(dd.short)}</b><small>${esc(dd.pref)}・在校${n}名</small></button>`;
    }).join('');
    const teachers = sc.teachers.map((id) => sim.heroes[id]).filter((h) => h.status === 'retired');
    const g = ui.sgrade;
    let list;
    if (g === 'ob') list = sim.students.filter((s) => s.school === cur && s.status !== 'enrolled').sort((a, b) => (b.gradYear || 0) - (a.gradYear || 0) || (a.status === 'hero' ? -1 : 1));
    else list = sim.enrolled(cur, g).sort((a, b) => sim.studentRating(b) - sim.studentRating(a));
    const shown = list.slice(0, ui.obLimit || 80);
    const heroes = sim.students.filter((s) => s.school === cur && s.status === 'hero').map((s) => sim.heroes[s.heroId]).filter((h) => h.rank !== null).sort((a, b) => a.rank - b.rank);
    const counts = [1, 2, 3].map((k) => sim.enrolled(cur, k).length);
    $('#pane-school').innerHTML = `<h2>ヒーロー養成校<small>次の行事 ${nextSchoolEvent()}</small></h2>
      <div class="schtabs" role="group" aria-label="学校を選ぶ">${tabs}</div>
      <section class="schhead" style="--sc:${d.color}">
        <div><h3>${esc(d.name)}</h3><p>${esc(d.desc)}</p><p class="motto">校訓「${esc(d.motto)}」</p></div>
        <div class="kpis sm"><div class="kpi"><b>${counts[0] + counts[1] + counts[2]}</b><span>在校生</span></div><div class="kpi"><b>${sc.heroes}</b><span>ヒーロー輩出</span></div><div class="kpi"><b>${sc.grads ? Math.round((sc.heroes / sc.grads) * 100) + '%' : '―'}</b><span>ヒーローになった割合</span></div><div class="kpi"><b>${sc.cups}</b><span>体育祭の優勝</span></div></div>
        <p class="mapnote">教員：${teachers.map((h) => link('h', h)).join('、') || 'なし'}${heroes.length ? `　／　活躍中の卒業生：${heroes.slice(0, 3).map((h) => `${link('h', h)}（${h.rank}位）`).join('、')}` : ''}</p>
      </section>
      <div class="tools"><div class="seg" role="group" aria-label="学年">${[[1, '1年'], [2, '2年'], [3, '3年'], ['ob', '卒業生']].map(([k, l]) => `<button type="button" data-sgrade="${k}" aria-pressed="${g === k}">${l}<b>${k === 'ob' ? sim.students.filter((s) => s.school === cur && s.status !== 'enrolled').length : counts[k - 1]}</b></button>`).join('')}</div></div>
      ${g !== 'ob' ? '<p class="mapnote">右の数字は校内の評価（能力値と、行事・試験での実績）。☆で推しに登録すると、ヒーローになったあとも追いかけられます。</p>' : ''}
      ${shown.length ? `<table class="rk-table srk"><tbody>${shown.map(studentRow).join('')}</tbody></table>` : '<p class="empty">まだいません。</p>'}
      ${list.length > shown.length ? `<button type="button" class="more" data-more="ob">さらに表示（残り${list.length - shown.length}名）</button>` : ''}`;
  }
  function showStudent(s) {
    const d = D.academies[s.school];
    const dl = (rows) => `<dl class="dl">${rows.filter((x) => x[1] !== undefined && x[1] !== null && x[1] !== '').map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl>`;
    const st = {}; for (const k of Object.keys(s.stats)) st[k] = Math.round(s.stats[k]);
    const gr = gradeRank(s);
    const rel = [];
    if (s.taught) rel.push(['担任', `${esc(s.teacherName || '')}先生（あなた）${s.status === 'enrolled' && sim.isMine(s) ? `　やる気${Math.round(s.mood)}・信頼${Math.round(s.trust)}` : ''}`]);
    if (s.friend !== null) rel.push(['親友', slinkFull(sim.students[s.friend])]);
    if (s.rival !== null) rel.push(['ライバル', slinkFull(sim.students[s.rival])]);
    if (s.partner !== null) rel.push(['恋人', slinkFull(sim.students[s.partner])]);
    else if (s.crush !== null) rel.push(['気になる人', slinkFull(sim.students[s.crush])]);
    if (s.internHist.length) rel.push(['インターン先', s.internHist.map((id) => link('h', sim.heroes[id])).join('、')]);
    const teachers = sim.academy.schools[s.school].teachers.map((id) => sim.heroes[id]).filter((h) => h.status === 'retired');
    if (teachers.length && s.status === 'enrolled') rel.push(['先生', teachers.map((h) => link('h', h)).join('、')]);
    let path = '';
    if (s.status === 'hero') { const h = sim.heroes[s.heroId]; path = `<p class="bio"><b>ヒーロー「${link('h', h)}」</b>として活動中（${h.debutYear}年デビュー${h.rank ? `・現在${h.rank}位` : ''}）。${favBtn(h)}</p>`; }
    else if (s.status === 'villain') path = `<p class="bio">卒業後、ヴィラン${link('v', sim.villains[s.villainId])}として活動を始めた。</p>`;
    else if (s.status === 'other' || s.status === 'dropped') path = `<p class="bio">${s.why ? esc(s.why) : ''}${esc(s.road)}。</p>`;
    else if (s.plan) path = `<p class="bio">${s.plan === 'hero' ? '春からプロヒーローとして事務所に入ることが決まっている。' : esc((s.why || '') + s.road) + '。'}</p>`;
    else path = `<p class="bio">夢は「${esc(s.dream)}」。${s.grade === 3 ? '1月のヒーロー資格試験に向けて準備中。' : ''}</p>`;
    const life = s.ev.slice().reverse();
    openModal(`
      <div class="pf-head"><span class="em big sch" style="--sc:${d.color}">${esc(d.short.slice(0, 1))}</span><div class="pf-title"><h2 id="modalTitle">${esc(s.real)}</h2><p class="pf-epi">${s.hname ? `ヒーロー名「${esc(s.hname)}」` : 'ヒーロー名はまだ決まっていない'}<span>${esc(d.name)}${s.status === 'enrolled' ? `　${s.grade}年生` : `　${s.gradYear ?? ''}年${s.status === 'dropped' ? '退学' : '卒業'}`}</span></p></div>${gr ? `<span class="rkbig">${gr[0]}<small>/${gr[1]}</small></span>` : ''}${sfavBtn(s)}${sStatus(s)}</div>
      ${s.honors.length ? `<div class="titles">${s.honors.map((t) => `<span>${t.y} ${esc(t.t)}</span>`).join('')}</div>` : ''}
      <div class="pf-cards">
        <section class="pcard"><h4>基本データ</h4>${dl([
          ['性別', esc(s.gender)], ['年齢', s.age + '歳'], ['誕生日', `${s.birthday[0]}月${s.birthday[1]}日`], ['身長', s.height + 'cm'], ['出身', esc(s.pref + s.city)],
          ['学年', s.status === 'enrolled' ? `${s.grade}年（${s.entry}年入学）` : `${s.entry}年入学`], ['部活', esc(s.club)], ['好物', esc(s.food)], ['見た目', esc(s.look)], ['夢', esc(s.dream)],
        ])}</section>
        <section class="pcard"><h4>能力</h4>
          <div class="power"><b>${esc(s.power.name)}</b><span class="stars" title="能力の格">${stars(s.power.tier + s.tierBonus)}</span><p>${esc(s.power.desc)}（${esc(D.elemLabel[s.power.el] || '')}系）</p></div>
          ${dl([['目覚め', esc(s.awaken)]])}
          ${radar(st)}
        </section>
        <section class="pcard"><h4>成績</h4>
          <div class="recs"><div><b>${gr ? gr[0] + '位' : '―'}</b><span>学年順位</span></div><div><b>${s.status === "enrolled" ? Math.round(sim.studentRating(s)) : "―"}</b><span>校内評価</span></div><div><b>${Math.round(s.fame)}</b><span>注目度</span></div><div><b>${s.lic === 2 ? '取得' : s.lic === 1 ? '仮免' : '―'}</b><span>資格</span></div></div>
          <div class="traits">${s.traits.map((t) => `<span>${esc(t)}</span>`).join('')}</div>
          <h5>ヒーローを目指したわけ</h5><p class="bio">${esc(s.motive)}ヒーローを志した。</p>
        </section>
        <section class="pcard"><h4>進路</h4>${path}</section>
        ${rel.length ? `<section class="pcard"><h4>人間関係</h4>${dl(rel)}</section>` : ''}
        <section class="pcard"><h4>語録</h4>${quoteList(s)}</section>
        <section class="pcard wide"><h4>学園年表</h4>${life.length ? `<ol class="life">${s.ev.map((e) => `<li><span class="ly">${e.y}</span><b>${esc(e.t)}</b><span>${esc(e.x)}</span></li>`).join('')}</ol>` : '<p class="mapnote">まだ記録はありません。</p>'}</section>
      </div>
      <h4 class="sect">学園でのできごと</h4>${histList(s)}`);
  }

  // ---------- 担任（教師モード） ----------
  const meter = (v, cls) => `<i class="tbar ${cls}"><b style="width:${Math.round(v)}%"></b></i>`;
  function renderTeach() {
    const pane = $('#pane-teach');
    const t = sim.teacher;
    if (!t) {
      const rnd = localRng(sim.seed + ':teacher');
      const nm = D.teacherNames[Math.floor(rnd() * D.teacherNames.length)];
      pane.innerHTML = `<h2>担任になる<small>教師モード</small></h2>
        <div class="fav-empty teach-intro">
          <p><b>養成校の教師として着任し、クラスの担任になれます。</b></p>
          <p>世界はこれまでどおり自動で進みます。そのうえで、1週間の時間割を組み、指導ポイントで個別指導や面談をし、生徒の相談に答え、期末試験の作戦を立て、学級予算で設備をそろえます。生徒のやる気・疲労・信頼・適性・能力熟練度が、成長や試験、進路を左右します。</p>
          <p>3年間受け持った生徒が卒業すると、新しい1年生の担任になります。評判が上がると学年主任・教頭・校長へと昇進します。</p>
          <div class="field col"><label>名前<input id="tName" type="text" value="${esc(nm)}"></label>
          <label>学校<select id="tSchool">${D.academies.map((d, i) => `<option value="${i}">${esc(d.name)}（${esc(d.pref)}）</option>`).join('')}</select></label></div>
          <p class="mapnote">その学校の1年生の担任になります。この世界（スロット${ui.slot}）だけに反映されます。</p>
          <button type="button" class="btn" id="teachStart">着任する</button>
        </div>`;
      return;
    }
    sim.ensureTeacher();
    const d = D.academies[t.school];
    const g = sim.myGrade();
    const sub = ui.tsub || 'class';
    const SUBS = [['class', 'クラス'], ['tt', '時間割'], ['event', '行事と試験'], ['shop', '予算と設備'], ['me', '教師'], ['log', '日誌']];
    const apPips = Array.from({ length: sim.apMax() }, (_, i) => `<i class="${i < t.ap ? 'on' : ''}"></i>`).join('');
    const pend = t.pending.map((c) => consultHTML(c)).join('');
    let body = '';
    if (sub === 'class') body = teachClass(t);
    if (sub === 'tt') body = teachTT(t);
    if (sub === 'event') body = teachEvent(t);
    if (sub === 'shop') body = teachShop(t);
    if (sub === 'me') body = teachMe(t);
    if (sub === 'log') body = `<ul class="hist">${t.log.slice(-80).reverse().map((l) => `<li><span>${G.fmtDate(l.y, l.d)}</span><div>${rich(l.t).replace(/\n/g, '<br>')}</div></li>`).join('') || '<li><div class="mapnote">まだ記録はありません。</div></li>'}</ul>`;
    pane.innerHTML = `<h2>${esc(t.name)}先生<small>${esc(d.short)}・${esc(sim.posLabel())}・${g ? `${g}年生の担任` : '新しいクラスを待っています'}</small></h2>
      <section class="schhead tdash" style="--sc:${d.color}">
        <div class="kpis sm"><div class="kpi"><b>${Math.round(t.rep)}</b><span>評判・${esc(sim.teacherTitle())}</span></div><div class="kpi"><b>${Math.round(t.unity)}</b><span>クラスの団結</span></div><div class="kpi"><b>${t.budget}<small>万</small></b><span>学級予算</span></div><div class="kpi"><b>Lv${t.lv}</b><span>教師レベル${t.sp ? `・技能pt ${t.sp}` : ''}</span></div></div>
        <div class="ap"><span>指導ポイント</span><span class="pips">${apPips}</span><small>毎週月曜に2回復。個別指導・面談・ほめる・休ませるに1ずつ使います。</small></div>
      </section>
      ${ui.teachMsg ? `<p class="tmsg">${rich(ui.teachMsg).replace(/\n/g, '<br>')}</p>` : ''}
      ${pend ? `<h3 class="sub">生徒からの相談<small>3週間答えないと、生徒が自分で決めます</small></h3>${pend}` : ''}
      <div class="seg tsubs" role="group" aria-label="担任の画面">${SUBS.map(([k, l]) => `<button type="button" data-tsub="${k}" aria-pressed="${sub === k}">${l}</button>`).join('')}</div>
      ${body}`;
  }
  const aptMark = (v) => (v >= 1.2 ? '◎' : v >= 1.0 ? '○' : v >= 0.85 ? '△' : '×');
  function teachClass(t) {
    const cls = sim.myClass().sort((a, b) => sim.studentRating(b) - sim.studentRating(a));
    const dis = t.ap < 1 ? ' disabled' : '';
    const row = (s, i) => {
      sim.prepStudent(s);
      const apt = s.aptKnown ? `戦${aptMark(s.apt.f)} 救${aptMark(s.apt.r)} 捜${aptMark(s.apt.i)}` : '適性 ？（面談2回か10週で判明）';
      return `<tr><td class="rk">${i + 1}</td><td class="who"><div>${link('s', s)}${sfavBtn(s)}${sStatus(s)}${s.plan ? `<span class="st${s.plan === 'hero' ? ' ok-st' : ''}">${s.plan === 'hero' ? 'ヒーロー内定' : '別の道へ'}</span>` : ''}${s.recommend ? '<span class="st gold">推薦状</span>' : ''}<span class="bondh" title="絆">${'♥'.repeat(s.bond)}${'♡'.repeat(3 - s.bond)}</span>
        <small>${s.hname ? `「${esc(s.hname)}」・` : ''}${esc(s.power.name)}・評価 ${Math.round(sim.studentRating(s))}・${apt}${s.move ? `・必殺技「${esc(s.move)}」` : ''}</small>
        <div class="tmeters"><span>やる気</span>${meter(s.mood, 'mood')}<span>信頼</span>${meter(s.trust, 'trust')}<span>疲労</span>${meter(s.fat, 'fat')}<span>熟練</span>${meter(s.prof, 'prof')}</div>
        <div class="tacts"><span>指導</span><button type="button" data-tact="teach:${s.id}:f"${dis}>戦闘</button><button type="button" data-tact="teach:${s.id}:r"${dis}>救助</button><button type="button" data-tact="teach:${s.id}:i"${dis}>捜査</button><button type="button" data-tact="teach:${s.id}:q"${dis}>能力</button><button type="button" data-tact="talk:${s.id}"${dis}>面談</button><button type="button" data-tact="praise:${s.id}"${dis}>ほめる</button><button type="button" data-tact="rest:${s.id}"${dis}>休ませる</button>${t.items ? `<button type="button" data-tact="item:${s.id}">アイテム</button>` : ''}</div></div></td></tr>`;
    };
    const tired = cls.filter((s) => s.fat > 70).length;
    return `${tired ? `<p class="mapnote warnline">疲労が70を超えている生徒が${tired}名います。疲労が80を超えるとけがをしやすく、伸びも半分になります。</p>` : ''}
      <p class="mapnote">熟練度が50で必殺技を編み出し、100で能力が覚醒します。信頼が50・70・90に届くと、その生徒との特別な話（絆）が起こります。</p>
      ${cls.length ? `<table class="rk-table srk trk"><tbody>${cls.map(row).join('')}</tbody></table>` : '<p class="empty">4月の入学式のあと、新しい1年生の担任になります。</p>'}`;
  }
  function teachTT(t) {
    const L = D.lessons;
    const cell = (i) => `<td><select data-slot="${i}" aria-label="${D.days[i >> 1]}曜${i % 2 ? '午後' : '午前'}">${Object.entries(L).map(([k, v]) => `<option value="${k}"${t.tt[i] === k ? ' selected' : ''}>${v.label}</option>`).join('')}</select></td>`;
    // 1週間の見込み
    const gain = {}; let fat = -24 - (t.eq.med ? 6 : 0), mood = 0, prof = 0, unity = -1.2;
    for (const k of t.tt) { for (const [st, v] of Object.entries(L[k].g)) gain[st] = (gain[st] || 0) + v; fat += L[k].fat; mood += L[k].mood || 0; prof += L[k].prof || 0; unity += (L[k].unity || 0) * 0.6; }
    const lab = { pow: 'パワー', tec: '技術', spd: '機動力', int: '知性', men: '精神力' };
    const mx = Math.max(1, ...Object.values(gain));
    return `<p class="mapnote">平日5日×午前・午後の10コマを組みます。月曜日ごとに1週間分の成果が出ます。土日で疲労が24回復します。</p>
      <div class="seg" role="group" aria-label="時間割の型">${Object.entries(D.plans).map(([k, p]) => `<button type="button" data-preset="${k}" aria-pressed="${t.plan === k && D.presets[k].every((x, i) => x === t.tt[i])}">${esc(p.label)}の型</button>`).join('')}</div>
      <div class="tablewrap"><table class="tt"><thead><tr><th></th>${D.days.map((x) => `<th>${x}</th>`).join('')}</tr></thead><tbody>
        <tr><th>午前</th>${[0, 2, 4, 6, 8].map(cell).join('')}</tr><tr><th>午後</th>${[1, 3, 5, 7, 9].map(cell).join('')}</tr></tbody></table></div>
      <h3 class="sub">この時間割の1週間の見込み</h3>
      <div class="ttsum">${Object.entries(lab).map(([k, l]) => `<div class="meter blue"><span>${l}</span><i><b style="width:${((gain[k] || 0) / mx) * 100}%"></b></i><span>${(gain[k] || 0).toFixed(1)}</span></div>`).join('')}</div>
      <p class="bio">疲労 <b class="${fat > 0 ? 'ng' : 'ok'}">${fat > 0 ? '+' : ''}${fat}</b>／週　やる気 ${mood >= 0 ? '+' : ''}${mood.toFixed(1)}　熟練度 +${prof.toFixed(1)}　団結 ${unity >= 0 ? '+' : ''}${unity.toFixed(1)}</p>
      <ul class="list">${Object.values(L).map((v) => `<li><span class="k">${v.label}</span><span>${Object.keys(v.g).map((k) => lab[k]).join('・') || (v.free ? '苦手な能力を自分で補う' : v.fat < 0 ? '疲労が大きく抜ける' : '―')}${v.prof ? '・熟練度' : ''}${v.unity ? '・団結' : ''}${v.exam ? '・試験に強くなる' : ''}（疲労${v.fat > 0 ? '+' : ''}${v.fat}）</span></li>`).join('')}</ul>`;
  }
  function teachEvent(t) {
    const ex = t.exams.slice().reverse();
    return `<h3 class="sub">学園の行事</h3><p class="mapnote">次の行事：<b>${nextSchoolEvent()}</b></p>
      <ul class="list">${SCAL.map(([m, dd, l]) => `<li><span class="k">${m}月${dd}日</span><span>${esc(l)}</span></li>`).join('')}<li><span class="k">7月1日</span><span>期末実技試験の作戦会議（担任）</span></li><li><span class="k">3月25日</span><span>年度末の査定（担任）</span></li></ul>
      <h3 class="sub">期末実技試験<small>2人1組でプロの先生に挑む。作戦と先生のタイプの相性、団結、疲労が結果を左右します</small></h3>
      <ul class="list">${Object.values(D.examStrat).map((v) => `<li><span class="k">${v.label}</span><span>${esc(v.desc)}</span></li>`).join('')}</ul>
      ${ex.length ? ex.map((x) => `<section class="awyear"><h3>${x.y}年　${link('h', sim.heroes[x.foe])}先生（${D.examFoe[x.foeType]}）・作戦「${D.examStrat[x.strat].label}」　${x.res.filter((r) => r.ok).length}/${x.res.length}組合格</h3><ul class="hist">${x.res.map((r) => `<li><span>${r.ok ? '<span class="ok">合格</span>' : '<span class="ng">不合格</span>'}</span><div>${rich(r.text)}</div></li>`).join('')}</ul></section>`).join('') : '<p class="empty">まだ期末試験の記録はありません。</p>'}`;
  }
  function teachShop(t) {
    return `<p class="mapnote">学級予算は毎月1日に入ります（役職と技能「人脈」で増えます）。いまの予算：<b>${t.budget}万円</b></p>
      <div class="cards">${Object.entries(D.shop).map(([k, it]) => {
        const owned = it.keep && t.eq[k];
        return `<div class="card shopcard${owned ? ' owned' : ''}"><h3>${esc(it.label)}</h3><p>${esc(it.desc)}</p><div class="btnrow">${owned ? '<span class="st ok-st">設置済み</span>' : `<button type="button" class="btn${t.budget < it.price ? ' alt' : ''}" data-buy="${k}"${t.budget < it.price ? ' disabled' : ''}>${it.price}万円で${it.keep ? '設置' : '用意'}する</button>`}${k === 'item' && t.items ? `<span class="mapnote">手元に${t.items}個</span>` : ''}${k === 'camp' && t.campWeek ? '<span class="mapnote">次の週に実施</span>' : ''}</div></div>`;
      }).join('')}</div>`;
  }
  function teachMe(t) {
    const pupils = sim.students.filter((s) => s.taught && s.status !== 'enrolled').sort((a, b) => (b.gradYear || 0) - (a.gradYear || 0));
    const heroes = pupils.filter((s) => s.status === 'hero').map((s) => sim.heroes[s.heroId]);
    const nx = D.positions[t.pos + 1];
    const need = t.lv * 120;
    return `<h3 class="sub">教師レベル ${t.lv}<small>次のレベルまで ${need - t.exp}</small></h3>
      <div class="meter blue"><span>経験</span><i><b style="width:${(t.exp / need) * 100}%"></b></i><span>${t.exp}/${need}</span></div>
      <h3 class="sub">技能<small>技能ポイント ${t.sp}・各3段階まで</small></h3>
      <ul class="list">${Object.entries(D.tskills).map(([k, v]) => { const lv = (t.skills || {})[k] || 0; return `<li><span class="k">${v.label} ${'●'.repeat(lv)}${'○'.repeat(3 - lv)}</span><span>${esc(v.desc)} ${t.sp && lv < 3 ? `<button type="button" class="btn alt sm" data-skill="${k}">覚える</button>` : ''}</span></li>`; }).join('')}</ul>
      <h3 class="sub">役職：${esc(sim.posLabel())}</h3>
      <p class="mapnote">${nx ? `次は「${nx.label}」。評判${nx.rep}以上・着任${nx.years}年以上で、3月25日の査定のときに昇進します（着任${sim.year - t.since}年目）。` : 'これ以上の役職はありません。'}</p>
      ${t.evals.length ? `<ul class="list">${t.evals.slice().reverse().map((e) => `<li><span class="k">${e.y}年度末</span><span>評判${e.rep}・${esc(D.positions[e.pos].label)}　${esc(e.note)}</span></li>`).join('')}</ul>` : ''}
      <h3 class="sub">教え子<small>${pupils.length}名・ヒーロー${heroes.length}名</small></h3>
      ${pupils.length ? `<table class="rk-table srk"><tbody>${pupils.slice(0, 60).map(studentRow).join('')}</tbody></table>` : '<p class="empty">まだ卒業した教え子はいません。</p>'}
      ${t.terms.length ? `<ul class="list">${t.terms.slice().reverse().map((x) => `<li><span class="k">${x.y}年卒業</span><span>${x.total}名中${x.heroes}名がヒーローに</span></li>`).join('')}</ul>` : ''}
      <label class="check"><input type="checkbox" id="consultStop" ${ui.consultStop !== false ? 'checked' : ''}> 相談やお知らせが来たら一時停止する</label>
      <div class="btnrow"><button type="button" class="btn alt" id="teachQuit">教師をやめる</button></div>`;
  }
  function consultHTML(c, inPop) {
    const opts = sim.consultOpts(c);
    return `<div class="consult${inPop ? ' pop' : ''}"><p>${rich(sim.consultText(c))}</p><small>${G.fmtDate(c.y, c.d)}</small>
      <div class="copts">${opts.map((o, i) => `<button type="button" class="btn alt" data-cans="${c.id}:${i}">${esc(o.label)}</button>`).join('')}</div></div>`;
  }
  const seenConsult = new Set();
  function checkConsult() {
    const t = sim.teacher;
    if (!t || ui.consultStop === false || skipping || !$('#extra').hidden) return;
    const note = (t.notes || []).find((x) => !seenConsult.has('n' + x.id));
    if (note) {
      seenConsult.add('n' + note.id);
      const wasPlaying = !!timer;
      stop();
      const box = $('#extra');
      box.innerHTML = `<div class="extra-box consult-box" role="dialog" aria-modal="true" aria-labelledby="consultTitle">
        <div class="extra-mast"><span class="extra-stamp teach">${esc(note.title)}</span><span>${esc(D.academies[t.school].short)}　${esc(t.name)}先生</span></div>
        <h2 id="consultTitle" class="sr">${esc(note.title)}</h2>
        <div class="notebody">${rich(note.text).replace(/\n/g, '<br>')}</div>
        <div class="btnrow"><button type="button" class="btn" id="extraGo">続ける</button></div></div>`;
      box.hidden = false;
      box.dataset.resume = wasPlaying ? '1' : '';
      clearInterval(extraTimer);
      return;
    }
    if (!t.pending.length) return;
    const c = t.pending.find((x) => !seenConsult.has(x.id));
    if (!c) return;
    seenConsult.add(c.id);
    const wasPlaying = !!timer;
    stop();
    const box = $('#extra');
    box.innerHTML = `<div class="extra-box consult-box" role="dialog" aria-modal="true" aria-labelledby="consultTitle">
      <div class="extra-mast"><span class="extra-stamp teach">相談</span><span>${esc(D.academies[t.school].short)}　${esc(t.name)}先生へ</span></div>
      <h2 id="consultTitle" class="sr">生徒からの相談</h2>
      <div id="consultBody">${consultHTML(c, true)}</div>
      <div class="btnrow"><button type="button" class="btn alt" id="extraGo">あとで答える</button></div></div>`;
    box.hidden = false;
    box.dataset.resume = wasPlaying ? '1' : '';
    clearInterval(extraTimer);
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

  // 画面専用の乱数（シミュレーションの乱数は使わない）
  function localRng(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    let st = h >>> 0;
    return () => { st = (st + 0x6d2b79f5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // ファンの支持層とファンの声
  function fanSection(h) {
    const F = D.fans;
    const tr = (list) => h.traits.filter((t) => list.includes(t)).length;
    const age = typeof h.age === 'number' ? h.age : 40;
    const sc = {
      kids: 1 + tr(['子ども好き', '陽気', '熱血', '天然', 'ムードメーカー', '体育会系']) * 3 + (h.power.tier >= 4 ? 2 : 0) + (h.rec.kaiju ? 1 : 0),
      young: 1 + tr(['SNS中毒', '目立ちたがり', 'ナルシスト', '恋多き', 'お調子者', 'クール']) * 3 + (age < 30 ? 3 : 0) + h.rec.media * 0.3,
      adult: 1 + tr(['真面目', '苦労人', 'お人好し', '世話焼き', '面倒見がいい', '心配性']) * 3 + (age >= 30 && age < 50 ? 2 : 0),
      senior: 1 + tr(['古風', '礼儀正しい', '職人気質', '義理堅い', '無口な職人', '頑固者']) * 3 + (age >= 50 ? 3 : 0) + h.career * 0.1,
      net: 1 + tr(['中二病', 'オタク気質', '毒舌', '皮肉屋', '天然', '理屈っぽい']) * 3 + (h.power.el === 'odd' ? 2 : 0) + h.rec.scandals * 0.8,
      local: 1 + (/観光課$/.test(h.agency) ? 6 : 0) + Math.min(h.career, 20) * 0.15 + (h.team !== null ? 1 : 0),
    };
    const total = Object.values(sc).reduce((a, b) => a + b, 0);
    const order = Object.entries(sc).sort((a, b) => b[1] - a[1]);
    const rnd = localRng(`${sim.seed}:${h.id}:${sim.year}`);
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const ctx = { name: h.name, nick: h.nickname || h.name, move: h.move || h.power.name, catch: h.catch || '', pref: h.pref.replace(/[都府県]$/, ''), city: h.city };
    const voices = [];
    for (const [k] of order.slice(0, 3)) voices.push(G.fill(pick(F[k].voices), ctx).replace('{pref}', ctx.pref));
    const bars = order.map(([k, v]) => {
      const label = k === 'local' ? `地元（${ctx.pref}）` : F[k].label;
      const pct = Math.round((v / total) * 100);
      return `<div class="meter blue"><span>${esc(label)}</span><i><b style="width:${Math.min(100, pct * 2)}%"></b></i><span>${pct}%</span></div>`;
    }).join('');
    const mood = h.status === 'dead' ? '今も献花が絶えない' : h.status === 'fallen' ? 'ファンの多くが離れていった' : h.fame > 600 ? '国民的な人気' : h.fame > 250 ? '全国区の人気' : h.fame > 80 ? '地元を中心に人気' : 'これからに期待';
    return `<p class="mapnote">人気の度合い：<b>${mood}</b>（人気 ${num(h.fame)}）</p><h5>支持層</h5>${bars}<h5>ファンの声</h5><ul class="voices">${voices.map((v) => `<li>${esc(v)}</li>`).join('')}</ul>`;
  }
  const SIT = { win: '勝利', lose: '敗北', rescue: '救助', capture: '逮捕', scandal: '謝罪', retire: '引退', debut: 'デビュー', award: '受賞', marry: '結婚', comeback: '復帰', rival: 'ライバル', ally: '共闘', tribute: '追悼', back: '復帰', tourney: '全国大会', interview: '取材' };
  function quoteList(h) {
    const q = (h.quotes || []).slice().reverse().slice(0, 8);
    if (!q.length) return '<p class="mapnote">まだ記録された言葉はありません。活躍すると、ここに名台詞が残ります。</p>';
    return `<ul class="quotes">${q.map((x) => `<li><span class="qs">${SIT[x.s] || ''}</span><p>「${rich(x.t)}」</p><small>${G.fmtDate(x.y, x.d)}</small></li>`).join('')}</ul>`;
  }
  // 人生年表
  const LIFE_LABEL = { kaiju: '怪獣', org: '組織壊滅', agency: '事務所', death: '殉職', retire: '引退', scandal: 'スキャンダル', hof: '殿堂入り', inherit: '師匠の技を継承', marry: '結婚', tourney: '全国大会', saga: '宿敵との因縁', boss: '審判の日', fallen: '闇堕ち', reform: '改心', comeback: '現役復帰', after: '引退後の消息', legacy: '二世デビュー', milestone: '節目' };
  function lifeTimeline(h) {
    const ev = [];
    ev.push({ y: h.debutYear, d: -1, t: 'デビュー', s: `${esc(h.agency)}からヒーローとして活動を始める` });
    for (const l of sim.log) {
      const me = l.h === h.id, other = l.h2 === h.id || l.parent === h.id || l.m === h.id || l.runner === h.id;
      if (!me && !other) continue;
      let t = LIFE_LABEL[l.t] || l.t, s2 = '';
      switch (l.t) {
        case 'milestone': t = '節目'; if (!['cap1', 'top1'].includes(l.key) && !/(cap50|cap100|cap200|cases500|cases1000|rescues100|rescues200|career20|career30|streak10|streak15|streak20)/.test(l.key)) continue;
          s2 = l.key === 'cap1' ? '初めてヴィランを検挙' : l.key === 'top1' ? 'ランキングで初めて1位に' : `${MS_LABEL[l.key.replace(/\d+$/, '')] || ''} ${l.num}`; break;
        case 'scandal': s2 = `${'●'.repeat(l.sev)}${'○'.repeat(3 - l.sev)} ${ACT[l.act] || ''}`; break;
        case 'marry': s2 = `${link('h', sim.heroes[me ? l.h2 : l.h])}と結婚`; break;
        case 'tourney': s2 = me ? '優勝' : `準優勝（優勝は${link('h', sim.heroes[l.h])}）`; break;
        case 'saga': s2 = `${link('v', sim.villains[l.v])}との因縁、${l.res}（${l.bouts}戦${l.w}勝${l.l}敗）`; break;
        case 'boss': s2 = `${link('v', sim.villains[l.v])}との最終決戦（${l.res}）`; break;
        case 'inherit': s2 = me ? `師匠${link('h', sim.heroes[l.m])}の技を受け継ぐ` : `弟子の${link('h', sim.heroes[l.h])}が技を受け継ぐ`; t = me ? t : '弟子が継承'; break;
        case 'legacy': s2 = me ? `親は${link('h', sim.heroes[l.parent])}` : `子の${link('h', sim.heroes[l.h])}がデビュー`; t = me ? t : '子がデビュー'; break;
        case 'retire': s2 = `${esc(l.reason)}（活動${l.career}年）`; break;
        case 'death': s2 = l.v !== null ? `${link('v', sim.villains[l.v])}との戦いで` : '救助活動中に'; break;
        case 'fallen': s2 = `${link('v', sim.villains[l.v])}として活動を始める`; break;
        case 'comeback': s2 = `${l.years}年ぶりに現役へ`; break;
        case 'after': s2 = esc(l.after); break;
        case 'hof': s2 = `最高${l.best}位・活動${l.career}年`; break;
        case 'kaiju': if (l.res !== '撃破') continue; s2 = `怪獣${link('v', sim.villains[l.v])}を撃破`; break;
        case 'org': s2 = `${link('o', sim.orgs[l.o])}を壊滅させる`; break;
        case 'agency': if (!me) continue; s2 = l.kind === '独立' ? `独立して「${esc(l.a)}」を設立` : l.kind === '引き抜き' ? `「${esc(l.a)}」に移籍` : esc(l.kind); break;
        default: continue;
      }
      ev.push({ y: l.y, d: l.d, t, s: s2, k: l.t });
    }
    for (const t of h.titles) if (!/^宿敵/.test(t.title)) ev.push({ y: t.y, d: 364.5, t: '受賞', s: esc(t.title), k: 'award' });
    ev.sort((a, b) => a.y - b.y || a.d - b.d);
    return `<ol class="life">${ev.map((e) => `<li class="lk-${e.k || 'debut'}"><span class="ly">${e.y}</span><b>${esc(e.t)}</b><span>${e.s}</span></li>`).join('')}</ol>`;
  }

  function yen(man) { return man >= 10000 ? `約${(man / 10000).toFixed(1)}億円` : `約${num(Math.round(man / 10) * 10)}万円`; }
  function showHero(h) {
    const rel = [];
    if (h.team !== null) rel.push(['チーム', link('t', sim.teams[h.team])]);
    if (h.rival !== null) { const hh = (h.h2h || {})[h.rival]; rel.push(['ライバル', link('h', sim.heroes[h.rival]) + (hh ? `（週間順位の対決 ${hh[0]}勝${hh[1]}敗）` : '')]); }
    if (h.feud) rel.push(['師匠との関係', 'ぎくしゃくしている']);
    if (h.spouse !== null) rel.push(['伴侶', link('h', sim.heroes[h.spouse])]);
    if (h.partner !== null) rel.push(['交際中', link('h', sim.heroes[h.partner])]);
    if (h.mentor !== null) rel.push(['師匠', link('h', sim.heroes[h.mentor])]);
    if (h.apprentices.length) rel.push(['弟子', h.apprentices.map((id) => link('h', sim.heroes[id])).join('、')]);
    if (h.parent !== null && h.parent !== undefined) rel.push(['親', link('h', sim.heroes[h.parent])]);
    if (h.child !== null && h.child !== undefined) rel.push(['子', link('h', sim.heroes[h.child])]);
    if (h.nemesis !== null) { const nv = sim.villains[h.nemesis]; rel.push(['宿敵', link('v', nv) + (nv.saga && nv.saga.h === h.id ? `（${nv.saga.since}年〜・${nv.saga.n}戦${nv.saga.w}勝${nv.saga.l}敗）` : '')]); }
    const closed = sim.log.filter((l) => l.t === 'saga' && l.h === h.id);
    if (closed.length) rel.push(['因縁の決着', closed.map((l) => `${link('v', sim.villains[l.v])}（${l.res}）`).join('、')]);
    if (h.ownAgency) rel.push(['設立した事務所', esc(h.ownAgency)]);
    if (h.sid !== undefined) { const st = sim.students[h.sid]; rel.push(['学生時代', `${slinkFull(st)}（${esc(D.academies[st.school].short)}・${st.gradYear}年卒）`]); }
    if (h.teach !== undefined && h.status === 'retired') rel.push(['教えている学校', esc(D.academies[h.teach].name)]);
    const interns = sim.students.filter((s) => s.status === 'enrolled' && s.intern === h.id);
    if (interns.length) rel.push(['インターン生', interns.map(slinkFull).join('、')]);
    if (h.villainId !== null) rel.push(['現在の姿', link('v', sim.villains[h.villainId])]);
    if (h.fromVillain !== null) rel.push(['ヴィラン時代', link('v', sim.villains[h.fromVillain])]);
    const r = h.rec;
    const tier = h.power.tier + h.tierBonus;
    const yrs = h.yearRanks || [];
    const dl = (rows) => `<dl class="dl">${rows.filter((x) => x[1] !== undefined && x[1] !== null && x[1] !== '').map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl>`;
    const income = h.rank !== null ? yen(score(h) * 6 + h.fame * 4 + 300) : '―';
    openModal(`
      <div class="pf-head">${emblem(h, true)}<div class="pf-title"><h2 id="modalTitle">${esc(h.name)}</h2><p class="pf-epi">${h.epithet ? `「${esc(h.epithet)}」` : ''}${h.nickname ? `<span>愛称 ${esc(h.nickname)}</span>` : ''}</p></div>${h.rank ? `<span class="rkbig">${h.rank}<small>位</small></span>` : ''}${favBtn(h)}${statusChip(h)}</div>
      ${h.catch ? `<p class="catch">「${esc(h.catch)}」</p>` : ''}
      ${h.titles.length ? `<div class="titles">${h.titles.map((t) => `<span>${t.y} ${esc(t.title)}</span>`).join('')}</div>` : ''}
      <div class="pf-cards">
        <section class="pcard"><h4>基本データ</h4>${dl([
          ['本名', h.masked ? '非公開' : esc(h.real)], ['性別', esc(h.gender)], ['年齢', typeof h.age === 'number' ? h.age + '歳' : esc(h.age)],
          ['誕生日', h.birthday ? `${h.birthday[0]}月${h.birthday[1]}日` : ''], ['血液型', h.blood ? h.blood + '型' : ''], ['身長・体重', h.height ? `${h.height}cm・${h.weight}kg` : ''],
          ['出身', esc(h.pref + h.city)], ['出身校', esc(h.school || '')], ['前職', esc(h.job)], ['家族', esc(h.family || '')],
          ['所属', esc(h.agency)], ['スポンサー', esc(h.sponsor || '')], ['活動', `${h.career}年目（${h.debutYear}年デビュー）`], ['最高順位', h.bestRank ? h.bestRank + '位' : '―'], ['推定年収', income],
          ['引退後', h.status === 'retired' && h.after ? esc(h.after) : ''], ['現役復帰', h.comebacks ? h.comebacks + '回' : ''],
        ])}</section>
        <section class="pcard"><h4>能力</h4>
          <div class="power"><b>${esc(h.power.name)}</b><span class="stars" title="能力の格">${stars(tier)}</span><p>${esc(h.power.desc)}（${esc(D.elemLabel[h.power.el] || '')}系）</p></div>
          ${dl([['必殺技', h.move ? `<b>${esc(h.move)}</b>` : ''], ['代償', esc(h.cost || '')], ['弱点', esc(h.weak || '')]])}
          ${radar(h.stats)}
        </section>
        <section class="pcard"><h4>人物</h4>
          <div class="traits">${h.traits.map((t) => `<span>${esc(t)}</span>`).join('')}</div>
          ${dl([['座右の銘', h.motto ? `「${esc(h.motto)}」` : ''], ['好物', esc(h.food || '')], ['苦手な食べ物', esc(h.dislike || '')], ['特技', esc(h.skill || '')], ['素顔', esc(h.quirk)], ['コスチューム', esc(h.costume || '')]])}
          <h5>ヒーローになるまで</h5><p class="bio">${esc(h.origin)}。${esc(h.motive)}ヒーローになった。</p>
        </section>
        <section class="pcard"><h4>成績</h4>
          <div class="recs"><div><b>${r.cases}</b><span>出動</span></div><div><b>${r.captures}</b><span>検挙</span></div><div><b>${r.rescues}</b><span>救助</span></div><div><b>${r.scandals}</b><span>炎上</span></div></div>
          ${dl([['連勝中', h.streak ? h.streak + '連勝' : ''], ['連続1位', h.topWeeks && h.rank === 1 ? h.topWeeks + '週' : ''], ['保持する記録', Object.entries(sim.records).filter(([, r]) => r.id === h.id && r.v >= D.records[Object.keys(D.records).find((k) => sim.records[k] === r)].min).map(([k, r]) => `${D.records[k].label} ${r.v}${D.records[k].unit}`).join('、')], ['ポイント', num(h.points)], ['人気', num(h.fame)], ['怪獣撃破', r.kaiju + '体'], ['メディア出演', r.media + '回']])}
          <h5>今年の順位推移</h5>${spark(h.rankHist)}
          <h5>年度別の最終順位</h5>${yrs.length ? `<ol class="yrs">${yrs.slice().reverse().map(([y, rk]) => `<li><span>${y}</span><b>${rk}位</b></li>`).join('')}</ol>` : '<p class="mapnote">年末に記録されます。</p>'}
        </section>
        <section class="pcard"><h4>ファンの声と支持層</h4>${fanSection(h)}</section>
        <section class="pcard"><h4>語録</h4>${quoteList(h)}</section>
        ${rel.length ? `<section class="pcard"><h4>人間関係</h4>${dl(rel)}</section>` : ''}
        <section class="pcard wide"><h4>人生年表</h4>${lifeTimeline(h)}</section>
      </div>
      <h4 class="sect">活動記録</h4>${histList(h)}`);
  }

  function showVillain(v) {
    const rel = [];
    if (v.org !== null) rel.push(['所属', link('o', sim.orgs[v.org]) + (v.orgRank === 'boss' ? '（首領）' : v.orgRank === 'exec' ? '（幹部）' : '')]);
    if (v.formerOrg !== undefined && v.org === null) rel.push(['元所属', link('o', sim.orgs[v.formerOrg])]);
    if (v.nemesis !== null) rel.push(['宿敵', link('h', sim.heroes[v.nemesis]) + (v.saga ? `（${v.saga.since}年〜・${v.saga.n}戦、${v.saga.closed ? '決着済み' : '継続中'}）` : '')]);
    if (v.sealed) rel.push(['状態', '特別監獄に収監（脱獄不能）']);
    if (v.isBoss) rel.push(['正体', 'すべての組織を束ねる黒幕']);
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
      <p class="pf-sub">${esc(a.era || '')}・支持率${a.approval ?? '–'}%・事件${num(Object.values(st.inc).reduce((x, y) => x + y, 0))}件・ヴィラン検挙${st.captures}名・怪獣撃破${st.kaijuDown}体・スキャンダル${st.scandals}件・殉職${st.deaths}名・引退${retires.length}名</p>
      <div class="champ">${emblem(champ, true)}<div><span>年間ランキング1位</span><b>${link('h', champ)}</b><small>${esc(champ.power.name)}・${esc(champ.pref)}・${esc(champ.agency)}</small></div></div>
      <ul class="awards">${a.list.map((x) => `<li><span class="k">${esc(x.title)}</span><span>${hlink(sim.heroes[x.id])}<small>${esc(x.note)}</small></span></li>`).join('')}</ul>
      ${deaths.length ? `<h4>今年、殉職したヒーロー</h4><p class="bio">${deaths.map((l) => hlink(sim.heroes[l.h])).join('　')}</p>` : ''}
      ${(() => { const tt = sim.tourneys.find((x) => x.y === a.year && x.champ !== null); const bs = sim.log.filter((l) => l.t === 'boss' && l.y === a.year); const sg = sim.log.filter((l) => l.t === 'saga' && l.y === a.year && l.res === '決着'); return (tt || bs.length || sg.length) ? `<h4>今年の名場面</h4><ul class="list">${tt ? `<li><span class="k">全国大会</span>${hlink(sim.heroes[tt.champ])}が優勝</li>` : ''}${bs.map((l) => `<li><span class="k">審判の日</span>${logSummary(l)}</li>`).join('')}${sg.map((l) => `<li><span class="k">因縁の決着</span>${logSummary(l)}</li>`).join('')}</ul>` : ''; })()}
      ${sim.chronicles.length && sim.chronicles[sim.chronicles.length - 1].to === a.year ? `<div class="chron-note"><b>この10年が年代記にまとめられました。</b><button type="button" class="btn alt" data-chron="${sim.chronicles.length - 1}">年代記を読む</button></div>` : ''}
      ${sim.teacher ? `<h4>担任として</h4><p class="bio">${esc(sim.teacher.name)}先生（${esc(D.academies[sim.teacher.school].short)}）の評判は${Math.round(sim.teacher.rep)}・「${esc(sim.teacherTitle())}」。ヒーローになった教え子は${sim.students.filter((x) => x.taught && x.status === 'hero').length}名。</p>` : ''}
      ${hofs.length ? `<h4>今年の殿堂入り</h4><p class="bio">${hofs.map((l) => hlink(sim.heroes[l.h])).join('　')}</p>` : ''}
      ${(() => {
        const p = lsGet(predKey())[a.year];
        const g = lsGet(goalKey())[a.year] || {};
        let html = '';
        if (p) html += `<h4>あなたの予想の答え合わせ</h4><ul class="plist">${judge(a.year, p).map((r) => `<li><span class="k">${r.label}</span><span>${r.pick}</span>${r.ok ? '<span class="pj ok">的中</span>' : '<span class="pj ng">はずれ</span>'}</li>`).join('')}</ul>`;
        const gs = Object.entries(g).filter(([id]) => sim.heroes[id]);
        if (gs.length) html += `<h4>推しの目標</h4><ul class="plist">${gs.map(([id, x]) => { const h = sim.heroes[id]; const fr = finalRank(h, a.year); const ok = fr !== null && fr <= x.t; return `<li><span class="k">${goalLabel(x.t)}</span><span>${hlink(h)}（${fr !== null ? fr + '位' : '圏外'}）</span>${ok ? '<span class="pj ok">達成</span>' : '<span class="pj ng">未達成</span>'}</li>`; }).join('')}</ul>`;
        return html;
      })()}
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
      <p class="bio">スロット${ui.slot}の今の世界（${esc(sim.seed)}・${sim.year}年）は上書きされ、元に戻せません。残しておきたいときは、先に「スロット」から別のスロットに切り替えてください。ヒーロー・ヴィラン・組織をすべて作り直して1年目から始めます。同じシードを入れると同じ顔ぶれの世界になります。</p>
      <div class="field"><input id="seedInput" type="text" value="${esc(randomSeed())}" aria-label="世界シード"><button type="button" class="btn" id="seedGo">この世界で始める</button></div>
      <div class="btnrow"><button type="button" class="btn alt" id="cancelNew">今の世界を続ける</button></div>`);
  }

  // ---------- イベント ----------
  function bind() {
    document.addEventListener('click', (e) => {
      const fb = e.target.closest('[data-fav]');
      if (fb) {
        const id = +fb.dataset.fav;
        if (ui.favs.has(id)) ui.favs.delete(id); else ui.favs.add(id);
        saveFavs();
        document.querySelectorAll(`[data-fav="${id}"]`).forEach((b) => { const on = ui.favs.has(id); b.setAttribute('aria-pressed', String(on)); b.textContent = on ? '★' : '☆'; });
        if (currentPane() === 'dash') renderDash();
        if (currentPane() === 'fav') renderFav();
        return;
      }
      const sfb = e.target.closest('[data-sfav]');
      if (sfb) {
        const id = +sfb.dataset.sfav;
        if (ui.sfavs.has(id)) ui.sfavs.delete(id); else ui.sfavs.add(id);
        saveSFavs();
        document.querySelectorAll(`[data-sfav="${id}"]`).forEach((b) => { const on = ui.sfavs.has(id); b.setAttribute('aria-pressed', String(on)); b.textContent = on ? '★' : '☆'; });
        if (currentPane() === 'fav') renderFav();
        return;
      }
      const sct = e.target.closest('[data-school]');
      if (sct) { ui.school = +sct.dataset.school; ui.obLimit = 80; renderSchool(); return; }
      const sgr = e.target.closest('[data-sgrade]');
      if (sgr) { ui.sgrade = sgr.dataset.sgrade === 'ob' ? 'ob' : +sgr.dataset.sgrade; ui.obLimit = 80; renderSchool(); return; }
      const fo = e.target.closest('[data-favonly]');
      if (fo) { ui.favOnly = !ui.favOnly; renderFilters(); rebuildFeed(); return; }
      const ch = e.target.closest('[data-chron]');
      if (ch) { cancelCountdown(); const c = sim.chronicles[+ch.dataset.chron]; openModal(`<h2 class="yearend-title" id="modalTitle">${c.from}〜${c.to}年の年代記</h2>${chronicleHTML(c)}`); return; }
      const nm = e.target.closest('.nm');
      if (nm) {
        cancelCountdown();
        const x = ent(nm.dataset.k, +nm.dataset.id);
        if (nm.dataset.k === 'h') showHero(x); else if (nm.dataset.k === 's') showStudent(x); else if (nm.dataset.k === 'v') showVillain(x); else if (nm.dataset.k === 'o') showOrg(x); else showTeam(x);
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
        if (m === 'ob') { ui.obLimit = (ui.obLimit || 80) + 80; renderSchool(); }
        return;
      }
      const id = e.target.id;
      if (id === 'modalClose' || id === 'modal' || id === 'cancelNew') { closeModal(); return; }
      if (id === 'stayBtn') { cancelCountdown(); const el = $('#countdown'); if (el) el.textContent = '再生ボタンを押すと次の年へ進みます。'; return; }
      if (id === 'nextYearBtn') { nextYear(); return; }
      if (id === 'seedGo') { const s = $('#seedInput').value.trim(); closeModal(); newWorld(s || randomSeed()); return; }
      if (id === 'newBtn' || e.target.dataset.act === 'new') { showNewWorld(); return; }
      if (id === 'slotBtn') { showSlots(); return; }
      const sg = e.target.closest('[data-slotgo]');
      if (sg) { switchSlot(+sg.dataset.slotgo); return; }
      const ca = e.target.closest('[data-cans]');
      if (ca) {
        const [cid, idx] = ca.dataset.cans.split(':').map(Number);
        const res = sim.resolveConsult(cid, idx) || '';
        const inPop = ca.closest('#extra');
        if (inPop) { $('#consultBody').innerHTML = `<p class="tmsg">${rich(res) || '（この相談はもう終わっています）'}</p>`; $('#extraGo').textContent = '続ける'; }
        ui.teachMsg = res;
        if (currentPane() === 'teach') renderTeach();
        return;
      }
      const tsb = e.target.closest('[data-tsub]');
      if (tsb) { ui.tsub = tsb.dataset.tsub; ui.teachMsg = ''; renderTeach(); return; }
      const pr = e.target.closest('[data-preset]');
      if (pr) { sim.setPreset(pr.dataset.preset); ui.teachMsg = ''; renderTeach(); return; }
      const by = e.target.closest('[data-buy]');
      if (by) { ui.teachMsg = sim.buy(by.dataset.buy) || ''; renderTeach(); return; }
      const sk = e.target.closest('[data-skill]');
      if (sk) { ui.teachMsg = sim.learnSkill(sk.dataset.skill) || ''; renderTeach(); return; }
      const ta = e.target.closest('[data-tact]');
      if (ta) { const [k, sid, area] = ta.dataset.tact.split(':'); ui.teachMsg = sim.teacherAct(k, +sid, area) || ''; renderTeach(); return; }
      if (id === 'teachStart') { sim.startTeaching($('#tName').value.trim(), +$('#tSchool').value); ui.teachMsg = ''; renderTeach(); saveWorld(); return; }
      if (id === 'teachQuit') {
        const b = e.target;
        if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = '本当にやめる（教え子の記録は残ります）'; return; }
        sim.quitTeaching(); renderTeach(); saveWorld(); return;
      }
      const sd = e.target.closest('[data-slotdel]');
      if (sd) {
        const n = +sd.dataset.slotdel;
        if (sd.dataset.sure !== '1') { sd.dataset.sure = '1'; sd.textContent = '本当に消す（元に戻せません）'; return; }
        Store.del(slotKey(n)).then(() => Store.del(metaKey(n))).then(showSlots);
        return;
      }
      if (id === 'skipBtn') skipToEnd();
      if (id === 'extraGo') { closeExtra(true); return; }
      if (id === 'extraStay') { closeExtra(false); return; }
      if (id === 'predGo') {
        const all = lsGet(predKey());
        all[sim.year] = { champ: +$('#pChamp').value, tour: +$('#pTour').value, death: $('#pDeath').value };
        lsSet(predKey(), all);
        renderDash();
        return;
      }
      if (id === 'sizeBtn') { ui.size = ui.size === 'm' ? 'l' : ui.size === 'l' ? 'xl' : 'm'; save(); applySize(); }
    });
    document.addEventListener('change', (e) => {
      if (e.target.id === 'noExtra') { ui.noExtra = e.target.checked; save(); }
      if (e.target.id === 'consultStop') { ui.consultStop = e.target.checked; save(); }
      if (e.target.dataset && e.target.dataset.slot !== undefined) { sim.setSlot(+e.target.dataset.slot, e.target.value); sim.teacher.plan = 'custom'; renderTeach(); }
      if (e.target.id === 'autoYear') { ui.autoYear = e.target.checked; save(); if (!ui.autoYear) cancelCountdown(); }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !$('#extra').hidden) { closeExtra(true); return; }
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

  const SIZES = { m: '標準', l: '大', xl: '特大' };
  function applySize() {
    document.documentElement.dataset.size = ui.size;
    $('#sizeBtn').textContent = '文字 ' + SIZES[ui.size];
  }
  async function start() {
    applySize();
    bind();
    renderFilters();
    if (ui.tab === 'almanac') ui.tab = 'dash';
    await Store.open();
    let saved = null;
    updateSlotBtn();
    try { const raw = await Store.get(slotKey(ui.slot)); if (raw) saved = G.Sim.fromJSON(JSON.parse(raw)); } catch (e) { saved = null; }
    if (saved) resumeWorld(saved); else newWorld(randomSeed());
    setTab(ui.tab);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})(globalThis.HG = globalThis.HG || {});
