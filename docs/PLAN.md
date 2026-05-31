# The Plan

The general game plan: who owns what, the order to do it in, the one decision gate, and what we protect at all costs. For current state see [STATUS.md](./STATUS.md). For your personal task list see your file in [`roles/`](./roles).

## Team map (4 members → 4 lanes)

| Member | Lane | Branch | One-line mission |
|---|---|---|---|
| **1** | 🟦 Lighthouse scorer | `lighthouse` | Verified Lighthouse score for every site, and **prove the x-axis spreads** |
| **2** | 🟩 Agent harness | `harness` | Prove the agent loop on 5 sites, then produce real `runs` for the cohort |
| **3** | 🟪 Frontend + deploy | `frontend` | Deployed real-data site whose scatter is the centerpiece |
| **4** | 🟧 Cohort + scoring | `cohort-data` | A leak-free, pre-registered answer key for all 30 sites |

**The cohort manual pass is the bottleneck** — it's non-parallelizable per site but parallel across people. Member 4 **owns** it (PREREG + consistency), but on Friday all 4 split the 25 sites ~6 each to get it done fast.

## ⬛ Hour 0 — do this first, together (Member 3 leads)

Stand up the real **Firebase project** — nothing real flows until this exists:
1. Create Firebase project `agentrank-quackhacks`, enable **Firestore** (native mode).
2. Generate a **service-account JSON** (Project settings → Service accounts).
3. Each member: `cp .env.local.example .env.local`, set `FIREBASE_SERVICE_ACCOUNT_JSON` (and `USE_FAKE_DATA=false` when testing real data).
4. Confirm `npm run dev` shows the fake leaderboard, then `npm run seed:sites` once the cohort is locked.

> Lane 1 can de-risk **without** Firebase via a local-JSON fallback — don't let the missing project stall the never-cut spread check.

## Recommended timeline

> Phase labels map to the classic Fri/Sat/Sun hackathon arc — compress if your clock differs.

**Phase 0 — Together (first hour)**
Firebase project + service-account → everyone's `.env.local`. Confirm fake leaderboard loads. (Contract is already frozen, build already green.)

**Phase 1 — Friday evening (parallel)**
- **M1:** verify Lighthouse IDs → run all 30 → **check the score spreads** (local-JSON, no Firebase needed). Escalate immediately if it clusters.
- **All:** cohort pass — ~6 sites each; M4 consolidates into `PREREG.md`.
- **M3:** add `firestore.rules`, guard partial-data states, build the Spearman + CI stat.

**Phase 2 — Friday night**
- **M2:** prove the agent loop end-to-end on 5 test sites. **Do not scale until it's clean.**

**Phase 3 — Saturday**
- Seed real `sites` + `lighthouse` to Firestore.
- **★ Saturday 6pm DECISION GATE** (see below).
- Full cohort run (M2) → wire frontend to real data (M3).
- Pull cut levers (5→3 trials, 30→20 sites) the moment it's tight.

**Phase 4 — Sunday AM**
- Rehearse the surprising-case study, finalize the sub-audit finding line, deploy to `.tech`, lock the 2-minute pitch.
- Transcripts / screenshots only if everything above is locked.

## ★ The one decision gate

**Saturday 6:00pm — full agent vs. fallback.** Owner: Member 2.
If the full Gemini agent isn't reliably completing the task on the 5 test sites (stated bar: e.g. ≥4/5 terminate cleanly + the 2 known-good sites pass), **switch the whole cohort to `--scripted-only`** (scripted navigation + Gemini extraction — already implemented). Label the results as extraction, not autonomous navigation. Decide on time; don't negotiate with a flaky agent past Saturday night.

## Never cut · Cut order

**NEVER CUT:**
1. The correlation chart (it's the thesis).
2. Pre-registered substring scoring (it's the credibility).
3. Lighthouse score spread in the cohort (it's whether there's a result at all).

**CUT ORDER (drop from the top as you fall behind):**
1. Rendered agent transcripts in the UI
2. Rich per-site detail pages
3. Page screenshots in Lane 1
4. 5 trials → 3
5. 30 sites → 20

## Definition of done (by Sunday)

- Leaderboard live at a `.tech` domain, ranked by real behavioral success.
- Minimal per-site detail pages (Lighthouse sub-scores + success rate + dominant failure mode).
- Correlation page: real scatter + Spearman ρ + bootstrap CI + explicit `n` + the "which sub-audit predicts success" line.
- A rehearsed 2-minute demo: leaderboard → a surprising entry → the correlation chart.
- Scoring is pre-registered and reproducible, and we can say so in one sentence.
