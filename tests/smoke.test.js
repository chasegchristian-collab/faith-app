const { chromium, devices } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: devices['iPhone 13'].userAgent, colorScheme: 'dark' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error' || m.type()==='warning') errors.push(m.type()+': '+m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));
  page.on('dialog', d => d.accept());
  const ok = (c, msg) => { console.log((c ? 'PASS ' : 'FAIL ') + msg); if (!c) process.exitCode = 1; };
  const B = 'http://localhost:8765/';
  await page.goto(B);
  // setup
  ok(await page.isVisible('#setup-form'), 'setup screen shown on first run');
  await page.fill('#p1', 'Christian'); await page.fill('#p2', 'Kendell');
  await page.click('#setup-form button[type=submit]');
  await page.waitForSelector('.verse-ref');
  const ref = await page.textContent('.verse-ref');
  const href = await page.getAttribute('.card.accent a', 'href');
  const expected = 'https://www.biblegateway.com/passage/?search=' + encodeURIComponent(ref) + '&version=NLT';
  ok(href === expected, 'verse link correct: ' + href);
  ok(await page.getAttribute('.card.accent a', 'target') === '_blank', 'verse link opens new tab');
  // deterministic VOTD
  const v2 = await page.evaluate(() => FaithApp.verseOfDay(new Date()));
  ok(v2 === ref, 'verse deterministic');
  // tabs
  for (const t of ['home','pray','read','thanks','more']) {
    await page.click(`.tabbar a[data-tab=${t}]`);
    await page.waitForTimeout(150);
    const cur = await page.getAttribute(`.tabbar a[data-tab=${t}]`, 'aria-current');
    const len = (await page.innerHTML('#main')).length;
    ok(cur === 'page' && len > 200, `tab ${t} renders (${len} chars)`);
  }
  // prayer add
  await page.click('.tabbar a[data-tab=pray]');
  await page.click('[data-action=new-prayer]');
  await page.fill('#pr-title', 'Wisdom planning our wedding');
  await page.fill('#pr-for', 'Us');
  await page.fill('#pr-notes', 'James 1:5');
  await page.click('#dialog button[value=ok]');
  await page.waitForTimeout(200);
  ok((await page.textContent('#main')).includes('Wisdom planning our wedding'), 'prayer added');
  await page.click('[data-action=new-prayer]');
  await page.fill('#pr-title', "Mom's health");
  await page.press('#pr-title', 'Enter');
  await page.waitForTimeout(200);
  ok((await page.textContent('#main')).includes("Mom's health"), 'prayer added via Enter key');
  await page.click('[data-action=prayed]');
  await page.evaluate(() => document.getElementById('toast').classList.remove('show')); await page.waitForTimeout(400); await page.screenshot({ path: 'screenshots/02-prayer-list.png' });
  // mark answered
  const items = await page.$$('.item');
  await page.click('.item:has-text("Mom") [data-action=answer]');
  await page.fill('#an-test', 'Scans came back clear!');
  await page.click('#dialog button[value=ok]');
  await page.waitForTimeout(200);
  await page.click('[data-action=pray-filter][data-f=answered]');
  const ans = await page.textContent('#main');
  ok(ans.includes("Mom's health") && ans.includes('Scans came back clear') && ans.includes('Answered'), 'prayer marked answered with testimony');
  // gratitude
  await page.click('.tabbar a[data-tab=thanks]');
  await page.fill('#g-text', 'Thankful for a long walk together tonight.');
  await page.click('#gratitude-form button[type=submit]');
  await page.waitForTimeout(200);
  await page.reload(); await page.waitForSelector('#main .prompt');
  ok((await page.textContent('#main')).includes('long walk together'), 'gratitude persists after reload');
  // switch user and add entry
  await page.click('#who-chip');
  await page.fill('#g-text', 'Grateful for Christian’s patience.');
  await page.click('#gratitude-form button[type=submit]');
  await page.waitForTimeout(200);
  await page.evaluate(() => window.scrollTo(0,0)); await page.evaluate(() => document.getElementById('toast').classList.remove('show')); await page.waitForTimeout(400); await page.screenshot({ path: 'screenshots/05-gratitude.png' });
  // reading
  await page.click('.tabbar a[data-tab=read]');
  await page.click('[data-action=toggle-reading][data-id=john-1]');
  await page.click('[data-action=toggle-reading][data-id=john-2]');
  const john3 = await page.getAttribute('.plan-day:nth-of-type(3) a, a:has-text("John 3")', 'href');
  ok(john3 === 'https://www.biblegateway.com/passage/?search=John%203&version=NLT', 'reading link: ' + john3);
  await page.evaluate(() => window.scrollTo(0,0));
  await page.evaluate(() => document.getElementById('toast').classList.remove('show')); await page.waitForTimeout(400); await page.screenshot({ path: 'screenshots/03-verse-and-reading.png' });
  // reminders + ics
  await page.click('.tabbar a[data-tab=more]');
  await page.click('[data-action=new-reminder]');
  await page.click('#dialog button[value=ok]');
  await page.waitForTimeout(200);
  ok((await page.textContent('#main')).includes('Pray together'), 'reminder added');
  const ics = await page.evaluate(() => FaithApp.icsFor(Store.reminders()[0]));
  ok(ics.includes('RRULE:FREQ=DAILY') && ics.includes('BEGIN:VALARM'), 'ics generated');
  // review fixes: live sync hidden when unconfigured, .ics folding/CRLF, Google link, past dates, 4 AM day, content
  ok(!(await page.$('#sync-card')) && (await page.textContent('#main')).includes('Live syncing isn’t turned on'), 'no Connect section when config is empty');
  ok(await page.getAttribute('#import-file', 'accept') === 'application/json,.json,.txt,text/plain', 'import accepts .txt');
  const ics2 = await page.evaluate(() => FaithApp.icsFor({ id: 'x', title: 'Pray for our marriage, our families, our church, and everyone on the list 🙏🙏', time: '21:00', repeat: 'daily', forWhom: 'Both', createdBy: 'Kendell' }));
  const enc = new TextEncoder();
  ok(ics2.endsWith('\r\n') && ics2.split('\r\n').every((l) => enc.encode(l).length <= 75) && ics2.includes('\r\n '), 'ics lines folded at 75 octets and end with CRLF');
  const unfolded = ics2.replace(/\r\n /g, '');
  ok(unfolded.includes('SUMMARY:Pray for our marriage\\, our families\\, our church\\, and everyone on the list 🙏🙏'), 'folded ics unfolds to the original text');
  const gcal = await page.evaluate(() => FaithApp.googleCalUrl(Store.reminders()[0]));
  ok(gcal.startsWith('https://calendar.google.com/calendar/render?action=TEMPLATE&text=Pray%20together&dates=') && gcal.includes('&recur=RRULE%3AFREQ%3DDAILY'), 'Google Calendar link: ' + gcal);
  ok(await page.getAttribute('.item a[href^="https://calendar.google.com"]', 'target') === '_blank', 'Google Calendar link shown next to .ics button');
  const [icsDl] = await Promise.all([page.waitForEvent('download'), page.evaluate(() => { Store.addReminder({ title: '🙏🙏', time: '07:00' }); })
    .then(async () => { await page.click('.tabbar a[data-tab=home]'); await page.click('.tabbar a[data-tab=more]'); await page.click('.item:has-text("🙏🙏") [data-action=ics]'); })]);
  ok(icsDl.suggestedFilename() === 'reminder.ics', 'empty slug falls back to reminder.ics: ' + icsDl.suggestedFilename());
  await page.evaluate(() => { const r = Store.reminders().find((x) => x.title === '🙏🙏'); Store.deleteReminder(r.id); });
  await page.click('.tabbar a[data-tab=home]'); await page.click('.tabbar a[data-tab=more]');
  const nRem = await page.evaluate(() => Store.reminders().length);
  await page.click('[data-action=new-reminder]');
  await page.selectOption('#rm-repeat', 'once');
  await page.evaluate(() => { const d = new Date(Date.now() - 86400000); document.getElementById('rm-date').value = Store.dateKey(d); });
  await page.click('#dialog button[value=ok]');
  await page.waitForTimeout(200);
  ok(await page.evaluate(() => document.getElementById('dialog').open) && await page.evaluate(() => Store.reminders().length) === nRem, 'one-time reminder in the past is blocked');
  await page.click('#dialog button[value=cancel]');
  const fd = await page.evaluate(() => [Store.faithDayKey(new Date(2026, 10, 21, 3, 59)), Store.faithDayKey(new Date(2026, 10, 21, 4, 0)), Store.faithDayKey(new Date(2026, 10, 21, 0, 30))]);
  ok(fd[0] === '2026-11-20' && fd[1] === '2026-11-21' && fd[2] === '2026-11-20', 'faith day rolls over at 4 AM: ' + fd.join(','));
  await page.evaluate(() => localStorage.setItem('faithapp:fired:v1', JSON.stringify({ 'a@2020-01-01': true, ['b@' + Store.dateKey()]: true })));
  await page.reload(); await page.waitForSelector('#main');
  const fired = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('faithapp:fired:v1'))));
  ok(!fired.includes('a@2020-01-01') && fired.some((k) => k.startsWith('b@')), 'fired-reminder log pruned after 7 days');
  const content = await page.evaluate(() => ({ v: Content.VERSES, g: Content.GRATITUDE_PROMPTS, plan: Content.PLAN.map((d) => d.ref) }));
  ok(['Philippians 4:11-13', 'Jeremiah 29:4-14', 'Ecclesiastes 4:12', 'Ephesians 5:21-33', 'Psalm 37:3-7', 'Ruth 1:15-18'].every((r) => content.v.includes(r)) &&
     !['Philippians 4:13', 'Jeremiah 29:11', 'Matthew 18:19-20', 'Ephesians 5:25', 'Psalm 37:4-5', 'Ruth 1:16-17'].some((r) => content.v.includes(r)) && content.v.length === 70, 'verse list updated');
  ok(content.g.includes('What quality in your partner are you thankful to God for?') && content.g.includes("Is there something hard where you've seen even a glimpse of God's care?"), 'gratitude prompts updated');
  ok(content.plan.includes('Psalm 13') && content.plan.includes('Psalm 133') && content.plan.length === 37, 'reading plan has Psalm 13 and 133 (37 days)');
  await page.click('.tabbar a[data-tab=read]'); await page.waitForTimeout(150);
  ok((await page.textContent('#main')).includes('Shared progress for both of you'), 'reading progress labelled as shared');
  await page.click('.tabbar a[data-tab=more]'); await page.waitForTimeout(150);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-action=export]')]);
  const path = await dl.path(); const exported = JSON.parse(require('fs').readFileSync(path,'utf8'));
  ok(exported.data.prayers.length === 2 && exported.data.gratitude.length === 2, 'export JSON contains data');
  // import merge on a fresh context (partner phone)
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const p2 = await ctx2.newPage(); p2.on('pageerror', e => errors.push('p2 pageerror: '+e.message));
  await p2.goto(B + '#more');
  await p2.fill('#p1', 'Christian'); await p2.fill('#p2', 'Kendell'); await p2.click('#setup-form button[type=submit]');
  await p2.click('.tabbar a[data-tab=more]');
  await p2.setInputFiles('#import-file', path);
  await p2.waitForTimeout(300);
  const st = await p2.evaluate(() => ({ p: Store.prayers().length, g: Store.gratitude().length, r: Store.streak('gratitude') }));
  ok(st.p === 2 && st.g === 2 && st.r === 1, 'import merges on partner device ' + JSON.stringify(st));
  await p2.evaluate(() => Store.importData(JSON.parse(JSON.stringify(Store.exportData())), 'merge'));
  ok(await p2.evaluate(() => Store.prayers().length) === 2, 'merge is idempotent (no duplicates)');
  // home screenshot
  await page.click('.tabbar a[data-tab=home]');
  await page.waitForTimeout(200);
  const streakText = await page.textContent('.streaks');
  ok(/1\s*Prayer/.test(streakText) && /1\s*Reading/.test(streakText) && /1\s*Gratitude/.test(streakText), 'streaks show 1 each: ' + streakText.replace(/\s+/g,' '));
  await page.evaluate(() => document.getElementById('toast').classList.remove('show')); await page.waitForTimeout(400); await page.screenshot({ path: 'screenshots/01-home-dashboard.png' });
  // SW registered
  const sw = await page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration()));
  ok(sw, 'service worker registered');
  // manifest
  const mf = await (await page.request.get(B + 'manifest.webmanifest')).json();
  ok(mf.icons.length === 3 && mf.display === 'standalone', 'manifest valid');
  // light mode screenshot
  await page.emulateMedia({ colorScheme: 'light' });
  await page.evaluate(() => document.getElementById('toast').classList.remove('show')); await page.waitForTimeout(400); await page.screenshot({ path: 'screenshots/04-home-light.png' });
  // iOS Safari tab (not installed): first-run banner asks to add to Home Screen first
  const ctx3 = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: devices['iPhone 13'].userAgent });
  await ctx3.addInitScript(() => Object.defineProperty(navigator, 'standalone', { get: () => false }));
  const p3 = await ctx3.newPage(); await p3.goto(B);
  ok((await p3.textContent('#ios-banner')).includes('Add this to your Home Screen first, then set up. Safari tabs can lose data.'), 'iOS Safari-tab banner shown');
  ok(!(await page.$('#ios-banner')), 'no banner when not an iOS browser tab');
  ok(errors.length === 0, 'no console errors/warnings' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
