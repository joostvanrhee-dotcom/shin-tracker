# Shin Tracker

A small offline web app for logging shin and calf strengthening exercises on an iPhone. It tracks a daily streak, what you did (sets, reps, weight, time) and whether you stretched. It is built to fix the usual imbalance: strong calves, weak shins.

- Plain HTML, CSS and vanilla JavaScript (ES modules). No frameworks, no build step, no dependencies.
- All data stays on your device in `localStorage` (key `shinTracker.v1`). No accounts, no analytics, no external requests.
- Works offline after the first visit (service worker).

## Daily routine

The app comes set up for one daily routine: three exercises plus a stretch.

1. **Standing calf raises**: straight knees, rise high onto your toes, lower slowly.
2. **Bent-knee calf raises**: knees bent (works the soleus), rise and lower with control.
3. **Band ankle eversion** (seated resisted ankle eversion): sit on a chair with a band over the top of your feet, keep your heel on the floor and turn your foot outward, then return slowly.
4. **Stretch**.

The Today screen shows how much of the routine is done, and celebrates when all four are done. You can still add, edit or archive exercises in Settings.

## Screens

- **Today**: streak and best streak, your exercises (tap to log, prefilled with last time's values), a "Stretched today" toggle with optional minutes, and notes for the day.
- **History**: month calendar. Filled days = exercised, small dot = stretched, outline = today. Tap a day to view, add, edit or delete its entries (backfilling updates your streaks).
- **Progress**: current, best and stretch streaks, training days, milestone badges (3, 7, 14, 30, 60, 100, 200, 365 days), and per-exercise volume this week vs last week.
- **Settings**: add, edit, reorder and archive exercises; export/import a JSON backup; reset all data.

## Streak rules

- A day counts when at least one exercise is logged. Stretching has its own separate stretch streak.
- If nothing is logged yet today, the streak ending yesterday stays alive until today is over.
- Best streak is always recalculated from your data, so editing past days stays correct.

## Publish with GitHub Pages

1. On GitHub, open the repository and go to **Settings > Pages**.
2. Under **Build and deployment**, choose **Source: Deploy from a branch**, then **Branch: main** and folder **/ (root)**. Click **Save**.
3. After a minute or two the app is live at:

   **https://joostvanrhee-dotcom.github.io/shin-tracker/**

## Add it to your iPhone home screen

1. Open the URL above in **Safari** (not another browser).
2. Tap **Share**, then **Add to Home Screen**, then **Add**.
3. Open Shin Tracker from the new icon from now on.

> **Important:** the home-screen app keeps its data separate from Safari. Data you log in a Safari tab is not visible in the home-screen app and vice versa. Always log from the icon, and use **Settings > Export JSON** regularly for backups (save the file to Files or iCloud Drive). Deleting the home-screen app also deletes its data.

## Updating

The service worker is network-first for the app files, so a new version shows up the next time you open the app while online. When you change app files, bump `VERSION` in `sw.js` so the offline cache is refreshed too.

## Development

```bash
python3 -m http.server 8000   # then open http://localhost:8000/
npm test                      # runs the stats tests with Node's built-in test runner
npm run icons                 # regenerates the PNG icons (no dependencies)
```

Files:

| Path | Purpose |
| --- | --- |
| `index.html`, `styles.css` | App shell and styles (light and dark mode) |
| `js/app.js` | UI, events, export/import |
| `js/stats.js` | Pure date, streak and statistics functions (no DOM) |
| `js/store.js` | `localStorage` load/save and data validation |
| `js/confetti.js` | Celebration animation |
| `sw.js` | Service worker for offline use |
| `manifest.webmanifest`, `icons/` | Home-screen app metadata and icons |
| `scripts/make-icons.js` | Icon generator |
| `tests/stats.test.js` | Tests for streaks and stats |

Requires Node 20+ for the tests only; the app itself needs no tooling.
