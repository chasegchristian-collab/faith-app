# Together in Faith

A private couple's faith app for two: shared prayer list, answered-prayer tracker, verse of the day,
nightly gratitude, reminders, a John + Psalms reading plan, and streaks. Plain HTML/CSS/JS:
no frameworks, no build step, no external CDNs.

Scripture: the app stores **references only** (for example "Philippians 4:6-7"). Every reference opens on
Bible Gateway in the NLT (`https://www.biblegateway.com/passage/?search=<ref>&version=NLT`).
No NLT text is included, because the NLT is copyrighted.

## Files
```
index.html             app shell + bottom tabs
styles.css             mobile-first styles (20px base, dark default, light when the phone is in light mode)
js/content.js          verse references (70), gratitude prompts (30), reading plan (37 days)
js/config.js           live sync settings (Supabase URL + anon key); empty = local-only
js/store.js            data layer: localStorage, export/import, merge, live sync engine
js/app.js              views, routing, voice input, reminders, sync UI
supabase/schema.sql    database table + pull/push functions for live sync (run once in Supabase)
manifest.webmanifest   lets the app install to the home screen
sw.js                  service worker (offline app shell). Bump VERSION when you change files.
icons/                 app icons (any, maskable, apple-touch)
tests/smoke.test.js    headless browser smoke test (optional)
tests/sync.test.js     two-phone live sync test against tests/mock-supabase.js (optional)
```

## Run locally
```bash
cd faith-app
python3 -m http.server 8000
# open http://localhost:8000
```
A service worker needs `http://localhost` or `https://`. Opening the file directly with `file://` works, but not offline.

To test from a phone on the same Wi-Fi, open `http://<your-computer-ip>:8000`. Offline mode and installing need
HTTPS, so for real phone use, host the app as described below.

## Host it for free (works on iPhone and Samsung)
Any static host with HTTPS works. Pick one:

- **Netlify Drop (easiest, no account setup):** go to https://app.netlify.com/drop and drag the `faith-app`
  folder onto the page. You get an `https://….netlify.app` link. Create a free account to keep the site permanently.
- **GitHub Pages:** push this folder to a GitHub repo, then go to Settings → Pages → "Deploy from a branch" → `main` / root.
  The URL will be `https://<user>.github.io/<repo>/`. Every path in the app is relative, so a subfolder works.
- **Cloudflare Pages** works too: upload the folder directly.

The app has no login, so anyone with the URL can open it, but they start with an empty app: each phone's data stays on
that phone, and synced data can only be reached with your couple code.
Use an unguessable site name if you want the link itself to be private.

## Add to Home Screen (do this BEFORE setup)
Add the app to your Home Screen first, then open it from the new icon and set it up there.
On iPhone, the Home Screen app and the Safari tab have **separate storage**, so anything entered in a Safari tab
won't appear in the Home Screen app, and Safari can wipe a site's data after 7 days without a visit.

**iPhone (Safari):** open the link in Safari, tap the Share button (a square with an arrow), choose
**Add to Home Screen**, then tap **Add**. Opening it from the icon runs it full screen.
Since iOS 16.4, other iPhone browsers (Chrome, Edge, Firefox) can add it to the Home Screen too, and on iOS 26
sites added to the Home Screen open as web apps by default. Notifications need the Home Screen app.

**Samsung Internet:** open the link, tap the menu (≡), choose **Add page to** → **Home screen**
(or tap the install icon in the address bar if you see one).
**Chrome on Android:** tap ⋮ → **Add to Home screen** / **Install app**.

## First run
Enter both names and pick who is using this phone (you can change it with the name chip in the top right).
On the second phone, tap Start too, then connect the phones (below).

## Syncing between your phones
### Live sync (when `js/config.js` is filled in)
1. Phone A: More → **Connect your phones** → **Create couple code**, then **Share code** (or show it and read it out).
2. Phone B: More → **Connect your phones** → **Join with code**, and paste or type it. Dashes and spaces don't matter.

After that, prayers, answered prayers, gratitude, reminders, reading check-offs, streak days and your two names
sync automatically: when the app opens, about a second after each change, when you come back to the app, and
every 20 seconds while it's on screen. The small line under the title shows **Synced just now**, **Offline**, or
**Sync problem**. Who is using each phone and the light/dark setting stay on that phone.

- **Joining merges.** Anything already on Phone B is kept and combined with Phone A's data.
- **Offline is fine.** Everything is saved on the phone first; changes upload when you're back online.
- **Conflicts:** each record has an id and an `updatedAt` time, and the newer edit wins. Deletes sync as tombstones.
- **Disconnect this phone** stops syncing but keeps the data on the phone. "Erase all data" also disconnects.
- **The couple code is the key.** Anyone with it can read and change your shared data, so only share it with each other.
  It's 24 random characters (about 120 bits), and the database only answers requests that include it.

### Setting up live sync (one time, for whoever hosts the app)
1. Create a free project at https://supabase.com.
2. Dashboard → **SQL Editor** → paste all of `supabase/schema.sql` → **Run**. It creates the `couple_items` table
   (row level security on, no policies, so it can't be read directly) and two functions, `pull` and `push`,
   that only the anon role may call and that always require the couple code.
3. Dashboard → **Project Settings → API**: copy the **Project URL** and the **anon public** key into `js/config.js`.
   Never put the `service_role` key in the app.
4. Bump `VERSION` in `sw.js`, commit and push. Both phones pick up the change on their own.

If `js/config.js` is left empty, the app stays local-only and the Connect section is hidden.

### Backup files (always available)
1. Phone A: More → **Share my data** (opens the share sheet: Messages, WhatsApp, email…). It's sent as a `.txt` file
   because Chrome won't share `.json` files. If the share sheet isn't available, use **Download backup file**.
2. Phone B: save the file, then go to More → **Import** and pick it (`.txt` or `.json`).

Imports **merge** the same way live sync does, and importing the same file twice won't create duplicates.

Clearing Safari website data deletes the app's data on that phone, so keep live sync on or export a backup now and then.

## Reminders, honestly
- Reminders fire only while the app is open, or catch up if you open it within 2 hours of the set time. They use a
  system notification if you allowed notifications, or an in-app banner if you didn't.
- **True background push (an alert while the app is closed) needs a push server**, which the app doesn't have.
  On iPhone, web notifications also need iOS 16.4+ and the app installed to the Home Screen.
- **Calendar option (usually works):** tap **📅 Add to calendar** on any reminder to download an `.ics` event
  (daily repeat plus an alert), or **Google Calendar ↗** to open a prefilled Google Calendar event.
  Pausing or deleting a reminder in the app does **not** remove an event you already added to your calendar.
- "Just once" reminders can't be set for a date and time that has already passed.

## Voice input
Every text box has a 🎤 button that uses the browser's Web Speech API. Works in Chrome and Samsung Internet on Android;
on iPhone use the keyboard's mic. The app asks for on-device recognition where the browser supports it, but in some
browsers voice is processed by the browser's online speech service.

## Day boundaries
Streaks, "tonight's" gratitude and reading check-offs use a day that runs from 4 AM to 4 AM, so an entry at 12:30 AM
still counts for the evening before. The reading plan is shared: a check-off by either of you counts for both.

## How live sync works (for developers)
All reads and writes go through `window.Store` (`js/store.js`); `Store.sync` is the sync engine. It talks to
Supabase with plain `fetch()` (no SDK): `POST <url>/rest/v1/rpc/push` and `/rpc/pull` with `apikey` and
`Authorization: Bearer <anon key>` headers. Each record is one row (`prayer:<id>`, `reading:john-3`, `settings`,
`activity:prayer:2026-11-21`, …). The engine pushes rows whose `updatedAt` differs from what the server last
confirmed, pulls rows the server changed since its cursor (server time, `synced_at`), and merges them with the
same last-write-wins `merge()` used for file imports. Sync state lives in `localStorage` under `faithapp:sync:v1`.
The service worker never touches cross-origin requests, so API calls are never cached.

## Tests (optional)
```bash
npm i playwright-core            # in any folder
python3 -m http.server 8765 &    # from faith-app/
NODE_PATH=$(npm root) CHROME=/path/to/chrome node tests/smoke.test.js
NODE_PATH=$(npm root) CHROME=/path/to/chrome node tests/sync.test.js   # starts its own mock Supabase on port 8799
```
The sync test points the app at the mock by intercepting `js/config.js` inside the test browser, so the committed
config stays empty.
