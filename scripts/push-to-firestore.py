"""
push-to-firestore.py — SAFE, idempotent pusher for the validated Lane 2 + Lighthouse data.

Loads the validated local artifacts and writes them into Firestore so the frontend
(lib/queries.ts) can read REAL data. Pure firebase_admin — no Gemini, no Playwright.

Three sinks, all written with .set() (idempotent overwrite — re-running never duplicates):

  lane2-runs.jsonl            -> collection "runs"            doc id f"{site_id}_t{trial_number}"
  lane2-runs-extraction.jsonl -> collection "runs_extraction" doc id f"{site_id}_t{trial_number}"
  data/lighthouse-results.json-> collection "lighthouse"       doc id = site_id

DOES NOT touch the "sites" collection — that is seeded separately by `npm run seed:sites`.
getLeaderboard / getSiteDetail join sites + lighthouse(doc id = site_id) + runs(where site_id ==),
so this script fills exactly the lighthouse + runs halves of that join.

SAFETY MODEL — default is a DRY preview that writes NOTHING:

    python scripts/push-to-firestore.py            # DRY preview: counts + sample doc ids, no writes
    python scripts/push-to-firestore.py --write     # actually write to Firestore

Each row is validated against the expected key set before it is eligible to write; a
malformed line is skipped with a warning and never aborts the whole push.

Credentials mirror scripts/lane2-agent.py get_db():
  - FIREBASE_SERVICE_ACCOUNT_JSON (raw JSON) -> credentials.Certificate, else
  - credentials.ApplicationDefault()  (GOOGLE_APPLICATION_CREDENTIALS=service-account.json)
Creds are only initialized when --write is actually used; the DRY preview needs no creds.

Requirements:
    pip install -r scripts/requirements.txt   # firebase-admin is enough for this script
"""

import argparse
import json
import os
import sys
from pathlib import Path

# Windows consoles default to cp1252 and choke on the ✓ glyph we print, which would crash
# the run mid-push. Force UTF-8 output (mirrors lane2-agent.py).
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:
        pass


# Repo root = parent of this scripts/ dir, so the script works from any cwd.
REPO_ROOT = Path(__file__).resolve().parent.parent


def load_env(path=None):
    """Load .env.local (simple key=value parser) so GOOGLE_APPLICATION_CREDENTIALS /
    FIREBASE_SERVICE_ACCOUNT_JSON can live there, mirroring lane2-agent.py. setdefault
    so a real shell export always wins over the file."""
    p = Path(path) if path else (REPO_ROOT / ".env.local")
    if not p.exists():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())


# ---------------------------------------------------------------------------
# Expected row schemas (frozen contract — lib/types.ts)
# ---------------------------------------------------------------------------

# A "runs" / "runs_extraction" row (Run in lib/types.ts). transcript is optional in the
# type, but every row Lane 2 writes includes it; we require the 7 non-transcript keys and
# treat transcript as optional-but-expected.
RUN_REQUIRED_KEYS = {
    "site_id", "trial_number", "success", "step_count",
    "duration_seconds", "failure_mode", "run_at",
}
RUN_OPTIONAL_KEYS = {"transcript"}

# A "lighthouse" row (LighthouseResult in lib/types.ts). screenshot_path is optional.
LIGHTHOUSE_REQUIRED_KEYS = {
    "site_id", "lh_total", "lh_accessibility_tree",
    "lh_layout_stability", "lh_llms_txt", "lh_webmcp", "run_at",
}
LIGHTHOUSE_OPTIONAL_KEYS = {"screenshot_path"}


# ---------------------------------------------------------------------------
# Firebase init (lazy — DRY preview needs no creds)
# ---------------------------------------------------------------------------

_db = None


def get_db():
    """Lazily init Firestore exactly like lane2-agent.py get_db(): prefer a raw
    FIREBASE_SERVICE_ACCOUNT_JSON, else ApplicationDefault (GOOGLE_APPLICATION_CREDENTIALS)."""
    global _db
    if _db is not None:
        return _db

    import firebase_admin
    from firebase_admin import credentials, firestore

    if not firebase_admin._apps:
        service_account_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
        if service_account_json:
            cred = credentials.Certificate(json.loads(service_account_json))
        else:
            cred = credentials.ApplicationDefault()
        firebase_admin.initialize_app(cred)

    _db = firestore.client()
    return _db


# ---------------------------------------------------------------------------
# Validation helpers
# ---------------------------------------------------------------------------

def _missing_keys(row: dict, required: set):
    """Return the sorted list of required keys absent from row (empty == valid)."""
    return sorted(required - row.keys())


def validate_run(row):
    """(ok, reason). A run row must be a dict with every RUN_REQUIRED_KEY present and a
    non-empty site_id + an int-coercible trial_number (both feed the doc id)."""
    if not isinstance(row, dict):
        return False, f"not a JSON object (got {type(row).__name__})"
    missing = _missing_keys(row, RUN_REQUIRED_KEYS)
    if missing:
        return False, f"missing keys: {missing}"
    if not str(row.get("site_id") or "").strip():
        return False, "empty site_id"
    # trial_number is part of the doc id; it must be present and integer-like.
    try:
        int(row["trial_number"])
    except (TypeError, ValueError):
        return False, f"non-integer trial_number: {row.get('trial_number')!r}"
    return True, ""


def validate_lighthouse(row):
    """(ok, reason). A lighthouse row must be a dict with every LIGHTHOUSE_REQUIRED_KEY
    present and a non-empty site_id (which is also the doc id)."""
    if not isinstance(row, dict):
        return False, f"not a JSON object (got {type(row).__name__})"
    missing = _missing_keys(row, LIGHTHOUSE_REQUIRED_KEYS)
    if missing:
        return False, f"missing keys: {missing}"
    if not str(row.get("site_id") or "").strip():
        return False, "empty site_id"
    return True, ""


def run_doc_id(row):
    return f"{row['site_id']}_t{int(row['trial_number'])}"


def lighthouse_doc_id(row):
    return str(row["site_id"])


# ---------------------------------------------------------------------------
# Loaders — return (valid_rows[(doc_id, row)], skipped[(where, reason)])
# ---------------------------------------------------------------------------

def load_jsonl_runs(path: Path):
    """Load a JSONL runs file. Each non-blank line must be a valid Run row. Malformed
    lines (bad JSON or failed validation) are skipped + reported, never fatal."""
    valid, skipped = [], []
    if not path.exists():
        return valid, skipped, False
    for lineno, raw in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        raw = raw.strip()
        if not raw:
            continue
        try:
            row = json.loads(raw)
        except Exception as e:
            skipped.append((f"{path.name}:{lineno}", f"invalid JSON: {e}"))
            continue
        ok, reason = validate_run(row)
        if not ok:
            skipped.append((f"{path.name}:{lineno}", reason))
            continue
        valid.append((run_doc_id(row), row))
    return valid, skipped, True


def load_lighthouse(path: Path):
    """Load the lighthouse JSON array. Each element must be a valid LighthouseResult.
    A malformed element is skipped + reported; a non-array top level is fatal-for-this-sink
    only (reported, returns empty), never crashes the other sinks."""
    valid, skipped = [], []
    if not path.exists():
        return valid, skipped, False
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        skipped.append((path.name, f"invalid JSON: {e}"))
        return valid, skipped, True
    if not isinstance(data, list):
        skipped.append((path.name, f"expected a JSON array, got {type(data).__name__}"))
        return valid, skipped, True
    for idx, row in enumerate(data):
        ok, reason = validate_lighthouse(row)
        if not ok:
            skipped.append((f"{path.name}[{idx}]", reason))
            continue
        valid.append((lighthouse_doc_id(row), row))
    return valid, skipped, True


# ---------------------------------------------------------------------------
# Push one collection
# ---------------------------------------------------------------------------

def push_collection(collection, items, skipped, file_found, *, write, sample=5):
    """Report (and, with write=True, push) one collection. `items` is a list of
    (doc_id, row). Returns the number of docs written (0 in dry mode)."""
    print(f"\n=== {collection} ===")
    if not file_found:
        print("  source file NOT FOUND — nothing to push for this collection.")
    print(f"  valid docs:   {len(items)}")
    print(f"  skipped rows: {len(skipped)}")

    # Surface a few sample doc ids so a human can eyeball the id scheme + coverage.
    if items:
        ids = [doc_id for doc_id, _ in items[:sample]]
        more = f" … (+{len(items) - sample} more)" if len(items) > sample else ""
        print(f"  sample ids:   {', '.join(ids)}{more}")

    # A doc-id collision within a collection means .set() would silently overwrite one row
    # with another (different data, same id). Worth flagging loudly even though .set() itself
    # is "safe" — it indicates a data problem, not a re-run.
    seen, dupes = set(), set()
    for doc_id, _ in items:
        if doc_id in seen:
            dupes.add(doc_id)
        seen.add(doc_id)
    if dupes:
        print(f"  ⚠ duplicate doc ids within this batch ({len(dupes)}): "
              f"{', '.join(sorted(dupes)[:10])}")

    for where, reason in skipped:
        print(f"  ⚠ skipped {where}: {reason}")

    if not write:
        print(f"  [DRY] would write {len(items)} doc(s) to '{collection}' (no write performed).")
        return 0

    if not items:
        print(f"  nothing to write to '{collection}'.")
        return 0

    db = get_db()
    written = 0
    for doc_id, row in items:
        try:
            db.collection(collection).document(doc_id).set(row)
            written += 1
        except Exception as e:
            # One failed write must not abort the rest of the push.
            print(f"  ✗ FAILED {collection}/{doc_id}: {e}")
    print(f"  ✓ wrote {written}/{len(items)} doc(s) to '{collection}'.")
    return written


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="SAFE idempotent pusher: validated local Lane 2 + Lighthouse data -> Firestore. "
                    "DEFAULT is a DRY preview that writes nothing; pass --write to actually write."
    )
    parser.add_argument("--write", action="store_true",
                        help="Actually write to Firestore. Without this flag the script only "
                             "previews counts + sample doc ids and writes NOTHING.")
    parser.add_argument("--runs", default=str(REPO_ROOT / "lane2-runs.jsonl"),
                        help="Navigation runs JSONL -> collection 'runs' (default: lane2-runs.jsonl)")
    parser.add_argument("--extraction", default=str(REPO_ROOT / "lane2-runs-extraction.jsonl"),
                        help="Extraction runs JSONL -> collection 'runs_extraction' "
                             "(default: lane2-runs-extraction.jsonl)")
    parser.add_argument("--lighthouse", default=str(REPO_ROOT / "data" / "lighthouse-results.json"),
                        help="Lighthouse results JSON array -> collection 'lighthouse' "
                             "(default: data/lighthouse-results.json)")
    args = parser.parse_args()

    load_env()

    mode = "WRITE (live Firestore)" if args.write else "DRY preview (no writes)"
    print("push-to-firestore.py")
    print(f"Mode: {mode}")
    print("NOTE: this script never touches the 'sites' collection (use `npm run seed:sites`).")

    # Load all three sources up front so the preview shows the full picture before any write.
    runs_items, runs_skipped, runs_found = load_jsonl_runs(Path(args.runs))
    extr_items, extr_skipped, extr_found = load_jsonl_runs(Path(args.extraction))
    lh_items, lh_skipped, lh_found = load_lighthouse(Path(args.lighthouse))

    print(f"\nSources:")
    print(f"  runs:            {args.runs}")
    print(f"  runs_extraction: {args.extraction}")
    print(f"  lighthouse:      {args.lighthouse}")

    w_runs = push_collection("runs", runs_items, runs_skipped, runs_found, write=args.write)
    w_extr = push_collection("runs_extraction", extr_items, extr_skipped, extr_found, write=args.write)
    w_lh = push_collection("lighthouse", lh_items, lh_skipped, lh_found, write=args.write)

    total_valid = len(runs_items) + len(extr_items) + len(lh_items)
    total_skipped = len(runs_skipped) + len(extr_skipped) + len(lh_skipped)
    total_written = w_runs + w_extr + w_lh

    print("\n" + "=" * 60)
    print("SUMMARY")
    print(f"  runs:            valid={len(runs_items):>3}  skipped={len(runs_skipped)}  written={w_runs}")
    print(f"  runs_extraction: valid={len(extr_items):>3}  skipped={len(extr_skipped)}  written={w_extr}")
    print(f"  lighthouse:      valid={len(lh_items):>3}  skipped={len(lh_skipped)}  written={w_lh}")
    print(f"  TOTAL:           valid={total_valid:>3}  skipped={total_skipped}  written={total_written}")
    if args.write:
        print(f"\n✓ Push complete — {total_written} doc(s) written across 3 collection(s).")
    else:
        print("\n[DRY] No writes performed. Re-run with --write to push to Firestore.")
        print("      (The 'sites' collection is still seeded separately: `npm run seed:sites`.)")

    # Exit non-zero only on a hard failure: --write requested but nothing was written even
    # though valid docs existed. A clean DRY preview and a fully-skipped-but-empty source
    # both exit 0.
    if args.write and total_valid > 0 and total_written == 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
