const { chromium, devices } = require('playwright-core');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: devices['iPhone 13'].userAgent, colorScheme: 'dark' });
  // Keep this test local-only: serve an empty sync config (the committed one points at the live Supabase project).
  await ctx.route('**/js/config.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript',
    body: "window.FAITH_CONFIG = { supabaseUrl: '', supabaseAnonKey: '' };" }));
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
  // compare with the original language (links only)
  const BG = 'https://www.biblegateway.com/passage/?search=';
  const STEP = 'https://www.stepbible.org/?q=version=BSB|version=';
  const cmp = await page.evaluate(() => ['John 3:16', '1 John 4:7-8', 'Psalm 46:1-3', 'Psalm 34:8', 'Song of Songs 8:6-7', 'John 3', 'Psalm 46']
    .map((r) => Content.compareLinks(r)));
  const [cJ316, c1J, cP46, cP34, cSong, cJ3, cPs46] = cmp;
  ok(cJ316.language === 'Greek' && cJ316.side === BG + 'John%203%3A16&version=NLT;SBLGNT' &&
     cJ316.step === STEP + 'SBLG|reference=John.3.16&options=HVLUN&display=INTERLINEAR', 'compare John 3:16');
  ok(c1J.side === BG + '1%20John%204%3A7-8&version=NLT;SBLGNT' && c1J.step === STEP + 'SBLG|reference=1John.4.7-8&options=HVLUN&display=INTERLINEAR', 'compare 1 John 4:7-8');
  ok(cP46.language === 'Hebrew' && cP46.hebrewRef === 'Psalm 46:2-4' && cP46.side === null &&
     cP46.split.nlt === BG + 'Psalm%2046%3A1-3&version=NLT' && cP46.split.wlc === BG + 'Psalm%2046%3A2-4&version=WLC' &&
     cP46.step === STEP + 'OSHB|reference=Psa.46.1-3&options=HVLUN&display=INTERLINEAR', 'compare Psalm 46:1-3 (WLC 46:2-4)');
  ok(cP34.hebrewRef === 'Psalm 34:9' && cP34.split.nlt === BG + 'Psalm%2034%3A8&version=NLT' && cP34.split.wlc === BG + 'Psalm%2034%3A9&version=WLC' &&
     cP34.step === STEP + 'OSHB|reference=Psa.34.8&options=HVLUN&display=INTERLINEAR', 'compare Psalm 34:8 (WLC 34:9)');
  ok(cSong.side === BG + 'Song%20of%20Songs%208%3A6-7&version=NLT;WLC' && cSong.step === STEP + 'OSHB|reference=Song.8.6-7&options=HVLUN&display=INTERLINEAR', 'compare Song of Songs 8:6-7');
  ok(cJ3.side === BG + 'John%203&version=NLT;SBLGNT' && cJ3.step === STEP + 'SBLG|reference=John.3&options=HVLUN&display=INTERLINEAR', 'compare reading-plan John 3');
  ok(cPs46.side === BG + 'Psalm%2046&version=NLT;WLC' && cPs46.step === STEP + 'OSHB|reference=Psa.46&options=HVLUN&display=INTERLINEAR', 'compare reading-plan Psalm 46 (whole chapter, same numbering)');
  const wlcMap = await page.evaluate(() => ['Psalm 46:10', 'Joel 2:28', 'Malachi 4:2', 'Psalm 23:1-3'].map((r) => Content.wlcRef(r)));
  ok(wlcMap.join('|') === 'Psalm 46:11|Joel 3:1|Malachi 3:20|Psalm 23:1-3', 'WLC numbering overrides: ' + wlcMap.join('|'));
  const allParse = await page.evaluate(() => Content.VERSES.concat(Content.PLAN.map((d) => d.ref)).every((r) => !!Content.compareLinks(r)));
  ok(allParse, 'every verse and plan ref gets compare links');
  const chipJ3 = page.locator('.plan-day:has(a:text-is("Day 3: John 3")) .chip-lang');
  const chipP46 = page.locator('.plan-day:has(a:text-is("Day 29: Psalm 46")) .chip-lang');
  ok((await chipJ3.innerText()).startsWith('Greek') && (await chipP46.innerText()).startsWith('Hebrew'), 'chip labelled by testament (John 3 Greek, Psalm 46 Hebrew)');
  const vodLang = await page.evaluate(() => Content.originalLanguage(FaithApp.verseOfDay(new Date())));
  ok((await page.locator('.card.accent .chip-lang').innerText()).startsWith(vodLang), 'verse-of-the-day chip: ' + vodLang);
  ok(await page.locator('.plan-day .chip-lang').count() === 37 && await page.locator('.plan-day').first().locator('.chip-lang').count() === 1, 'one chip per plan reference');
  ok(await page.$$eval('.cmp-panel', (n) => n.length) === 0 && !(await page.getAttribute('details.about-orig', 'open')), 'compare panels and the about note start collapsed');
  ok(await chipP46.getAttribute('aria-controls') === null, 'no aria-controls before the panel exists');
  const shifts = await page.evaluate(() => ['Psalm 46', 'Psalm 13', 'Psalm 51', 'Psalm 1', 'Psalm 23', 'John 3', 'Psalm 46:10'].map((r) => Content.compareLinks(r).verseShift));
  ok(shifts.join(',') === '1,1,2,0,0,0,0', 'whole-chapter psalm verse shifts: ' + shifts.join(','));
  await chipP46.click();
  ok(await chipP46.getAttribute('aria-expanded') === 'true', 'chip expands');
  const ctl = await chipP46.getAttribute('aria-controls');
  ok(!!ctl && !!(await page.$('#' + ctl + '.cmp-panel')), 'aria-controls points at the open panel');
  ok((await page.textContent('#' + ctl)).includes('In the Hebrew, verse numbers here run 1 ahead (the title is verse 1).'), 'Psalm 46 shift note');
  ok(await page.$$eval('#' + ctl + ' a', (as) => as.every((a) => a.querySelector('.sr-only') && a.querySelector('.sr-only').textContent === ' (opens in a new tab)')), 'compare links announce new tab');
  ok(await page.$eval('.plan-day:has(#' + ctl + ')', (el) => getComputedStyle(el).alignItems) === 'flex-start', 'open plan day aligns check to the top');
  const p46Links = await page.$$eval('.plan-day .cmp-panel a', (as) => as.map((a) => a.href + ' ' + a.target));
  ok(p46Links.length === 2 && p46Links[0] === BG + 'Psalm%2046&version=NLT;WLC _blank' && p46Links[1].startsWith(STEP + 'OSHB|reference=Psa.46&'), 'Psalm 46 panel links: ' + p46Links.join(' , '));
  await chipP46.scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, 120)); await page.waitForTimeout(200);
  await page.screenshot({ path: 'screenshots/06-compare-plan.png' });
  await page.click('.plan-day:has(a:text-is("Day 29: Psalm 46")) [data-action=toggle-reading]'); // re-render
  ok(await chipP46.getAttribute('aria-expanded') === 'true' && await page.$$eval('.plan-day .cmp-panel', (n) => n.length) === 1, 'open panel survives a re-render');
  await page.click('.plan-day:has(a:text-is("Day 29: Psalm 46")) [data-action=toggle-reading]');
  const chipP51 = page.locator('.plan-day:has(a:text-is("Day 30: Psalm 51")) .chip-lang');
  await chipP51.click();
  ok((await page.textContent('#' + (await chipP51.getAttribute('aria-controls')))).includes('run 2 ahead'), 'Psalm 51 shift note (2 ahead)');
  await chipP51.click();
  const chipJ3b = page.locator('.plan-day:has(a:text-is("Day 3: John 3")) .chip-lang');
  await chipJ3b.click();
  ok(!(await page.textContent('#' + (await chipJ3b.getAttribute('aria-controls')))).includes('ahead'), 'no shift note for John 3');
  await chipJ3b.click();
  await chipP46.click();
  ok(await page.$$eval('.cmp-panel', (n) => n.length) === 0 && await chipP46.getAttribute('aria-controls') === null, 'chip collapses again');
  // split links for a verse whose Hebrew numbering differs: a phone whose date makes Psalm 46:1-3 the verse of the day
  const ctx4 = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    userAgent: devices['iPhone 13'].userAgent, colorScheme: 'dark' });
  await ctx4.route('**/js/config.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: "window.FAITH_CONFIG = { supabaseUrl: '', supabaseAnonKey: '' };" }));
  const p4 = await ctx4.newPage(); p4.on('pageerror', e => errors.push('p4 pageerror: ' + e.message));
  await p4.clock.setFixedTime(new Date(2026, 9, 20, 12, 0)); // Oct 20, 2026 -> VERSES[26] = Psalm 46:1-3
  await p4.goto(B); await p4.click('#setup-form button[type=submit]'); await p4.click('.tabbar a[data-tab=read]');
  ok(await p4.textContent('.verse-ref') === 'Psalm 46:1-3' && (await p4.locator('.card.accent .chip-lang').innerText()).startsWith('Hebrew'), 'Psalm 46:1-3 verse card has a Hebrew chip');
  await p4.click('.card.accent .chip-lang');
  const splitText = await p4.textContent('.card.accent .cmp-panel');
  const splitLinks = await p4.$$eval('.card.accent .cmp-panel a', (as) => as.map((a) => a.href));
  ok(splitText.includes('The Hebrew numbers this as Psalm 46:2-4') && splitLinks[0] === BG + 'Psalm%2046%3A1-3&version=NLT' &&
     splitLinks[1] === BG + 'Psalm%2046%3A2-4&version=WLC' && splitLinks[2] === STEP + 'OSHB|reference=Psa.46.1-3&options=HVLUN&display=INTERLINEAR' &&
     splitLinks.length === 3, 'split side-by-side links when numbering differs');
  await p4.evaluate(() => document.getElementById('toast').classList.remove('show')); await p4.waitForTimeout(400);
  await p4.screenshot({ path: 'screenshots/07-compare-verse.png' });
  await p4.click('details.about-orig summary');
  const about = await p4.textContent('details.about-orig');
  ok(about.includes('The NLT is a meaning-based (thought-for-thought) translation') && about.includes('counts the title as a verse') &&
     about.includes('narrow') && about.includes('tour pop-up'), 'about-the-original-languages note');
  await p4.evaluate(() => document.querySelector('details.about-orig').scrollIntoView({ block: 'center' })); await p4.waitForTimeout(200);
  await p4.screenshot({ path: 'screenshots/08-about-original.png' });
  await ctx4.close();
  await page.click('.tabbar a[data-tab=home]'); await page.click('.tabbar a[data-tab=read]');
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
  ok(['Philippians 4:11-13', 'Jeremiah 29:4-14', '1 Peter 3:8-9', 'Ephesians 5:21-33', 'Psalm 37:3-7', 'Ruth 1:15-18'].every((r) => content.v.includes(r)) &&
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
