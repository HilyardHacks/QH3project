"""
reconcile-firestore.py — delete ORPHAN docs so live Firestore matches the canonical cohort.

push-to-firestore.py and seed-sites.ts only .set() (overwrite) — they never DELETE. So a
doc that existed from an older/larger cohort (e.g. the orphan 'zalando' left in `sites` by
the old 28-site seed, or a stale deep-link `lighthouse` doc for a site we now omit) lingers
forever and pollutes getLeaderboard()/getCorrelationPoints(). This script reconciles each
collection against a canonical id set derived from the SAME local artifacts the pusher uses,
and deletes anything not in that set.

Canonical id sets (doc id scheme matches the pusher exactly):
  sites            -> {site_id} from scripts/cohort.json
  lighthouse       -> {site_id} from data/lighthouse-results.json   (== what was pushed)
  runs             -> {f"{site_id}_t{trial_number}"} from lane2-runs.jsonl
  runs_extraction  -> {f"{site_id}_t{trial_number}"} from lane2-runs-extraction.jsonl

SAFETY:
  python scripts/reconcile-firestore.py            # DRY: connect + LIST orphans, delete NOTHING
  python scripts/reconcile-firestore.py --write     # actually DELETE the listed orphans

Both modes read Firestore (a read is non-destructive). A collection whose canonical set comes
out EMPTY (e.g. a missing local file) is SKIPPED with a warning — never wiped. Run this AFTER
push-to-firestore.py --write + npm run seed:sites (push the canonical docs first, then prune).

Creds mirror push-to-firestore.py: FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS
(from .env.local).
"""

import argparse
import json
import os
import sys
from pathlib import Path

for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except Exception:
        pass

REPO_ROOT = Path(__file__).resolve().parent.parent


def load_env(path=None):
    p = Path(path) if path else (REPO_ROOT / ".env.local")
    if not p.exists():
        return
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())


_db = None


def get_db():
    global _db
    if _db is not None:
        return _db
    import firebase_admin
    from firebase_admin import credentials, firestore
    if not firebase_admin._apps:
        sa = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
        cred = credentials.Certificate(json.loads(sa)) if sa else credentials.ApplicationDefault()
        firebase_admin.initialize_app(cred)
    _db = firestore.client()
    return _db


# ---------------------------------------------------------------------------
# Canonical id sets from the local artifacts
# ---------------------------------------------------------------------------

def cohort_site_ids():
    data = json.loads((REPO_ROOT / "scripts" / "cohort.json").read_text(encoding="utf-8"))
    return {str(r["site_id"]) for r in data}


def lighthouse_site_ids():
    p = REPO_ROOT / "data" / "lighthouse-results.json"
    if not p.exists():
        return set()
    data = json.loads(p.read_text(encoding="utf-8"))
    return {str(r["site_id"]) for r in data if isinstance(r, dict) and r.get("site_id")}


def run_doc_ids(filename):
    p = REPO_ROOT / filename
    if not p.exists():
        return set()
    ids = set()
    for line in p.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            r = json.loads(line)
            ids.add(f"{r['site_id']}_t{int(r['trial_number'])}")
        except Exception:
            continue
    return ids


# ---------------------------------------------------------------------------
# Reconcile one collection
# ---------------------------------------------------------------------------

def reconcile(collection, canonical_ids, *, write):
    print(f"\n=== {collection} ===")
    if not canonical_ids:
        print(f"  ⚠ canonical set is EMPTY (missing local source?) — SKIPPING (won't risk wiping '{collection}').")
        return 0
    db = get_db()
    existing = [d.id for d in db.collection(collection).list_documents()]
    orphans = sorted(set(existing) - set(canonical_ids))
    print(f"  canonical docs: {len(canonical_ids)}")
    print(f"  in Firestore:   {len(existing)}")
    print(f"  orphans:        {len(orphans)}")
    if orphans:
        show = orphans[:20]
        more = f" … (+{len(orphans) - 20} more)" if len(orphans) > 20 else ""
        print(f"  -> {', '.join(show)}{more}")
    if not orphans:
        print("  ✓ no orphans — collection already matches canonical set.")
        return 0
    if not write:
        print(f"  [DRY] would DELETE {len(orphans)} orphan doc(s) from '{collection}'.")
        return 0
    deleted = 0
    for doc_id in orphans:
        try:
            db.collection(collection).document(doc_id).delete()
            deleted += 1
        except Exception as e:
            print(f"  ✗ FAILED delete {collection}/{doc_id}: {e}")
    print(f"  ✓ deleted {deleted}/{len(orphans)} orphan doc(s) from '{collection}'.")
    return deleted


def main():
    ap = argparse.ArgumentParser(description="Delete orphan Firestore docs not in the canonical cohort. DRY by default.")
    ap.add_argument("--write", action="store_true", help="Actually delete orphans (default: preview only).")
    args = ap.parse_args()

    load_env()
    print("reconcile-firestore.py")
    print(f"Mode: {'WRITE (deletes orphans)' if args.write else 'DRY preview (no deletes)'}")

    targets = [
        ("sites", cohort_site_ids()),
        ("lighthouse", lighthouse_site_ids()),
        ("runs", run_doc_ids("lane2-runs.jsonl")),
        ("runs_extraction", run_doc_ids("lane2-runs-extraction.jsonl")),
    ]
    total = sum(reconcile(c, ids, write=args.write) for c, ids in targets)

    print("\n" + "=" * 50)
    if args.write:
        print(f"✓ Reconcile complete — {total} orphan doc(s) deleted.")
    else:
        print(f"[DRY] {total} deletions performed (preview only). Re-run with --write to delete the listed orphans.")


if __name__ == "__main__":
    main()
