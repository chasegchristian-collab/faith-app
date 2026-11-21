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
  ok(errors.length === 0, 'no console errors/warnings' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
