# Lane 2 (Harness) — Status & Next Steps

_Updated 2026-06-01 · Branch: `harness`_

Human-readable handoff. Session memory also persists, so a fresh chat picks up with full
context — say **"continue Lane 2"**. **Pick-up instructions for the next chat are at the bottom.**

## Where we are (big picture)

The experiment is **end-to-end on real data, and the data is now fully refreshed + aligned in
live Firestore.** We have:
- a **27-site cohort** (Member 4's homepages + answer keys; zalando dropped),
- a frozen **measure-both harness** (homepage navigation → `runs`; deep-link extraction → `runs_extraction`),
- a pre-registered **scorer** (275/275),
- **real homepage-aligned Lighthouse x-axis** + **real agent y-axis** data,
- a **frontend that builds green reading real Firestore data** (verified `data mode: REAL`).

**Headline (homepage Lighthouse vs navigation success, n=27): Pearson r = −0.14, Spearman ρ = −0.11,
95% CI [−0.48, 0.29].** i.e. **Google's Agentic Browsing rubric has NO detectable relationship with
whether a real agent completes the task** — a cleaner, stronger version of the contrarian thesis than
the earlier ρ≈0.25 (which was computed on the *mismatched deep-link* x-axis and is now superseded).
Caveat we report honestly: the y-axis is near-binary (14 sites 0/5, 12 sites 5/5, powells 4/5), so ρ is
tie-dominated and unstable at this n — present it as a **null result with the CI, n, and the tie caveat**,
not as a precise negative.

## ✅ Done + committed (on `harness`)

- **Scorer** `scripts/scorer.py` + `test_scorer.py` (275/275), pre-registered contract.
- **Cohort pipeline** `build-cohort.py` → `cohort.json` (**27 sites**; Member 4 fixes applied).
- **measure-both harness** (`--mode navigation|extraction|both`); **frozen** at `MAX_STEPS=20 / TIMEOUT=120`.
- **Lane 1** audit-IDs corrected + Windows EPERM salvage + offline JSON fallback + **`--homepage` flag**.
- **Lane 3** Spearman ρ + bootstrap CI + visible n; silent-fake-data gate fixed; partial-data guards.
- **`push-to-firestore.py`** — idempotent `--write` pusher (runs / runs_extraction / lighthouse).
- **`PREREG.md`** (draft, pending Member 4 ratify), `docs/member4-cohort-fixes.md` handoff.

## ✅ Data refresh — DONE & VERIFIED (2026-06-01)

The full homepage-aligned refresh ran this session. Live Firestore now exactly matches the local
source of truth: **sites=27, lighthouse=27, runs=135, runs_extraction=135.**

1. **Lighthouse re-run on the 27 homepages** (`lane1-lighthouse.ts --homepage`) → `data/lighthouse-results.json`.
   All 27 scored OK; x-axis spreads 0→100. (Deep-link scores preserved at `data/lighthouse-results.deeplink-backup.json`.)
   - **twilio fix:** the homepage run stored `lh_total=0`; an adversarial re-measure proved that was a
     *slow-load "results may be incomplete" artifact* (3× re-runs → a stable **33**, raw cat-score 0.33,
     no runtimeError, only a benign `/en-us` redirect; deep-link backup was 29). Patched to **33** (n stays 27).
2. **Clean re-push:** `push-to-firestore.py --write` (297 docs) → `seed:sites` (27) →
   **`scripts/reconcile-firestore.py --write`** deleted **19 orphan `sites` docs** (zalando + `dmv_ca`,
   `irs_gov`, `vercel`, `wikipedia`, `nytimes`, `openai`, `reddit`, `southwest`, … — junk from old seeds).
   lighthouse / runs / runs_extraction had 0 orphans (clean in-place overwrite).
3. **Headline recomputed** on the aligned set (see big-picture box). Verified two ways: the frontend's
   own `lib/queries` functions (`scripts/analyze-correlation.ts`) AND an independent from-scratch
   reviewer cross-checked against `scipy` — identical to 4 decimals.
4. **Frontend verified:** `npm run build` → `✓ Compiled successfully`, `data mode: REAL`, `/correlation`
   prerendered from live Firestore.

> New uncommitted helpers this session (James's call to commit): `scripts/analyze-correlation.ts`,
> `scripts/reconcile-firestore.py` (generic orphan-pruner — DRY by default), `scripts/validate_yaxis.py`
> (reviewer's run-file validator), the twilio patch in `data/lighthouse-results.json`, and this doc.

## ⏭️ NEXT STEPS (finish line)

1. **Deploy to a public `.tech` URL** — human: `firebase login` + Blaze billing + domain; set
   `FIREBASE_SERVICE_ACCOUNT_JSON` **inline** in the hosting backend (a missing var silently serves fake data).
2. **Member 4** still owes: ratify `PREREG.md`; optionally document notion's monthly-toggle + target's anti-bot.
3. Rehearse the 2-min demo (leaderboard → a surprising entry → the correlation chart).

## Findings / caveats for the writeup

- **Off-diagonal (demo gold):**
  - High Lighthouse, **0% nav:** tx_dmv (100), ssa (100), portland (100), voodoo (100) — all genuine
    `navigation_stuck`/`timeout`. **Feature these.**
  - Low Lighthouse, **~100% nav:** bear (12), craigslist (24), innout (28), spotify (29), powells (3→80%).
- **costco** is LH 98 / 0% nav, BUT its 0% is a **transport error** (`net::ERR_HTTP2_PROTOCOL_ERROR` at
  `goto`, step 0 — the agent never ran), not a behavioral failure. Kept as a real 0% in the data, but
  **annotate it as transport-level** and don't headline it as an off-diagonal (use the four above).
- **Best single sub-audit:** `llms.txt` (Pearson r ≈ 0.51 vs nav success); a11y / layout / WebMCP ≈ 0.
- **measure-both gap:** extraction success (~0.74 mean) ≫ navigation success (~0.47 mean) — agents read
  better than they navigate. (Secondary corr LH vs extraction is also ~0: r=0.09, ρ=0.11.)
- **Genuinely hard (real failures, not bugs):** oregon_state (accordion), notion (monthly toggle),
  target/bestbuy (anti-bot, `wrong_extraction`), the 2 blockers (amazon/ticketmaster).
- **Thin n + near-binary y** → report as "no reliable relationship"; always show Spearman + CI + n.

## Resuming in a new chat

The data refresh is complete; the remaining work is **deploy** (human-gated) + demo rehearsal.
Everything is on disk: agent runs in `lane2-runs*.jsonl`, Lighthouse in `data/lighthouse-results.json`,
all pushed to live Firestore. Re-run the headline anytime with `npx tsx scripts/analyze-correlation.ts`.
