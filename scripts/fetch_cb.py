"""
fetch_cb.py — keep a long history of central bank rate decisions.

Run by GitHub Actions (.github/workflows/cb-fetch.yml) once a day, and by
hand from the Actions tab. Uses the same secrets as fetch_econ.py:
  SUPABASE_URL, SUPABASE_SECRET_KEY

Each run:
  1. Reads cb_banks (which TradingView indicator each bank uses).
  2. Fetches TradingView from 400 days back to 200 days ahead for those regions.
  3. Upserts the matching rate decisions into cb_events (never deletes old ones).
  4. Removes future meetings in that window that TradingView no longer lists
     (rescheduled), but only if the fetch looked healthy.

Local test without touching Supabase:   python fetch_cb.py --dry-run
"""
import os
import sys
from datetime import datetime, timedelta, timezone

import requests

from fetch_econ import REGIONS, Supa, fetch_tv, iso, num, std_name

DAYS_BACK, DAYS_FWD = 400, 200

# Used for --dry-run (and as a fallback if cb_banks can't be read)
DEFAULT_BANKS = [
    ("FED", "US", "Fed Interest Rate Decision"), ("ECB", "EU", "Deposit Facility Rate"),
    ("BOJ", "JP", "BoJ Interest Rate Decision"), ("BOE", "UK", "BoE Interest Rate Decision"),
    ("RBA", "AU", "RBA Interest Rate Decision"), ("BOC", "CA", "BoC Interest Rate Decision"),
    ("SNB", "CH", "SNB Interest Rate Decision"), ("RBNZ", "NZ", "RBNZ Interest Rate Decision"),
    ("PBOC", "CN", "Loan Prime Rate 1Y"), ("BOK", "KR", "Interest Rate Decision"),
    ("CBC", "TW", "Interest Rate Decision"), ("RBI", "IN", "RBI Interest Rate Decision"),
    ("BI", "ID", "Interest Rate Decision"), ("BSP", "PH", "Interest Rate Decision"),
    ("BNM", "MY", "Interest Rate Decision"), ("BCB", "BR", "Interest Rate Decision"),
]


def read_banks(db: Supa):
    r = requests.get(f"{db.base}/cb_banks", params={"select": "code,region,event_name"}, headers=db.h, timeout=30)
    db._check(r, "read cb_banks")
    return [(b["code"], b["region"], b["event_name"]) for b in r.json()]


def main() -> int:
    dry = "--dry-run" in sys.argv
    now = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    start, end = now - timedelta(days=DAYS_BACK), now + timedelta(days=DAYS_FWD)

    db = None
    if dry:
        banks = DEFAULT_BANKS
    else:
        url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SECRET_KEY")
        if not url or not key:
            raise SystemExit("Set SUPABASE_URL and SUPABASE_SECRET_KEY")
        db = Supa(url, key)
        banks = read_banks(db)
    lookup = {(region, name): code for code, region, name in banks}
    regions = sorted({region for _, region, _ in banks})
    print(f"{len(banks)} banks, regions: {', '.join(regions)}")

    # only ask TradingView for the countries we need
    import fetch_econ
    fetch_econ.REGIONS = {r: REGIONS[r] for r in regions if r in REGIONS}
    tv_to_region = {v: k for k, v in fetch_econ.REGIONS.items()}

    print(f"Fetching TradingView {start:%Y-%m-%d} → {end:%Y-%m-%d}")
    rows, seen_codes = [], set()
    for ev in fetch_tv(start, end):
        region = tv_to_region.get(ev.get("country"))
        code = lookup.get((region, std_name(ev.get("title"))))
        if not code or not ev.get("id") or not ev.get("date"):
            continue
        seen_codes.add(code)
        rows.append({
            "id": str(ev["id"]), "code": code, "date": ev["date"],
            "actual": num(ev.get("actual")), "forecast": num(ev.get("forecast")),
            "previous": num(ev.get("previous")),
            "updated_at": datetime.now(timezone.utc).isoformat(),
        })

    by_code = {}
    for r in rows:
        by_code.setdefault(r["code"], []).append(r)
    for code, _, _ in banks:
        evs = sorted(by_code.get(code, []), key=lambda r: r["date"])
        past = [r for r in evs if r["date"] <= iso(datetime.now(timezone.utc))]
        fut = [r for r in evs if r["date"] > iso(datetime.now(timezone.utc))]
        print(f"  {code:5} {len(past):3} past, next: {fut[0]['date'][:10] if fut else '—'}")
    missing = [c for c, _, _ in banks if c not in seen_codes]
    if missing:
        print(f"No decisions found for: {', '.join(missing)} (check event_name in cb_banks)")

    if dry:
        print(f"(dry run) would upsert {len(rows)} decisions")
        return 0

    db.upsert("cb_events", rows, "id")
    print(f"Upserted {len(rows)} decisions")

    # tidy future meetings that moved (only for banks we got data for)
    if len(rows) >= 30:
        r = requests.get(f"{db.base}/cb_events",
                         params=[("select", "id,code"), ("date", f"gt.{iso(datetime.now(timezone.utc))}"),
                                 ("date", f"lt.{iso(end)}")],
                         headers=db.h, timeout=30)
        db._check(r, "read future cb_events")
        keep = {x["id"] for x in rows}
        stale = [x["id"] for x in r.json() if x["code"] in seen_codes and x["id"] not in keep]
        for i in range(0, len(stale), 100):
            chunk = ",".join(f'"{x}"' for x in stale[i:i + 100])
            db._check(requests.delete(f"{db.base}/cb_events", params={"id": f"in.({chunk})"},
                                      headers=db.h, timeout=30), "delete moved meetings")
        print(f"Removed {len(stale)} rescheduled future meetings")
    print("Done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
