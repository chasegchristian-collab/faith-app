/* Two-phone live sync test against an in-memory mock of the Supabase RPC endpoints.
   Run from faith-app/:  python3 -m http.server 8765 &   then   NODE_PATH=... node tests/sync.test.js
   The committed js/config.js stays empty; this test serves a filled-in config only inside the test browser. */
const { chromium, devices } = require('playwright-core');
const mock = require('./mock-supabase');

const B = 'http://localhost:8765/';
const MOCK_PORT = Number(process.env.MOCK_PORT || 8799);
const INTERVAL = 2000; // polling interval used in the test (the app default is 20 s)
const CONFIG = `window.FAITH_CONFIG = { supabaseUrl: 'http://127.0.0.1:${MOCK_PORT}', supabaseAnonKey: 'test-anon-key', syncIntervalMs: ${INTERVAL}, syncDebounceMs: 300 };`;

(async () => {
  const srv = await mock.start(MOCK_PORT);
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) process.exitCode = 1; };
  const errors = [];
  let offlinePhase = false, expect400 = false;

  async function phone(name) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
      userAgent: devices['Pixel 7'].userAgent, serviceWorkers: 'block' });
    await ctx.route('**/js/config.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: CONFIG }));
    const page = await ctx.newPage();
    page.on('console', (m) => {
      if (m.type() !== 'error' && m.type() !== 'warning') return;
      if (offlinePhase && /ERR_INTERNET_DISCONNECTED|Failed to fetch|Failed to load resource/.test(m.text())) return;
      if (/Service Worker registration blocked by Playwright/.test(m.text())) return; // SWs are blocked on purpose in this test
      if (expect400 && /status of 400/.test(m.text())) return;
      errors.push(name + ' ' + m.type() + ': ' + m.text());
    });
    page.on('pageerror', (e) => errors.push(name + ' pageerror: ' + e.message));
    page.on('dialog', (d) => d.accept());
    await page.goto(B);
    await page.click('#setup-form button[type=submit]'); // names are prefilled: Christian, Kendell
    await page.waitForSelector('.verse-ref');
    return { ctx, page };
  }
  const waitFor = async (page, fn, arg, ms) => {
    try { await page.waitForFunction(fn, arg, { timeout: ms || INTERVAL * 4 + 2000, polling: 200 }); return true; } catch (e) { return false; }
  };
  const titles = (page) => page.evaluate(() => Store.prayers().map((p) => p.title));

  const A = await phone('A');
  const Bp = await phone('B');
  await Bp.page.click('#who-chip'); // phone B is Kendell's
  ok(await Bp.page.evaluate(() => Store.meName()) === 'Kendell' && await A.page.evaluate(() => Store.meName()) === 'Christian', 'each phone has its own user');

  // Before pairing: More tab shows the Connect section and "Not connected"
  await A.page.click('.tabbar a[data-tab=more]');
  await A.page.waitForSelector('#sync-card', { timeout: 3000 }).catch(() => {});
  const st0 = { card: await A.page.isVisible('#sync-card'), text: await A.page.textContent('#sync-status-more').catch(() => null) };
  ok(st0.card && st0.text.includes('Not connected'), 'More tab shows Connect your phones + Not connected ' + JSON.stringify(st0));
  ok(await A.page.isHidden('#sync-status'), 'header status hidden until connected');

  // B has a prayer of its own before joining (must be merged, not wiped)
  await Bp.page.evaluate(() => Store.addPrayer({ title: 'B before joining' }));

  // Pair: A creates a code, B joins with it
  await A.page.click('[data-action=sync-create]');
  await A.page.waitForSelector('#couple-code');
  const shown = (await A.page.textContent('#couple-code')).trim();
  const raw = shown.replace(/-/g, '');
  ok(/^[A-HJ-NP-Z2-9]{24}$/.test(raw) && /^([A-Z0-9]{4}-){5}[A-Z0-9]{4}$/.test(shown), 'couple code is 24 chars shown in groups: ' + shown);
  ok(await A.page.evaluate(() => JSON.parse(localStorage.getItem('faithapp:sync:v1')).code) === raw, 'code stored in localStorage');

  await Bp.page.click('.tabbar a[data-tab=more]');
  await Bp.page.click('[data-action=sync-join]');
  await Bp.page.fill('#join-code', 'not a code');
  await Bp.page.click('#dialog button[value=ok]');
  ok(await Bp.page.evaluate(() => document.getElementById('dialog').open) && !(await Bp.page.evaluate(() => Store.sync.active())), 'bad code rejected');
  await Bp.page.fill('#join-code', ' ' + shown.toLowerCase().replace(/-/g, ' ') + ' '); // spaces / lowercase are fine
  await Bp.page.click('#dialog button[value=ok]');
  ok(await Bp.page.evaluate(() => Store.sync.code()) === raw, 'B joined with the same code');

  ok(await waitFor(A.page, () => Store.prayers().some((p) => p.title === 'B before joining')), "B's pre-join prayer reached A (merge on join)");
  ok((await titles(Bp.page)).includes('B before joining'), "B kept its own data after joining");
  ok(await waitFor(A.page, () => /Synced/.test(document.getElementById('sync-status').textContent)), 'header shows Synced: ' + await A.page.textContent('#sync-status'));

  // 1) add a prayer on A (via the UI) -> appears on B, live on screen
  await Bp.page.click('.tabbar a[data-tab=pray]');
  await A.page.click('.tabbar a[data-tab=pray]');
  await A.page.click('[data-action=new-prayer]');
  await A.page.fill('#pr-title', 'Healing for Grandpa');
  await A.page.click('#dialog button[value=ok]');
  let t0 = Date.now();
  ok(await waitFor(Bp.page, () => document.getElementById('main').textContent.includes('Healing for Grandpa')), 'prayer added on A shows on B screen (' + (Date.now() - t0) + ' ms)');

  // 2) mark answered on B (UI) -> answered on A
  await Bp.page.click('.item:has-text("Healing for Grandpa") [data-action=answer]');
  await Bp.page.fill('#an-test', 'Home from the hospital!');
  await Bp.page.click('#dialog button[value=ok]');
  t0 = Date.now();
  ok(await waitFor(A.page, () => { const p = Store.prayers().find((x) => x.title === 'Healing for Grandpa'); return p && p.answeredAt && p.testimony === 'Home from the hospital!'; }),
    'marked answered on B shows on A (' + (Date.now() - t0) + ' ms)');

  // 3) delete on A -> gone on B
  const delId = await A.page.evaluate(() => Store.prayers().find((x) => x.title === 'Healing for Grandpa').id);
  await A.page.evaluate((id) => Store.deletePrayer(id), delId);
  t0 = Date.now();
  ok(await waitFor(Bp.page, () => !Store.prayers().some((x) => x.title === 'Healing for Grandpa')), 'delete on A propagates to B (' + (Date.now() - t0) + ' ms)');
  ok(await Bp.page.evaluate((id) => Store.get().prayers.some((p) => p.id === id && p.deleted), delId), 'delete kept as a tombstone');

  // 4) gratitude, reading, reminders, streak days and names sync; "who is using this phone" + theme stay local
  await Bp.page.evaluate(() => { Store.addGratitude('Thankful for Christian', 'p'); Store.toggleReading('john-1'); Store.addReminder({ title: 'Pray together', time: '21:00' }); Store.setTheme('light'); });
  ok(await waitFor(A.page, () => Store.gratitude().some((g) => g.author === 'Kendell') && Store.get().reading['john-1'] && Store.get().reading['john-1'].done &&
    Store.reminders().length === 1 && Store.didToday('gratitude') && Store.didToday('reading')), 'gratitude, reading, reminder and streak days sync B -> A');
  await A.page.evaluate(() => Store.setPartners('Christian', 'Kendell M.'));
  ok(await waitFor(Bp.page, () => Store.get().settings.partners[1] === 'Kendell M.'), 'partner names sync');
  ok(await A.page.evaluate(() => Store.device().me) === 0 && await Bp.page.evaluate(() => Store.device().me) === 1 &&
     await A.page.evaluate(() => Store.device().theme) === 'auto', 'who-is-using-this-phone and theme stay local');

  // 5) offline edit on A -> syncs after reconnect, nothing lost
  offlinePhase = true;
  await A.ctx.setOffline(true);
  await A.page.evaluate(() => Store.addPrayer({ title: 'Written while offline' }));
  ok(await waitFor(A.page, () => /Offline/.test(document.getElementById('sync-status').textContent)), 'A shows Offline: ' + await A.page.textContent('#sync-status'));
  await Bp.page.waitForTimeout(INTERVAL * 2);
  ok(!(await titles(Bp.page)).includes('Written while offline'), 'B does not have it while A is offline');
  ok((await titles(A.page)).includes('Written while offline'), 'A kept the offline edit locally');
  ok(await A.page.evaluate(() => localStorage.getItem('faithapp:data:v1').includes('Written while offline')), 'offline edit is saved in localStorage');
  await A.ctx.setOffline(false);
  await A.page.evaluate(() => window.dispatchEvent(new Event('online')));
  t0 = Date.now();
  ok(await waitFor(Bp.page, () => Store.prayers().some((x) => x.title === 'Written while offline')), 'offline edit synced after reconnect (' + (Date.now() - t0) + ' ms)');
  offlinePhase = false;
  ok(await waitFor(A.page, () => /Synced/.test(document.getElementById('sync-status').textContent)), 'A back to Synced');

  // 6) concurrent edits: newer write wins on both phones
  const pid = await A.page.evaluate(() => Store.prayers().find((x) => x.title === 'Written while offline').id);
  await A.page.evaluate((id) => Store.prayedFor(id), pid);
  await A.page.waitForTimeout(50);
  await Bp.page.evaluate((id) => Store.markAnswered(id, 'B was later'), pid);
  ok(await waitFor(A.page, (id) => { const p = Store.prayers().find((x) => x.id === id); return p && p.testimony === 'B was later'; }, pid), 'last write wins (B newer)');

  // 7) no duplicates after many cycles
  await A.page.waitForTimeout(INTERVAL * 2);
  const ids = await A.page.evaluate(() => Store.get().prayers.map((p) => p.id));
  ok(ids.length === new Set(ids).size, 'no duplicate records');
  const sa = await A.page.evaluate(() => JSON.stringify(Store.prayers().map((p) => [p.id, p.updatedAt]).sort()));
  const sb = await Bp.page.evaluate(() => JSON.stringify(Store.prayers().map((p) => [p.id, p.updatedAt]).sort()));
  ok(sa === sb, 'both phones converge to the same prayers');

  // 8) mock enforces the code rule like schema.sql; nothing else readable without the code
  expect400 = true;
  const short = await A.page.evaluate(async (port) => (await fetch('http://127.0.0.1:' + port + '/rest/v1/rpc/pull', { method: 'POST', headers: { apikey: 'k', Authorization: 'Bearer k', 'Content-Type': 'application/json' }, body: JSON.stringify({ p_code: 'short', p_since: null }) })).status, MOCK_PORT);
  ok(short === 400, 'short code rejected by server');
  const other = await A.page.evaluate(async (port) => (await (await fetch('http://127.0.0.1:' + port + '/rest/v1/rpc/pull', { method: 'POST', headers: { apikey: 'k', Authorization: 'Bearer k', 'Content-Type': 'application/json' }, body: JSON.stringify({ p_code: 'ZZZZZZZZZZZZZZZZZZZZZZZZ', p_since: null }) })).json()).length, MOCK_PORT);
  ok(other === 0, 'a different code sees nothing');
  expect400 = false;

  // 9) disconnect B: data stays, changes stop syncing
  await Bp.page.click('.tabbar a[data-tab=more]');
  await Bp.page.click('[data-action=sync-disconnect]');
  ok(!(await Bp.page.evaluate(() => Store.sync.active())) && (await Bp.page.textContent('#sync-status-more')).includes('Not connected'), 'B disconnected');
  ok((await titles(Bp.page)).length > 0, 'B keeps its data after disconnect');
  await Bp.page.evaluate(() => Store.addPrayer({ title: 'After disconnect' }));
  await A.page.waitForTimeout(INTERVAL * 2);
  ok(!(await titles(A.page)).includes('After disconnect'), 'changes stop syncing after disconnect');
  await Bp.page.screenshot({ path: '/tmp/sync-b-more.png', fullPage: false });
  await A.page.click('.tabbar a[data-tab=more]'); await A.page.click('[data-action=sync-show-code]');
  await A.page.evaluate(() => document.getElementById('sync-card').scrollIntoView());
  await A.page.screenshot({ path: '/tmp/sync-a-more.png' });

  console.log('mock calls:', JSON.stringify(srv.stats), 'rows:', srv.rows.size);
  ok(errors.length === 0, 'no console errors/warnings' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
  srv.server.close();
})().catch((e) => { console.error(e); process.exit(1); });
