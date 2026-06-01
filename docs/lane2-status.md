# Lane 2 (Harness) — Status & Next Steps

_Updated 2026-05-31 · Branch: `harness`_

Human-readable handoff. Session memory also persists, so a fresh chat picks up with full
context — say **"continue Lane 2"**. **Pick-up instructions for the next chat are at the bottom.**

## Where we are (big picture)

The experiment is **end-to-end on real data**, locally. We have:
- a **27-site cohort** (Member 4's homepages + answer keys; zalando dropped),
- a frozen **measure-both harness** (homepage navigation → `runs`; deep-link extraction → `runs_extraction`),
- a pre-registered **scorer** (275/275),
- **real Lighthouse x-axis** + **real agent y-axis** data,
- a **frontend that builds green reading real Firestore data**.

Headline so far: **Lighthouse weakly predicts agent navigation success** (Spearman ρ ≈ 0.25–0.3, thin n) — the "the static rubric doesn't reliably predict real agent behavior" story, with strong off-diagonal cases.

## ✅ Done + committed (on `harness`)

- **Scorer** `scripts/scorer.py` + `test_scorer.py` (275/275), pre-registered contract.
- **Cohort pipeline** `build-cohort.py` → `cohort.json` (**27 sites**; Member 4 fixes applied: 5 product URLs filled, zalando dropped, oregon_state→`16014`; notion `$12` / target `12.89` confirmed unchanged).
- **measure-both harness** (`--mode navigation|extraction|both`): homepage nav → `runs`, deep-link scripted → `runs_extraction`; `homepage` auto-derived.
- **Frozen** at `MAX_STEPS=20 / TIMEOUT=120` (after the homepage re-gate).
- **Crash fix** — Gemini multi-action JSON arrays no longer abort the run (executes the first action).
- **Lane 1** audit-IDs corrected + Windows EPERM salvage + offline JSON fallback + **`--homepage` flag** (score the homepage, not the deep-link).
- **Lane 3** Spearman ρ + bootstrap CI + visible n; fixed the silent fake-data gate; partial-data guards.
- **`push-to-firestore.py`** — idempotent `--write` pusher (runs / runs_extraction / lighthouse).
- **`PREREG.md`** (draft, pending Member 4 ratify), `docs/member4-cohort-fixes.md` handoff, STATUS/FUTURE updates.
- **Real data ran + pushed earlier:** 22-site measure-both + 21-site Lighthouse → Firestore; frontend verified REAL.

## ⚠️ Current dataset state (IMPORTANT — mid-refresh)

The cohort + agent runs were just refreshed, so **Firestore is now STALE vs the local files**:
- **Local (current, correct):** `lane2-runs.jsonl` (135 nav) + `lane2-runs-extraction.jsonl` (135 ext) = **all 27 sites**, with the corrected oregon_state + the 5 new sites. *(gitignored; live on disk.)*
- **Firestore (stale):** old 22-site runs (oregon_state scored against the wrong key), no runs for the 5 new sites, an orphan `zalando` site doc.
- **Lighthouse (stale):** `data/lighthouse-results.json` has 21 sites scored on the **deep-link** pages → must be re-run on **homepages**.

## ⏭️ NEXT STEPS (in order — start here in the new chat)

1. **Re-run Lighthouse on the 27 homepages** (approved x-axis fix; also covers the 5 new sites):
   ```
   npx tsx scripts/lane1-lighthouse.ts --homepage
   ```
   → writes `data/lighthouse-results.json` (local fallback; ~20–25 min; needs Chrome — it's installed).
2. **Clean re-push to Firestore** (overwrites stale data):
   ```
   python scripts/push-to-firestore.py --write
   $env:GOOGLE_APPLICATION_CREDENTIALS="service-account.json"; npm run seed:sites
   ```
   Then **delete the orphan `zalando` doc** from `sites` (seeded with the old 28). The pusher only `.set()`-overwrites — it does NOT delete, so also remove any stale `lighthouse` docs for sites that fail the homepage re-run.
3. **Re-compute the final correlation** on the aligned set (27 sites, homepage-Lighthouse vs homepage-navigation). Update the headline number + the off-diagonal picks from the real values.
4. **Verify the live frontend** (`npm run build` → "data mode: REAL", scatter renders the refreshed data).

## Then (finish line)

- **Deploy to a public `.tech` URL** — human: `firebase login` + Blaze billing + domain; set `FIREBASE_SERVICE_ACCOUNT_JSON` **inline** in the hosting backend (a missing var silently serves fake data).
- **Member 4** still owes: ratify `PREREG.md`; optionally treat notion's monthly-toggle + target's anti-bot as documented findings.
- **Investigate `costco`** nav `error` (technical, read the transcript) if time.
- Rehearse the 2-min demo (surprising-case click-through).

## Findings / caveats for the writeup

- **Off-diagonal:** high-Lighthouse sites that FAIL navigation (ssa, tx_dmv, costco); low-Lighthouse that SUCCEED (bear). The rubric doesn't separate them.
- **measure-both gap:** extraction (~0.8) ≫ navigation (~0.5) — agents read better than they navigate.
- **Genuinely hard (real failures, not bugs):** oregon_state (accordion), notion (monthly price behind a toggle), target (anti-bot), bestbuy (anti-bot), the 2 blockers (amazon/ticketmaster).
- **Thin n** (~20 with Lighthouse) → report as "no reliable relationship"; show Spearman + CI + n.

## Resuming in a new chat

Say **"continue Lane 2 — re-run Lighthouse on the homepages and finish the data refresh."**
Everything is committed; the agent runs are on disk in `lane2-runs*.jsonl`. Start at **NEXT STEP #1**.
