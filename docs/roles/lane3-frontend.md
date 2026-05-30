# Member 3 — Frontend, Deploy & Demo (+ Firebase setup)

**Branch:** `frontend`  ·  **Owns:** `app/**`, `components/**`, deploy, **and the shared Firebase project**

> **Mission:** turn the green-on-fake scaffold into a deployed, real-data-wired site whose correlation scatter is the thesis-proving centerpiece, survives messy partial data, and carries a rehearsed surprising-case-study moment.

You're the most complete lane already (3 pages build green). Your job is real-data wiring, statistical credibility, deploy, and the demo. You also **own the hour-0 Firebase setup** that unblocks everyone.

## ⬛ Hour 0 (you lead this — it blocks Lanes 1, 2, 3)

1. Create Firebase project `agentrank-quackhacks`, enable **Firestore** (native mode).
2. Generate a **service-account JSON** and share it securely with the team (it goes in each person's gitignored `.env.local`).
3. Verify `npm run dev` → fake leaderboard loads.

## Deliverables

- [ ] **1. Add the missing `firestore.rules`** _(effort S, never cut)_
  - `firebase.json` references it but the file doesn't exist → deploy fails. Create it: public read on `sites`/`lighthouse`/`runs`, writes locked to the seeding service account.

- [ ] **2. Wire frontend to real Firebase (`USE_FAKE` off)** _(effort M, never cut)_
  - With `FIREBASE_SERVICE_ACCOUNT_JSON` set + `USE_FAKE_DATA` unset, all 3 routes render real seeded rows (not Stripe/IRS/DMV fakes).

- [ ] **3. Graceful partial / empty data** _(effort M, never cut)_
  - Real data arrives in waves (sites → lighthouse → runs trickling in). With sites-but-no-runs: **no `NaN`/`Infinity`/crash** anywhere. The stats strip in `app/page.tsx` divides by `entries.length` — guard it. Show "pending / —" instead of fake 0%.

- [ ] **4. Spearman ρ + bootstrap CI + explicit n** _(effort M, never cut)_
  - Replace the bare Pearson `r` on `/correlation` with Spearman (robust to the clustered/binary x-axis), a bootstrap 95% CI, and a visible `n = X`. At n≈30, **never show a bare Pearson** — judges will dismiss it.

- [ ] **5. Confirm the x-axis spreads in the rendered scatter** _(effort S, never cut)_
  - The moment Lane 1 has ~8–10 real scores, eyeball the scatter + compute min/max/stdev. If clustered → escalate (shared never-cut risk).

- [ ] **6. Curate + rehearse the surprising-case moment** _(effort M, never cut)_
  - The auto-picked divergent site (`correlation/page.tsx`) must be a real high-LH/low-success (or inverse) story. Rehearse the scatter → `/site/[slug]` click-through with no dead air. Keep a manual pin override so the demo moment never breaks.

- [ ] **7. Deploy to a `.tech` domain** _(effort M, never cut)_
  - Public HTTPS SSR URL reading real Firestore. **The service-account must be set in the hosting backend env**, not just locally — a missing var silently serves fake data. Verify the live URL shows real cohort names.

- [ ] **8. Methodology/credibility footer** _(effort S, never cut)_
  - Visible note: pre-registered exact-substring scoring, the cohort `n`, and Spearman + CI — so judges can't claim cherry-picking.

- [ ] **9. Transcript view** → **10. screenshots** _(both cut-first)_
  - Render the stored `Run.transcript` as a collapsible per-trial timeline; then `screenshot_path` thumbnails. **Drop these first** if behind.

## Watch out

- **`USE_FAKE` silently flips to fake data when `FIREBASE_SERVICE_ACCOUNT_JSON` is absent** (`lib/queries.ts`). On the deployed backend, a missing env var ships fake Stripe/IRS/DMV rows **without erroring**. Explicitly verify the live `.tech` URL shows real names.
- x-axis **clustering** is the existential demo risk — verify spread the moment Lane 1 has ~8 scores.
- Surface `blocked` distinctly in the UI (it already has a badge) so access-failure sites don't read as legitimate agent failures.
- **Respect the cut order:** never sink time into transcripts/screenshots while real-data wiring, the scatter, Spearman+CI, or deploy are unfinished.

## Definition of done

A public `.tech` URL serves the SSR app reading **real** Firestore data (no fake leak), all 3 routes load remotely. `/correlation` renders real points with a confirmed-spread x-axis, Spearman ρ + bootstrap CI + explicit `n`, and the pre-registration note. The surprising-case panel points at a genuine, validated divergence and the click-through is rehearsed. Every route degrades gracefully under partial data. `firestore.rules` exists so deploy succeeds.

## Dependencies / blockers

- #1, #3, #4 (stat math) can start now against fake data.
- #2, #5, #6, #7 need the real **Firebase project** + Lane 1/2 data.
