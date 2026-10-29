"""
fetch_econ.py — pull the economic calendar from TradingView into Supabase.

Run by GitHub Actions (.github/workflows/econ-fetch.yml) every 30 minutes.
Needs two repository secrets:
  SUPABASE_URL          e.g. https://abcd1234.supabase.co
  SUPABASE_SECRET_KEY   Supabase "secret" key (sb_secret_...) or legacy service_role key

What it does each run
  1. Fetches events from last Monday-1 week to +4 weeks for our 18 regions.
  2. Upserts them into econ_events (matched by TradingView id).
  3. Adds any indicator name it hasn't seen before to econ_catalog (watch = false).
  4. Removes events inside the window that TradingView no longer lists
     (cancelled / moved), but only if the fetch looked healthy.
  5. Deletes events older than 180 days to keep the table small.

Local test without touching Supabase:   python fetch_econ.py --dry-run
"""
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone

import requests

REGIONS = {  # our code -> TradingView country code
    "US": "US", "EU": "EU", "JP": "JP", "UK": "GB", "CN": "CN",
    "AU": "AU", "CA": "CA", "CH": "CH", "NZ": "NZ",
    "HK": "HK", "TW": "TW", "KR": "KR", "IN": "IN", "ID": "ID",
    "PH": "PH", "MY": "MY", "VN": "VN", "BR": "BR",
}
TV_TO_REGION = {v: k for k, v in REGIONS.items()}

TV_URL = "https://economic-calendar.tradingview.com/events"
TV_HEADERS = {
    "Origin": "https://www.tradingview.com",
    "Referer": "https://www.tradingview.com/",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/130.0 Safari/537.36",
}
CHUNK_DAYS = 14
KEEP_DAYS = 180
MIN_HEALTHY = 50          # below this many events we don't delete anything

PERIOD_RE = re.compile(
    r"\s*\((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Q[1-4]|H[12]|\d{4})[^)]*\)\s*$", re.I)


def std_name(title: str) -> str:
    name = (title or "").strip()
    while True:
        new = PERIOD_RE.sub("", name)
        if new == name:
            return name
        name = new


def iso(d: datetime) -> str:
    return d.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def num(v):
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


# ---------------------------------------------------------------- TradingView
def fetch_tv(start: datetime, end: datetime) -> list[dict]:
    out, seen = [], set()
    t = start
    while t < end:
        t2 = min(t + timedelta(days=CHUNK_DAYS), end)
        params = {"from": iso(t), "to": iso(t2), "countries": ",".join(REGIONS.values())}
        for attempt in range(3):
            try:
                r = requests.get(TV_URL, params=params, headers=TV_HEADERS, timeout=30)
                r.raise_for_status()
                data = r.json()
                batch = data.get("result", []) if isinstance(data, dict) else data
                break
            except Exception as e:  # noqa: BLE001
                print(f"  TradingView {t:%Y-%m-%d}: attempt {attempt + 1} failed: {e}")
                time.sleep(3 * (attempt + 1))
        else:
            raise SystemExit("TradingView fetch failed 3 times — stopping without changing anything.")
        for ev in batch or []:
            if ev.get("id") in seen:
                continue
            seen.add(ev.get("id"))
            out.append(ev)
        print(f"  {t:%Y-%m-%d} → {t2:%Y-%m-%d}: {len(batch or [])} events")
        t = t2
        time.sleep(1.0)
    return out


def to_row(ev: dict) -> dict | None:
    region = TV_TO_REGION.get(ev.get("country"))
    if not region or not ev.get("id") or not ev.get("date"):
        return None
    title = (ev.get("title") or "").strip()
    return {
        "id": str(ev["id"]),
        "date": ev["date"],
        "region": region,
        "title": title,
        "std_name": std_name(title),
        "period": ev.get("period") or None,
        "actual": num(ev.get("actual")),
        "forecast": num(ev.get("forecast")),
        "previous": num(ev.get("previous")),
        "unit": ev.get("unit") or None,
        "scale": ev.get("scale") or None,
        "importance": ev.get("importance") if isinstance(ev.get("importance"), int) else None,
        "source": ev.get("source") or None,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }


# ---------------------------------------------------------------- Supabase REST
class Supa:
    def __init__(self, url: str, key: str):
        self.base = url.rstrip("/") + "/rest/v1"
        self.h = {"apikey": key, "Content-Type": "application/json"}
        if key.startswith("eyJ"):                 # legacy JWT service_role key
            self.h["Authorization"] = f"Bearer {key}"

    def _check(self, r, what):
        if r.status_code >= 300:
            raise SystemExit(f"Supabase {what} failed: HTTP {r.status_code} {r.text[:300]}")
        return r

    def upsert(self, table, rows, on_conflict, ignore=False):
        pref = "resolution=ignore-duplicates" if ignore else "resolution=merge-duplicates"
        for i in range(0, len(rows), 500):
            r = requests.post(f"{self.base}/{table}", params={"on_conflict": on_conflict},
                              json=rows[i:i + 500], headers={**self.h, "Prefer": f"{pref},return=minimal"},
                              timeout=60)
            self._check(r, f"upsert {table}")

    def select_ids(self, start, end):
        r = requests.get(f"{self.base}/econ_events",
                         params=[("select", "id"), ("date", f"gte.{start}"), ("date", f"lt.{end}")],
                         headers={**self.h, "Range": "0-9999"}, timeout=60)
        return {x["id"] for x in self._check(r, "select ids").json()}

    def delete_ids(self, ids):
        ids = list(ids)
        for i in range(0, len(ids), 100):
            chunk = ",".join(f'"{x}"' for x in ids[i:i + 100])
            r = requests.delete(f"{self.base}/econ_events", params={"id": f"in.({chunk})"},
                                headers=self.h, timeout=60)
            self._check(r, "delete stale")

    def delete_older(self, cutoff):
        r = requests.delete(f"{self.base}/econ_events", params={"date": f"lt.{cutoff}"},
                            headers=self.h, timeout=60)
        self._check(r, "delete old")


def main() -> int:
    dry = "--dry-run" in sys.argv
    now = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    monday = now - timedelta(days=now.weekday())
    start, end = monday - timedelta(days=7), monday + timedelta(days=28)

    print(f"Fetching TradingView {start:%Y-%m-%d} → {end:%Y-%m-%d}")
    rows = [r for r in (to_row(e) for e in fetch_tv(start, end)) if r]
    print(f"{len(rows)} events for our regions")

    # every indicator name; has_actual = False for date-only items (speeches, statements, S&P PMIs)
    has_num = {}
    for r in rows:
        k = (r["region"], r["std_name"])
        has_num[k] = has_num.get(k, False) or r["actual"] is not None or r["previous"] is not None
    catalog = sorted(has_num)
    if dry:
        for r in rows[:5]:
            print(r)
        print(f"(dry run) would upsert {len(rows)} events and {len(catalog)} catalog names")
        return 0

    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SECRET_KEY")
    if not url or not key:
        raise SystemExit("Set SUPABASE_URL and SUPABASE_SECRET_KEY")
    db = Supa(url, key)

    db.upsert("econ_events", rows, "id")
    db.upsert("econ_catalog", [{"region": a, "std_name": b, "has_actual": has_num[(a, b)]} for a, b in catalog],
              "region,std_name", ignore=True)       # existing rows (and their watch ticks) are left untouched
    print(f"Upserted {len(rows)} events; catalog checked ({len(catalog)} names)")

    if len(rows) >= MIN_HEALTHY:
        stale = db.select_ids(iso(start), iso(end)) - {r["id"] for r in rows}
        if stale:
            db.delete_ids(stale)
        print(f"Removed {len(stale)} events no longer on TradingView")
    else:
        print("Too few events returned — skipped stale clean-up to be safe")

    db.delete_older(iso(now - timedelta(days=KEEP_DAYS)))
    print("Done")
    return 0


if __name__ == "__main__":
    sys.exit(main())
