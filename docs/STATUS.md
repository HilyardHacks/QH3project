# Where We Are Now

_Last updated: 2026-05-30_

**TL;DR:** the scaffold is consolidated on `main`, pushed, and the production build is
**green**. Since the original scaffold, real infrastructure has landed: the **Firebase
project `agentrank-quackhacks` exists and Firestore is verified writable**, the **Gemini
harness is hardened, frozen, and passed its 5-site gate** (plus crash-safe `--resume`),
a **pre-registered scorer with a 275/275 test suite** is built (still uncommitted), and
**Member 4 has delivered the 28-site cohort** to `scripts/cohort-source/`. What's still
genuinely undone is the experiment itself: **real Lighthouse has NOT been run** (x-axis
spread unverified; audit-ids being corrected this session), the **full cohort run is
pending**, and **deploy + the pre-registration commit are pending**.

## ✅ Done

- **Full scaffold for all lanes** built by Jeff, merged to `main`, pushed.
- **Data contract frozen** in `lib/types.ts` (`sites` / `lighthouse` / `runs` + the 6-value `failure_mode` enum), consistent snake_case across the frontend, the TS Lane 1 script, and the Python Lane 2 script.
- **Frontend works on fake data** — all 3 routes (`/`, `/site/[slug]`, `/correlation`) build and prerender.
- **Build verified green:** `tsc --noEmit` clean + `next build` passes.
- **Audit fixes applied** (commit `b207951`):
  - Lane 1 no longer **fabricates** `lh_total` — it fails loudly if the `agentic-browsing` category is missing.
  - Lane 2 no longer **leaks the answer** into the prompt — it uses a neutral `task_hint`, not the answer-bearing `answer_note`.
  - `seed-sites.ts` added — seeds the `sites` collection from the real cohort (previously only 3 of 30 sites were seeded).
  - `failure_mode` mislabel fixed (`navigation_stuck` now emitted); `top_failure_mode` no longer counts `success`.
  - SSR-correct `firebase.json` (frameworks backend) + `next.config.mjs` (Next 14 can't read a `.ts` config).
- **Firebase project exists + Firestore verified writable** — the real project
  `agentrank-quackhacks` is provisioned; Lane 2 ran a write/read/delete round-trip against
  the live `runs` collection with `service-account.json` + `GOOGLE_APPLICATION_CREDENTIALS`.
  (Gap #1 from the old status is resolved.)
- **Lane 2 harness hardened + frozen** (`2edc2f4`) and **passed its 5-site pre-scale gate**
  — raw-bytes image, JSON mode + retry, de-masked errors, empty-substring guard,
  3-identical-actions loop-breaker, `--dry-run`/`--out`, UTF-8 stdout, browser try/finally,
  per-action timeouts. Model / prompt / `MAX_STEPS` / `TIMEOUT` / viewport are FROZEN.
- **`--resume`** (`7872c12`) — crash-safe re-runs (skip-if-exists on the deterministic doc id).
- **28-site cohort delivered by Member 4** → `scripts/cohort-source/`
  (`agentrank_sites.csv` + `agentrank_cohort.md` + `agentrank_scoring_rules.md`):
  pre-registered discriminating answers, off-diagonal picks (Apple / Craigslist),
  2 deliberate blockers. This is now the **canonical cohort** (the root
  `cohort_worklist.md` is SUPERSEDED).
- **Pre-registered scorer built — `scripts/scorer.py` + `scripts/test_scorer.py`
  (275/275 passing) — but UNCOMMITTED** (untracked in the working tree). Pure stdlib,
  never raises, implements `agentrank_scoring_rules.md` (any-of `" | "`, currency strip,
  numeric word-boundary via `Decimal` value, Zalando comma-as-decimal, percent / time /
  phrase / phone / literal classifiers). Wired into `lane2-agent.py` (also uncommitted);
  adversarially reviewed. Must be committed before the full run.

## ❌ Not done yet (the real work)

| # | Gap | Owner | Blocks |
|---|---|---|---|
| 1 | **Real Lighthouse 13.3 has NOT been run** — the category + 4 audit IDs in Lane 1 are unverified guesses; **x-axis spread is unverified**. (Audit-ids are being corrected this session.) | Member 1 | the x-axis, the headline correlation |
| 2 | **Full cohort run pending** — the frozen Gemini agent has not been run across the 28-site cohort; the y-axis (`success_rate` per site) does not exist yet | Member 2 | the y-axis |
| 3 | **Scorer + harness wiring still uncommitted** — `scripts/scorer.py`, `scripts/test_scorer.py`, and the 3-line `lane2-agent.py` wiring are in the working tree only | Member 2 | reproducibility, the full run |
| 4 | **PREREG.md not committed** — a DRAFT exists at repo root; it must be committed (Member 4 ratifies wording) **before the first `runs` row is written** — that git ordering is the falsifiability guarantee | Member 4 (ratify) / Member 2 | a defensible headline |
| 5 | **Deep-link-vs-homepage decision pending** — whether each site starts at its homepage (real navigation) or a deep link (extraction only) is not finalized in `cohort.json`; affects what the y-axis means | Member 2 / Member 4 | y-axis validity |
| 6 | **Deploy untested**; **correlation never computed on real data** | Member 3 | the demo |

## Verification state

- **Firestore round-trip** against `agentrank-quackhacks` — write/read/delete on `runs` OK.
- **Harness 5-site gate** — passed (loop terminates cleanly on all 5; commit `2edc2f4`).
- **Scorer** — `python scripts/test_scorer.py` → **275/275 pass** (uncommitted).
- `npm install` → 760 packages, `lighthouse@13.3.0` confirmed on the registry.
- `npx tsc --noEmit` → exit 0.
- `npm run build` → green; routes: `/` (static), `/correlation` (static), `/site/[slug]` (dynamic SSR).
- **NOT yet verified:** a real Lighthouse 13.3 run / x-axis spread; the full 28×5 cohort run.

## Branches

| Branch | Commit | Note |
|---|---|---|
| `main` | `b207951` | consolidated base + fixes (source of truth) |
| `harness` | ahead of `b207951` | Lane 2: frozen harness (`2edc2f4`) + `--resume` (`7872c12`) + cohort source + docs; scorer changes still uncommitted in the working tree |
| `lighthouse` / `frontend` / `cohort-data` | `b207951` | other per-member lanes, cut off the fixed `main` |
| `jeff-mvp` | `218a661` | original scaffold, preserved |

> Note on pushing in PowerShell: a successful `git push` prints progress to **stderr**, which PowerShell shows in red as a "RemoteException." That is **not** a failure — confirm with `git log origin/<branch>..<branch>` being empty.
