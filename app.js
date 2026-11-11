/* Halves — shared expense splitting for two people.
   Data lives in Supabase; this file is the whole front end. */
(() => {
  'use strict';

  // ---------- Categories ----------
  const ICON = {
    cart: '<path d="M3 4h2l2.2 10.2a1.5 1.5 0 0 0 1.5 1.2h8.6a1.5 1.5 0 0 0 1.5-1.1L21 8H6.2"/><circle cx="9.5" cy="19.5" r="1.3"/><circle cx="17" cy="19.5" r="1.3"/>',
    fuel: '<path d="M4 20V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v15M3 20h12M4 10h10"/><path d="M14 8h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V9l-3-3"/>',
    bag: '<path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
    baby: '<circle cx="12" cy="13" r="7"/><path d="M9.5 12.5h0M14.5 12.5h0" stroke-width="2.6"/><path d="M10 16c1.2 1 2.8 1 4 0M12 6c0-1.5 1-2.5 2.5-2.5"/>',
    paw: '<circle cx="7" cy="10" r="1.8"/><circle cx="10.5" cy="6.5" r="1.8"/><circle cx="14.5" cy="6.5" r="1.8"/><circle cx="18" cy="10" r="1.8"/><path d="M12.5 11.5c-3 0-5.5 4-5.5 6 0 1.5 1.2 2.5 2.7 2.5 1 0 1.8-.5 2.8-.5s1.8.5 2.8.5c1.5 0 2.7-1 2.7-2.5 0-2-2.5-6-5.5-6z"/>',
    gift: '<rect x="3.5" y="8" width="17" height="4" rx="1"/><path d="M5 12v8h14v-8M12 8v12M12 8S10.5 3.5 8 4.2C6 4.8 7 8 12 8zM12 8s1.5-4.5 4-3.8C18 4.8 17 8 12 8z"/>',
    home: '<path d="M3.5 11 12 4l8.5 7M5.5 9.5V20h13V9.5"/><path d="M10 20v-5h4v5"/>',
    dots: '<circle cx="6" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18" cy="12" r="1.3"/>',
    swap: '<path d="M7 7h12l-3-3M17 17H5l3 3"/>',
  };
  const CATEGORIES = [
    { id: 'groceries', label: 'Groceries',   color: '#2f9e5b', icon: 'cart' },
    { id: 'fuel',      label: 'Fuel',        color: '#3b6fd8', icon: 'fuel' },
    { id: 'takeaway',  label: 'Takeaway',    color: '#e0662a', icon: 'bag'  },
    { id: 'baby',      label: 'Baby',        color: '#d4589a', icon: 'baby' },
    { id: 'pet',       label: 'Pet',         color: '#9a6a3a', icon: 'paw'  },
    { id: 'present',   label: 'Present',     color: '#8a55d6', icon: 'gift' },
    { id: 'home',      label: 'Home upkeep', color: '#2a9aa8', icon: 'home' },
    { id: 'other',     label: 'Other',       color: '#7a817a', icon: 'dots' },
  ];
  const SETTLE_STYLE = { color: '#151715', icon: 'swap' };
  const catById = (id) => CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1];
  const svg = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICON[name]}</svg>`;

  // ---------- State ----------
  const state = {
    sb: null,
    user: null,
    me: null,        // {user_id, display_name}
    partner: null,   // {user_id, display_name} | null
    members: [],
    entries: [],
    filter: 'all',
    channel: null,
    editing: null,   // entry being edited (expense or settle)
    form: { category: 'groceries', split: 'me-half' },
    settleDir: 'me', // 'me' = I'm paying partner; 'them' = partner paying me
    tab: 'activity',
    ov: { range: 'month', start: null, sel: null },
  };

  // ---------- Helpers ----------
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const round2 = (n) => Math.round(n * 100) / 100;
  const money = (n) => {
    const v = Math.abs(round2(n));
    const whole = Number.isInteger(v);
    return 'R' + v.toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
  };
  const parseAmount = (s) => {
    const clean = String(s).replace(/\s/g, '').replace(/^R/i, '').replace(',', '.');
    const n = Number(clean);
    return Number.isFinite(n) && n > 0 ? round2(n) : null;
  };
  const todayISO = () => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  };
  const fmtDate = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-ZA', { day: 'numeric', month: 'short' });
  const fmtMonth = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' });
  const nameOf = (uid) => (uid === state.me?.user_id ? 'You' : (state.members.find((m) => m.user_id === uid)?.display_name || 'Partner'));
  const partnerName = () => state.partner?.display_name || 'Partner';

  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 2200);
  }

  function show(view) {
    ['loading', 'setup', 'login', 'name', 'main'].forEach((v) => ($('view-' + v).hidden = v !== view));
  }

  // Share owed to the payer by the other person.
  const shareOf = (e) => (e.split === 'half' ? Number(e.amount) / 2 : Number(e.amount));
  // Positive = partner owes me; negative = I owe partner.
  const effectOnMe = (e) => (e.paid_by === state.me.user_id ? shareOf(e) : -shareOf(e));
  const balance = () => round2(state.entries.reduce((s, e) => s + effectOnMe(e), 0));

  // ---------- Boot ----------
  async function boot() {
    const cfg = window.HALVES_CONFIG || {};
    if (!cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_URL.includes('YOUR-')) {
      show('setup');
      return;
    }
    state.sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });

    const { data } = await state.sb.auth.getSession();
    state.sb.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') { state.user = null; teardown(); show('login'); }
      else if (event === 'SIGNED_IN' && session && !state.user) { state.user = session.user; afterLogin(); }
    });
    if (data.session) { state.user = data.session.user; await afterLogin(); }
    else show('login');
  }

  async function afterLogin() {
    show('loading');
    await loadMembers();
    if (!state.me) { show('name'); $('name-input').focus(); return; }
    await loadEntries();
    subscribe();
    show('main');
    render();
  }

  function teardown() {
    if (state.channel) { state.sb.removeChannel(state.channel); state.channel = null; }
    Object.assign(state, { me: null, partner: null, members: [], entries: [] });
  }

  async function loadMembers() {
    const { data, error } = await state.sb.from('members').select('*');
    if (error) { toast('Could not load members'); console.error(error); return; }
    state.members = data || [];
    state.me = state.members.find((m) => m.user_id === state.user.id) || null;
    state.partner = state.members.find((m) => m.user_id !== state.user.id) || null;
  }

  async function loadEntries() {
    const { data, error } = await state.sb
      .from('entries').select('*')
      .order('spent_on', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) { toast('Could not load entries'); console.error(error); return; }
    state.entries = data || [];
  }

  let reloadTimer;
  function scheduleReload() {
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(async () => {
      if (!state.me) return;
      await Promise.all([loadMembers(), loadEntries()]);
      render();
    }, 250);
  }

  function subscribe() {
    if (state.channel) return;
    state.channel = state.sb
      .channel('halves-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entries' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, scheduleReload)
      .subscribe();
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && state.me) scheduleReload(); });

  // ---------- Render ----------
  function render() {
    renderBalance();
    renderFilters();
    renderList();
    $('partner-banner').hidden = !!state.partner;
    if (!state.ov.start) state.ov.start = periodStart(state.ov.range, new Date());
    if (state.tab === 'overview') renderOverview();
  }

  function renderBalance() {
    const b = balance();
    const box = $('balance');
    box.classList.toggle('owed', b > 0);
    box.classList.toggle('owe', b < 0);
    $('balance-amount').textContent = money(b);
    if (b > 0) {
      $('balance-label').textContent = 'You are owed';
      $('balance-sub').textContent = `${partnerName()} owes you`;
    } else if (b < 0) {
      $('balance-label').textContent = 'You owe';
      $('balance-sub').textContent = `You owe ${partnerName()}`;
    } else {
      $('balance-label').textContent = 'All settled up';
      $('balance-sub').textContent = state.entries.length ? 'Nobody owes anything' : 'Tap + to log your first expense';
    }
    $('settle-btn').hidden = !state.partner;
  }

  function renderFilters() {
    const used = new Set(state.entries.map((e) => (e.kind === 'settle' ? 'settle' : e.category)));
    const opts = [{ id: 'all', label: 'All' }, ...CATEGORIES.filter((c) => used.has(c.id))];
    if (used.has('settle')) opts.push({ id: 'settle', label: 'Payments', color: SETTLE_STYLE.color });
    if (!opts.some((o) => o.id === state.filter)) state.filter = 'all';
    $('filters').hidden = opts.length <= 2;
    $('filters').innerHTML = opts.map((o) =>
      `<button class="chip" data-filter="${o.id}" aria-pressed="${state.filter === o.id}">` +
      (o.color ? `<span class="dot" style="background:${o.color}"></span>` : '') + esc(o.label) + '</button>'
    ).join('');
  }

  function renderList() {
    const list = $('list');
    const items = state.entries.filter((e) =>
      state.filter === 'all' ? true : state.filter === 'settle' ? e.kind === 'settle' : e.kind !== 'settle' && e.category === state.filter
    );
    if (!items.length) {
      list.innerHTML = `<div class="empty">${state.entries.length ? 'Nothing in this category yet.' : 'No expenses yet.'}</div>`;
      return;
    }
    let html = '';
    let month = '';
    // month totals (expenses only, full amount spent)
    const totals = {};
    items.forEach((e) => {
      const m = e.spent_on.slice(0, 7);
      if (e.kind !== 'settle') totals[m] = (totals[m] || 0) + Number(e.amount);
    });
    for (const e of items) {
      const m = e.spent_on.slice(0, 7);
      if (m !== month) {
        month = m;
        html += `<div class="month"><span>${fmtMonth(e.spent_on)}</span><span>${totals[m] ? money(totals[m]) + ' spent' : ''}</span></div>`;
      }
      html += itemHTML(e);
    }
    list.innerHTML = html;
  }

  function itemHTML(e) {
    const eff = effectOnMe(e);
    const payer = nameOf(e.paid_by);
    const other = e.paid_by === state.me.user_id ? partnerName() : 'you';
    let title, sub, iconBg, icon, lbl;
    if (e.kind === 'settle') {
      title = `${payer} paid ${other}`;
      sub = `${fmtDate(e.spent_on)} · Settle up${e.note ? ' · ' + e.note : ''}`;
      iconBg = SETTLE_STYLE.color; icon = SETTLE_STYLE.icon;
      lbl = eff > 0 ? 'you paid' : 'you received';
    } else {
      const c = catById(e.category);
      title = e.title;
      const how = e.split === 'half' ? 'split' : 'owed in full';
      sub = `${fmtDate(e.spent_on)} · ${payer} paid ${money(e.amount)} · ${how}`;
      iconBg = c.color; icon = c.icon;
      lbl = eff > 0 ? 'you lent' : 'you owe';
    }
    const cls = eff > 0 ? 'pos' : 'neg';
    return `<button class="item" data-id="${e.id}">
      <span class="cat-icon" style="background:${iconBg}">${svg(icon)}</span>
      <span class="item-main"><div class="item-title">${esc(title)}</div><div class="item-sub">${esc(sub)}</div></span>
      <span class="item-side ${cls}"><div class="lbl">${lbl}</div><div class="amt">${money(eff)}</div></span>
    </button>`;
  }

  // ---------- Overview ----------
  const pad = (n) => String(n).padStart(2, '0');
  const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const fromISO = (s) => new Date(s + 'T00:00:00');
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const MON = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

  function periodStart(range, d) {
    if (range === 'day') return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (range === 'week') return addDays(d, -((d.getDay() + 6) % 7)); // weeks start Monday
    if (range === 'month') return new Date(d.getFullYear(), d.getMonth(), 1);
    return new Date(d.getFullYear(), 0, 1);
  }
  function shiftPeriod(range, start, dir) {
    if (range === 'day') return addDays(start, dir);
    if (range === 'week') return addDays(start, 7 * dir);
    if (range === 'month') return new Date(start.getFullYear(), start.getMonth() + dir, 1);
    return new Date(start.getFullYear() + dir, 0, 1);
  }
  function periodLabel(range, start) {
    const today = periodStart(range, new Date());
    const same = toISO(start) === toISO(today);
    const opts = (o) => start.toLocaleDateString('en-ZA', o);
    if (range === 'day') {
      if (same) return 'Today';
      if (toISO(start) === toISO(addDays(today, -1))) return 'Yesterday';
      return opts({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    }
    if (range === 'week') {
      if (same) return 'This week';
      const end = addDays(start, 6);
      const mon = (d) => d.toLocaleDateString('en-ZA', { month: 'short' });
      const a = start.getMonth() === end.getMonth() ? start.getDate() : `${start.getDate()} ${mon(start)}`;
      return `${a} – ${end.getDate()} ${mon(end)} ${end.getFullYear()}`;
    }
    if (range === 'month') return opts({ month: 'long', year: 'numeric' });
    return String(start.getFullYear());
  }
  function expensesBetween(startISO, endISO) {
    return state.entries.filter((e) => e.kind !== 'settle' && e.spent_on >= startISO && e.spent_on < endISO);
  }
  const sumAmt = (list) => round2(list.reduce((s, e) => s + Number(e.amount), 0));

  function buckets(range, start) {
    const out = [];
    if (range === 'week') {
      for (let i = 0; i < 7; i++) {
        const d = addDays(start, i);
        out.push({ s: toISO(d), e: toISO(addDays(d, 1)), label: DOW[i], name: d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' }) });
      }
    } else if (range === 'month') {
      const days = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
      for (let i = 1; i <= days; i++) {
        const d = new Date(start.getFullYear(), start.getMonth(), i);
        out.push({ s: toISO(d), e: toISO(addDays(d, 1)), label: [1, 8, 15, 22, 29].includes(i) ? String(i) : '', name: d.toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' }) });
      }
    } else if (range === 'year') {
      for (let m = 0; m < 12; m++) {
        const d = new Date(start.getFullYear(), m, 1);
        out.push({ s: toISO(d), e: toISO(new Date(start.getFullYear(), m + 1, 1)), label: MON[m], name: d.toLocaleDateString('en-ZA', { month: 'long' }) });
      }
    }
    return out;
  }

  function renderOverview() {
    const ov = state.ov;
    const start = ov.start;
    const end = shiftPeriod(ov.range, start, 1);
    const sISO = toISO(start), eISO = toISO(end);
    const list = expensesBetween(sISO, eISO);
    const total = sumAmt(list);

    document.querySelectorAll('#ov-range [data-range]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.range === ov.range));
    $('ov-label').textContent = periodLabel(ov.range, start);
    $('ov-next').disabled = end > new Date();
    $('ov-amount').textContent = money(total);

    // Compare with the previous period
    const prevStart = shiftPeriod(ov.range, start, -1);
    const prevTotal = sumAmt(expensesBetween(toISO(prevStart), sISO));
    const prevName = { day: 'the day before', week: 'the week before', month: 'the month before', year: 'the year before' }[ov.range];
    const diff = round2(total - prevTotal);
    $('ov-compare').textContent = !list.length ? 'Nothing logged in this period'
      : !prevTotal ? `${list.length} expense${list.length === 1 ? '' : 's'}`
      : diff === 0 ? `Same as ${prevName}`
      : `${money(diff)} ${diff > 0 ? 'more' : 'less'} than ${prevName}`;

    // Who paid
    const mine = sumAmt(list.filter((e) => e.paid_by === state.me.user_id));
    $('ov-who').hidden = !list.length;
    $('ov-who').innerHTML = `<span>You paid <b>${money(mine)}</b></span><span>${esc(partnerName())} paid <b>${money(total - mine)}</b></span>`;

    // Chart
    const bks = buckets(ov.range, start);
    $('ov-chart-wrap').hidden = !bks.length;
    if (bks.length) {
      const vals = bks.map((b) => sumAmt(list.filter((e) => e.spent_on >= b.s && e.spent_on < b.e)));
      const max = Math.max(...vals, 1);
      if (ov.sel != null && ov.sel >= bks.length) ov.sel = null;
      $('ov-chart-title').textContent = ov.range === 'year' ? 'By month' : 'By day';
      $('ov-chart').innerHTML = bks.map((b, i) =>
        `<button class="bar${vals[i] ? ' has' : ''}${ov.sel === i ? ' sel' : ''}" data-bar="${i}" aria-label="${esc(b.name)}: ${money(vals[i])}">` +
        `<i style="height:${vals[i] ? Math.max(4, (vals[i] / max) * 100) : 0}%"></i><span>${b.label}</span></button>`
      ).join('');
      $('ov-chart-sel').innerHTML = ov.sel != null ? `${esc(bks[ov.sel].name)} · <b>${money(vals[ov.sel])}</b>` : 'Tap a bar';
    }

    // Categories
    const byCat = {};
    list.forEach((e) => { const id = catById(e.category).id; byCat[id] = (byCat[id] || 0) + Number(e.amount); });
    const rows = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    $('ov-cats').innerHTML = rows.length ? rows.map(([id, amt]) => {
      const c = catById(id);
      const pct = total ? Math.round((amt / total) * 100) : 0;
      return `<button class="item cat-row" data-cat-jump="${id}">
        <span class="cat-icon" style="background:${c.color}">${svg(c.icon)}</span>
        <span class="cat-body">
          <span class="cat-line"><span>${esc(c.label)}<span class="cat-pct">${pct}%</span></span><b>${money(amt)}</b></span>
          <span class="cat-bar"><i style="width:${(amt / rows[0][1]) * 100}%;background:${c.color}"></i></span>
        </span></button>`;
    }).join('') : '<div class="empty" style="padding:24px">No spending to break down.</div>';
  }

  function setTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.tabs [data-tab]').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === tab));
    $('tab-activity').hidden = tab !== 'activity';
    $('tab-overview').hidden = tab !== 'overview';
    if (tab === 'overview') renderOverview();
    window.scrollTo(0, 0);
  }

  // ---------- Expense sheet ----------
  const SPLITS = () => [
    { id: 'me-half',   title: 'I paid',               sub: 'Split 50/50',               paid: 'me',   split: 'half' },
    { id: 'them-half', title: `${partnerName()} paid`, sub: 'Split 50/50',               paid: 'them', split: 'half' },
    { id: 'me-full',   title: `${partnerName()} owes`, sub: 'The full amount, to me',     paid: 'me',   split: 'full' },
    { id: 'them-full', title: 'I owe',                 sub: `The full amount, to ${partnerName()}`, paid: 'them', split: 'full' },
  ];
  const splitIdFor = (e) => `${e.paid_by === state.me.user_id ? 'me' : 'them'}-${e.split}`;

  function openSheet(id) {
    $(id).hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function closeSheets() {
    document.querySelectorAll('.sheet-wrap').forEach((s) => (s.hidden = true));
    document.body.style.overflow = '';
    state.editing = null;
    disarm($('delete-btn')); disarm($('settle-delete-btn'));
  }

  function openExpense(entry) {
    state.editing = entry || null;
    $('expense-heading').textContent = entry ? 'Edit expense' : 'Add expense';
    $('f-amount').value = entry ? String(Number(entry.amount)) : '';
    $('f-title').value = entry ? entry.title : '';
    $('f-date').value = entry ? entry.spent_on : todayISO();
    $('f-note').value = entry?.note || '';
    state.form.category = entry ? (entry.category || 'other') : 'groceries';
    state.form.split = entry ? splitIdFor(entry) : 'me-half';
    $('delete-btn').hidden = !entry;
    $('expense-error').hidden = true;
    $('expense-meta').textContent = entry ? metaLine(entry) : '';
    renderCategoryPicker();
    renderSplitPicker();
    updatePreview();
    openSheet('sheet-expense');
    if (!entry) setTimeout(() => $('f-amount').focus(), 260);
  }

  function metaLine(e) {
    const added = `Logged by ${nameOf(e.created_by)}`;
    const edited = e.updated_by ? ` · last edited by ${nameOf(e.updated_by)}` : '';
    return added + edited;
  }

  function renderCategoryPicker() {
    $('f-categories').innerHTML = CATEGORIES.map((c) =>
      `<button type="button" class="chip" data-cat="${c.id}" aria-pressed="${state.form.category === c.id}">` +
      `<span class="dot" style="background:${c.color}"></span>${esc(c.label)}</button>`
    ).join('');
  }

  function renderSplitPicker() {
    $('f-splits').innerHTML = SPLITS().map((s) =>
      `<button type="button" class="split-opt" data-split="${s.id}" aria-pressed="${state.form.split === s.id}" ${s.paid === 'them' && !state.partner ? 'disabled' : ''}>` +
      `<strong>${esc(s.title)}</strong><small>${esc(s.sub)}</small></button>`
    ).join('');
  }

  function updatePreview() {
    const amt = parseAmount($('f-amount').value);
    const s = SPLITS().find((x) => x.id === state.form.split);
    const p = $('f-split-preview');
    if (!amt || !s) { p.textContent = ''; return; }
    const share = s.split === 'half' ? amt / 2 : amt;
    p.innerHTML = s.paid === 'me'
      ? `${esc(partnerName())} will owe you <b class="pos">${money(share)}</b>`
      : `You will owe ${esc(partnerName())} <b class="neg">${money(share)}</b>`;
  }

  async function saveExpense(ev) {
    ev.preventDefault();
    const err = $('expense-error');
    const amount = parseAmount($('f-amount').value);
    const title = $('f-title').value.trim() || catById(state.form.category).label;
    const s = SPLITS().find((x) => x.id === state.form.split);
    if (!amount) { err.textContent = 'Enter an amount.'; err.hidden = false; return; }
    if (s.paid === 'them' && !state.partner) { err.textContent = 'Your partner needs to sign in first.'; err.hidden = false; return; }
    const row = {
      kind: 'expense',
      title,
      amount,
      category: state.form.category,
      paid_by: s.paid === 'me' ? state.me.user_id : state.partner.user_id,
      split: s.split,
      spent_on: $('f-date').value || todayISO(),
      note: $('f-note').value.trim() || null,
    };
    await persist(row, $('save-btn'), err, 'Saved');
  }

  async function persist(row, btn, err, okMsg) {
    btn.disabled = true;
    let res;
    if (state.editing) {
      res = await state.sb.from('entries')
        .update({ ...row, updated_by: state.me.user_id, updated_at: new Date().toISOString() })
        .eq('id', state.editing.id);
    } else {
      res = await state.sb.from('entries').insert({ ...row, created_by: state.me.user_id });
    }
    btn.disabled = false;
    if (res.error) { err.textContent = 'Could not save. Check your connection.'; err.hidden = false; console.error(res.error); return; }
    closeSheets();
    toast(okMsg);
    await loadEntries();
    render();
  }

  // Two-tap delete (no browser confirm dialogs)
  function disarm(btn) { btn.classList.remove('armed'); btn.textContent = 'Delete'; }
  async function handleDelete(btn) {
    if (!btn.classList.contains('armed')) {
      btn.classList.add('armed');
      btn.textContent = 'Tap to confirm';
      setTimeout(() => disarm(btn), 3000);
      return;
    }
    const id = state.editing.id;
    btn.disabled = true;
    const { error } = await state.sb.from('entries').delete().eq('id', id);
    btn.disabled = false;
    if (error) { toast('Could not delete'); console.error(error); return; }
    closeSheets();
    toast('Deleted');
    await loadEntries();
    render();
  }

  // ---------- Settle sheet ----------
  function openSettle(entry) {
    state.editing = entry || null;
    const b = balance();
    if (entry) state.settleDir = entry.paid_by === state.me.user_id ? 'me' : 'them';
    else state.settleDir = b > 0 ? 'them' : 'me';
    $('settle-heading').textContent = entry ? 'Edit payment' : 'Settle up';
    $('s-amount').value = entry ? String(Number(entry.amount)) : (b !== 0 ? String(Math.abs(b)) : '');
    $('s-date').value = entry ? entry.spent_on : todayISO();
    $('s-note').value = entry?.note || '';
    $('settle-delete-btn').hidden = !entry;
    $('settle-error').hidden = true;
    $('settle-meta').textContent = entry ? metaLine(entry) : '';
    renderSettleDir();
    updateSettlePreview();
    openSheet('sheet-settle');
  }

  function renderSettleDir() {
    const opts = [
      { id: 'me',   title: `I paid ${partnerName()}`, sub: 'Paying back what I owe' },
      { id: 'them', title: `${partnerName()} paid me`, sub: 'Paying back what they owe' },
    ];
    $('s-direction').innerHTML = opts.map((o) =>
      `<button type="button" class="split-opt" data-dir="${o.id}" aria-pressed="${state.settleDir === o.id}">` +
      `<strong>${esc(o.title)}</strong><small>${esc(o.sub)}</small></button>`
    ).join('');
  }

  function updateSettlePreview() {
    const amt = parseAmount($('s-amount').value) || 0;
    const current = state.editing ? balance() - effectOnMe(state.editing) : balance();
    const after = round2(current + (state.settleDir === 'me' ? amt : -amt));
    const p = $('s-preview');
    if (!amt) { p.textContent = ''; return; }
    p.innerHTML = after === 0 ? 'You will be <b class="pos">all settled up</b>'
      : after > 0 ? `After this, ${esc(partnerName())} owes you <b class="pos">${money(after)}</b>`
      : `After this, you owe ${esc(partnerName())} <b class="neg">${money(after)}</b>`;
  }

  async function saveSettle(ev) {
    ev.preventDefault();
    const err = $('settle-error');
    const amount = parseAmount($('s-amount').value);
    if (!amount) { err.textContent = 'Enter an amount.'; err.hidden = false; return; }
    const row = {
      kind: 'settle',
      title: 'Settle up',
      amount,
      category: null,
      paid_by: state.settleDir === 'me' ? state.me.user_id : state.partner.user_id,
      split: 'full',
      spent_on: $('s-date').value || todayISO(),
      note: $('s-note').value.trim() || null,
    };
    await persist(row, ev.submitter || $('settle-form').querySelector('[type=submit]'), err, 'Payment recorded');
  }

  // ---------- CSV export ----------
  function exportCSV() {
    const head = ['Date', 'Type', 'Description', 'Category', 'Amount', 'Paid by', 'Split', 'Effect on me', 'Note'];
    const rows = state.entries.map((e) => [
      e.spent_on, e.kind, e.title, e.kind === 'settle' ? '' : catById(e.category).label, Number(e.amount).toFixed(2),
      nameOf(e.paid_by), e.split === 'half' ? '50/50' : 'Full', effectOnMe(e).toFixed(2), e.note || '',
    ]);
    const csv = [head, ...rows].map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `halves-${todayISO()}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ---------- Events ----------
  $('login-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = ev.submitter; btn.disabled = true;
    $('login-error').hidden = true;
    const { data, error } = await state.sb.auth.signInWithPassword({
      email: $('login-email').value.trim(), password: $('login-password').value,
    });
    btn.disabled = false;
    if (error) { $('login-error').textContent = 'Wrong email or password.'; $('login-error').hidden = false; return; }
    if (!state.user) { state.user = data.user; afterLogin(); }
  });

  $('name-form').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const name = $('name-input').value.trim();
    if (!name) return;
    const err = $('name-error'); err.hidden = true;
    const res = state.me
      ? await state.sb.from('members').update({ display_name: name }).eq('user_id', state.user.id)
      : await state.sb.from('members').insert({ user_id: state.user.id, display_name: name });
    if (res.error) { err.textContent = res.error.message || 'Could not save'; err.hidden = false; return; }
    await afterLogin();
  });

  $('add-btn').addEventListener('click', () => openExpense());
  $('settle-btn').addEventListener('click', () => openSettle());
  $('menu-btn').addEventListener('click', () => {
    $('menu-who').textContent = `Signed in as ${state.me.display_name}${state.partner ? ' · sharing with ' + state.partner.display_name : ''}`;
    openSheet('sheet-menu');
  });
  $('signout-btn').addEventListener('click', async () => { closeSheets(); await state.sb.auth.signOut(); });
  $('rename-btn').addEventListener('click', () => { closeSheets(); $('name-input').value = state.me.display_name; show('name'); });
  $('export-btn').addEventListener('click', () => { closeSheets(); exportCSV(); });

  document.querySelectorAll('[data-close]').forEach((el) => el.addEventListener('click', closeSheets));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeSheets(); });

  $('filters').addEventListener('click', (e) => {
    const b = e.target.closest('[data-filter]'); if (!b) return;
    state.filter = b.dataset.filter; renderFilters(); renderList();
  });
  $('list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]'); if (!b) return;
    const entry = state.entries.find((x) => x.id === b.dataset.id); if (!entry) return;
    entry.kind === 'settle' ? openSettle(entry) : openExpense(entry);
  });

  document.querySelector('.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab);
  });
  $('ov-range').addEventListener('click', (e) => {
    const b = e.target.closest('[data-range]'); if (!b) return;
    state.ov.range = b.dataset.range;
    state.ov.start = periodStart(b.dataset.range, new Date());
    state.ov.sel = null;
    renderOverview();
  });
  $('ov-prev').addEventListener('click', () => { state.ov.start = shiftPeriod(state.ov.range, state.ov.start, -1); state.ov.sel = null; renderOverview(); });
  $('ov-next').addEventListener('click', () => { state.ov.start = shiftPeriod(state.ov.range, state.ov.start, 1); state.ov.sel = null; renderOverview(); });
  $('ov-chart').addEventListener('click', (e) => {
    const b = e.target.closest('[data-bar]'); if (!b) return;
    const i = Number(b.dataset.bar);
    state.ov.sel = state.ov.sel === i ? null : i; renderOverview();
  });
  $('ov-cats').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat-jump]'); if (!b) return;
    state.filter = b.dataset.catJump; setTab('activity'); renderFilters(); renderList();
  });

  $('f-categories').addEventListener('click', (e) => {
    const b = e.target.closest('[data-cat]'); if (!b) return;
    state.form.category = b.dataset.cat; renderCategoryPicker();
  });
  $('f-splits').addEventListener('click', (e) => {
    const b = e.target.closest('[data-split]'); if (!b || b.disabled) return;
    state.form.split = b.dataset.split; renderSplitPicker(); updatePreview();
  });
  $('f-amount').addEventListener('input', updatePreview);
  $('expense-form').addEventListener('submit', saveExpense);
  $('delete-btn').addEventListener('click', (e) => handleDelete(e.currentTarget));

  $('s-direction').addEventListener('click', (e) => {
    const b = e.target.closest('[data-dir]'); if (!b) return;
    state.settleDir = b.dataset.dir; renderSettleDir(); updateSettlePreview();
  });
  $('s-amount').addEventListener('input', updateSettlePreview);
  $('settle-form').addEventListener('submit', saveSettle);
  $('settle-delete-btn').addEventListener('click', (e) => handleDelete(e.currentTarget));

  boot().catch((e) => { console.error(e); toast('Something went wrong loading the app'); });
})();
