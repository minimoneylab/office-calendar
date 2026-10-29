# DeskCal — team leave, bank holidays and economic calendar

Static site (GitHub Pages) + Supabase, same setup as FitLog. Economic data is pulled from
TradingView by a GitHub Action every 30 minutes.

## Pages
| File | What it does |
|---|---|
| `index.html` | **Team calendar** — month view Mon–Fri. Click a day to add **L** / **Biz** (with an "until" date for multi-day) or **AM** / **PM** half days. A multi-day period can be removed in one click or re-dated / re-typed with the pencil. |
| `econ.html` | **Economic calendar** — Last week / Today / This week / Next week, grouped by Hong Kong date, with Actual / Forecast / Previous. "Watchlist only" on by default; region filter; ☆ to add/remove. Bank holidays show in each day header. Refreshes every 5 minutes while open. |
| `econ-watch.html` | **Watchlist** — one panel per region, tick the indicators the desk follows. Set once. |
| `team.html` | Add / remove people, confirm the **short name**, pick each person's **colour**, turn people off, reorder. |
| `holidays.html` | Bank holidays (dates only). One panel per region, this year + next 2 years. Add, remove, or paste a list per region. Toggle which regions show on the calendars / TRMNL. |

Bank holiday regions: HK TW KR JP PH IN ID VN MY US UK BR.
Economic calendar regions: US EU JP UK CN AU CA CH NZ HK TW KR IN ID PH MY VN BR.

## Go live
1. **Database** — Supabase → SQL Editor → run, in order:
   `roster_migration_1.sql`, `roster_migration_2.sql`, `roster_migration_3.sql`.
   (Same project as FitLog; nothing of FitLog is touched. Migration 3 also loads your 366-indicator watchlist.)
2. **Connect the website** — in `js/supabase-client.js` paste `SUPABASE_URL` and `SUPABASE_KEY`
   (the *publishable* key) from FitLog's `js/supabase-client.js`.
   Until you do, the site runs in **demo mode** (sample data, saved only in your browser).
3. **Logo (optional)** — copy FitLog's `images/logo.png` into `images/`.
4. **Publish** — new GitHub repo named `office-calendar`, push, turn on Pages → `minimoneylab.com/office-calendar/`.
5. **Economic data robot** — in the GitHub repo: Settings → Secrets and variables → Actions → *New repository secret*:
   - `SUPABASE_URL` — same URL as above
   - `SUPABASE_SECRET_KEY` — Supabase → Project Settings → API Keys → **Secret key** (`sb_secret_...`).
     Keep this one secret: it's only stored in GitHub, never in the website files.
   Then Actions tab → *Economic calendar fetch* → **Run workflow** once. After that it runs every 30 minutes by itself.

```bash
git init
git add .
git commit -m "DeskCal: team calendar, bank holidays, economic calendar"
git branch -M main
git remote add origin https://github.com/<your-account>/office-calendar.git
git push -u origin main
```

## Notes
- No login; leave dates, bank holidays and the watchlist are open read/write for the team (same as FitLog).
  Economic events are read-only on the site — only the GitHub Action can write them.
- TradingView's calendar feed is unofficial. If it ever stops, only `scripts/fetch_econ.py` needs changing
  (e.g. to FMP or Trading Economics); the website stays the same.
- S&P Global PMIs (incl. HSBC India, RatingDog China) come through as date only — check Bloomberg for the number.
- GitHub pauses scheduled Actions after 60 days with no commits to the repo. If data stops updating,
  open the Actions tab and re-enable the workflow (or push any small change).
- After editing a JS/CSS file, bump its `?v=` number so browsers don't serve the old copy.
- Next phase: TRMNL endpoint reading these same tables.
