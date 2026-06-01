import json
import collections
from pathlib import Path

# Repo root = parent of this scripts/ dir, so the validator works from any cwd / machine.
ROOT = str(Path(__file__).resolve().parent.parent)
NAV = ROOT + r"\lane2-runs.jsonl"
EXT = ROOT + r"\lane2-runs-extraction.jsonl"
COHORT = ROOT + r"\scripts\cohort.json"

ENUM = {"success", "blocked", "timeout", "wrong_extraction", "navigation_stuck", "error"}

def load_jsonl(path):
    rows = []
    n_valid = 0
    with open(path, "r", encoding="utf-8") as f:
        for i, line in enumerate(f, 1):
            s = line.strip()
            if not s:
                continue
            try:
                obj = json.loads(s)
                rows.append(obj)
                n_valid += 1
            except Exception as e:
                print(f"INVALID JSON {path} line {i}: {e}")
    return rows, n_valid

def raw_text(path):
    with open(path, "r", encoding="utf-8") as f:
        return f.read()

# Cohort
with open(COHORT, "r", encoding="utf-8") as f:
    cohort = json.load(f)
cohort_ids = sorted({c["site_id"] for c in cohort})
print(f"cohort count: {len(cohort)}  distinct ids: {len(cohort_ids)}")
print(f"zalando in cohort? {'zalando' in cohort_ids}")

nav_rows, nav_valid = load_jsonl(NAV)
ext_rows, ext_valid = load_jsonl(EXT)
print(f"\nNAV valid lines: {nav_valid}")
print(f"EXT valid lines: {ext_valid}")

def analyze(rows, label):
    print(f"\n===== {label} =====")
    sites = collections.defaultdict(list)
    enum_violations = []
    success_type_violations = []
    docids = collections.Counter()
    dup_docids = []
    for r in rows:
        sid = r.get("site_id")
        tn = r.get("trial_number")
        sites[sid].append(tn)
        fm = r.get("failure_mode")
        if fm not in ENUM:
            enum_violations.append(f"{sid}_t{tn}: {fm}")
        if not isinstance(r.get("success"), bool):
            success_type_violations.append(f"{sid}_t{tn}: {type(r.get('success')).__name__}={r.get('success')}")
        did = f"{sid}_t{tn}"
        docids[did] += 1
    for did, c in docids.items():
        if c > 1:
            dup_docids.append(f"{did} x{c}")
    distinct = sorted(sites.keys())
    print(f"distinct site_ids: {len(distinct)}")
    trial_counts = {s: len(t) for s, t in sites.items()}
    bad_counts = {s: c for s, c in trial_counts.items() if c != 5}
    print(f"sites with != 5 trials: {bad_counts if bad_counts else 'NONE (all 5)'}")
    # trial numbering scheme
    all_tns = sorted(set(tn for ts in sites.values() for tn in ts))
    print(f"trial_number values seen across file: {all_tns}")
    # per-site trial scheme consistency
    schemes = set(tuple(sorted(t)) for t in sites.values())
    print(f"distinct per-site trial tuples: {schemes}")
    print(f"enum violations: {enum_violations if enum_violations else 'NONE'}")
    print(f"success-not-bool: {success_type_violations if success_type_violations else 'NONE'}")
    print(f"duplicate doc ids: {dup_docids if dup_docids else 'NONE'}")
    print(f"matches cohort set EXACTLY? {set(distinct) == set(cohort_ids)}")
    extra = set(distinct) - set(cohort_ids)
    missing = set(cohort_ids) - set(distinct)
    print(f"  extra (in file, not cohort): {sorted(extra)}")
    print(f"  missing (in cohort, not file): {sorted(missing)}")
    print(f"  zalando present? {'zalando' in distinct}")
    return sites, enum_violations, dup_docids, distinct

nav_sites, nav_enum_v, nav_dup, nav_distinct = analyze(nav_rows, "NAVIGATION")
ext_sites, ext_enum_v, ext_dup, ext_distinct = analyze(ext_rows, "EXTRACTION")

# Per-site stats
def per_site_stats(rows):
    bys = collections.defaultdict(list)
    for r in rows:
        bys[r["site_id"]].append(r)
    out = {}
    for sid, rs in bys.items():
        trials = len(rs)
        succ = sum(1 for r in rs if r.get("success") is True)
        # dominant failure mode excluding 'success'
        fmc = collections.Counter(r.get("failure_mode") for r in rs if r.get("failure_mode") != "success")
        if fmc:
            top = fmc.most_common(1)[0][0]
        else:
            top = "success"
        out[sid] = {
            "trials": trials,
            "successes": succ,
            "rate": succ / trials if trials else 0.0,
            "nav_top_failure": top,
        }
    return out

nav_stats = per_site_stats(nav_rows)
ext_stats = per_site_stats(ext_rows)

print("\n===== PER-SITE (sorted by nav_success_rate DESC) =====")
per_site = []
for sid in sorted(nav_stats.keys(), key=lambda s: (-nav_stats[s]["rate"], s)):
    ns = nav_stats[sid]
    es = ext_stats.get(sid, {})
    ext_rate = es.get("rate", 0.0)
    per_site.append({
        "site_id": sid,
        "nav_success_rate": round(ns["rate"], 4),
        "nav_successes": ns["successes"],
        "nav_trials": ns["trials"],
        "nav_top_failure": ns["nav_top_failure"],
        "ext_success_rate": round(ext_rate, 4),
    })
    print(f"{sid:16s} nav={ns['rate']:.3f} ({ns['successes']}/{ns['trials']}) topfail={ns['nav_top_failure']:18s} ext={ext_rate:.3f}")

# zalando anywhere in raw text
nav_raw = raw_text(NAV)
ext_raw = raw_text(EXT)
zal = ("zalando" in nav_raw.lower()) or ("zalando" in ext_raw.lower())
print(f"\nzalando present anywhere in either file (raw text)? {zal}")
print(f"  in NAV raw: {'zalando' in nav_raw.lower()}")
print(f"  in EXT raw: {'zalando' in ext_raw.lower()}")

print(f"\ncanonical_site_ids ({len(cohort_ids)}): {cohort_ids}")

# Emit machine-readable summary
summary = {
    "nav_lines": nav_valid,
    "ext_lines": ext_valid,
    "distinct_nav": len(nav_distinct),
    "distinct_ext": len(ext_distinct),
    "ids_match_cohort": (set(nav_distinct) == set(cohort_ids)) and (set(ext_distinct) == set(cohort_ids)),
    "zalando_present_locally": zal,
    "nav_enum_violations": nav_enum_v,
    "ext_enum_violations": ext_enum_v,
    "nav_dup": nav_dup,
    "ext_dup": ext_dup,
    "canonical_site_ids": cohort_ids,
    "per_site": per_site,
}
print("\n=====JSON=====")
print(json.dumps(summary, indent=2))
