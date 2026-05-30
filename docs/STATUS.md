# Where We Are Now

_Last updated: 2026-05-30_

**TL;DR:** the whole project is scaffolded, consolidated on `main`, pushed, and the production build is **green** — but it all runs on **3 hand-written fake rows**. No real Lighthouse score, no real agent run, and no verified cohort answer exists yet. The remaining work is the real work.

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
- **All branches pushed:** `main` + `lighthouse` / `harness` / `frontend` / `cohort-data` (all at `b207951`). `jeff-mvp` preserved at the original scaffold.

## ❌ Not done yet (the real work)

| # | Gap | Owner | Blocks |
|---|---|---|---|
| 1 | **The real Firebase project doesn't exist** — no service-account, so no real data flows | Member 3 (hour 0) | Lanes 1, 2, 3 real data |
| 2 | **Nobody has run real Lighthouse 13.3** — the category + 4 audit IDs in Lane 1 are unverified guesses | Member 1 | the x-axis |
| 3 | **Nobody has run the real Gemini agent** — the flaky-harness risk is unexercised | Member 2 | the y-axis |
| 4 | **Manual cohort pass is 5/30** — 25 sites have unverified answer keys, several too generic | Member 4 | scoring credibility, Lane 2 full run |
| 5 | **Deploy untested**; **correlation never computed on real data** | Member 3 | the demo |

## Verification state

- `npm install` → 760 packages, `lighthouse@13.3.0` confirmed on the registry.
- `npx tsc --noEmit` → exit 0.
- `npm run build` → green; routes: `/` (static), `/correlation` (static), `/site/[slug]` (dynamic SSR).

## Branches

| Branch | Commit | Note |
|---|---|---|
| `main` | `b207951` | consolidated base + fixes (source of truth) |
| `lighthouse` / `harness` / `frontend` / `cohort-data` | `b207951` | per-member lanes, cut off the fixed `main` |
| `jeff-mvp` | `218a661` | original scaffold, preserved |

> Note on pushing in PowerShell: a successful `git push` prints progress to **stderr**, which PowerShell shows in red as a "RemoteException." That is **not** a failure — confirm with `git log origin/<branch>..<branch>` being empty.
