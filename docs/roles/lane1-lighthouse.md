# Member 1 — Lighthouse Static Scorer (the x-axis)

**Branch:** `lighthouse`  ·  **Owns:** `scripts/lane1-lighthouse.ts`, the Firestore `lighthouse` collection

> **Mission:** produce a *verified* Lighthouse 13.3 "agentic-browsing" score for every cohort site, and **prove early that `lh_total` actually spreads** across the cohort — so the headline scatter has a real x-axis.

You're the lightest, most deterministic lane (no model calls), so you finish your core fast and then help with the cohort pass. But you own the single most existential gate in the project: **if the Lighthouse scores all cluster, the scatter is flat and there is no result.**

## Deliverables

- [ ] **1. Verify the real category + 4 audit IDs** _(effort M, never cut)_
  - Run `npx lighthouse <url> --output=json` against 2–3 live sites (lighthouse 13.3.0 is already installed).
  - Inspect `raw.categories` keys and `raw.audits` keys. Replace the **guessed** ids in `lane1-lighthouse.ts` (`agentic-browsing` + the 4 `auditIds`) with the real ones.
  - **Done when:** a real run fires neither the "⚠ Unknown audit ids" warning nor the "No agentic-browsing category" throw. Save a sample raw JSON for reference.

- [ ] **2. X-axis spread de-risk — NEVER-CUT GATE** _(effort M, never cut)_
  - Run **all 30** cohort sites; dump `lh_total` to a sortable table (CSV/JSON).
  - Report min/max/spread. Spread is acceptable if values are **not** bunched in a narrow band — ideally a ~30+ point high-to-low range, with modern SaaS (Stripe/Vercel) above legacy .gov (IRS/DMV/SSA).
  - **Done when:** the distribution is checked and shared with the team **Friday night**. If clustered → raise the alarm and propose cohort swaps *immediately* (don't wait for agent runs).

- [ ] **3. Local-JSON fallback (decouple from Firebase)** _(effort S, never cut)_
  - Make the script persist results to `data/lighthouse-results.json` when Firebase creds are absent.
  - **Done when:** a full 30-site run completes and writes a local artifact with **no** `FIREBASE_SERVICE_ACCOUNT_JSON` set. (This is what lets you do deliverable #2 before the Firebase project exists.)

- [ ] **4. Backfill to Firestore** _(effort S, never cut)_
  - Once the Firebase project exists, `npm run lane1` writes one `lighthouse/{site_id}` doc per scored site.
  - **Done when:** a few docs read back correctly and `lib/queries.ts` surfaces non-null `lh_total`. **Failed sites get NO doc — never a placeholder/fabricated score.**

- [ ] **5. Harden for slow / access-failure sites** _(effort M, cut if behind)_
  - One bad site must not abort the batch. Confirm/raise the 120s timeout for slow .gov; log Lighthouse `runtimeError` (NO_FCP, consent wall) distinctly; keep temp paths unique per run (already pid-suffixed).
  - **Done when:** a full run finishes all 30, and risky sites (nytimes paywall, gov) produce a real score or a clearly-labeled non-fatal failure.

- [ ] **6. Document the locked rubric** _(effort S, cut if behind)_
  - In the script header / README: the real category id, the 4 real audit ids, lighthouse version (13.3.0), run date, and that `lh_total = round(category.score*100)` was pinned **before** correlation was computed. Remove the "UNVERIFIED GUESS" comments.

## Watch out

- **Clustering is existential and never-cut.** If `lh_total` comes back bunched (e.g. everything 40–55), the scatter is dead flat regardless of Lane 2. Check Friday night, escalate fast.
- The category id and 4 audit ids in the code are **unverified guesses**. A typo'd audit id silently returns `0` (looks like a real audit failure); a wrong category id throws. Confirm against real JSON *before* the cohort run.
- Low-end **access failures** (CAPTCHA/consent on .gov, nytimes) can make Lighthouse itself error — record those distinctly so they aren't mistaken for a real low-readiness signal.
- **Do not fabricate `lh_total`.** Keep the current fail-loud behavior. Keep `lh_total` = `round(score*100)` and the 4 sub-audits as strict 0/1 — exactly matching `lib/types.ts`.

## Definition of done

Every cohort site has a verified Lighthouse 13.3 result (real category + 4 audit ids confirmed against live JSON, no guess-comments left); the cohort's `lh_total` values are **proven to spread** and that proof was shared Friday night; all results are written to the real `lighthouse` collection (no fabricated scores); and the correlation page has a real, pre-registered x-axis.

## Dependencies / blockers

- #1, #2, #3 need **nothing** (lighthouse installed locally; no Firebase needed).
- #4 needs the real **Firebase project** (Member 3, hour 0).
