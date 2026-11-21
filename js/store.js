/* Store: the ONLY module that knows where data lives.
   Data always lives in localStorage first (the app works fully offline). Two ways to share it:
   - manual: JSON export/import (works with no server at all)
   - live:   Store.sync, a small engine that pushes/pulls rows to Supabase through two RPC
             functions (supabase/schema.sql) when js/config.js is filled in and the phones are paired.
   Records carry id + updatedAt + soft-delete flags, so the same last-write-wins merge() is used
   for both files and the server. */
(function () {
  'use strict';

  const DATA_KEY = 'faithapp:data:v1';
  const DEVICE_KEY = 'faithapp:device:v1'; // per-device prefs (who is using this phone) — never synced

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function nowIso() { return new Date().toISOString(); }
  function dateKey(d) {
    d = d || new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }
  // The "faith day" runs 4 AM to 4 AM, so a gratitude entry or a prayer at 12:30 AM still counts for "tonight".
  const DAY_START_HOUR = 4;
  function faithDate(d) {
    const x = d ? new Date(d.getTime()) : new Date();
    if (x.getHours() < DAY_START_HOUR) x.setDate(x.getDate() - 1);
    x.setHours(12, 0, 0, 0);
    return x;
  }
  function faithDayKey(d) { return dateKey(faithDate(d)); }

  const LocalAdapter = {
    name: 'local',
    load: function () {
      try { return JSON.parse(localStorage.getItem(DATA_KEY)); } catch (e) { return null; }
    },
    save: function (data) {
      localStorage.setItem(DATA_KEY, JSON.stringify(data));
    }
  };

  function emptyData() {
    return {
      schema: 1,
      settings: { partners: ['', ''], updatedAt: '' },
      prayers: [],    // {id, title, forWhom, from, notes, createdAt, updatedAt, prayedCount, answeredAt, testimony, deleted}
      gratitude: [],  // {id, author, text, prompt, date, createdAt, updatedAt, deleted}
      reminders: [],  // {id, title, time:'HH:MM', repeat:'daily'|'once', date, forWhom, enabled, createdBy, updatedAt, deleted}
      reading: {},    // planDayId -> {done, by, at, updatedAt}
      activity: { prayer: {}, reading: {}, gratitude: {} }, // kind -> {YYYY-MM-DD: true}
      updatedAt: nowIso()
    };
  }

  function normalize(d) {
    const base = emptyData();
    if (!d || typeof d !== 'object') return base;
    const out = Object.assign(base, d);
    out.settings = Object.assign(emptyData().settings, d.settings || {});
    if (!Array.isArray(out.settings.partners)) out.settings.partners = ['', ''];
    ['prayers', 'gratitude', 'reminders'].forEach(function (k) { if (!Array.isArray(out[k])) out[k] = []; });
    out.reading = out.reading && typeof out.reading === 'object' ? out.reading : {};
    out.activity = Object.assign({ prayer: {}, reading: {}, gratitude: {} }, out.activity || {});
    return out;
  }

  let adapter = LocalAdapter;
  let data = null;
  let device = null;
  const listeners = new Set();

  function loadDevice() {
    try { device = JSON.parse(localStorage.getItem(DEVICE_KEY)) || {}; } catch (e) { device = {}; }
    if (typeof device.me !== 'number') device.me = 0;
    if (!device.theme) device.theme = 'auto';
  }
  function saveDevice() { localStorage.setItem(DEVICE_KEY, JSON.stringify(device)); }

  function notify(remote) {
    listeners.forEach(function (fn) { try { fn(data, !!remote); } catch (e) { console.warn(e); } });
  }
  function persist() {
    data.updatedAt = nowIso();
    adapter.save(data);
    notify(false);
    Sync.schedule(); // live sync (no-op when not configured / not paired)
  }

  function update(mutator) {
    mutator(data);
    persist();
  }

  function meName() {
    const p = data.settings.partners;
    return p[device.me] || p[0] || 'Me';
  }

  function findById(list, id) {
    for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  function newer(a, b) { return (a.updatedAt || '') >= (b.updatedAt || ''); }

  // Last-write-wins merge, used for file import today and reusable for a backend later.
  function merge(local, incoming) {
    const out = normalize(JSON.parse(JSON.stringify(local)));
    const inc = normalize(incoming);
    ['prayers', 'gratitude', 'reminders'].forEach(function (k) {
      inc[k].forEach(function (item) {
        if (!item || !item.id) return;
        const mine = findById(out[k], item.id);
        if (!mine) out[k].push(item);
        else if (!newer(mine, item)) Object.assign(mine, item);
      });
    });
    Object.keys(inc.reading).forEach(function (id) {
      const a = out.reading[id], b = inc.reading[id];
      if (!a || !newer(a, b)) out.reading[id] = b;
    });
    Object.keys(inc.activity).forEach(function (kind) {
      out.activity[kind] = Object.assign({}, out.activity[kind] || {}, inc.activity[kind] || {});
    });
    const lp = out.settings.partners, ip = inc.settings.partners;
    const localEmpty = !lp[0] && !lp[1];
    if (localEmpty || (inc.settings.updatedAt || '') > (out.settings.updatedAt || '')) {
      out.settings = inc.settings;
    }
    return out;
  }

  const Store = {
    uid: uid,
    dateKey: dateKey,
    faithDayKey: faithDayKey,
    init: function () {
      loadDevice();
      data = normalize(adapter.load());
      return data;
    },
    setAdapter: function (a) { adapter = a; data = normalize(adapter.load()); persist(); },
    get: function () { return data; },
    device: function () { return device; },
    subscribe: function (fn) { listeners.add(fn); return function () { listeners.delete(fn); }; },
    meName: meName,

    /* ---- settings ---- */
    isSetUp: function () { return !!(data.settings.partners[0] && data.settings.partners[1]); },
    setPartners: function (a, b) {
      update(function (d) { d.settings.partners = [a.trim(), b.trim()]; d.settings.updatedAt = nowIso(); });
    },
    setMe: function (i) { device.me = i; saveDevice(); listeners.forEach(function (fn) { fn(data); }); },
    setTheme: function (t) { device.theme = t; saveDevice(); },

    /* ---- prayers ---- */
    prayers: function () { return data.prayers.filter(function (p) { return !p.deleted; }); },
    addPrayer: function (p) {
      const t = nowIso();
      update(function (d) {
        d.prayers.unshift({
          id: uid(), title: p.title.trim(), forWhom: (p.forWhom || '').trim(), from: p.from || meName(),
          notes: (p.notes || '').trim(), createdAt: t, updatedAt: t, prayedCount: 0, answeredAt: null, testimony: ''
        });
      });
    },
    prayedFor: function (id) {
      update(function (d) {
        const p = findById(d.prayers, id); if (!p) return;
        p.prayedCount = (p.prayedCount || 0) + 1; p.lastPrayedAt = nowIso(); p.updatedAt = nowIso();
        d.activity.prayer[faithDayKey()] = true;
      });
    },
    markAnswered: function (id, testimony, answeredDate) {
      update(function (d) {
        const p = findById(d.prayers, id); if (!p) return;
        p.answeredAt = answeredDate || dateKey(); p.testimony = (testimony || '').trim(); p.updatedAt = nowIso();
        d.activity.prayer[faithDayKey()] = true;
      });
    },
    unmarkAnswered: function (id) {
      update(function (d) {
        const p = findById(d.prayers, id); if (!p) return;
        p.answeredAt = null; p.updatedAt = nowIso();
      });
    },
    deletePrayer: function (id) {
      update(function (d) { const p = findById(d.prayers, id); if (p) { p.deleted = true; p.updatedAt = nowIso(); } });
    },

    /* ---- gratitude ---- */
    gratitude: function () { return data.gratitude.filter(function (g) { return !g.deleted; }); },
    addGratitude: function (text, prompt) {
      const t = nowIso();
      update(function (d) {
        d.gratitude.unshift({ id: uid(), author: meName(), text: text.trim(), prompt: prompt, date: faithDayKey(), createdAt: t, updatedAt: t });
        d.activity.gratitude[faithDayKey()] = true;
      });
    },
    deleteGratitude: function (id) {
      update(function (d) { const g = findById(d.gratitude, id); if (g) { g.deleted = true; g.updatedAt = nowIso(); } });
    },

    /* ---- reminders ---- */
    reminders: function () { return data.reminders.filter(function (r) { return !r.deleted; }); },
    addReminder: function (r) {
      update(function (d) {
        d.reminders.push({
          id: uid(), title: r.title.trim(), time: r.time, repeat: r.repeat || 'daily', date: r.date || '',
          forWhom: r.forWhom || 'Both', enabled: true, createdBy: meName(), updatedAt: nowIso()
        });
      });
    },
    toggleReminder: function (id) {
      update(function (d) { const r = findById(d.reminders, id); if (r) { r.enabled = !r.enabled; r.updatedAt = nowIso(); } });
    },
    deleteReminder: function (id) {
      update(function (d) { const r = findById(d.reminders, id); if (r) { r.deleted = true; r.updatedAt = nowIso(); } });
    },

    /* ---- reading plan ---- */
    toggleReading: function (dayId) {
      update(function (d) {
        const cur = d.reading[dayId];
        const done = !(cur && cur.done);
        d.reading[dayId] = { done: done, by: meName(), at: done ? faithDayKey() : '', updatedAt: nowIso() };
        if (done) d.activity.reading[faithDayKey()] = true;
      });
    },

    /* ---- activity / streaks ---- */
    logActivity: function (kind) { update(function (d) { d.activity[kind][faithDayKey()] = true; }); },
    didToday: function (kind) { return !!data.activity[kind][faithDayKey()]; },
    streak: function (kind) {
      const days = data.activity[kind] || {};
      const d = faithDate();
      // A streak stays alive until the end of today even if today isn't done yet.
      if (!days[dateKey(d)]) d.setDate(d.getDate() - 1);
      let n = 0;
      while (days[dateKey(d)]) { n++; d.setDate(d.getDate() - 1); }
      return n;
    },
    bestStreak: function (kind) {
      const keys = Object.keys(data.activity[kind] || {}).sort();
      let best = 0, run = 0, prev = null;
      keys.forEach(function (k) {
        const cur = new Date(k + 'T12:00:00');
        if (prev && Math.round((cur - prev) / 86400000) === 1) run++; else run = 1;
        if (run > best) best = run; prev = cur;
      });
      return best;
    },

    /* ---- sync: export / import ---- */
    exportData: function () {
      return { app: 'faith-app', exportedAt: nowIso(), exportedBy: meName(), data: data };
    },
    importData: function (obj, mode) {
      const incoming = obj && obj.data ? obj.data : obj;
      if (!incoming || typeof incoming !== 'object' || !('prayers' in incoming || 'gratitude' in incoming)) {
        throw new Error('That file does not look like a Faith App backup.');
      }
      data = mode === 'replace' ? normalize(incoming) : merge(data, incoming);
      persist();
    },
    resetAll: function () { Sync.disconnect(); data = emptyData(); persist(); },
    sync: null // set below
  };

  /* ================= Live sync (Supabase via plain fetch) =================
     Every record becomes one row: {id:'prayer:<id>', kind, data, updated_at, deleted}.
     - push: rows whose updated_at differs from what we last saw on the server (st.synced[id])
     - pull: rows the server changed since our cursor (server time, with a 60s overlap; merging is idempotent)
     - merge: the same last-write-wins merge() used for file import
     Local data is always saved to localStorage first, so being offline never loses anything;
     unsent changes are simply found again on the next attempt. */
  const SYNC_KEY = 'faithapp:sync:v1'; // per device: {code, cursor, synced:{rowId: ms}, lastOk} — never synced itself
  const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 32 symbols, no I/O/0/1 to avoid mix-ups
  const CODE_LEN = 24; // 24 x 5 bits = 120 random bits
  const EPOCH = '1970-01-01T00:00:00.000Z';
  const ACTIVITY_KINDS = ['prayer', 'reading', 'gratitude'];
  const LIST_KINDS = [['prayers', 'prayer'], ['gratitude', 'gratitude'], ['reminders', 'reminder']];
  const BATCH = 200;
  const PAGE = 5000; // must match the LIMIT in pull()

  function syncCfg() {
    const c = window.FAITH_CONFIG || {};
    return {
      url: String(c.supabaseUrl || '').trim().replace(/\/+$/, ''),
      key: String(c.supabaseAnonKey || '').trim(),
      interval: Number(c.syncIntervalMs) > 0 ? Number(c.syncIntervalMs) : 20000,
      debounce: Number(c.syncDebounceMs) > 0 ? Number(c.syncDebounceMs) : 1000
    };
  }
  function loadSyncState() {
    let st = null;
    try { st = JSON.parse(localStorage.getItem(SYNC_KEY)); } catch (e) { st = null; }
    if (!st || typeof st !== 'object' || !st.code) return null;
    if (!st.synced || typeof st.synced !== 'object') st.synced = {};
    return st;
  }
  function saveSyncState(st) { localStorage.setItem(SYNC_KEY, JSON.stringify(st)); }
  function ms(t) { const n = Date.parse(t); return isNaN(n) ? 0 : n; }

  function normalizeCode(input) {
    return String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }
  function validCode(code) {
    if (code.length !== CODE_LEN) return false;
    for (let i = 0; i < code.length; i++) if (CODE_ALPHABET.indexOf(code[i]) < 0) return false;
    return true;
  }
  function generateCode() {
    const bytes = new Uint8Array(CODE_LEN);
    crypto.getRandomValues(bytes);
    let out = '';
    for (let i = 0; i < CODE_LEN; i++) out += CODE_ALPHABET[bytes[i] & 31]; // 256 % 32 === 0, so no bias
    return out;
  }
  function formatCode(code) { return (normalizeCode(code).match(/.{1,4}/g) || []).join('-'); }

  function toRows(d) {
    const rows = [];
    LIST_KINDS.forEach(function (pair) {
      d[pair[0]].forEach(function (it) {
        if (it && it.id) rows.push({ id: pair[1] + ':' + it.id, kind: pair[1], data: it, updated_at: it.updatedAt || EPOCH, deleted: !!it.deleted });
      });
    });
    Object.keys(d.reading).forEach(function (id) {
      const r = d.reading[id];
      if (r) rows.push({ id: 'reading:' + id, kind: 'reading', data: r, updated_at: r.updatedAt || EPOCH, deleted: false });
    });
    const s = d.settings;
    if (s.updatedAt || s.partners[0] || s.partners[1]) {
      rows.push({ id: 'settings', kind: 'settings', data: { partners: s.partners, updatedAt: s.updatedAt || '' }, updated_at: s.updatedAt || EPOCH, deleted: false });
    }
    ACTIVITY_KINDS.forEach(function (kind) {
      Object.keys(d.activity[kind] || {}).forEach(function (day) {
        if (d.activity[kind][day]) rows.push({ id: 'activity:' + kind + ':' + day, kind: 'activity', data: { kind: kind, day: day }, updated_at: EPOCH, deleted: false });
      });
    });
    return rows;
  }
  function fromRows(rows) {
    const inc = emptyData();
    const listFor = { prayer: 'prayers', gratitude: 'gratitude', reminder: 'reminders' };
    rows.forEach(function (r) {
      const v = r && r.data;
      if (!v || typeof v !== 'object') return;
      if (listFor[r.kind]) {
        if (!v.id) v.id = String(r.id).slice(r.kind.length + 1);
        inc[listFor[r.kind]].push(v);
      } else if (r.kind === 'reading') {
        inc.reading[String(r.id).slice(8)] = v;
      } else if (r.kind === 'settings') {
        if (Array.isArray(v.partners)) inc.settings = { partners: [String(v.partners[0] || ''), String(v.partners[1] || '')], updatedAt: v.updatedAt || '' };
      } else if (r.kind === 'activity') {
        if (ACTIVITY_KINDS.indexOf(v.kind) >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(v.day)) inc.activity[v.kind][v.day] = true;
      }
    });
    return inc;
  }

  function SyncError(msg, offline) { const e = new Error(msg); e.offline = !!offline; return e; }
  async function rpc(fn, body) {
    const c = syncCfg();
    let res;
    try {
      res = await fetch(c.url + '/rest/v1/rpc/' + fn, {
        method: 'POST',
        cache: 'no-store',
        headers: { 'Content-Type': 'application/json', apikey: c.key, Authorization: 'Bearer ' + c.key },
        body: JSON.stringify(body)
      });
    } catch (e) {
      throw SyncError('offline', true);
    }
    if (!res.ok) {
      let msg = 'Sync server error ' + res.status;
      try { const j = await res.json(); if (j && j.message) msg += ': ' + j.message; } catch (e) { /* ignore */ }
      throw SyncError(msg, false);
    }
    return res.json();
  }

  const syncListeners = new Set();
  let syncStatus = { state: 'off', lastOk: null, error: '' };
  let syncing = false, syncAgain = false, debounceTimer = null, intervalTimer = null, started = false;

  function setSyncStatus(state, extra) {
    const st = loadSyncState();
    syncStatus = Object.assign({ state: state, lastOk: st && st.lastOk, error: '' }, extra || {});
    syncListeners.forEach(function (fn) { try { fn(syncStatus, false); } catch (e) { console.warn(e); } });
  }
  function emitRemoteChange() {
    syncListeners.forEach(function (fn) { try { fn(syncStatus, true); } catch (e) { console.warn(e); } });
  }

  async function syncNow() {
    if (!Sync.active()) { setSyncStatus(Sync.configured() ? 'off' : 'unconfigured'); return; }
    if (syncing) { syncAgain = true; return; }
    syncing = true;
    if (syncStatus.state !== 'ok') setSyncStatus('syncing');
    try {
      let st = loadSyncState();
      const code = st.code;

      // 1) push everything that changed locally since the server last confirmed it
      const pending = toRows(data).filter(function (r) { return st.synced[r.id] !== ms(r.updated_at); });
      for (let i = 0; i < pending.length; i += BATCH) {
        const batch = JSON.parse(JSON.stringify(pending.slice(i, i + BATCH)));
        await rpc('push', { p_code: code, p_items: batch });
        st = loadSyncState(); if (!st || st.code !== code) return; // disconnected meanwhile
        batch.forEach(function (r) { st.synced[r.id] = ms(r.updated_at); });
        saveSyncState(st);
      }

      // 2) pull what changed on the server since our cursor (page through if large)
      let since = st.cursor ? new Date(ms(st.cursor) - 60000).toISOString() : null;
      let all = [], maxTs = st.cursor || null;
      for (let guard = 0; guard < 50; guard++) {
        const rows = await rpc('pull', { p_code: code, p_since: since });
        if (!Array.isArray(rows)) throw SyncError('Unexpected reply from sync server', false);
        all = all.concat(rows);
        rows.forEach(function (r) { if (!maxTs || ms(r.synced_at) > ms(maxTs)) maxTs = r.synced_at; });
        if (rows.length < PAGE) break;
        since = new Date(ms(rows[rows.length - 1].synced_at) - 1).toISOString();
      }
      st = loadSyncState(); if (!st || st.code !== code) return;
      if (all.length) {
        const before = JSON.stringify(data);
        data = merge(data, fromRows(all));
        all.forEach(function (r) { st.synced[r.id] = ms(r.updated_at); });
        if (JSON.stringify(data) !== before) {
          adapter.save(data);
          notify(true);
          emitRemoteChange();
        }
      }
      st.cursor = maxTs;
      st.lastOk = nowIso();
      saveSyncState(st);
      setSyncStatus('ok');
      // If our merged copy is newer than the server for some rows, push them on the next pass.
      if (toRows(data).some(function (r) { return st.synced[r.id] !== ms(r.updated_at); })) syncAgain = true;
    } catch (e) {
      if (e && e.offline) setSyncStatus('offline');
      else { console.warn('Sync failed:', e); setSyncStatus('error', { error: (e && e.message) || 'Sync failed' }); }
    } finally {
      syncing = false;
      if (syncAgain) { syncAgain = false; Sync.schedule(); }
    }
  }

  const Sync = {
    configured: function () { const c = syncCfg(); return !!(c.url && c.key); },
    active: function () { return Sync.configured() && !!loadSyncState(); },
    code: function () { const st = loadSyncState(); return st ? st.code : ''; },
    formatCode: formatCode,
    normalizeCode: normalizeCode,
    validCode: validCode,
    status: function () { return syncStatus; },
    onStatus: function (fn) { syncListeners.add(fn); return function () { syncListeners.delete(fn); }; },
    schedule: function (delay) {
      if (!Sync.active()) return;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(syncNow, delay == null ? syncCfg().debounce : delay);
    },
    syncNow: syncNow,
    createCode: function () {
      const code = generateCode();
      saveSyncState({ code: code, cursor: null, synced: {}, lastOk: null });
      Sync.start(); Sync.schedule(0);
      return code;
    },
    // Joining keeps this phone's data: everything local is pushed, everything remote is merged in.
    join: function (input) {
      const code = normalizeCode(input);
      if (!validCode(code)) throw new Error('That code doesn’t look right. It should be ' + CODE_LEN + ' letters and numbers.');
      saveSyncState({ code: code, cursor: null, synced: {}, lastOk: null });
      Sync.start(); Sync.schedule(0);
      return code;
    },
    disconnect: function () {
      localStorage.removeItem(SYNC_KEY);
      clearTimeout(debounceTimer);
      setSyncStatus(Sync.configured() ? 'off' : 'unconfigured');
    },
    // Wire up the triggers once: app open, page visible again, back online, and a timer while visible.
    start: function () {
      if (started) { return; }
      started = true;
      setSyncStatus(Sync.active() ? 'syncing' : (Sync.configured() ? 'off' : 'unconfigured'));
      if (!Sync.configured()) return;
      document.addEventListener('visibilitychange', function () { if (!document.hidden) Sync.schedule(0); });
      window.addEventListener('online', function () { Sync.schedule(0); });
      window.addEventListener('offline', function () { if (Sync.active()) setSyncStatus('offline'); });
      intervalTimer = setInterval(function () { if (!document.hidden) Sync.schedule(0); }, syncCfg().interval);
      Sync.schedule(0);
    },
    // exposed for tests
    _toRows: function () { return toRows(data); }
  };
  Store.sync = Sync;
  window.Store = Store;
})();
