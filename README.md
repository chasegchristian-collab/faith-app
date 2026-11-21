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
js/content.js          verse references (70), gratitude prompts (30), reading plan (35 days)
js/store.js            data layer: localStorage, export/import, merge (swap point for a future backend)
js/app.js              views, routing, voice input, reminders, sync UI
manifest.webmanifest   lets the app install to the home screen
sw.js                  service worker (offline app shell). Bump VERSION when you change files.
icons/                 app icons (any, maskable, apple-touch)
tests/smoke.test.js    headless browser smoke test (optional)
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

The app has no login, so anyone with the URL can open it. Each phone's data still stays on that phone.
Use an unguessable site name if you want the link itself to be private.

## Add to Home Screen
**iPhone (Safari):** open the link in Safari, tap the Share button (a square with an arrow), choose
**Add to Home Screen**, then tap **Add**. Opening it from the icon runs it full screen.
(On iOS, only Safari can install it in a way that supports notifications.)

**Samsung Internet:** open the link, tap the menu (≡), choose **Add page to** → **Home screen**
(or tap the install icon in the address bar if you see one).
**Chrome on Android:** tap ⋮ → **Add to Home screen** / **Install app**.

## First run
Enter both names and pick who is using this phone (you can change it with the name chip in the top right).
On the second phone, either enter the same two names or import a file your partner sent (More → Import).

## Syncing between your phones (v1)
There is no server yet, so each phone keeps its own copy in `localStorage`.
1. Phone A: More → **Share my data** (opens the share sheet: Messages, WhatsApp, email…). If the share sheet
   isn't available, use **Download backup file**.
2. Phone B: save the file, then go to More → **Import** and pick it.

Imports **merge**: each record has an id and an `updatedAt` time, the newer version wins, and deletions sync too.
Importing the same file twice won't create duplicates. To fully sync, do it in both directions.

Clearing Safari website data deletes the app's data, so export a backup now and then.

## Reminders, honestly
- While the app is open (or was opened recently), reminders fire at their set time. They use a system notification
  if you allowed notifications, or an in-app banner if you didn't.
- **True background push (an alert while the app is closed) needs a server**, which v1 doesn't have.
  On iPhone, web notifications also need iOS 16.4+ and the app installed to the Home Screen.
- **Reliable option:** tap **📅 Add to calendar** on any reminder. That downloads an `.ics` event
  (daily repeat plus an alert) that your phone's calendar app will ring on time.

## Voice input
Every text box has a 🎤 button that uses the browser's Web Speech API (works in Chrome and Samsung Internet;
on iOS Safari it's unreliable). If it isn't supported, the app tells you to use the keyboard's own 🎤 dictation key,
which works everywhere.

## Adding a backend later
All reads and writes go through `window.Store` (`js/store.js`). To add Firebase or Supabase:
write an adapter with `load()` / `save(data)` (and optionally a realtime subscription that calls the same
`merge()` logic), then call `Store.setAdapter(yourAdapter)`. The UI doesn't need to change. Records already
carry `id`, `updatedAt`, and `deleted` flags for last-write-wins syncing.

## Smoke test (optional)
```bash
npm i playwright-core            # in any folder
python3 -m http.server 8765 &    # from faith-app/
NODE_PATH=$(npm root) CHROME=/path/to/chrome node tests/smoke.test.js
```
