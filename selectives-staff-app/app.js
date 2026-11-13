/*
 * Selectives Home Care — staff & family app (PWA)
 * Front end for the existing Apps Script API: every call is
 *   POST <API_URL>  body: {"method":"api_x","args":[...]}  ->  {ok, result | code, error}
 * Core, sign-in, shell, caregiver and family screens live here;
 * scheduler/admin screens are in admin.js (registered through App.route).
 */
(function () {
  'use strict';
  var CFG = window.APP_CONFIG || {};
  var TZ = CFG.TIME_ZONE || 'America/New_York';
  var DEMO = CFG.API_URL === 'DEMO';
  var SESSION_KEY = 'selectives_session_v1';
  var REQ_KEY = 'selectives_my_requests_v1';

  /* ================================================================ utils */
  function Raw(s) { this.s = s; }
  function raw(s) { return new Raw(s == null ? '' : String(s)); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function val(v) { if (v instanceof Raw) return v.s; if (Array.isArray(v)) return v.map(val).join(''); if (v == null || v === false) return ''; return esc(String(v)); }
  /** Tagged template: interpolations are escaped unless wrapped in raw() or produced by h``. */
  function h(strings) { var out = strings[0]; for (var i = 1; i < strings.length; i++) out += val(arguments[i]) + strings[i]; return new Raw(out); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) { var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); });
  }
  function deviceInfo() { return ('App ' + (isStandalone() ? 'installed' : 'browser') + ' | ' + navigator.userAgent).slice(0, 190); }
  function isStandalone() { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; }

  /* ---- dates (everything shown in the agency's time zone) ---- */
  var dayFmt = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
  function todayStr() { return dayFmt.format(new Date()); }
  function addDays(str, n) { var d = new Date(str + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function fmtDate(str, opts) {
    if (!str) return '';
    var d = new Date(String(str).slice(0, 10) + 'T12:00:00Z');
    if (isNaN(d)) return String(str);
    return d.toLocaleDateString('en-US', Object.assign({ weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }, opts || {}));
  }
  function fmtTime(hhmm) {
    if (!hhmm) return '';
    var m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm)); if (!m) return String(hhmm);
    var hr = Number(m[1]), ap = hr >= 12 ? 'PM' : 'AM'; hr = hr % 12 || 12;
    return hr + ':' + m[2] + ' ' + ap;
  }
  function fmtDT(v, withDate) {
    if (!v) return '';
    var d = new Date(v); if (isNaN(d)) return String(v);
    var o = { timeZone: TZ, hour: 'numeric', minute: '2-digit' };
    if (withDate !== false) { o.month = 'short'; o.day = 'numeric'; }
    return d.toLocaleString('en-US', o);
  }
  function relDay(str) {
    var t = todayStr();
    if (str === t) return 'Today'; if (str === addDays(t, 1)) return 'Tomorrow'; if (str === addDays(t, -1)) return 'Yesterday';
    return fmtDate(str);
  }
  /** ISO instant -> 'YYYY-MM-DDTHH:mm' wall time in the agency zone (for datetime-local inputs). */
  function isoToWall(v) {
    if (!v) return '';
    var d = new Date(v); if (isNaN(d)) return '';
    var p = {}; new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(d).forEach(function (x) { p[x.type] = x.value; });
    return p.year + '-' + p.month + '-' + p.day + 'T' + p.hour + ':' + p.minute;
  }
  /** Wall time in the agency zone -> string with an explicit Eastern offset the server accepts. */
  function wallToOffset(wall) {
    if (!wall) return '';
    var offs = ['-04:00', '-05:00'];
    for (var i = 0; i < offs.length; i++) {
      var d = new Date(wall + ':00' + offs[i]);
      if (!isNaN(d) && isoToWall(d) === wall) return wall + ':00' + offs[i];
    }
    throw new Error('That time does not exist in Eastern time (daylight-saving change). Pick another minute.');
  }
  function wallToIso(wall) { return wall ? new Date(wallToOffset(wall)).toISOString() : ''; }
  function hrs(n) { if (n === '' || n == null) return ''; var x = Number(n); return isFinite(x) ? (Math.round(x * 100) / 100) + ' h' : ''; }
  function dateTile(str) {
    var d = new Date(String(str).slice(0, 10) + 'T12:00:00Z');
    return h`<div class="date-tile"><small>${d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })}</small><b>${d.getUTCDate()}</b><small>${d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}</small></div>`;
  }
  var BADGE = {
    ASSIGNED: 'b-blue', OPEN: 'b-amber', REQUESTED: 'b-amber', IN_PROGRESS: 'b-green', COMPLETED: '', CANCELLED: 'b-red', DRAFT: '',
    PENDING: 'b-amber', APPROVED: 'b-green', REJECTED: 'b-red', WITHDRAWN: '', WITHHELD: 'b-red',
    SUBMITTED: 'b-blue', EXCEPTION: 'b-red', CORRECTED: 'b-amber',
    ACTIVE: 'b-green', INACTIVE: 'b-red', VERIFIED: 'b-green', BLOCKED: 'b-red', GPS_ISSUE: 'b-amber', OVERRIDDEN: 'b-blue', DENIED: 'b-red',
    INSIDE: 'b-green', OUTSIDE: 'b-red', LOW_ACCURACY: 'b-amber', UNAVAILABLE: 'b-amber', ADMIN_CORRECTED: 'b-blue',
    AVAILABLE: 'b-green', ADMIN: 'b-blue', SCHEDULER: 'b-amber', CAREGIVER: 'b-green',
    PENDING_REAPPROVAL: 'b-amber', CORRECTION_REQUIRED: 'b-red', SCHEDULED: 'b-blue', ARRIVED: 'b-green'
  };
  function badge(status, label) { if (!status && !label) return ''; return h`<span class="badge ${BADGE[status] || ''}">${label || String(status).replace(/_/g, ' ')}</span>`; }
  function payLabel(p) { return { PRIVATE_PAY: 'Private pay', MEDICAID_EVV: 'Medicaid (EVV)', OTHER: 'Other' }[p] || p || ''; }
  function mapsLink(addr) { return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(addr); }
  function isTrue(v) { return String(v).trim().toUpperCase() === 'TRUE'; }

  /* ================================================================ icons */
  var ICON = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    open: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
    bell: '<path d="M6 9a6 6 0 1112 0c0 6 3 7 3 7H3s3-1 3-7"/><path d="M10 20a2 2 0 004 0"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-4 3-6 6.5-6s6 2 6.5 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16 14c3 0 5 2 5.5 5"/>',
    shifts: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 13h3M8 17h6"/>',
    pin: '<path d="M12 21s-7-6.5-7-12a7 7 0 0114 0c0 5.5-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    heart: '<path d="M12 20s-7-4.5-9-9a4.5 4.5 0 018-3 4.5 4.5 0 018 3c-2 4.5-7 9-7 9z"/>',
    check: '<path d="M4 12l5 5L20 6"/>',
    inbox: '<path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1 2h6l1-2h5"/>',
    dollar: '<path d="M12 3v18M16 7c0-1.5-1.8-2.5-4-2.5S8 5.5 8 7.5s2 2.6 4 3 4 1.2 4 3.3-1.8 3.2-4 3.2-4-1-4-2.5"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
    log: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13h7M9 17h7"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.5 4-7 8-7s7 2.5 8 7"/>',
    out: '<path d="M15 4h4v16h-4M10 17l5-5-5-5M15 12H3"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2"/>',
    refresh: '<path d="M20 11a8 8 0 10-2 6"/><path d="M20 4v7h-7"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>'
  };
  function icon(name) { return raw('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICON[name] || '') + '</svg>'); }

  /* ================================================================ session */
  var S = { token: null, kind: null, me: null, unread: 0, shiftCache: {}, installEvt: null };
  function loadSession() {
    try { var s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); if (s && s.token) { S.token = s.token; S.kind = s.kind; S.me = s.me; } } catch (e) {}
  }
  function saveSession() { try { localStorage.setItem(SESSION_KEY, JSON.stringify({ token: S.token, kind: S.kind, me: S.me })); } catch (e) {} }
  function clearSession() { S.token = null; S.kind = null; S.me = null; S.unread = 0; S.shiftCache = {}; try { localStorage.removeItem(SESSION_KEY); } catch (e) {} }
  function can(p) { return !!(S.me && S.me.permissions && S.me.permissions.indexOf(p) !== -1); }
  function isManager() { return can('shift.view_all'); }
  function myRequests() { try { return JSON.parse(localStorage.getItem(REQ_KEY) || '{}'); } catch (e) { return {}; } }
  function setMyRequest(shiftId, requestId) { var m = myRequests(); if (requestId) m[shiftId] = requestId; else delete m[shiftId]; try { localStorage.setItem(REQ_KEY, JSON.stringify(m)); } catch (e) {} }

  /* ================================================================ API */
  async function call(method, args) {
    for (var attempt = 0; ; attempt++) {
      var data;
      if (DEMO) {
        data = await window.DemoAPI.handle(method, args);
      } else {
        if (!CFG.API_URL || CFG.API_URL.indexOf('https://') !== 0) throw new Error('The app is not connected yet. Set API_URL in config.js.');
        var res;
        try {
          // text/plain keeps this a "simple" request, so the browser skips the CORS preflight Apps Script can't answer.
          res = await fetch(CFG.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ method: method, args: args }), redirect: 'follow' });
        } catch (e) {
          throw new Error(navigator.onLine === false ? 'You are offline. Connect to the internet and try again.' : 'Could not reach the staff service. Check your connection and try again.');
        }
        if (!res.ok) throw new Error('The staff service returned an error (' + res.status + '). Please try again.');
        try { data = await res.json(); } catch (e) { throw new Error('The staff service sent an unexpected reply. Check that API_URL is the web app /exec URL.'); }
      }
      if (data && data.ok) return data.result;
      if (data && data.code === 'BUSY' && attempt < 3) { await sleep(500 + Math.random() * 800 * (attempt + 1)); continue; }
      var err = new Error((data && data.error) || 'Request failed.');
      err.code = data && data.code;
      if (err.code === 'AUTH_REQUIRED' && S.token && !/^api_(verify|request)/.test(method)) {
        clearSession(); toast(err.message, true); location.hash = '#/'; render();
      }
      throw err;
    }
  }
  /** Authenticated call: the session token is always the first argument. */
  function api(method) { return call(method, [S.token].concat(Array.prototype.slice.call(arguments, 1))); }
  /** Up to 6 read-only calls in one round trip. Returns results in order; a failed part throws when read. */
  async function batch(parts) {
    var out = await api('api_getBatch', parts.map(function (p) { return [p[0], p.slice(1)]; }));
    return out.map(function (r) { if (r.ok) return r.result; var e = new Error(r.error); e.code = r.code; return e; });
  }
  function ok(v) { if (v instanceof Error) throw v; return v; }

  /* ================================================================ UI helpers */
  var toastTimer;
  function toast(msg, isErr) {
    var t = $('#toast'); t.textContent = msg; t.className = 'show' + (isErr ? ' err' : '');
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.className = ''; }, isErr ? 5200 : 3200);
  }
  function busy(btn, on, label) {
    if (!btn) return;
    if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span>' + esc(label || 'Working…'); }
    else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
  }
  /** Runs an async action from a button with a spinner, reporting errors as a toast. */
  async function act(btn, label, fn) {
    busy(btn, true, label);
    try { return await fn(); } catch (e) { toast(e.message, true); } finally { if (btn && document.body.contains(btn)) busy(btn, false); }
  }
  function formValues(form) {
    var o = {};
    $$('input, select, textarea', form).forEach(function (el) {
      if (!el.name) return;
      var multi = /\[\]$/.test(el.name), name = el.name.replace(/\[\]$/, '');
      if (el.type === 'checkbox') {
        if (multi) { o[name] = o[name] || []; if (el.checked) o[name].push(el.value); }
        else o[name] = el.checked;
      } else if (el.type === 'radio') { if (el.checked) o[name] = el.value; else if (!(name in o)) o[name] = ''; }
      else o[name] = el.value.trim();
    });
    return o;
  }
  /**
   * Modal form. onSubmit(values, form) may throw to show an error inline;
   * returning false keeps the modal open. Resolves with the onSubmit result, or null if dismissed.
   */
  function modal(opt) {
    return new Promise(function (resolve) {
      var d = $('#modal');
      d.innerHTML = h`<form novalidate>
        <div class="modal-head"><h2>${opt.title}</h2><button type="button" class="x" aria-label="Close">×</button></div>
        <div class="modal-body"><div class="form-error" hidden></div>${opt.body || ''}</div>
        <div class="modal-foot">
          ${opt.cancel === false ? '' : h`<button type="button" class="btn cancel">${opt.cancel || 'Cancel'}</button>`}
          ${opt.submit === false ? '' : h`<button type="submit" class="btn ${opt.danger ? 'danger' : 'primary'} ok">${opt.submit || 'Save'}</button>`}
        </div></form>`.s;
      var form = $('form', d), errEl = $('.form-error', d), done = false;
      function close(v) { if (done) return; done = true; d.close(); d.innerHTML = ''; resolve(v); }
      $('.x', d).onclick = function () { close(null); };
      var c = $('.cancel', d); if (c) c.onclick = function () { close(null); };
      d.oncancel = function (e) { e.preventDefault(); close(null); };
      form.onsubmit = async function (e) {
        e.preventDefault();
        var btn = $('.ok', d); errEl.hidden = true; busy(btn, true, opt.busyLabel);
        try {
          var r = opt.onSubmit ? await opt.onSubmit(formValues(form), form) : true;
          if (r === false) { busy(btn, false); return; }
          close(r === undefined ? true : r);
        } catch (err) { errEl.textContent = err.message; errEl.hidden = false; busy(btn, false); errEl.scrollIntoView({ block: 'nearest' }); }
      };
      d.showModal();
      if (opt.onOpen) opt.onOpen(form, close);
      var first = $('input:not([type=hidden]):not([type=checkbox]):not([type=radio]), select, textarea', form);
      if (first && opt.autofocus !== false && window.innerWidth > 700) first.focus();
    });
  }
  function confirmBox(title, message, submit, danger) {
    return modal({ title: title, body: h`<p>${message}</p>`, submit: submit || 'Confirm', danger: danger });
  }
  function askText(title, label, opts) {
    opts = opts || {};
    return modal({
      title: title, submit: opts.submit || 'Submit', danger: opts.danger,
      body: h`${opts.intro ? h`<p class="muted">${opts.intro}</p>` : ''}<label class="f"><span>${label}</span><textarea name="text" maxlength="${opts.max || 500}" ${opts.required !== false ? 'required' : ''}>${opts.value || ''}</textarea></label>`,
      onSubmit: function (v) {
        if (opts.required !== false && v.text.length < (opts.min || 1)) throw new Error(opts.minMessage || 'Please fill this in.');
        return v.text;
      }
    });
  }
  function field(label, input, hint) { return h`<label class="f"><span>${label}</span>${input}${hint ? h`<small>${hint}</small>` : ''}</label>`; }
  function options(list, selected, blank) {
    return h`${blank != null ? h`<option value="">${blank}</option>` : ''}${list.map(function (o) {
      var v = typeof o === 'object' ? o.value : o, l = typeof o === 'object' ? o.label : o;
      return h`<option value="${v}" ${String(v) === String(selected == null ? '' : selected) ? 'selected' : ''}>${l}</option>`;
    })}`;
  }
  function loading(el) { el.innerHTML = '<div class="loading">Loading…</div>'; }
  function errorBox(el, e, retry) {
    el.innerHTML = h`<div class="card"><div class="notice bad">${e.message}</div><button class="btn retry">${icon('refresh')} Try again</button></div>`.s;
    $('.retry', el).onclick = retry || render;
  }

  /* ================================================================ routing */
  var routes = {};
  var renderSeq = 0;
  function route(name, def) { routes[name] = def; }
  function parseHash() {
    var hsh = location.hash.replace(/^#\/?/, '');
    var q = {}, qi = hsh.indexOf('?');
    if (qi !== -1) { hsh.slice(qi + 1).split('&').forEach(function (kv) { var p = kv.split('='); if (p[0]) q[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ''); }); hsh = hsh.slice(0, qi); }
    var parts = hsh.split('/').filter(Boolean);
    return { name: parts[0] || 'home', id: parts[1] ? decodeURIComponent(parts[1]) : '', query: q };
  }
  function go(path) { if (location.hash === '#/' + path) render(); else location.hash = '#/' + path; }
  window.addEventListener('hashchange', function () { render(); });

  function tabsFor() {
    if (S.kind === 'family') return [];
    if (isManager()) {
      var t = [{ k: 'home', l: 'Home', i: 'home' }, { k: 'shifts', l: 'Shifts', i: 'shifts' }, { k: 'time', l: 'Time', i: 'clock' }];
      if (can('staff.view_directory')) t.push({ k: 'staff', l: 'Staff', i: 'users' });
      t.push({ k: 'more', l: 'More', i: 'more' });
      return t;
    }
    return [{ k: 'home', l: 'Home', i: 'home' }, { k: 'schedule', l: 'Schedule', i: 'cal' }, { k: 'open', l: 'Open shifts', i: 'open' }, { k: 'hours', l: 'Hours', i: 'clock' }, { k: 'more', l: 'More', i: 'more' }];
  }

  async function render() {
    var seq = ++renderSeq;
    var app = $('#app');
    if ($('#modal').open) { $('#modal').close(); $('#modal').innerHTML = ''; }
    if (!S.token) { renderLogin(app); return; }
    if (S.kind === 'family') { renderFamily(app); return; }
    var r = parseHash();
    var def = routes[r.name] || routes.home;
    if (def.perm && !can(def.perm)) def = routes.home;
    var tabs = tabsFor();
    var activeTab = def.tab || r.name;
    app.innerHTML = h`
      <header class="topbar">
        <div class="title"><small>${CFG.ORG_NAME || 'Staff'}</small><strong id="page-title">${typeof def.title === 'function' ? '' : def.title || ''}</strong></div>
        <button class="icon-btn" id="bell" aria-label="Notifications">${icon('bell')}<span class="dot" ${S.unread ? '' : 'hidden'}>${S.unread}</span></button>
      </header>
      <main id="main" class="${def.wide ? 'wide' : ''}"></main>
      <nav class="tabbar">${tabs.map(function (t) { return h`<a href="#/${t.k}" class="${t.k === activeTab ? 'on' : ''}">${icon(t.i)}<span>${t.l}</span></a>`; })}</nav>`.s;
    $('#bell').onclick = function () { go('alerts'); };
    var main = $('#main');
    loading(main);
    window.scrollTo(0, 0);
    try {
      await def.view(main, r, function () { return seq === renderSeq; });
    } catch (e) { if (seq === renderSeq) errorBox(main, e); }
    refreshUnread();
  }
  function setTitle(t) { var el = $('#page-title'); if (el) el.textContent = t; document.title = t + ' · Selectives'; }
  async function refreshUnread() {
    if (!S.token || S.kind !== 'staff') return;
    try {
      S.unread = await api('api_countUnreadNotifications');
      var dot = $('#bell .dot'); if (dot) { dot.textContent = S.unread > 99 ? '99+' : S.unread; dot.hidden = !S.unread; }
    } catch (e) {}
  }

  /* ================================================================ sign in */
  function renderLogin(app) {
    var st = { kind: /family/i.test(location.search + location.hash) ? 'family' : 'staff', step: 'email', email: '' };
    document.title = 'Sign in · Selectives';
    function draw() {
      app.innerHTML = h`<div class="login"><div style="width:100%;max-width:420px">
        <div class="brand"><img src="icons/icon-192.png" alt=""><small>${st.kind === 'family' ? 'Family app' : 'Staff app'}</small><h1>${CFG.ORG_NAME || 'Selectives Home Care'}</h1></div>
        <div class="card">
          <div class="seg" role="tablist"><button type="button" data-k="staff" class="${st.kind === 'staff' ? 'on' : ''}">Staff</button><button type="button" data-k="family" class="${st.kind === 'family' ? 'on' : ''}">Family</button></div>
          ${DEMO ? h`<div class="demo-note"><b>Demo mode</b> – sample data, nothing is saved. Sign in as <b>admin@demo.com</b>, <b>scheduler@demo.com</b>, <b>caregiver@demo.com</b> or (Family) <b>family@demo.com</b>. Code: <b>123456</b></div>` : ''}
          ${st.step === 'email' ? h`
            <form id="f-email">
              <h2 style="margin-bottom:6px">Sign in</h2>
              <p class="muted small" style="margin-top:0">${st.kind === 'family' ? 'Use the email the care team has on file for you.' : 'Use your work email. We will email you a 6-digit code.'}</p>
              ${field('Email', h`<input type="email" name="email" autocomplete="email" inputmode="email" required value="${st.email}">`)}
              <button class="btn primary block xl" type="submit">Send sign-in code</button>
              <button class="btn ghost block" type="button" id="have-code" style="margin-top:6px">I already have a code</button>
            </form>` : h`
            <form id="f-code">
              <h2 style="margin-bottom:6px">Enter your code</h2>
              <p class="muted small" style="margin-top:0">${st.sentMsg || 'Enter the 6-digit code from your email.'}<br><b>${st.email}</b></p>
              ${field('6-digit code', h`<input type="text" name="code" class="code-input" inputmode="numeric" autocomplete="one-time-code" pattern="\\d{6}" maxlength="6" required>`)}
              <button class="btn primary block xl" type="submit">Sign in</button>
              <div class="row between" style="margin-top:10px"><button class="btn ghost sm" type="button" id="resend">Send a new code</button><button class="btn ghost sm" type="button" id="back">Use a different email</button></div>
            </form>`}
          <p class="small muted" style="text-align:center;margin-bottom:0">Need help? ${CFG.SUPPORT_PHONE ? h`<a href="tel:${CFG.SUPPORT_PHONE}">${CFG.SUPPORT_PHONE}</a>` : ''}</p>
        </div></div></div>`.s;
      $$('.seg button', app).forEach(function (b) { b.onclick = function () { st.kind = b.dataset.k; st.step = 'email'; draw(); }; });
      var fe = $('#f-email', app);
      if (fe) {
        fe.onsubmit = async function (e) {
          e.preventDefault(); var email = fe.email.value.trim();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast('Enter a valid email address.', true);
          st.email = email;
          await act($('button[type=submit]', fe), 'Sending…', async function () {
            var r = await call(st.kind === 'family' ? 'api_requestFamilyLoginCode' : 'api_requestLoginCode', [email, deviceInfo()]);
            st.sentMsg = (r && r.message) || 'If that email is registered, a code has been sent.'; st.step = 'code'; draw();
          });
        };
        $('#have-code', app).onclick = function () {
          var email = fe.email.value.trim();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast('Enter your email first.', true);
          st.email = email; st.sentMsg = 'Enter the code from your email (welcome codes last 15 hours).'; st.step = 'code'; draw();
        };
      }
      var fc = $('#f-code', app);
      if (fc) {
        if (window.innerWidth > 700) fc.code.focus();
        fc.code.oninput = function () { fc.code.value = fc.code.value.replace(/\D/g, '').slice(0, 6); if (fc.code.value.length === 6) fc.requestSubmit(); };
        fc.onsubmit = async function (e) {
          e.preventDefault(); var code = fc.code.value.trim();
          if (!/^\d{6}$/.test(code)) return toast('Enter the 6-digit code.', true);
          await act($('button[type=submit]', fc), 'Checking…', async function () {
            if (st.kind === 'family') {
              var fr = await call('api_verifyFamilyLoginCode', [st.email, code, deviceInfo()]);
              S.token = fr.token; S.kind = 'family'; S.me = { email: st.email };
            } else {
              var r = await call('api_verifyLoginCode', [st.email, code, deviceInfo()]);
              S.token = r.token; S.kind = 'staff'; S.me = r.employee;
            }
            saveSession(); location.hash = '#/home'; render();
          });
        };
        $('#resend', app).onclick = function (e) {
          act(e.currentTarget, 'Sending…', async function () {
            var r = await call(st.kind === 'family' ? 'api_requestFamilyLoginCode' : 'api_requestLoginCode', [st.email, deviceInfo()]);
            toast((r && r.message) || 'Code sent.');
          });
        };
        $('#back', app).onclick = function () { st.step = 'email'; draw(); };
      }
    }
    draw();
  }
  async function signOut() {
    var t = S.token; clearSession();
    try { if (t) await call('api_signOut', [t]); } catch (e) {}
    location.hash = '#/'; render();
  }

  /* ================================================================ clock in / out */
  function readGps() {
    return new Promise(function (resolve) {
      var attemptId = 'LOC-' + uuid();
      var fake = { latitude: 39.4213, longitude: -76.6236, accuracy: 15, timestamp: Date.now(), attemptId: attemptId };
      // Demo only: where the browser blocks location (e.g. an embedded preview), pretend a good reading.
      if (DEMO) { var real = resolve; resolve = function (r) { real(r.error ? fake : r); }; }
      if (!navigator.geolocation) return resolve({ error: 'POSITION_UNAVAILABLE', attemptId: attemptId });
      navigator.geolocation.getCurrentPosition(function (p) {
        resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy, timestamp: Math.round(p.timestamp || Date.now()), attemptId: attemptId });
      }, function (e) {
        resolve({ error: e.code === 1 ? 'PERMISSION_DENIED' : e.code === 3 ? 'TIMEOUT' : 'POSITION_UNAVAILABLE', attemptId: attemptId });
      }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
    });
  }
  function distanceLines(r) {
    var out = [];
    if (r.distanceMiles !== '' && r.distanceMiles != null) out.push('Distance from the service location: ' + Number(r.distanceMiles).toFixed(2) + ' mi');
    if (r.radiusMiles) out.push('Allowed clock-in area: ' + r.radiusMiles + ' mi');
    if (r.accuracyMeters !== '' && r.accuracyMeters != null) out.push('Your GPS accuracy: ' + Math.round(r.accuracyMeters) + ' m' + (r.maximumAccuracyMeters ? ' (needs ' + r.maximumAccuracyMeters + ' m or better)' : ''));
    return out;
  }
  async function requestReview(eventId) {
    var text = await askText('Ask for a location review', 'What happened?', {
      intro: 'A supervisor will review this attempt. Explain why your location could not be verified (for example: parked down the street, met the client outside).',
      min: 5, minMessage: 'Please write at least a few words for your reviewer.'
    });
    if (text == null) return;
    try { await api('api_requestLocationOverride', eventId, text); toast('Review requested. Your supervisor has been notified.'); }
    catch (e) { toast(e.message, true); }
  }
  async function clockIn(shift, btn) {
    busy(btn, true, 'Getting your location…');
    try {
      var gps = await readGps();
      btn.innerHTML = '<span class="spin"></span>Verifying…';
      var r = await api('api_clockIn', shift.Shift_ID, gps, deviceInfo());
      if (r.ok) { toast('Clocked in at ' + fmtDT(r.clockInTime, false) + '. ' + (r.message || '')); render(); return; }
      var again = await modal({
        title: 'Clock-in not verified', submit: 'Try again', cancel: 'Close',
        body: h`<div class="notice warn">${r.message}</div>${distanceLines(r).map(function (l) { return h`<p class="small">${l}</p>`; })}
          ${r.eventId ? h`<p class="small muted">Still can’t clock in? Ask a supervisor to review this attempt.</p><button type="button" class="btn block" id="ask-review">Request a location review</button>` : ''}`,
        onOpen: function (form, close) { var b = $('#ask-review', form); if (b) b.onclick = function () { close(null); requestReview(r.eventId); }; }
      });
      if (again) return clockIn(shift, btn);
    } catch (e) { toast(e.message, true); } finally { if (document.body.contains(btn)) busy(btn, false); }
  }
  async function clockOut(shift, btn) {
    var sure = await confirmBox('Clock out?', 'This records the end of your shift ' + (shift.Location_Label ? 'at ' + shift.Location_Label : '') + '. Your location is checked one more time.', 'Clock out');
    if (!sure) return;
    busy(btn, true, 'Getting your location…');
    try {
      var gps = await readGps();
      btn.innerHTML = '<span class="spin"></span>Saving…';
      var r = await api('api_clockOut', shift.Shift_ID, gps, deviceInfo());
      await modal({
        title: r.flagged ? 'Clocked out – needs review' : 'Clocked out', cancel: false, submit: 'Done',
        body: h`<div class="notice ${r.flagged ? 'warn' : 'ok'}">${r.message}</div>
          <p>Clock-out time: <b>${fmtDT(r.clockOutTime, false)}</b> · Total: <b>${hrs(r.totalHours)}</b></p>
          ${r.flagged ? distanceLines(r).map(function (l) { return h`<p class="small">${l}</p>`; }) : ''}
          ${r.flagged && r.eventId ? h`<button type="button" class="btn block" id="ask-review">Explain to your supervisor</button>` : ''}
          ${shift.Client_ID ? h`<p class="small muted">Remember to record the care you provided for this visit.</p>` : ''}`,
        onOpen: function (form, close) { var b = $('#ask-review', form); if (b) b.onclick = function () { close(null); requestReview(r.eventId); }; }
      });
      if (shift.Client_ID) go('shift/' + shift.Shift_ID); else render();
    } catch (e) { toast(e.message, true); } finally { if (document.body.contains(btn)) busy(btn, false); }
  }
  async function reportProblem(shift) {
    var types = [
      { value: 'MISSED_CLOCK_IN', label: 'I missed my clock-in' }, { value: 'MISSED_CLOCK_OUT', label: 'I missed my clock-out' },
      { value: 'INCORRECT_TIME', label: 'A recorded time is wrong' }, { value: 'GPS_FAILURE', label: 'GPS / location problem' }, { value: 'OTHER', label: 'Something else' }
    ];
    var res = await modal({
      title: 'Report a time problem', submit: 'Send to the office',
      body: h`<p class="muted small">${fmtDate(shift.Shift_Date)} · ${fmtTime(shift.Start_Time)}–${fmtTime(shift.End_Time)}</p>
        ${field('What went wrong?', h`<select name="Problem_Type" required>${options(types)}</select>`)}
        ${field('Correct clock-in (optional)', h`<input type="datetime-local" name="Requested_Clock_In">`)}
        ${field('Correct clock-out (optional)', h`<input type="datetime-local" name="Requested_Clock_Out">`)}
        ${field('Explain', h`<textarea name="Reason" maxlength="500" required></textarea>`)}`,
      onSubmit: async function (v) {
        if (!v.Reason) throw new Error('Please explain what happened.');
        var payload = { Shift_ID: shift.Shift_ID, Problem_Type: v.Problem_Type, Reason: v.Reason };
        if (v.Requested_Clock_In) payload.Requested_Clock_In = wallToOffset(v.Requested_Clock_In);
        if (v.Requested_Clock_Out) payload.Requested_Clock_Out = wallToOffset(v.Requested_Clock_Out);
        return api('api_reportTimeProblem', payload);
      }
    });
    if (res) toast('Sent. The office will review it.');
  }

  /* ================================================================ caregiver screens */
  function shiftItem(s, opts) {
    opts = opts || {};
    S.shiftCache[s.Shift_ID] = s;
    return h`<div class="item tap" data-go="shift/${s.Shift_ID}">${dateTile(s.Shift_Date)}
      <div class="body"><b>${fmtTime(s.Start_Time)} – ${fmtTime(s.End_Time)}</b>
      <span>${s.Location_Label || s.General_Service_Area || ''}${opts.who ? h` · ${s.Assigned_Employee_Name || 'Unassigned'}` : ''}</span></div>
      ${badge(s.Shift_Status)}</div>`;
  }
  function wireGo(root) { $$('[data-go]', root).forEach(function (el) { el.onclick = function (e) { var inner = e.target.closest('button, a'); if (inner && inner !== el) return; go(el.dataset.go); }; }); }

  function installHint() {
    if (isStandalone()) return '';
    var ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (S.installEvt) return h`<div class="install-hint">${icon('download')}<span>Install the app on this phone for one-tap access.</span><button class="btn sm primary" id="install-btn">Install</button></div>`;
    if (ios) return h`<div class="install-hint">${icon('download')}<span>Install: tap <b>Share</b> then <b>Add to Home Screen</b>.</span></div>`;
    return '';
  }
  function wireInstall(root) {
    var b = $('#install-btn', root);
    if (b) b.onclick = async function () { var e = S.installEvt; S.installEvt = null; e.prompt(); try { await e.userChoice; } catch (x) {} b.closest('.install-hint').remove(); };
  }

  route('home', { title: 'Home', view: async function (el, r, live) {
    if (isManager()) return routes.dashboard.view(el, r, live);
    setTitle('Home');
    var t = todayStr();
    var res = await batch([['api_listMySchedule', { dateFrom: addDays(t, -1), dateTo: addDays(t, 14), dashboard: true }], ['api_getMyHours', { summaryOnly: true }], ['api_listOpenShifts']]);
    if (!live()) return;
    var shifts = ok(res[0]), hoursSum = res[1] instanceof Error ? null : res[1], open = res[2] instanceof Error ? [] : res[2];
    var active = shifts.filter(function (s) { return s.Shift_Status === 'IN_PROGRESS'; })[0];
    var nextUp = shifts.filter(function (s) { return s.Shift_Status === 'ASSIGNED' && s.Can_Clock_In; })[0];
    var upcoming = shifts.filter(function (s) { return s.Shift_Status === 'ASSIGNED' && s.Shift_Date >= t && s !== nextUp; }).slice(0, 6);
    var hero;
    if (active) {
      hero = h`<div class="card hero"><small class="muted">YOU ARE CLOCKED IN</small>
        <h2 style="margin:6px 0 2px">${active.Location_Label || active.General_Service_Area || 'Current shift'}</h2>
        <p class="muted">${relDay(active.Shift_Date)} · ${fmtTime(active.Start_Time)} – ${fmtTime(active.End_Time)}</p>
        <button class="btn accent block xl" id="clock-out" style="margin-top:12px">${icon('clock')} Clock out</button>
        <button class="btn ghost block" data-go="shift/${active.Shift_ID}" style="color:#fff">Shift details & care notes</button></div>`;
    } else if (nextUp) {
      var startsToday = nextUp.Shift_Date === t;
      hero = h`<div class="card hero"><small class="muted">${startsToday ? 'NEXT SHIFT · TODAY' : 'NEXT SHIFT · ' + relDay(nextUp.Shift_Date).toUpperCase()}</small>
        <div class="big-time" style="margin:6px 0 2px">${fmtTime(nextUp.Start_Time)}</div>
        <p class="muted">until ${fmtTime(nextUp.End_Time)} · ${nextUp.Location_Label || nextUp.General_Service_Area || ''}</p>
        ${nextUp.Street_Address ? h`<p><a href="${mapsLink(nextUp.Street_Address)}" target="_blank" rel="noopener" style="color:#fff">${icon('pin')} ${nextUp.Street_Address}</a></p>` : ''}
        ${nextUp.Clock_In_Overdue ? h`<div class="notice warn">Your shift has started. Clock in now.</div>` : ''}
        ${startsToday ? h`<button class="btn accent block xl" id="clock-in" style="margin-top:12px">${icon('clock')} Clock in</button>` : ''}
        <button class="btn ghost block" data-go="shift/${nextUp.Shift_ID}" style="color:#fff">View shift</button></div>`;
    } else {
      hero = h`<div class="card hero"><small class="muted">HELLO ${String(S.me.firstName || '').toUpperCase()}</small><h2 style="margin:6px 0">No shift to clock in to right now.</h2><p class="muted">${open.length ? 'There are open shifts you can request.' : 'Check your schedule or set your availability so the office can offer you shifts.'}</p></div>`;
    }
    el.innerHTML = h`${installHint()}${hero}
      ${hoursSum ? h`<div class="grid"><a class="stat" href="#/hours"><b>${hoursSum.weeklyHours}</b><span>hours this week</span></a><a class="stat" href="#/hours"><b>${hoursSum.payPeriodHours}</b><span>hours this pay period</span></a><a class="stat ${open.length ? 'alert' : ''}" href="#/open"><b>${open.length}</b><span>open shifts for you</span></a></div>` : ''}
      <div class="section-title">Coming up</div>
      ${upcoming.length ? h`<div class="list">${upcoming.map(function (s) { return shiftItem(s); })}</div>` : h`<div class="card empty">No other shifts in the next two weeks.</div>`}
      <div class="actions"><a class="btn" href="#/availability">${icon('cal')} Set my availability</a><a class="btn" href="#/schedule">Full schedule</a></div>`.s;
    wireGo(el); wireInstall(el);
    var ci = $('#clock-in', el); if (ci) ci.onclick = function () { clockIn(nextUp, ci); };
    var co = $('#clock-out', el); if (co) co.onclick = function () { clockOut(active, co); };
  } });

  route('schedule', { title: 'My schedule', view: async function (el, r, live) {
    setTitle('My schedule');
    var t = todayStr(), range = r.query.range || 'upcoming';
    var ranges = { upcoming: [t, addDays(t, 28)], past: [addDays(t, -28), addDays(t, -1)] };
    var list = await api('api_listMySchedule', { dateFrom: ranges[range][0], dateTo: ranges[range][1] });
    if (!live()) return;
    if (range === 'past') list.reverse();
    var byDay = {};
    list.forEach(function (s) { (byDay[s.Shift_Date] = byDay[s.Shift_Date] || []).push(s); });
    el.innerHTML = h`<div class="seg"><button data-r="upcoming" class="${range === 'upcoming' ? 'on' : ''}">Next 4 weeks</button><button data-r="past" class="${range === 'past' ? 'on' : ''}">Past 4 weeks</button></div>
      ${list.length ? Object.keys(byDay).map(function (d) { return h`<div class="section-title">${relDay(d)}</div><div class="list">${byDay[d].map(function (s) { return shiftItem(s); })}</div>`; })
        : h`<div class="card empty">${range === 'upcoming' ? 'No shifts scheduled yet.' : 'No shifts in the past four weeks.'}</div>`}`.s;
    $$('.seg button', el).forEach(function (b) { b.onclick = function () { go('schedule?range=' + b.dataset.r); }; });
    wireGo(el);
  } });

  route('shift', { title: 'Shift', tab: 'schedule', view: async function (el, r, live) {
    if (isManager() && routes.mshift) return routes.mshift.view(el, r, live);
    setTitle('Shift');
    var s = S.shiftCache[r.id];
    var fresh = await api('api_listMySchedule', s ? { dateFrom: s.Shift_Date, dateTo: s.Shift_Date, dashboard: true } : {});
    s = fresh.filter(function (x) { return x.Shift_ID === r.id; })[0] || s;
    if (!live()) return;
    if (!s) { el.innerHTML = h`<div class="card empty">This shift is no longer on your schedule.</div>`.s; return; }
    S.shiftCache[s.Shift_ID] = s;
    var care = null;
    if (s.Client_ID && ['IN_PROGRESS', 'COMPLETED'].indexOf(s.Shift_Status) !== -1) { try { care = await api('api_getVisitCare', s.Shift_ID); } catch (e) { care = { error: e.message }; } }
    if (!live()) return;
    var isToday = s.Shift_Date === todayStr();
    el.innerHTML = h`<div class="card">
        <div class="row between"><h2>${relDay(s.Shift_Date)}</h2>${badge(s.Shift_Status)}</div>
        <p class="big-time" style="font-size:1.6rem">${fmtTime(s.Start_Time)} – ${fmtTime(s.End_Time)}</p>
        <dl class="kv">
          ${s.Location_Label ? h`<dt>Location</dt><dd>${s.Location_Label}</dd>` : ''}
          ${s.Street_Address ? h`<dt>Address</dt><dd><a href="${mapsLink(s.Street_Address)}" target="_blank" rel="noopener">${s.Street_Address}</a></dd>` : ''}
          <dt>Area</dt><dd>${s.General_Service_Area || '—'}</dd>
          ${s.Required_Qualifications ? h`<dt>Requires</dt><dd>${s.Required_Qualifications}</dd>` : ''}
          <dt>Pay type</dt><dd>${payLabel(s.Pay_Type)}</dd>
        </dl>
        <div class="actions">
          ${s.Shift_Status === 'ASSIGNED' && s.Can_Clock_In && isToday ? h`<button class="btn accent xl block" id="ci">${icon('clock')} Clock in</button>` : ''}
          ${s.Shift_Status === 'IN_PROGRESS' ? h`<button class="btn accent xl block" id="co">${icon('clock')} Clock out</button>` : ''}
          <button class="btn" id="problem">Report a time problem</button>
        </div></div>
      ${care ? careCard(care) : ''}`.s;
    var ci = $('#ci', el); if (ci) ci.onclick = function () { clockIn(s, ci); };
    var co = $('#co', el); if (co) co.onclick = function () { clockOut(s, co); };
    $('#problem', el).onclick = function () { reportProblem(s); };
    var cf = $('#care-form', el);
    if (cf) cf.onsubmit = async function (e) {
      e.preventDefault(); var v = formValues(cf);
      await act($('button[type=submit]', cf), 'Saving…', async function () {
        await api('api_saveVisitCare', s.Shift_ID, v.tasks || [], v.note || '');
        toast('Care notes saved. The office will review them before family sees anything.'); render();
      });
    };
  } });
  function careCard(c) {
    if (c.error) return h`<div class="card"><h3>Visit care</h3><div class="notice bad">${c.error}</div></div>`;
    var status = c.approvalStatus ? h` ${badge(c.approvalStatus, c.approvalStatus === 'PENDING' ? 'Waiting for office review' : c.approvalStatus === 'APPROVED' ? 'Shared with family' : 'Not shared')}` : '';
    if (c.readOnly) return h`<div class="card"><h3>Visit care${status}</h3><p>${(c.tasks || []).join(', ') || 'No tasks recorded.'}</p>${c.staffNote ? h`<p class="muted">${c.staffNote}</p>` : ''}<p class="small muted">This visit is closed. Use “Report a time problem” to ask for a change.</p></div>`;
    return h`<form class="card" id="care-form"><h3>Visit care${status}</h3>
      <p class="small muted">Tick the care you provided. The office reviews this before the family sees it.</p>
      <div class="chips" style="margin:10px 0 12px">${(c.availableTasks || []).map(function (t) { return h`<label><input type="checkbox" name="tasks[]" value="${t}" ${(c.tasks || []).indexOf(t) !== -1 ? 'checked' : ''}>${t}</label>`; })}</div>
      ${field('Note for the office', h`<textarea name="note" maxlength="500" placeholder="How did the visit go?">${c.staffNote || ''}</textarea>`)}
      <button class="btn primary block" type="submit">Save care notes</button></form>`;
  }

  route('open', { title: 'Open shifts', view: async function (el, r, live) {
    setTitle('Open shifts');
    var list = await api('api_listOpenShifts');
    if (!live()) return;
    var mine = myRequests();
    el.innerHTML = h`<div class="page-head"><div><p>Shifts that match your qualifications and the availability you’ve set. Request one and the office will confirm.</p></div></div>
      ${list.length ? list.map(function (s) {
        return h`<div class="card"><div class="row between"><div class="row">${dateTile(s.Shift_Date)}<div><b>${fmtTime(s.Start_Time)} – ${fmtTime(s.End_Time)}</b><div class="muted small">${s.General_Service_Area || ''} · ${payLabel(s.Pay_Type)}</div></div></div>
          ${s.AlreadyRequested ? badge('PENDING', 'Requested') : ''}</div>
          ${s.Required_Qualifications ? h`<p class="small muted">Requires: ${s.Required_Qualifications}</p>` : ''}
          <div class="actions">${s.AlreadyRequested
            ? (mine[s.Shift_ID] ? h`<button class="btn danger sm" data-withdraw="${s.Shift_ID}">Withdraw request</button>` : h`<span class="small muted">The office will let you know.</span>`)
            : h`<button class="btn primary" data-req="${s.Shift_ID}">Request this shift</button>`}</div></div>`;
      }) : h`<div class="card empty"><p>No open shifts match you right now.</p><p class="small">Open shifts only show for days you’ve marked yourself available.</p><a class="btn primary" href="#/availability">Set my availability</a></div>`}`.s;
    $$('[data-req]', el).forEach(function (b) {
      b.onclick = function () { act(b, 'Requesting…', async function () { var rec = await api('api_requestShift', b.dataset.req); setMyRequest(b.dataset.req, rec.Request_ID); toast('Requested. You’ll be notified when the office decides.'); render(); }); };
    });
    $$('[data-withdraw]', el).forEach(function (b) {
      b.onclick = async function () {
        if (!await confirmBox('Withdraw request?', 'The shift goes back to other caregivers.', 'Withdraw', true)) return;
        act(b, 'Withdrawing…', async function () { await api('api_withdrawShiftRequest', myRequests()[b.dataset.withdraw]); setMyRequest(b.dataset.withdraw, null); toast('Request withdrawn.'); render(); });
      };
    });
  } });

  function availabilityForm(row) {
    row = row || {};
    var allDay = !row.Available_From && !row.Available_To;
    return modal({
      title: row.Availability_ID ? 'Edit availability' : 'Add availability', submit: 'Save',
      body: h`${field('Date', h`<input type="date" name="Date" min="${todayStr()}" required value="${row.Date || ''}">`)}
        ${field('I am', h`<select name="Availability_Status">${options([{ value: 'AVAILABLE', label: 'Available' }, { value: 'UNAVAILABLE', label: 'Not available' }], row.Availability_Status || 'AVAILABLE')}</select>`)}
        <label class="check"><input type="checkbox" name="allDay" ${allDay ? 'checked' : ''}> All day</label>
        <div class="row" id="times" style="${allDay ? 'display:none' : ''}">
          <label class="f" style="flex:1"><span>From</span><input type="time" name="Available_From" value="${row.Available_From || '08:00'}"></label>
          <label class="f" style="flex:1"><span>To</span><input type="time" name="Available_To" value="${row.Available_To || '17:00'}"></label></div>
        <p class="small muted" style="margin-top:-4px">An end time earlier than the start means overnight.</p>
        ${field('Note (optional)', h`<input type="text" name="Note" maxlength="300" value="${row.Note || ''}">`)}`,
      onOpen: function (form) { form.allDay.onchange = function () { $('#times', form).style.display = form.allDay.checked ? 'none' : ''; }; },
      onSubmit: async function (v) {
        var p = { Date: v.Date, Availability_Status: v.Availability_Status, Available_From: v.allDay ? '' : v.Available_From, Available_To: v.allDay ? '' : v.Available_To, Note: v.Note };
        if (!p.Date) throw new Error('Choose a date.');
        if (row.Availability_ID) return api('api_updateAvailability', row.Availability_ID, p);
        return api('api_createAvailability', p);
      }
    });
  }
  route('availability', { title: 'My availability', tab: 'more', view: async function (el, r, live) {
    setTitle('My availability');
    var list = await api('api_listMyAvailability');
    if (!live()) return;
    var t = todayStr();
    var future = list.filter(function (a) { return a.Date >= t; });
    el.innerHTML = h`<div class="page-head"><p>Tell the office when you can work. Open shifts are offered on days you’re available.</p><button class="btn primary" id="add">+ Add a day</button></div>
      ${future.length ? h`<div class="list">${future.map(function (a) {
        return h`<div class="item tap" data-id="${a.Availability_ID}">${dateTile(a.Date)}<div class="body"><b>${a.Available_From ? fmtTime(a.Available_From) + ' – ' + fmtTime(a.Available_To) : 'All day'}</b><span>${a.Note || ''}</span></div>${badge(a.Availability_Status, a.Availability_Status === 'AVAILABLE' ? 'Available' : 'Not available')}</div>`;
      })}</div>` : h`<div class="card empty">No upcoming availability set.</div>`}
      <p class="small muted">Entries can’t be deleted — change a day to “Not available” instead.</p>`.s;
    $('#add', el).onclick = async function () { if (await availabilityForm()) { toast('Saved.'); render(); } };
    $$('[data-id]', el).forEach(function (it) {
      it.onclick = async function () { var row = future.filter(function (a) { return a.Availability_ID === it.dataset.id; })[0]; if (await availabilityForm(row)) { toast('Updated.'); render(); } };
    });
  } });

  route('hours', { title: 'My hours', view: async function (el, r, live) {
    setTitle('My hours');
    var res = await api('api_getMyHours', {});
    if (!live()) return;
    el.innerHTML = h`<div class="grid"><div class="stat"><b>${res.weeklyHours}</b><span>hours this week</span></div><div class="stat"><b>${res.payPeriodHours}</b><span>hours this pay period</span></div></div>
      <div class="section-title">Time entries</div>
      ${res.entries.length ? h`<div class="list">${res.entries.map(function (e, i) {
        return h`<div class="item tap" data-i="${i}">${dateTile(e.Shift_Date)}<div class="body"><b>${e.Clock_In_Time ? fmtDT(e.Clock_In_Time, false) : '—'} → ${e.Clock_Out_Time ? fmtDT(e.Clock_Out_Time, false) : 'open'}</b><span>${e.Total_Hours ? hrs(e.Total_Hours) : 'In progress'}</span></div>${badge(e.Entry_Status)}</div>`;
      })}</div>` : h`<div class="card empty">No time entries yet.</div>`}`.s;
    $$('[data-i]', el).forEach(function (it) {
      it.onclick = async function () {
        var e = res.entries[Number(it.dataset.i)];
        var again = await modal({
          title: fmtDate(e.Shift_Date), submit: 'Report a problem', cancel: 'Close',
          body: h`<dl class="kv"><dt>Scheduled</dt><dd>${fmtTime(e.Start_Time)} – ${fmtTime(e.End_Time)}</dd><dt>Clock in</dt><dd>${fmtDT(e.Clock_In_Time) || '—'} ${badge(e.Clock_In_Geofence_Status)}</dd>
            <dt>Clock out</dt><dd>${fmtDT(e.Clock_Out_Time) || '—'} ${badge(e.Clock_Out_Geofence_Status)}</dd><dt>Hours</dt><dd>${hrs(e.Total_Hours) || '—'}</dd><dt>Status</dt><dd>${badge(e.Entry_Status)}</dd>
            ${e.Correction_Reason ? h`<dt>Note</dt><dd>${e.Correction_Reason}</dd>` : ''}</dl>`
        });
        if (again) reportProblem({ Shift_ID: e.Shift_ID, Shift_Date: e.Shift_Date, Start_Time: e.Start_Time, End_Time: e.End_Time });
      };
    });
  } });

  route('alerts', { title: 'Notifications', tab: 'more', view: async function (el, r, live) {
    setTitle('Notifications');
    var list = await api('api_listMyNotifications');
    if (!live()) return;
    var unread = list.filter(function (n) { return !isTrue(n.Read_Status); });
    el.innerHTML = h`<div class="page-head"><p>${unread.length} unread</p>${unread.length ? h`<button class="btn sm" id="all">Mark all read</button>` : ''}</div>
      ${list.length ? h`<div class="list">${list.slice(0, 150).map(function (n) {
        return h`<div class="item tap ${isTrue(n.Read_Status) ? '' : 'unread'}" data-id="${n.Notification_ID}" data-rel="${n.Related_Record_ID || ''}"><div class="body"><b>${n.Title}</b><span style="white-space:normal">${n.Message}</span><span class="small">${fmtDT(n.Created_At)}</span></div></div>`;
      })}</div>` : h`<div class="card empty">You’re all caught up.</div>`}`.s;
    $$('[data-id]', el).forEach(function (it) {
      it.onclick = async function () {
        if (it.classList.contains('unread')) { it.classList.remove('unread'); try { await api('api_markNotificationRead', it.dataset.id); refreshUnread(); } catch (e) {} }
        if (/^SHF_/.test(it.dataset.rel)) go('shift/' + it.dataset.rel);
      };
    });
    var all = $('#all', el);
    if (all) all.onclick = function () {
      act(all, 'Marking…', async function () { for (var i = 0; i < unread.length && i < 40; i++) await api('api_markNotificationRead', unread[i].Notification_ID); render(); });
    };
  } });

  route('profile', { title: 'My profile', tab: 'more', view: async function (el, r, live) {
    setTitle('My profile');
    var p = await api('api_getMyProfile');
    var quals = [];
    try { quals = await api('api_listQualifications', p.Employee_ID); } catch (e) {}
    if (!live()) return;
    el.innerHTML = h`<div class="card"><h2>${p.First_Name} ${p.Last_Name}</h2><p>${badge(p.Role)} ${badge(String(p.Employment_Status).trim().toUpperCase())}</p>
      <dl class="kv"><dt>Email</dt><dd>${p.Email}</dd><dt>Phone</dt><dd>${p.Phone || '—'}</dd><dt>Hire date</dt><dd>${p.Hire_Date ? fmtDate(p.Hire_Date, { year: 'numeric' }) : '—'}</dd>
      <dt>Service areas</dt><dd>${p.Service_Areas || '—'}</dd><dt>Max weekly hours</dt><dd>${p.Maximum_Weekly_Hours || '—'}</dd>
      ${p.Hourly_Rate !== undefined && p.Hourly_Rate !== '' ? h`<dt>Hourly rate</dt><dd>$${p.Hourly_Rate}</dd>` : ''}</dl>
      <p class="small muted">To change your details, contact the office.</p></div>
      <div class="section-title">Credentials</div>
      ${quals.length ? h`<div class="list">${quals.map(function (q) { return h`<div class="item"><div class="body"><b>${q.Qualification_Type}</b><span>Expires ${fmtDate(q.Expiration_Date, { year: 'numeric' })}</span></div>${badge(q.Verification_Status)}</div>`; })}</div>` : h`<div class="card empty">No credentials on file.</div>`}
      <button class="btn danger block" id="so" style="margin-top:16px">${icon('out')} Sign out</button>`.s;
    $('#so', el).onclick = signOut;
  } });

  route('more', { title: 'More', view: async function (el) {
    setTitle('More');
    var links = [];
    function L(k, l, i, perm, badgeCount) { if (!perm || can(perm)) links.push({ k: k, l: l, i: i, n: badgeCount }); }
    if (!isManager()) {
      L('availability', 'My availability', 'cal'); L('open', 'Open shifts', 'open'); L('hours', 'My hours', 'clock');
    } else {
      L('requests', 'Shift requests', 'inbox', 'shift.approve_request');
      L('locationchecks', 'Location verification', 'shield', 'location.view_status');
      L('familyupdates', 'Family updates to approve', 'heart', 'visit.approve_family_update');
      L('clients', 'Clients & families', 'heart', 'client.view_all');
      L('locations', 'Service locations', 'pin', 'shift.view_all');
      L('corrections', 'Time correction requests', 'clock', 'timesheet.review');
      L('payroll', 'Payroll export', 'dollar', 'timesheet.export');
      L('settings', 'Settings', 'gear', 'system.manage');
      L('audit', 'Audit log', 'log', 'audit.view');
    }
    L('alerts', 'Notifications', 'bell', null, S.unread); L('profile', 'My profile', 'user');
    el.innerHTML = h`${installHint()}<div class="card" style="display:flex;gap:12px;align-items:center"><div class="date-tile" style="width:48px">${icon('user')}</div><div><b>${S.me.firstName} ${S.me.lastName}</b><div class="small muted">${S.me.role}</div></div></div>
      <div class="menu-list card">${links.map(function (x) { return h`<a href="#/${x.k}">${icon(x.i)}<span>${x.l}</span>${x.n ? h`<em>${x.n}</em>` : ''}</a>`; })}</div>
      <div class="menu-list card"><a href="tel:${CFG.SUPPORT_PHONE}">${icon('phone')}<span>Call the office · ${CFG.SUPPORT_PHONE}</span></a><a href="#" id="so">${icon('out')}<span>Sign out</span></a></div>
      <p class="small muted" style="text-align:center">${DEMO ? 'Demo mode · ' : ''}Selectives Staff app</p>`.s;
    $('#so', el).onclick = function (e) { e.preventDefault(); signOut(); };
    wireInstall(el);
  } });

  /* ================================================================ family */
  async function renderFamily(app, clientId) {
    document.title = 'Care today · Selectives';
    app.innerHTML = h`<header class="topbar"><div class="title"><small>${CFG.ORG_NAME}</small><strong>Care today</strong></div><button class="icon-btn" id="ref" aria-label="Refresh">${icon('refresh')}</button><button class="icon-btn" id="so" aria-label="Sign out">${icon('out')}</button></header><main id="main"></main>`.s;
    $('#so').onclick = signOut;
    $('#ref').onclick = function () { renderFamily(app, clientId); };
    var main = $('#main'); loading(main);
    try {
      var v = await api('api_getFamilyView', clientId || '');
      main.innerHTML = h`${installHint()}<div class="page-head"><div><h1>Hello ${v.contactName || ''}</h1><p>${fmtDate(v.today, { weekday: 'long', month: 'long', day: 'numeric' })}</p></div>
          ${v.clients.length > 1 ? h`<select id="who" style="max-width:220px">${options(v.clients.map(function (c) { return { value: c.clientId, label: c.name }; }), v.client.clientId)}</select>` : ''}</div>
        <div class="section-title">Today’s visits for ${v.client ? v.client.name : ''}</div>
        ${v.visits.length ? v.visits.map(function (x) {
          return h`<div class="card"><div class="row between"><h3>${x.caregiver}</h3>${badge(x.status, x.status === 'ARRIVED' ? 'Caregiver arrived' : x.status === 'COMPLETED' ? 'Visit complete' : 'Scheduled')}</div>
            <p class="muted">${fmtTime(x.startTime)} – ${fmtTime(x.endTime)}</p>
            ${x.arrivedAt ? h`<p class="small">Arrived ${fmtDT(x.arrivedAt, false)}${x.completedAt ? h` · Finished ${fmtDT(x.completedAt, false)}` : ''}</p>` : ''}
            ${x.tasks.length ? h`<div class="chips" style="margin:8px 0">${x.tasks.map(function (t) { return h`<span class="badge b-green">${icon('check')} ${t}</span>`; })}</div>` : ''}
            ${x.update ? h`<div class="notice ok">${x.update}</div>` : (x.status === 'COMPLETED' ? h`<p class="small muted">The care team will share an update after reviewing the visit.</p>` : '')}</div>`;
        }) : h`<div class="card empty">No visits scheduled today.</div>`}
        ${v.nextVisit ? h`<div class="card"><small class="muted">NEXT VISIT</small><h3 style="margin-top:4px">${relDay(v.nextVisit.date)} · ${fmtTime(v.nextVisit.startTime)} – ${fmtTime(v.nextVisit.endTime)}</h3></div>` : ''}
        <a class="btn block" href="tel:${v.phone}">${icon('phone')} Call the care team · ${v.phone}</a>`.s;
      var who = $('#who', main); if (who) who.onchange = function () { renderFamily(app, who.value); };
      wireInstall(main);
    } catch (e) { errorBox(main, e, function () { renderFamily(app, clientId); }); }
  }

  /* ================================================================ boot */
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); S.installEvt = e; });
  window.App = {
    h: h, raw: raw, esc: esc, $: $, $$: $$, api: api, batch: batch, ok: ok, route: route, routes: routes, go: go, render: render, setTitle: setTitle,
    modal: modal, confirmBox: confirmBox, askText: askText, field: field, options: options, toast: toast, act: act, busy: busy, formValues: formValues,
    badge: badge, icon: icon, dateTile: dateTile, shiftItem: shiftItem, wireGo: wireGo, careCard: careCard,
    fmtDate: fmtDate, fmtTime: fmtTime, fmtDT: fmtDT, relDay: relDay, todayStr: todayStr, addDays: addDays, hrs: hrs, payLabel: payLabel, mapsLink: mapsLink,
    isoToWall: isoToWall, wallToOffset: wallToOffset, wallToIso: wallToIso, uuid: uuid, isTrue: isTrue, can: can, S: S, loading: loading
  };
  document.addEventListener('DOMContentLoaded', async function () {
    loadSession();
    if (S.token && S.kind === 'staff') {
      // Confirms a stored session is still valid and picks up any role change.
      try { var me = await api('api_getCurrentSession'); S.me = Object.assign({}, S.me, me); saveSession(); } catch (e) { if (e.code !== 'AUTH_REQUIRED') { /* offline: keep going */ } }
    }
    render();
  });
})();
