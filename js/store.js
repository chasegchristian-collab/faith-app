/* Store: the ONLY module that knows where data lives.
   v1 uses localStorage + manual JSON export/import for syncing between two phones.
   To add a backend later (Firebase, Supabase, etc.), implement an adapter with the same
   shape as LocalAdapter ({ load(), save(data) }, optionally subscribeRemote(cb)) and call
   Store.setAdapter(adapter). Records carry id + updatedAt + soft-delete flags so a
   last-write-wins merge works the same for files and for a server. */
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

  function persist() {
    data.updatedAt = nowIso();
    adapter.save(data);
    listeners.forEach(function (fn) { try { fn(data); } catch (e) { console.warn(e); } });
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
        d.activity.prayer[dateKey()] = true;
      });
    },
    markAnswered: function (id, testimony, answeredDate) {
      update(function (d) {
        const p = findById(d.prayers, id); if (!p) return;
        p.answeredAt = answeredDate || dateKey(); p.testimony = (testimony || '').trim(); p.updatedAt = nowIso();
        d.activity.prayer[dateKey()] = true;
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
        d.gratitude.unshift({ id: uid(), author: meName(), text: text.trim(), prompt: prompt, date: dateKey(), createdAt: t, updatedAt: t });
        d.activity.gratitude[dateKey()] = true;
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
        d.reading[dayId] = { done: done, by: meName(), at: done ? dateKey() : '', updatedAt: nowIso() };
        if (done) d.activity.reading[dateKey()] = true;
      });
    },

    /* ---- activity / streaks ---- */
    logActivity: function (kind) { update(function (d) { d.activity[kind][dateKey()] = true; }); },
    didToday: function (kind) { return !!data.activity[kind][dateKey()]; },
    streak: function (kind) {
      const days = data.activity[kind] || {};
      const d = new Date();
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
    resetAll: function () { data = emptyData(); persist(); }
  };

  window.Store = Store;
})();
