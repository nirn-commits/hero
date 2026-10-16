// 画面：ニュースの流れ・ランキング・名鑑・詳細表示
(function (G) {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const D = G.D;
  const SPEEDS = [0, 1500, 600, 150, 20];
  const CAT = { case: '事件', villain: 'ヴィラン', big: '大事件', scandal: 'スキャンダル', media: '芸能', life: '人間模様', rank: 'ランキング', world: '社会' };
  const STATUS = { active: '', off: '', retired: '引退', dead: '殉職', fallen: '闇堕ち' };
  const VSTATUS = { free: '逃亡中', captured: '収監中', dead: '撃破', retreated: '撤退', reformed: '改心' };
  const STAT_LABEL = [['pow', 'パワー'], ['tec', '技術'], ['spd', '機動力'], ['int', '知性'], ['cha', '人気'], ['men', '精神力'], ['mor', '正義感']];
  const MAX_DAYS = 90;

  let sim = null;
  let timer = null;
  let skipping = false;
  let ticks = 0;
  const ui = load({ speed: 2, tab: 'rank', cats: Object.keys(CAT), rankLimit: 50, rosterLimit: 60, vLimit: 60 });

  function load(def) {
    try { const s = JSON.parse(localStorage.getItem('hero-ui') || 'null'); if (s) return { ...def, speed: s.speed ?? def.speed, tab: s.tab || def.tab, cats: s.cats || def.cats }; } catch (e) { /* 保存領域なし */ }
    return def;
  }
  function save() { try { localStorage.setItem('hero-ui', JSON.stringify({ speed: ui.speed, tab: ui.tab, cats: ui.cats })); } catch (e) { /* 無視 */ } }

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ent = (k, id) => (k === 'h' ? sim.heroes[id] : k === 'v' ? sim.villains[id] : k === 'o' ? sim.orgs[id] : sim.teams[id]);
  function link(k, e) {
    if (!e) return '';
    const dead = (k === 'h' && (e.status === 'dead' || e.status === 'retired' || e.status === 'fallen')) ? ' dead' : '';
    return `<button type="button" class="nm ${k}${dead}" data-k="${k}" data-id="${e.id}">${esc(e.name)}</button>`;
  }
  const rich = (t) => esc(t).replace(/⟦([hvot])(\d+)⟧/g, (m, k, id) => link(k, ent(k, +id)));
  const num = (n) => Math.round(n).toLocaleString('ja-JP');
  const score = (h) => sim.score(h);

  // ---------- 進行 ----------
  function newWorld(seed) {
    stop();
    sim = new G.Sim(seed || randomSeed());
    $('#seedLabel').textContent = sim.seed;
    $('#feed').innerHTML = '';
    setFlash('新しい世界が生まれました。登録ヒーロー' + sim.heroes.length + '名、ヴィラン組織' + sim.orgs.length + 'つ。一年が始まります。');
    renderHeader();
    renderSide(true);
    play();
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
        const last = sim.news.filter((n) => n.imp === 3).pop();
        if (last) setFlash(rich(last.text), true);
        updateSpeedButtons();
        showYearEnd();
      } else setTimeout(chunk, 0);
    };
    chunk();
  }

  function nextYear() {
    closeModal();
    sim.nextYear();
    $('#feed').innerHTML = '';
    setFlash(`${sim.year}年が始まりました。昨年の王者は${link('h', sim.ranked[0])}。`, true);
    renderHeader();
    renderSide(true);
    if (ui.speed === 0) ui.speed = 2;
    play();
  }

  // ---------- ヘッダー ----------
  const lastDay = () => (sim.ended ? sim.day : Math.max(0, sim.day - 1));
  function renderHeader() {
    $('#dateLabel').textContent = G.fmtDate(sim.year, lastDay(), true);
    const total = G.daysInYear(sim.year);
    $('#yearFill').style.width = ((sim.ended ? total : sim.day) / total) * 100 + '%';
  }
  function updateSpeedButtons() {
    document.querySelectorAll('.sp').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.sp === (sim && sim.ended ? 0 : ui.speed))));
  }
  function setFlash(html, isHtml) {
    const el = $('#flashText');
    el.innerHTML = isHtml ? html : esc(html);
    const f = $('#flash');
    f.classList.remove('pulse');
    void f.offsetWidth;
    f.classList.add('pulse');
  }

  // ---------- ニュース ----------
  function renderFilters() {
    const box = $('#filters');
    box.innerHTML = Object.entries(CAT).map(([k, v]) => `<button type="button" class="chip" data-cat="${k}" aria-pressed="${ui.cats.includes(k)}">${v}</button>`).join('');
  }
  const visible = (n) => ui.cats.includes(n.cat);

  function dayHTML(day, items) {
    const vis = items.filter(visible);
    if (!vis.length) return '';
    return `<section class="day" data-day="${day}"><h3>${G.fmtDate(sim.year, day, true)}</h3><ol>${vis.map(itemHTML).join('')}</ol></section>`;
  }
  function itemHTML(n) {
    return `<li class="it i${n.imp} c-${n.cat}"><span class="tag">${CAT[n.cat]}</span><p>${rich(n.text)}</p></li>`;
  }
  function renderDay(day, items) {
    const top = items.filter((n) => n.imp === 3).pop();
    if (top) setFlash(rich(top.text), true);
    const html = dayHTML(day, items);
    if (!html) return;
    const feed = $('#feed');
    feed.insertAdjacentHTML('afterbegin', html);
    while (feed.children.length > MAX_DAYS) feed.lastElementChild.remove();
  }
  function rebuildFeed() {
    const byDay = new Map();
    for (let i = sim.news.length - 1; i >= 0; i--) {
      const n = sim.news[i];
      if (n.y !== sim.year) break;
      if (!byDay.has(n.d)) { if (byDay.size >= MAX_DAYS) break; byDay.set(n.d, []); }
      byDay.get(n.d).unshift(n);
    }
    const html = [...byDay.entries()].map(([d, items]) => dayHTML(d, items)).join('');
    $('#feed').innerHTML = html || '<p class="empty">表示できるニュースがありません。上の分類を選んでください。</p>';
    $('#feed').querySelectorAll('.it').forEach((el) => (el.style.animation = 'none'));
  }

  // ---------- タブ ----------
  function setTab(tab) {
    ui.tab = tab;
    save();
    const wide = window.matchMedia('(min-width: 900px)').matches;
    const sideTab = tab === 'feed' ? (wide ? 'rank' : null) : tab;
    $('.layout').dataset.view = tab;
    document.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === (wide && tab === 'feed' ? 'rank' : tab))));
    document.querySelectorAll('.pane').forEach((p) => (p.hidden = p.id !== 'pane-' + sideTab));
    renderSide(true);
  }
  function currentPane() {
    const wide = window.matchMedia('(min-width: 900px)').matches;
    if (ui.tab === 'feed') return wide ? 'rank' : null;
    return ui.tab;
  }
  function renderSide(force) {
    const p = currentPane();
    if (!p) return;
    if (p === 'rank') renderRank();
    else if (force || ticks % 5 === 0) {
      if (p === 'roster') renderRoster();
      if (p === 'villain') renderVillains();
      if (p === 'org') renderOrgs();
      if (p === 'almanac') renderAlmanac();
    }
  }

  function moveHTML(h) {
    if (h.weekRank === null || h.weekRank === undefined) return '<span class="new">NEW</span>';
    const d = h.weekRank - h.rank;
    if (d > 0) return `<span class="up">▲${d}</span>`;
    if (d < 0) return `<span class="down">▼${-d}</span>`;
    return '<span class="same">―</span>';
  }
  function statusChip(h) {
    if (h.status === 'off') return `<span class="st${h.offReason === '謹慎' ? ' bad' : ''}">${h.offReason || '休養'}</span>`;
    if (STATUS[h.status]) return `<span class="st${h.status === 'fallen' ? ' bad' : ''}">${STATUS[h.status]}</span>`;
    return '';
  }
  function heroRow(h, rankCell, right) {
    return `<tr><td class="rk">${rankCell}</td><td class="mv">${h.rank ? moveHTML(h) : ''}</td><td class="who">${link('h', h)}${statusChip(h)}<small>${esc(h.power.name)}・${esc(h.pref)}・${esc(h.agency)}</small></td><td class="sc">${right}</td></tr>`;
  }
  function renderRank() {
    const list = sim.ranked.slice(0, ui.rankLimit);
    const live = sim.ranked.length;
    $('#pane-rank').innerHTML = `<h2>ヒーローランキング<small>現役${live}名・矢印は先週比</small></h2>
      <table class="rk-table"><tbody>${list.map((h) => heroRow(h, h.rank, num(score(h)))).join('')}</tbody></table>
      ${ui.rankLimit < live ? `<button type="button" class="more" data-more="rank">さらに50名を表示</button>` : ''}`;
  }

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
    const right = (h) => sort === 'fame' ? '人気' + num(h.fame) : sort === 'captures' ? '検挙' + h.rec.captures : sort === 'scandals' ? '炎上' + h.rec.scandals : sort === 'age' ? h.age + '歳' : num(score(h));
    const shown = list.slice(0, ui.rosterLimit);
    $('#rosterList').innerHTML = list.length
      ? `<table class="rk-table"><tbody>${shown.map((h) => heroRow(h, h.rank ?? '–', right(h))).join('')}</tbody></table>
        ${list.length > shown.length ? `<button type="button" class="more" data-more="roster">さらに表示（残り${list.length - shown.length}名）</button>` : ''}`
      : '<p class="empty">条件に合うヒーローはいません。</p>';
  }

  function renderVillains() {
    const f = $('#vStatus').value;
    const tw = { S: 4, A: 3, B: 2, C: 1 };
    let list = sim.villains.filter((v) => (f === 'kaiju' ? v.kind === 'kaiju' : f === 'all' ? true : v.kind === 'villain' && v.status === f));
    list.sort((a, b) => (tw[b.threat] - tw[a.threat]) || (b.notoriety - a.notoriety));
    const shown = list.slice(0, ui.vLimit);
    $('#villainList').innerHTML = `<h2>ヴィラン${f === 'kaiju' ? '・怪獣' : ''}<small>${list.length}件</small></h2>` + (list.length
      ? `<table class="rk-table"><tbody>${shown.map((v) => `<tr><td class="rk">${v.threat}</td><td class="mv">${esc(VSTATUS[v.status] || '')}</td><td class="who">${link('v', v)}<small>${esc(v.power.name)}${v.org !== null ? '・' + esc(sim.orgs[v.org].name) + (v.orgRank === 'boss' ? '首領' : v.orgRank === 'exec' ? '幹部' : '') : ''}${v.nemesis !== null ? '・宿敵 ' + esc(sim.heroes[v.nemesis].name) : ''}</small></td><td class="sc">${v.kind === 'kaiju' ? '' : '悪名' + v.notoriety}</td></tr>`).join('')}</tbody></table>
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
      ${gone.length ? `<div class="sec"><h2>壊滅した組織</h2><ul class="list">${gone.map((o) => `<li><span class="k">${link('o', o)}</span><span>${o.destroyedYear}年に壊滅</span></li>`).join('')}</ul></div>` : ''}`;
  }

  function renderAlmanac() {
    const st = sim.st;
    const inc = Object.values(st.inc).reduce((a, b) => a + b, 0);
    const solved = st.out.great + st.out.win;
    const handled = solved + st.out.fail + st.out.bad;
    const k = (v, l) => `<div class="kpi"><b>${v}</b><span>${l}</span></div>`;
    const dead = sim.heroes.filter((h) => h.status === 'dead');
    const fallen = sim.heroes.filter((h) => h.status === 'fallen');
    $('#pane-almanac').innerHTML = `<h2>${sim.year}年の記録<small>${G.fmtDate(sim.year, lastDay())}時点</small></h2>
      <div class="kpis">${k(num(inc), '事件発生')}${k(handled ? Math.round((solved / handled) * 100) + '%' : '–', '解決率')}${k(st.captures, 'ヴィラン検挙')}${k(st.escapes, '脱獄')}
      ${k(st.kaijuDown, '怪獣撃破')}${k(st.orgsDown, '組織壊滅')}${k(st.scandals, 'スキャンダル')}${k(st.debuts, '新人デビュー')}${k(st.retired, '引退')}${k(st.deaths, '殉職')}${k(st.fallen, '闇堕ち')}${k(st.reformed, '改心')}</div>
      <h4>月間ランキング1位</h4>
      <ul class="list">${sim.monthTop.slice().reverse().map((m) => `<li><span class="k">${m.y}年${m.m}月</span>${link('h', sim.heroes[m.id])}</li>`).join('') || '<li>まだ発表されていません。</li>'}</ul>
      ${sim.awards.length ? `<h4>歴代の年間表彰</h4>${sim.awards.slice().reverse().map((a) => `<ul class="awards">${a.list.map((x) => `<li><span class="k">${a.year} ${esc(x.title)}</span><span>${link('h', sim.heroes[x.id])}<small>${esc(x.note)}</small></span></li>`).join('')}</ul>`).join('')}` : ''}
      ${dead.length ? `<h4>殉職したヒーロー</h4><ul class="list">${dead.map((h) => `<li>${link('h', h)}<span class="k">${esc(h.power.name)}</span></li>`).join('')}</ul>` : ''}
      ${fallen.length ? `<h4>闇に堕ちたヒーロー</h4><ul class="list">${fallen.map((h) => `<li>${link('h', h)}<span>→ ${link('v', sim.villains[h.villainId])}</span></li>`).join('')}</ul>` : ''}`;
  }

  // ---------- 詳細 ----------
  function openModal(html) {
    $('#modalBody').innerHTML = html;
    $('#modal').hidden = false;
    $('#modalBody').scrollTop = 0;
    $('#modalClose').focus();
  }
  function closeModal() { $('#modal').hidden = true; }

  function spark(hist) {
    if (hist.length < 2) return '<p class="empty">ランキング推移は週ごとに記録されます。</p>';
    const W = 320, Hh = 90, pl = 26, pr = 8, pt = 8, pb = 16;
    const ranks = hist.map((x) => x[1]);
    const lo = Math.min(...ranks), hi = Math.max(...ranks, lo + 1);
    const days = G.daysInYear(sim.year);
    const x = (d) => pl + (d / days) * (W - pl - pr);
    const y = (r) => pt + ((r - lo) / (hi - lo)) * (Hh - pt - pb);
    const pts = hist.map(([d, r]) => `${x(d).toFixed(1)},${y(r).toFixed(1)}`).join(' ');
    const last = hist[hist.length - 1];
    const months = [0, 90, 181, 273];
    return `<svg class="spark" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="今年のランキング推移">
      <line class="gd" x1="${pl}" x2="${W - pr}" y1="${y(lo)}" y2="${y(lo)}"/><line class="gd" x1="${pl}" x2="${W - pr}" y1="${y(hi)}" y2="${y(hi)}"/>
      <text x="${pl - 4}" y="${y(lo) + 3}" text-anchor="end">${lo}位</text><text x="${pl - 4}" y="${y(hi) + 3}" text-anchor="end">${hi}位</text>
      ${months.map((d, i) => `<text x="${x(d)}" y="${Hh - 3}">${i * 3 + 1}月</text>`).join('')}
      <polygon class="ar" points="${x(hist[0][0])},${y(hi)} ${pts} ${x(last[0])},${y(hi)}"/>
      <polyline class="ln" points="${pts}"/><circle class="dot" cx="${x(last[0])}" cy="${y(last[1])}" r="3.5"/></svg>`;
  }
  function histList(e) {
    const items = e.hist.slice().reverse().slice(0, 200).map((id) => sim.news[id]);
    if (!items.length) return '<p class="empty">まだ記録はありません。</p>';
    return `<ul class="hist">${items.map((n) => `<li><span>${G.fmtDate(n.y, n.d)}</span><div>${rich(n.text)}</div></li>`).join('')}</ul>`;
  }
  const stars = (t) => '★'.repeat(Math.min(5, t)) + '☆'.repeat(Math.max(0, 5 - t)) + (t > 5 ? '+' : '');
  function statBars(s) {
    return STAT_LABEL.map(([k, l]) => `<div class="meter${k === 'mor' ? ' blue' : ''}"><span>${l}</span><i><b style="width:${s[k]}%"></b></i><span>${s[k]}</span></div>`).join('');
  }

  function showHero(h) {
    const rel = [];
    if (h.team !== null) rel.push(['チーム', link('t', sim.teams[h.team])]);
    if (h.rival !== null) rel.push(['ライバル', link('h', sim.heroes[h.rival])]);
    if (h.spouse !== null) rel.push(['伴侶', link('h', sim.heroes[h.spouse])]);
    if (h.partner !== null) rel.push(['交際中', link('h', sim.heroes[h.partner])]);
    if (h.mentor !== null) rel.push(['師匠', link('h', sim.heroes[h.mentor])]);
    if (h.apprentices.length) rel.push(['弟子', h.apprentices.map((id) => link('h', sim.heroes[id])).join('、')]);
    if (h.nemesis !== null) rel.push(['宿敵', link('v', sim.villains[h.nemesis])]);
    if (h.villainId !== null) rel.push(['現在の姿', link('v', sim.villains[h.villainId])]);
    if (h.fromVillain !== null) rel.push(['ヴィラン時代', link('v', sim.villains[h.fromVillain])]);
    const r = h.rec;
    const tier = h.power.tier + h.tierBonus;
    openModal(`
      <div class="pf-head"><h2 id="modalTitle">${esc(h.name)}</h2>${h.rank ? `<span class="rkbig">${h.rank}位</span>` : ''}${statusChip(h)}</div>
      <p class="pf-sub">本名 ${h.masked ? '非公開' : esc(h.real)}・${esc(h.gender)}・${h.age}歳・${esc(h.pref)}${esc(h.city)}・${esc(h.agency)}・活動${h.career}年目${h.oldNames.length ? '・旧名 ' + h.oldNames.map(esc).join('、') : ''}</p>
      <div class="pf-grid">
        <div>
          <div class="power"><b>${esc(h.power.name)}</b><span class="stars" title="能力の格">${stars(tier)}</span><p>${esc(h.power.desc)}（${esc(D.elemLabel[h.power.el] || '')}系）</p></div>
          <h4>経歴</h4>
          <p class="bio">${esc(h.job)}。${esc(h.origin)}。${esc(h.motive)}ヒーローになった。${esc(h.quirk)}。</p>
          <h4>性格</h4><div class="traits">${h.traits.map((t) => `<span>${esc(t)}</span>`).join('')}</div>
          ${rel.length ? `<h4>関係</h4><dl class="dl">${rel.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl>` : ''}
        </div>
        <div>
          <h4>能力値</h4>${statBars(h.stats)}
          <h4>通算成績</h4>
          <div class="recs"><div><b>${r.cases}</b><span>出動</span></div><div><b>${r.captures}</b><span>検挙</span></div><div><b>${r.rescues}</b><span>救助</span></div><div><b>${r.scandals}</b><span>炎上</span></div></div>
          <h4>ポイント ${num(h.points)}・人気 ${num(h.fame)}</h4>
          ${spark(h.rankHist)}
        </div>
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
      <div class="pf-head"><h2 id="modalTitle">${esc(v.name)}</h2><span class="rkbig">危険度${v.threat}</span><span class="st${v.status === 'free' ? ' bad' : ''}">${VSTATUS[v.status] || ''}</span></div>
      <p class="pf-sub">${isK ? '怪獣' : `本名 ${esc(v.real)}・${esc(v.gender)}・${v.age}歳`}・出現地 ${esc(v.pref)}</p>
      <div class="pf-grid">
        <div>
          <div class="power"><b>${esc(v.power.name)}</b>${isK ? '' : `<span class="stars">${stars(v.power.tier + (v.tierBonus || 0))}</span>`}<p>${esc(v.power.desc)}</p></div>
          ${isK ? '' : `<h4>素性</h4><p class="bio">${esc(v.origin)}。目的は「${esc(v.motive)}」。</p>`}
          ${rel.length ? `<h4>関係</h4><dl class="dl">${rel.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl>` : ''}
        </div>
        <div>
          ${isK ? `<h4>推定戦闘力</h4><p class="bio">${v.kpow}</p>` : `<h4>能力値</h4>${statBars(v.stats)}`}
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

  function showYearEnd() {
    const a = sim.awards[sim.awards.length - 1];
    if (!a) return;
    const st = a.stats;
    openModal(`<h2 class="yearend-title" id="modalTitle">${a.year}年 ヒーロー年間表彰</h2>
      <p class="pf-sub">事件${num(Object.values(st.inc).reduce((x, y) => x + y, 0))}件・ヴィラン検挙${st.captures}名・怪獣撃破${st.kaijuDown}体・スキャンダル${st.scandals}件・殉職${st.deaths}名</p>
      <ul class="awards">${a.list.map((x) => `<li><span class="k">${esc(x.title)}</span><span>${link('h', sim.heroes[x.id])}<small>${esc(x.note)}</small></span></li>`).join('')}</ul>
      <h4>年間ランキング トップ10</h4>
      <table class="rk-table"><tbody>${a.top10.map((id, i) => { const h = sim.heroes[id]; return `<tr><td class="rk">${i + 1}</td><td class="mv"></td><td class="who">${link('h', h)}<small>${esc(h.power.name)}・${esc(h.pref)}</small></td><td class="sc">${num(score(h))}</td></tr>`; }).join('')}</tbody></table>
      <div class="btnrow"><button type="button" class="btn" id="nextYearBtn">${a.year + 1}年へ進む</button><button type="button" class="btn alt" data-act="new">新しい世界で始める</button></div>`);
  }

  function showNewWorld() {
    openModal(`<h2 class="yearend-title" id="modalTitle">新しい世界を作る</h2>
      <p class="bio">ヒーロー・ヴィラン・組織をすべて作り直して、1年目から始めます。同じシードを入れると同じ世界になります。</p>
      <div class="field"><input id="seedInput" type="text" value="${esc(randomSeed())}" aria-label="世界シード"><button type="button" class="btn" id="seedGo">この世界で始める</button></div>
      <div class="btnrow"><button type="button" class="btn alt" id="cancelNew">今の世界を続ける</button></div>`);
  }

  // ---------- イベント ----------
  function bind() {
    document.addEventListener('click', (e) => {
      const nm = e.target.closest('.nm');
      if (nm) {
        const x = ent(nm.dataset.k, +nm.dataset.id);
        if (nm.dataset.k === 'h') showHero(x); else if (nm.dataset.k === 'v') showVillain(x); else if (nm.dataset.k === 'o') showOrg(x); else showTeam(x);
        return;
      }
      const sp = e.target.closest('.sp');
      if (sp) { if (sim.ended) return; ui.speed = +sp.dataset.sp; save(); play(); return; }
      const tab = e.target.closest('.tab');
      if (tab) { setTab(tab.dataset.tab); return; }
      const chip = e.target.closest('.chip');
      if (chip) {
        const c = chip.dataset.cat;
        ui.cats = ui.cats.includes(c) ? ui.cats.filter((x) => x !== c) : [...ui.cats, c];
        save(); renderFilters(); rebuildFeed(); return;
      }
      const more = e.target.closest('.more');
      if (more) {
        if (more.dataset.more === 'rank') { ui.rankLimit += 50; renderRank(); }
        if (more.dataset.more === 'roster') { ui.rosterLimit += 60; renderRoster(); }
        if (more.dataset.more === 'villain') { ui.vLimit += 60; renderVillains(); }
        return;
      }
      if (e.target.id === 'modalClose' || e.target.id === 'modal' || e.target.id === 'cancelNew') { closeModal(); return; }
      if (e.target.id === 'nextYearBtn') { nextYear(); return; }
      if (e.target.id === 'seedGo') { const s = $('#seedInput').value.trim(); closeModal(); newWorld(s || randomSeed()); return; }
      if (e.target.id === 'newBtn' || e.target.dataset.act === 'new') { showNewWorld(); return; }
      if (e.target.id === 'skipBtn') { skipToEnd(); }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#modal').hidden) closeModal(); });
    $('#rosterQ').addEventListener('input', () => { ui.rosterLimit = 60; renderRoster(); });
    $('#rosterSort').addEventListener('change', () => { ui.rosterLimit = 60; renderRoster(); });
    $('#rosterStatus').addEventListener('change', () => { ui.rosterLimit = 60; renderRoster(); });
    $('#vStatus').addEventListener('change', () => { ui.vLimit = 60; renderVillains(); });
    window.matchMedia('(min-width: 900px)').addEventListener('change', () => setTab(ui.tab));
  }

  function start() {
    bind();
    renderFilters();
    newWorld(randomSeed());
    setTab(ui.tab);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})(globalThis.HG = globalThis.HG || {});
