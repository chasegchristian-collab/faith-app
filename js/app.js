/* App UI: views, routing, voice input, reminders, sync. All data goes through window.Store. */
(function () {
  'use strict';

  const S = window.Store;
  const C = window.Content;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const main = $('#main');

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function dayNumber(d) {
    d = d || new Date();
    return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
  }
  function verseOfDay(d) { return C.VERSES[dayNumber(d) % C.VERSES.length]; }
  // Tonight's prompt follows the 4 AM "faith day", so it doesn't change at midnight mid-entry.
  function promptOfDay(d) { d = d || new Date(S.faithDayKey() + 'T12:00:00'); return C.GRATITUDE_PROMPTS[(dayNumber(d) * 7) % C.GRATITUDE_PROMPTS.length]; }
  function bgLink(ref, label, cls) {
    return '<a class="' + (cls || '') + '" href="' + esc(C.bibleGatewayUrl(ref)) + '" target="_blank" rel="noopener noreferrer">' +
      esc(label || ref) + '<span class="sr-only"> (opens Bible Gateway, NLT, in a new tab)</span></a>';
  }
  function fmtDate(key) {
    if (!key) return '';
    const d = new Date(key.length === 10 ? key + 'T12:00:00' : key);
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: d.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined });
  }
  function fmtTime(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    const d = new Date(); d.setHours(h, m, 0, 0);
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  let toastTimer;
  function toast(msg, ms) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms || 2600);
  }
  function partners() { return S.get().settings.partners; }
  function me() { return S.meName(); }
  function other() { const p = partners(); return p[S.device().me === 0 ? 1 : 0] || 'Partner'; }

  const MIC_SVG = '<svg aria-hidden="true" viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
  function micBtn(target) {
    return '<button type="button" class="mic" data-action="mic" data-target="' + target + '" aria-label="Speak instead of typing">' + MIC_SVG + '</button>';
  }
  function voiceHint() {
    return SR ? '<p class="hint">Note: in some browsers, voice is processed by the browser’s online speech service.</p>'
      : '<p class="hint">Voice tip: this browser can\'t do in-app voice typing, but you can tap the 🎤 on your keyboard to dictate.</p>';
  }
  function textField(id, label, opts) {
    opts = opts || {};
    const input = opts.multiline
      ? '<textarea id="' + id + '" name="' + id + '" placeholder="' + esc(opts.placeholder || '') + '"' + (opts.required ? ' required' : '') + '></textarea>'
      : '<input type="text" id="' + id + '" name="' + id + '" autocomplete="off" placeholder="' + esc(opts.placeholder || '') + '"' + (opts.required ? ' required' : '') + ' value="' + esc(opts.value || '') + '">';
    return '<label for="' + id + '">' + esc(label) + '</label><div class="field">' + input + micBtn(id) + '</div>';
  }

  /* ---------- voice input (Web Speech API) ---------- */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, recBtn = null;
  function stopMic() {
    if (rec) { try { rec.stop(); } catch (e) { /* ignore */ } }
    if (recBtn) { recBtn.classList.remove('listening'); recBtn.setAttribute('aria-label', 'Speak instead of typing'); }
    rec = null; recBtn = null;
  }
  function startMic(btn) {
    const target = document.getElementById(btn.dataset.target);
    if (!SR) {
      toast('Voice typing isn\'t supported here. Tap the 🎤 on your keyboard to dictate instead.', 4500);
      if (target) target.focus();
      return;
    }
    if (recBtn === btn) { stopMic(); return; }
    stopMic();
    const base = target.value ? target.value.replace(/\s*$/, ' ') : '';
    rec = new SR(); recBtn = btn;
    rec.lang = navigator.language || 'en-US';
    rec.interimResults = true; rec.continuous = false;
    // Ask for on-device recognition where the browser supports it (falls back to the browser's service).
    if ('processLocally' in rec) { try { rec.processLocally = true; } catch (e) { /* ignore */ } }
    rec.onresult = (e) => {
      let text = '';
      for (let i = 0; i < e.results.length; i++) text += e.results[i][0].transcript;
      target.value = base + text;
    };
    rec.onerror = (e) => {
      const msg = e.error === 'not-allowed' || e.error === 'service-not-allowed'
        ? 'Microphone permission was blocked. You can use your keyboard\'s 🎤 dictation instead.'
        : (e.error === 'no-speech' ? 'Didn\'t catch that — try again.' : 'Voice typing stopped. Your keyboard\'s 🎤 works too.');
      toast(msg, 4000); stopMic();
    };
    rec.onend = () => stopMic();
    btn.classList.add('listening'); btn.setAttribute('aria-label', 'Listening… tap to stop');
    try { rec.start(); } catch (e) { stopMic(); toast('Couldn\'t start voice typing. Use your keyboard\'s 🎤 instead.', 4000); }
  }

  /* ---------- dialog helper ---------- */
  function openDialog(html, onSubmit) {
    const dlg = $('#dialog'), form = $('#dialog-form');
    form.innerHTML = html;
    form.dataset.last = '';
    form.onclick = (ev) => { const b = ev.target.closest('button[value]'); if (b) form.dataset.last = b.value; };
    form.onsubmit = (e) => {
      const action = (e.submitter && e.submitter.value) || form.dataset.last || 'ok';
      form.dataset.last = '';
      if (action === 'ok' && onSubmit) {
        const ok = onSubmit(new FormData(form), form);
        if (ok === false) { e.preventDefault(); return; }
      }
      stopMic();
    };
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
    const first = form.querySelector('input,textarea,select');
    if (first) setTimeout(() => first.focus(), 50);
  }

  /* ---------- views ---------- */
  const TITLES = { home: 'Together', pray: 'Prayer', read: 'The Word', thanks: 'Gratitude', more: 'More' };
  const state = { prayFilter: 'active' };

  function streakTile(kind, label) {
    const n = S.streak(kind), today = S.didToday(kind);
    return '<div class="streak' + (today ? ' today' : '') + '"><div class="num">' + n + '</div><div class="label">' + label + '</div>' +
      '<div class="small ' + (today ? '' : 'muted') + '">' + (today ? '✓ today' : 'not yet today') + '</div></div>';
  }

  function nextPlanDay() {
    const r = S.get().reading;
    return C.PLAN.find((d) => !(r[d.id] && r[d.id].done)) || null;
  }

  function viewHome() {
    const ref = verseOfDay();
    const hr = new Date().getHours();
    const greet = hr < 12 ? 'Good morning' : hr < 18 ? 'Good afternoon' : 'Good evening';
    const todayKey = S.dateKey();
    const tonightKey = S.faithDayKey(); // before 4 AM still counts as "tonight"
    const g = S.gratitude().filter((x) => x.date === tonightKey);
    const p = partners();
    const gStatus = p.map((name) => {
      const done = g.some((x) => x.author === name);
      return '<span class="badge' + (done ? ' good' : '') + '">' + esc(name) + (done ? ' ✓' : ' …') + '</span>';
    }).join(' ');
    const next = nextPlanDay();
    const active = S.prayers().filter((x) => !x.answeredAt).length;
    const answered = S.prayers().filter((x) => x.answeredAt).length;
    const rems = S.reminders().filter((r) => r.enabled).sort((a, b) => a.time.localeCompare(b.time)).slice(0, 3);

    return '' +
      '<p class="muted">' + greet + ', ' + esc(me()) + ' · ' + esc(fmtDate(todayKey)) + '</p>' +
      '<section class="card accent" aria-labelledby="vod-h"><p class="eyebrow" id="vod-h">Verse of the day</p>' +
        '<p class="verse-ref">' + esc(ref) + '</p>' +
        bgLink(ref, 'Read it in the NLT ↗', 'btn primary block') + '</section>' +
      '<h2>Streaks together</h2><div class="streaks">' + streakTile('prayer', 'Prayer') + streakTile('reading', 'Reading') + streakTile('gratitude', 'Gratitude') + '</div>' +
      '<section class="card" aria-labelledby="pr-h"><div class="row spread"><h3 id="pr-h">Prayer</h3><span class="muted small">' + active + ' active · ' + answered + ' answered</span></div>' +
        '<div class="row" style="margin-top:.5rem"><button type="button" class="btn ' + (S.didToday('prayer') ? 'done' : 'good') + '" data-action="prayed-today">' +
        (S.didToday('prayer') ? '✓ We prayed today' : 'We prayed today') + '</button><a class="btn" href="#pray">Open list</a></div></section>' +
      '<section class="card" aria-labelledby="gr-h"><h3 id="gr-h">Tonight\'s gratitude</h3><p class="prompt">' + esc(promptOfDay()) + '</p>' +
        '<p>' + gStatus + '</p><a class="btn block" href="#thanks">Write tonight\'s entry</a></section>' +
      '<section class="card" aria-labelledby="rd-h"><h3 id="rd-h">Today\'s reading</h3>' +
        (next ? '<p class="muted small">' + esc(next.section) + ' · Day ' + (C.PLAN.indexOf(next) + 1) + ' of ' + C.PLAN.length + '</p>' +
          '<div class="row">' + bgLink(next.ref, next.title + ' ↗', 'btn primary') +
          '<button type="button" class="btn" data-action="toggle-reading" data-id="' + next.id + '">Mark read</button></div>'
          : '<p>🎉 You finished the plan together!</p>') + '</section>' +
      (rems.length ? '<section class="card"><h3>Reminders</h3><ul class="list">' + rems.map((r) =>
        '<li class="small">' + esc(fmtTime(r.time)) + ' — ' + esc(r.title) + ' <span class="muted">(' + esc(r.forWhom) + ')</span></li>').join('') +
        '</ul><a href="#more" class="small">Manage reminders</a></section>' : '');
  }

  function prayerItem(p) {
    const meta = [];
    if (p.forWhom) meta.push('For ' + esc(p.forWhom));
    meta.push('added by ' + esc(p.from) + ' · ' + esc(fmtDate(p.createdAt)));
    if (p.prayedCount) meta.push('prayed ' + p.prayedCount + '×');
    return '<li class="item' + (p.answeredAt ? ' answered' : '') + '">' +
      '<h3>' + esc(p.title) + '</h3><p class="meta">' + meta.join(' · ') + '</p>' +
      (p.notes ? '<p class="quote small">' + esc(p.notes) + '</p>' : '') +
      (p.answeredAt ? '<p><span class="badge good">Answered ' + esc(fmtDate(p.answeredAt)) + '</span></p>' +
        (p.testimony ? '<p class="quote"><strong>Testimony:</strong> ' + esc(p.testimony) + '</p>' : '') : '') +
      '<div class="actions">' +
        (p.answeredAt
          ? '<button type="button" class="btn small" data-action="unanswer" data-id="' + p.id + '">Move back to active</button>'
          : '<button type="button" class="btn small good" data-action="prayed" data-id="' + p.id + '">🙏 Prayed</button>' +
            '<button type="button" class="btn small" data-action="answer" data-id="' + p.id + '">Mark answered</button>') +
        '<button type="button" class="btn small danger" data-action="delete-prayer" data-id="' + p.id + '" aria-label="Delete prayer: ' + esc(p.title) + '">Delete</button>' +
      '</div></li>';
  }

  function viewPray() {
    const all = S.prayers();
    const active = all.filter((p) => !p.answeredAt);
    const answered = all.filter((p) => p.answeredAt).sort((a, b) => b.answeredAt.localeCompare(a.answeredAt));
    const f = state.prayFilter;
    const list = f === 'active' ? active : answered;
    const p = partners();
    return '' +
      '<button type="button" class="btn primary block" data-action="new-prayer">+ Add a prayer request</button>' +
      '<div class="seg" role="group" aria-label="Filter prayers">' +
        '<button type="button" data-action="pray-filter" data-f="active" aria-pressed="' + (f === 'active') + '">Active (' + active.length + ')</button>' +
        '<button type="button" data-action="pray-filter" data-f="answered" aria-pressed="' + (f === 'answered') + '">Answered (' + answered.length + ')</button>' +
      '</div>' +
      (f === 'answered' && answered.length ? '<p class="muted small">God\'s faithfulness, written down. ' + answered.length + ' answered prayer' + (answered.length === 1 ? '' : 's') + ' so far.</p>' : '') +
      (list.length ? '<ul class="list">' + list.map(prayerItem).join('') + '</ul>'
        : '<p class="empty">' + (f === 'active' ? 'No active requests yet. Add the first one together.' : 'Answered prayers will show up here with the date and your testimony.') + '</p>') +
      '<button type="button" class="btn block ' + (S.didToday('prayer') ? 'done' : 'good') + '" data-action="prayed-today" style="margin-top:1rem">' +
        (S.didToday('prayer') ? '✓ We prayed today' : 'We prayed today') + '</button>' +
      '<p class="hint">' + (S.sync.active()
        ? 'Shared live between ' + esc(p[0]) + ' and ' + esc(p[1]) + '.'
        : 'Shared between ' + esc(p[0]) + ' and ' + esc(p[1]) + ' once you connect your phones (More tab).') + '</p>';
  }

  function viewRead() {
    const ref = verseOfDay();
    const r = S.get().reading;
    const done = C.PLAN.filter((d) => r[d.id] && r[d.id].done).length;
    const pct = Math.round((done / C.PLAN.length) * 100);
    let section = '';
    const rows = C.PLAN.map((d, i) => {
      const st = r[d.id];
      const isDone = !!(st && st.done);
      let head = '';
      if (d.section !== section) { section = d.section; head = '<h3 style="margin-top:1rem">' + esc(section) + '</h3>'; }
      return head + '<div class="plan-day"><button type="button" class="check" data-action="toggle-reading" data-id="' + d.id + '" aria-pressed="' + isDone +
        '" aria-label="Day ' + (i + 1) + ', ' + esc(d.title) + (isDone ? ', read' : ', not read') + '">' + (isDone ? '✓' : '') + '</button>' +
        '<div class="grow">' + bgLink(d.ref, 'Day ' + (i + 1) + ': ' + d.title) +
        (isDone ? '<div class="small muted">Read by ' + esc(st.by) + ' · ' + esc(fmtDate(st.at)) + '</div>' : '') + '</div></div>';
    }).join('');
    return '' +
      '<section class="card accent"><p class="eyebrow">Verse of the day</p><p class="verse-ref">' + esc(ref) + '</p>' +
        bgLink(ref, 'Read it in the NLT ↗', 'btn primary block') +
        '<p class="hint">Both of your phones show the same verse each day. Text opens on Bible Gateway (NLT).</p></section>' +
      '<h2>Reading plan: John + Psalms</h2>' +
      '<p class="muted small">Shared progress for both of you: ' + done + ' of ' + C.PLAN.length + ' days · ' + pct + '%</p>' +
      '<p class="hint">A check-off by either of you counts for you both.</p>' +
      '<div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-label="Shared reading plan progress"><span style="width:' + pct + '%"></span></div>' +
      '<div class="card">' + rows + '</div>';
  }

  function viewThanks() {
    const prompt = promptOfDay();
    const all = S.gratitude();
    const groups = {};
    all.forEach((g) => { (groups[g.date] = groups[g.date] || []).push(g); });
    const days = Object.keys(groups).sort().reverse();
    return '' +
      '<section class="card accent"><p class="eyebrow">Tonight\'s prompt</p><p class="prompt">' + esc(prompt) + '</p>' +
        '<form id="gratitude-form" novalidate>' +
          textField('g-text', 'Your entry, ' + me(), { multiline: true, placeholder: 'I\'m thankful for…', required: true }) +
          voiceHint() +
          '<button type="submit" class="btn primary block" style="margin-top:.8rem">Save entry</button>' +
        '</form></section>' +
      '<h2>History</h2>' +
      (days.length ? days.map((k) => '<div class="day-group"><h3>' + esc(fmtDate(k)) + '</h3><ul class="list">' + groups[k].map((g) =>
        '<li class="item"><p class="meta"><strong>' + esc(g.author) + '</strong>' + (g.prompt ? ' · ' + esc(g.prompt) : '') + '</p>' +
        '<p class="quote">' + esc(g.text) + '</p><div class="actions"><button type="button" class="btn small danger" data-action="delete-gratitude" data-id="' + g.id + '">Delete</button></div></li>').join('') +
        '</ul></div>').join('')
        : '<p class="empty">Your gratitude entries will collect here, night by night.</p>');
  }

  function viewMore() {
    const p = partners();
    const rems = S.reminders().sort((a, b) => a.time.localeCompare(b.time));
    const perm = ('Notification' in window) ? Notification.permission : 'unsupported';
    const permText = {
      granted: 'Notifications are on for this device. They fire only while the app is open, or catch up if you open it within 2 hours.',
      denied: 'Notifications are blocked in this browser’s settings. Use “Add to calendar” for reliable alerts.',
      default: 'Turn on notifications to get a ping while the app is open (or a catch-up if you open it within 2 hours).',
      unsupported: 'This browser doesn’t support web notifications here. On iPhone they need iOS 16.4+ and the app added to your Home Screen. “Add to calendar” always works.'
    }[perm];
    const d = S.device();
    return '' +
      '<h2 id="rem-h">Reminders for each other</h2>' +
      '<button type="button" class="btn primary block" data-action="new-reminder">+ Add a reminder</button>' +
      '<p class="hint">' + esc(permText) + '</p>' +
      '<p class="hint">“Add to calendar” usually works even when the app is closed. Pausing or deleting a reminder here doesn’t remove a calendar event you already added; delete it in your calendar too.</p>' +
      (perm === 'default' ? '<button type="button" class="btn block" data-action="enable-notifs" style="margin-top:.5rem">Turn on notifications</button>' : '') +
      (rems.length ? '<ul class="list">' + rems.map((r) =>
        '<li class="item"><div class="row spread"><h3>' + esc(r.title) + '</h3><span class="badge' + (r.enabled ? ' good' : '') + '">' + (r.enabled ? 'On' : 'Off') + '</span></div>' +
        '<p class="meta">' + esc(fmtTime(r.time)) + ' · ' + (r.repeat === 'daily' ? 'every day' : 'once on ' + esc(fmtDate(r.date))) + ' · for ' + esc(r.forWhom) + ' · set by ' + esc(r.createdBy) + '</p>' +
        '<div class="actions"><button type="button" class="btn small" data-action="ics" data-id="' + r.id + '">📅 Add to calendar</button>' +
        '<a class="btn small" href="' + esc(googleCalUrl(r)) + '" target="_blank" rel="noopener noreferrer">Google Calendar ↗</a>' +
        '<button type="button" class="btn small" data-action="toggle-reminder" data-id="' + r.id + '">' + (r.enabled ? 'Pause' : 'Resume') + '</button>' +
        '<button type="button" class="btn small danger" data-action="delete-reminder" data-id="' + r.id + '">Delete</button></div></li>').join('') + '</ul>'
        : '<p class="empty">No reminders yet. Try “Pray together” at 9:00 PM.</p>') +

      syncSection() +
      '<h2>' + (S.sync.configured() ? 'Backup file' : 'Sync between your phones') + '</h2>' +
      '<div class="card stack"><p class="small">' + (S.sync.configured()
        ? 'You can also send a backup file. One of you taps <strong>Share</strong> (or Download) and sends it; the other taps <strong>Import</strong>. Imports <em>merge</em>, so nothing gets lost.'
        : 'Live syncing isn’t turned on in this copy of the app, so each phone keeps its own copy. To sync: one of you taps <strong>Share</strong> (or Download) and sends the file; the other taps <strong>Import</strong>. Imports <em>merge</em>, so nothing gets lost.') + '</p>' +
        '<button type="button" class="btn primary block" data-action="share">Share my data with ' + esc(other()) + '</button>' +
        '<button type="button" class="btn block" data-action="export">Download backup file (.json)</button>' +
        '<label class="btn block" for="import-file" style="margin:0">Import a file from ' + esc(other()) + '</label>' +
        '<input id="import-file" type="file" accept="application/json,.json,.txt,text/plain" class="hidden">' +
        (d.lastExport ? '<p class="hint">Last shared/exported on this phone: ' + esc(fmtDate(d.lastExport)) + '</p>' : '') +
      '</div>' +

      '<h2>Settings</h2>' +
      '<form class="card" id="settings-form">' +
        '<label for="s-p1">Partner 1</label><input type="text" id="s-p1" value="' + esc(p[0]) + '" required>' +
        '<label for="s-p2">Partner 2</label><input type="text" id="s-p2" value="' + esc(p[1]) + '" required>' +
        '<fieldset><legend style="font-weight:600;font-size:.9rem;margin:.7rem 0 .3rem">Who’s using this phone?</legend><div class="seg">' +
          [0, 1].map((i) => '<label><input type="radio" name="me" value="' + i + '"' + (d.me === i ? ' checked' : '') + '><span>' + esc(p[i] || 'Partner ' + (i + 1)) + '</span></label>').join('') +
        '</div></fieldset>' +
        '<fieldset><legend style="font-weight:600;font-size:.9rem;margin:.3rem 0 .3rem">Appearance</legend><div class="seg">' +
          [['auto', 'Auto'], ['dark', 'Dark'], ['light', 'Light']].map((t) => '<label><input type="radio" name="theme" value="' + t[0] + '"' + (d.theme === t[0] ? ' checked' : '') + '><span>' + t[1] + '</span></label>').join('') +
        '</div></fieldset>' +
        '<button type="submit" class="btn primary block">Save settings</button>' +
      '</form>' +
      '<div class="card stack"><h3>Install on your phone</h3>' +
        '<p class="small"><strong>iPhone (Safari):</strong> tap Share <span aria-hidden="true">⬆︎</span> → “Add to Home Screen”.</p>' +
        '<p class="small"><strong>Samsung / Android:</strong> tap the menu (≡ or ⋮) → “Add page to” → “Home screen” (or “Install app”).</p>' +
        (deferredInstall ? '<button type="button" class="btn block" data-action="install">Install app</button>' : '') +
      '</div>' +
      '<button type="button" class="btn block danger" data-action="reset" style="margin-top:1rem">Erase all data on this phone</button>' +
      '<p class="hint" style="text-align:center;margin-top:1rem">Scripture links open Bible Gateway (NLT). Verse text is not stored in this app.</p>';
  }

  function viewSetup() {
    return (isIOSBrowserTab() ? '<div class="card banner" role="note" id="ios-banner"><strong>Add this to your Home Screen first, then set up. Safari tabs can lose data.</strong>' +
        '<p class="small">Tap Share <span aria-hidden="true">⬆︎</span> → “Add to Home Screen”, then open Together from the new icon.</p></div>' : '') +
      '<section class="welcome"><img src="icons/icon-192.png" alt=""><h2>Welcome</h2>' +
      '<p class="muted">A quiet place for the two of you to pray, give thanks, and read together.</p></section>' +
      '<form class="card" id="setup-form">' +
        textField('p1', 'First partner', { required: true, placeholder: 'e.g. Christian', value: 'Christian' }) +
        textField('p2', 'Second partner', { required: true, placeholder: 'Their name', value: 'Kendell' }) +
        voiceHint() +
        '<p class="hint">Joining your partner? Tap Start, then More → “Connect your phones” → “Join with code”. (Or Import a file there.)</p>' +
        '<button type="submit" class="btn primary block" style="margin-top:1rem">Start</button>' +
      '</form>';
  }

  /* ---------- routing / render ---------- */
  const VIEWS = { home: viewHome, pray: viewPray, read: viewRead, thanks: viewThanks, more: viewMore };
  function currentTab() {
    const h = (location.hash || '#home').slice(1);
    return VIEWS[h] ? h : 'home';
  }
  function render(opts) {
    const setup = !S.isSetUp();
    const tab = currentTab();
    document.querySelector('.tabbar').classList.toggle('hidden', setup);
    $('#who-chip').classList.toggle('hidden', setup);
    $('#view-title').textContent = setup ? 'Together in Faith' : TITLES[tab];
    document.title = (setup ? 'Welcome' : TITLES[tab]) + ' · Together in Faith';
    document.querySelectorAll('.tabbar a').forEach((a) => {
      if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    $('#who-chip').textContent = '👤 ' + me();
    renderSyncBadge();
    // Preserve an in-progress gratitude draft across re-renders.
    const draft = $('#g-text') ? $('#g-text').value : '';
    main.innerHTML = setup ? viewSetup() : VIEWS[tab]();
    if (draft && $('#g-text')) $('#g-text').value = draft;
    if (opts && opts.scroll) window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', () => { stopMic(); render({ scroll: true }); main.focus({ preventScroll: true }); });

  function applyTheme() {
    const t = S.device().theme;
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }

  /* ---------- reminders: in-app scheduler + Notification API + .ics ---------- */
  async function notify(title, body) {
    if (!('Notification' in window) || Notification.permission !== 'granted') { toast('⏰ ' + title, 6000); return; }
    try {
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (reg && reg.showNotification) await reg.showNotification(title, { body: body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: title });
      else new Notification(title, { body: body, icon: 'icons/icon-192.png' });
    } catch (e) { toast('⏰ ' + title, 6000); }
  }
  const FIRED_KEY = 'faithapp:fired:v1';
  function checkReminders() {
    let fired; try { fired = JSON.parse(localStorage.getItem(FIRED_KEY)) || {}; } catch (e) { fired = {}; }
    const now = new Date(), today = S.dateKey(now);
    const mine = me();
    S.reminders().forEach((r) => {
      if (!r.enabled) return;
      if (r.forWhom !== 'Both' && r.forWhom !== mine) return;
      if (r.repeat === 'once' && r.date !== today) return;
      const [h, m] = r.time.split(':').map(Number);
      const due = new Date(now); due.setHours(h, m, 0, 0);
      const key = r.id + '@' + today;
      // Fire if due within the last 2 hours and not yet fired today on this device.
      if (now >= due && now - due < 2 * 3600 * 1000 && !fired[key]) {
        fired[key] = true;
        notify(r.title, 'Reminder from ' + r.createdBy + ' · Together in Faith');
      }
    });
    // Keep only the last 7 days of "already fired" marks.
    const cutoff = new Date(now); cutoff.setDate(cutoff.getDate() - 7);
    const cutKey = S.dateKey(cutoff);
    Object.keys(fired).forEach((k) => { const day = k.slice(k.lastIndexOf('@') + 1); if (!(day >= cutKey)) delete fired[k]; });
    localStorage.setItem(FIRED_KEY, JSON.stringify(fired));
  }
  const pad2 = (n) => String(n).padStart(2, '0');
  const icsLocal = (d) => d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + 'T' + pad2(d.getHours()) + pad2(d.getMinutes()) + '00';
  function reminderStart(r) {
    const [h, m] = r.time.split(':').map(Number);
    const start = r.repeat === 'once' && r.date ? new Date(r.date + 'T00:00:00') : new Date();
    start.setHours(h, m, 0, 0);
    if (r.repeat === 'daily' && start < new Date()) start.setDate(start.getDate() + 1);
    return start;
  }
  // RFC 5545: lines longer than 75 octets are folded with CRLF + one space (never splitting a UTF-8 character).
  function foldLine(line) {
    const enc = new TextEncoder();
    if (enc.encode(line).length <= 75) return line;
    const parts = []; let cur = '', curLen = 0, limit = 75;
    for (const ch of line) {
      const n = enc.encode(ch).length;
      if (curLen + n > limit) { parts.push(cur); cur = ''; curLen = 0; limit = 74; }
      cur += ch; curLen += n;
    }
    parts.push(cur);
    return parts.join('\r\n ');
  }
  function googleCalUrl(r) {
    const start = reminderStart(r), end = new Date(start.getTime() + 15 * 60000);
    let url = 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
      '&text=' + encodeURIComponent(r.title) +
      '&dates=' + icsLocal(start) + '/' + icsLocal(end) +
      '&details=' + encodeURIComponent('Reminder for ' + r.forWhom + ' from ' + r.createdBy + ' (Together in Faith)');
    try { const tz = Intl.DateTimeFormat().resolvedOptions().timeZone; if (tz) url += '&ctz=' + encodeURIComponent(tz); } catch (e) { /* ignore */ }
    if (r.repeat === 'daily') url += '&recur=' + encodeURIComponent('RRULE:FREQ=DAILY');
    return url;
  }
  function icsFor(r) {
    const local = icsLocal;
    const start = reminderStart(r);
    const end = new Date(start.getTime() + 15 * 60000);
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const text = (s) => String(s).replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
    return [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Together in Faith//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT', 'UID:' + r.id + '@together-in-faith', 'DTSTAMP:' + stamp,
      'DTSTART:' + local(start), 'DTEND:' + local(end),
      r.repeat === 'daily' ? 'RRULE:FREQ=DAILY' : null,
      'SUMMARY:' + text(r.title), 'DESCRIPTION:' + text('Reminder for ' + r.forWhom + ' from ' + r.createdBy + ' (Together in Faith)'),
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + text(r.title), 'TRIGGER:PT0M', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'
    ].filter(Boolean).map(foldLine).join('\r\n') + '\r\n';
  }
  function download(filename, content, type) {
    const blob = new Blob([content], { type: type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /* ---------- sync ---------- */
  function backupName(ext) { return 'together-' + (me().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'backup') + '-' + S.dateKey() + (ext || '.json'); }
  function markExported() { const d = S.device(); d.lastExport = new Date().toISOString(); localStorage.setItem('faithapp:device:v1', JSON.stringify(d)); }
  async function shareData() {
    const json = JSON.stringify(S.exportData(), null, 2);
    // Shared as .txt / text/plain: Chrome on Android refuses to share .json files.
    const file = new File([json], backupName('.txt'), { type: 'text/plain' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Together in Faith sync', text: 'Open Together in Faith → More → Import, and pick this file.' });
        markExported(); toast('Shared! Ask ' + other() + ' to Import it.'); render();
      } catch (e) { if (e.name !== 'AbortError') { download(backupName(), json, 'application/json'); markExported(); toast('Sharing failed, so the file was downloaded instead.'); } }
    } else {
      download(backupName(), json, 'application/json'); markExported();
      toast('This browser can’t share files, so it was downloaded. Send it to ' + other() + ' any way you like.', 4500); render();
    }
  }
  function importFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        S.importData(JSON.parse(reader.result), 'merge');
        toast('Synced! Data from the file was merged in.'); render();
      } catch (e) { toast(e.message && e.message.indexOf('Faith App') >= 0 ? e.message : 'Couldn’t read that file. Is it a Together backup (.json)?', 4500); }
    };
    reader.readAsText(file);
  }

  /* ---------- live sync UI ---------- */
  function syncStatusText(st) {
    st = st || S.sync.status();
    if (!S.sync.configured()) return 'Live sync not set up';
    if (!S.sync.active()) return 'Not connected';
    if (st.state === 'offline') return 'Offline · changes saved on this phone';
    if (st.state === 'error') return 'Sync problem · will retry';
    if (st.state === 'syncing' && !st.lastOk) return 'Syncing…';
    if (st.lastOk) {
      const mins = Math.floor((Date.now() - Date.parse(st.lastOk)) / 60000);
      return mins < 1 ? 'Synced just now' : mins < 60 ? 'Synced ' + mins + ' min ago' : 'Synced ' + fmtDate(st.lastOk);
    }
    return 'Syncing…';
  }
  function syncStateClass(st) {
    st = st || S.sync.status();
    if (!S.sync.active()) return 'off';
    return st.state === 'offline' || st.state === 'error' ? 'warn' : 'good';
  }
  function renderSyncBadge() {
    const el = $('#sync-status'); if (!el) return;
    const show = S.sync.active() && S.isSetUp();
    el.classList.toggle('hidden', !show);
    if (show) { el.textContent = syncStatusText(); el.dataset.state = syncStateClass(); }
    const more = $('#sync-status-more'); if (more) { more.textContent = syncStatusText(); more.dataset.state = syncStateClass(); }
  }
  function syncSection() {
    if (!S.sync.configured()) return '';
    const active = S.sync.active();
    const code = S.sync.code();
    return '<h2>Connect your phones</h2>' +
      '<div class="card stack" id="sync-card">' +
        '<p class="small">Status: <strong class="sync-status" id="sync-status-more" data-state="' + syncStateClass() + '">' + esc(syncStatusText()) + '</strong></p>' +
        (active
          ? '<p class="small">Prayers, gratitude, reminders, reading and your names sync automatically between this phone and ' + esc(other()) + '’s. Works offline too: changes upload when you’re back online.</p>' +
            '<button type="button" class="btn block" data-action="sync-show-code">' + (state.showCode ? 'Hide couple code' : 'Show couple code') + '</button>' +
            (state.showCode ? '<p class="couple-code" id="couple-code" aria-label="Couple code">' + esc(S.sync.formatCode(code)) + '</p>' +
              '<p class="hint">Anyone with this code can see and change your shared data. Only share it with ' + esc(other()) + '.</p>' +
              '<div class="row"><button type="button" class="btn primary" data-action="sync-share-code">Share code</button><button type="button" class="btn" data-action="sync-copy-code">Copy</button></div>' : '') +
            '<button type="button" class="btn block" data-action="sync-now">Sync now</button>' +
            '<button type="button" class="btn block danger" data-action="sync-disconnect">Disconnect this phone</button>'
          : '<p class="small">Connect once and everything you add shows up on both phones within seconds.</p>' +
            '<p class="small"><strong>One phone:</strong> tap “Create couple code” and send the code to ' + esc(other()) + '. <strong>Other phone:</strong> tap “Join with code” and paste it. Nothing already on either phone is lost; it’s merged.</p>' +
            '<button type="button" class="btn primary block" data-action="sync-create">Create couple code</button>' +
            '<button type="button" class="btn block" data-action="sync-join">Join with code</button>') +
      '</div>';
  }
  async function shareCode() {
    const code = S.sync.formatCode(S.sync.code());
    const text = 'Our Together in Faith couple code: ' + code + '\nOpen the app → More → Connect your phones → Join with code.';
    if (navigator.share) {
      try { await navigator.share({ title: 'Together in Faith couple code', text: text }); return; }
      catch (e) { if (e.name === 'AbortError') return; }
    }
    copyCode();
  }
  async function copyCode() {
    const code = S.sync.formatCode(S.sync.code());
    try { await navigator.clipboard.writeText(code); toast('Code copied'); }
    catch (e) { state.showCode = true; render(); toast('Copy the code shown on screen.'); }
  }
  function joinDialog() {
    openDialog('<h2 id="dialog-title">Join with code</h2>' +
      '<p class="small">Paste or type the code from ' + esc(other()) + '’s phone. Dashes and spaces don’t matter.</p>' +
      '<label for="join-code">Couple code</label><input type="text" id="join-code" name="join-code" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD-EFGH-…" required>' +
      '<p class="hint">Anything already on this phone is kept and merged with ' + esc(other()) + '’s data.</p>' +
      '<div class="dialog-actions"><button class="btn primary" value="ok">Join</button><button class="btn" value="cancel" formnovalidate>Cancel</button></div>',
      (fd) => {
        try { S.sync.join(String(fd.get('join-code') || '')); }
        catch (e) { toast(e.message, 4500); return false; }
        toast('Connected! Syncing now…'); setTimeout(render, 0);
      });
  }
  function isIOSBrowserTab() {
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return ios && navigator.standalone === false;
  }
  // Re-render when the partner's changes arrive, but never while someone is typing or a dialog is open.
  let pendingRemoteRender = false;
  function busyEditing() {
    const a = document.activeElement;
    const dlg = $('#dialog');
    return (dlg && dlg.open) || (a && main.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
  }
  function remoteRender() {
    if (busyEditing()) { pendingRemoteRender = true; return; }
    pendingRemoteRender = false;
    const y = window.scrollY; render(); window.scrollTo(0, y);
  }
  document.addEventListener('focusout', () => { if (pendingRemoteRender) setTimeout(() => { if (pendingRemoteRender) remoteRender(); }, 300); });
  $('#dialog').addEventListener('close', () => { if (pendingRemoteRender) setTimeout(remoteRender, 50); });

  /* ---------- events ---------- */
  let deferredInstall = null;
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredInstall = e; });

  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const id = el.dataset.id;
    const act = el.dataset.action;
    switch (act) {
      case 'mic': startMic(el); break;
      case 'switch-user': {
        const p = partners(); const next = S.device().me === 0 ? 1 : 0;
        S.setMe(next); toast('Now using as ' + (p[next] || 'Partner')); render(); break;
      }
      case 'prayed-today':
        if (S.didToday('prayer')) { toast('Already counted today 🙏'); break; }
        S.logActivity('prayer'); toast('Prayer streak: ' + S.streak('prayer') + ' day' + (S.streak('prayer') === 1 ? '' : 's') + ' 🔥'); render(); break;
      case 'pray-filter': state.prayFilter = el.dataset.f; render(); break;
      case 'new-prayer': {
        const p = partners();
        openDialog('<h2 id="dialog-title">New prayer request</h2>' +
          textField('pr-title', 'What are we praying for?', { required: true, placeholder: 'e.g. Mom’s surgery on Friday' }) +
          textField('pr-for', 'Who is it for? (optional)', { placeholder: 'e.g. Mom, us, our church' }) +
          '<label for="pr-from">Request from</label><select id="pr-from" name="pr-from">' +
            [p[0], p[1], 'Both of us'].map((n) => '<option' + (n === me() ? ' selected' : '') + '>' + esc(n) + '</option>').join('') + '</select>' +
          textField('pr-notes', 'Notes (optional)', { multiline: true, placeholder: 'Details, scripture, updates…' }) + voiceHint() +
          '<div class="dialog-actions"><button class="btn primary" value="ok">Add prayer</button><button class="btn" value="cancel" formnovalidate>Cancel</button></div>',
          (fd) => {
            const title = String(fd.get('pr-title') || '').trim();
            if (!title) { toast('Add a short title first.'); return false; }
            S.addPrayer({ title: title, forWhom: fd.get('pr-for'), from: fd.get('pr-from'), notes: fd.get('pr-notes') });
            state.prayFilter = 'active'; toast('Prayer added 🙏'); setTimeout(render, 0);
          });
        break;
      }
      case 'prayed': S.prayedFor(id); toast('Prayed 🙏'); render(); break;
      case 'answer': {
        const pr = S.prayers().find((x) => x.id === id); if (!pr) break;
        openDialog('<h2 id="dialog-title">Answered! 🎉</h2><p class="muted">' + esc(pr.title) + '</p>' +
          '<label for="an-date">Date answered</label><input type="date" id="an-date" name="an-date" value="' + S.dateKey() + '" max="' + S.dateKey() + '">' +
          textField('an-test', 'How did God answer? (optional testimony)', { multiline: true, placeholder: 'Write what happened so you can remember…' }) + voiceHint() +
          '<div class="dialog-actions"><button class="btn primary" value="ok">Save as answered</button><button class="btn" value="cancel" formnovalidate>Cancel</button></div>',
          (fd) => { S.markAnswered(id, fd.get('an-test'), fd.get('an-date') || S.dateKey()); toast('Praise God! Moved to Answered.'); setTimeout(render, 0); });
        break;
      }
      case 'unanswer': S.unmarkAnswered(id); render(); break;
      case 'delete-prayer': if (confirm('Delete this prayer request?')) { S.deletePrayer(id); render(); } break;
      case 'delete-gratitude': if (confirm('Delete this gratitude entry?')) { S.deleteGratitude(id); render(); } break;
      case 'toggle-reading': S.toggleReading(id); render(); break;
      case 'new-reminder': {
        const p = partners();
        openDialog('<h2 id="dialog-title">New reminder</h2>' +
          textField('rm-title', 'Reminder', { required: true, placeholder: 'e.g. Pray together', value: 'Pray together' }) +
          '<label for="rm-time">Time</label><input type="time" id="rm-time" name="rm-time" value="21:00" required>' +
          '<label for="rm-repeat">Repeat</label><select id="rm-repeat" name="rm-repeat"><option value="daily">Every day</option><option value="once">Just once</option></select>' +
          '<label for="rm-date">Date (for “Just once”)</label><input type="date" id="rm-date" name="rm-date" value="' + S.dateKey() + '" min="' + S.dateKey() + '">' +
          '<label for="rm-for">For</label><select id="rm-for" name="rm-for"><option>Both</option><option>' + esc(p[0]) + '</option><option>' + esc(p[1]) + '</option></select>' +
          '<p class="hint">Tip: after saving, tap “Add to calendar” so it rings even when the app is closed.</p>' +
          '<div class="dialog-actions"><button class="btn primary" value="ok">Save reminder</button><button class="btn" value="cancel" formnovalidate>Cancel</button></div>',
          (fd) => {
            const title = String(fd.get('rm-title') || '').trim(), time = fd.get('rm-time');
            if (!title || !time) { toast('Add a title and time.'); return false; }
            if (fd.get('rm-repeat') === 'once') {
              const day = String(fd.get('rm-date') || '');
              if (!day) { toast('Pick a date for a one-time reminder.'); return false; }
              const when = new Date(day + 'T' + time + ':00');
              if (isNaN(when) || when <= new Date()) { toast('That date and time has already passed. Pick a time in the future.', 4000); return false; }
            }
            S.addReminder({ title: title, time: time, repeat: fd.get('rm-repeat'), date: fd.get('rm-date'), forWhom: fd.get('rm-for') });
            toast('Reminder saved'); setTimeout(render, 0);
          });
        break;
      }
      case 'toggle-reminder': S.toggleReminder(id); render(); break;
      case 'delete-reminder': if (confirm('Delete this reminder?')) { S.deleteReminder(id); render(); } break;
      case 'ics': {
        const r = S.reminders().find((x) => x.id === id);
        if (r) {
          const slug = r.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase();
          download((slug || 'reminder') + '.ics', icsFor(r), 'text/calendar'); toast('Open the file to add it to your calendar.');
        }
        break;
      }
      case 'enable-notifs':
        if ('Notification' in window) Notification.requestPermission().then((res) => { toast(res === 'granted' ? 'Notifications on' : 'Notifications not allowed'); render(); });
        break;
      case 'share': shareData(); break;
      case 'sync-create': {
        if (S.sync.active() && !confirm('This phone is already connected. Make a new code? ' + other() + ' would need to join again.')) break;
        S.sync.createCode(); state.showCode = true; render(); toast('Code created. Now send it to ' + other() + '.'); break;
      }
      case 'sync-share-code': shareCode(); break;
      case 'sync-show-code': state.showCode = !state.showCode; render(); break;
      case 'sync-copy-code': copyCode(); break;
      case 'sync-join': joinDialog(); break;
      case 'sync-now': S.sync.syncNow(); toast('Syncing…', 1200); break;
      case 'sync-disconnect':
        if (confirm('Disconnect this phone? Everything stays on this phone, but changes will stop syncing with ' + other() + '.')) { S.sync.disconnect(); state.showCode = false; render(); toast('Disconnected. Your data is still on this phone.'); }
        break;
      case 'export': download(backupName(), JSON.stringify(S.exportData(), null, 2), 'application/json'); markExported(); toast('Backup downloaded'); render(); break;
      case 'install': if (deferredInstall) { deferredInstall.prompt(); deferredInstall = null; } break;
      case 'reset':
        if (confirm('Erase ALL prayers, entries and settings on this phone? This also disconnects live sync on this phone (' + other() + '’s phone keeps its copy). Export a backup first if unsure.')) { S.resetAll(); location.hash = '#home'; render(); }
        break;
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target.id === 'import-file' && e.target.files[0]) { importFile(e.target.files[0]); e.target.value = ''; }
  });

  document.addEventListener('submit', (e) => {
    const f = e.target;
    if (f.id === 'setup-form') {
      e.preventDefault();
      const a = f.p1.value.trim(), b = f.p2.value.trim();
      if (!a || !b) { toast('Please enter both names.'); return; }
      S.setPartners(a, b); S.setMe(0); stopMic(); location.hash = '#home'; render(); toast('Welcome, ' + a + '!');
    } else if (f.id === 'gratitude-form') {
      e.preventDefault();
      const text = f['g-text'].value.trim();
      if (!text) { toast('Write a few words first.'); return; }
      stopMic(); S.addGratitude(text, promptOfDay()); f['g-text'].value = ''; render(); toast('Saved. Thank you, Lord 🙏');
    } else if (f.id === 'settings-form') {
      e.preventDefault();
      const a = f['s-p1'].value.trim(), b = f['s-p2'].value.trim();
      if (!a || !b) { toast('Both names are needed.'); return; }
      S.setPartners(a, b);
      S.setMe(Number(new FormData(f).get('me') || 0));
      S.setTheme(new FormData(f).get('theme') || 'auto'); applyTheme();
      render(); toast('Settings saved');
    }
  });

  /* ---------- boot ---------- */
  S.init();
  applyTheme();
  render();
  // Re-render if another tab of the app changes data.
  window.addEventListener('storage', (e) => { if (e.key && e.key.indexOf('faithapp:data') === 0) { S.init(); render(); } });
  checkReminders();
  setInterval(checkReminders, 30000);
  S.sync.onStatus((st, remoteChanged) => { if (remoteChanged) remoteRender(); else renderSyncBadge(); });
  S.sync.start();
  setInterval(renderSyncBadge, 30000); // keep "Synced x min ago" fresh
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkReminders(); render(); } });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW registration failed', e)));
  }

  // Exposed for tests / debugging.
  window.FaithApp = { verseOfDay: verseOfDay, promptOfDay: promptOfDay, icsFor: icsFor, googleCalUrl: googleCalUrl, syncStatusText: syncStatusText };
})();
