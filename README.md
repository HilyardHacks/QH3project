# AgentRank

**Is the web ready for agents?**  
A behavioral leaderboard ranking real websites by how often a Gemini agent can complete a real task on them — correlated against Google's Lighthouse Agentic Browsing score.

> QuackHacks 3 · University of Oregon · May 2026

---

## The one-liner

Google shipped the agentic-browsing checklist. We ran the experiment that tests whether it actually predicts anything, using Google's own model as the agent.

---

## Quick start (local dev, fake data)

```bash
cp .env.local.example .env.local
# .env.local already has USE_FAKE_DATA=true — no Firebase needed yet

npm install
npm run dev
# → http://localhost:3000
```

The app runs fully against the 3 pre-seeded fake rows. Lane 3 can build and polish while Lanes 1 & 2 run.

---

## Architecture — three lanes

| Lane | Owner | Deliverable | Status |
|------|-------|------------|--------|
| **1** | TBD | Lighthouse runner → Firestore `lighthouse` collection | Ready to run |
| **2** | TBD | Gemini agent harness → Firestore `runs` collection | Ready to run |
| **3** | TBD | Next.js leaderboard + correlation chart | Working against fake data |

---

## Hour 1 checklist (do this first, as a team)

- [ ] Create Firebase project → copy config into `.env.local`
- [ ] Verify the three fake rows in `lib/fake-data.ts` match your mental model
- [ ] Each lane owner reads the schema in `lib/types.ts` and confirms it
- [ ] Agree the `failure_mode` enum values (they're already in `lib/types.ts`)
- [ ] Run `npm run dev`, confirm the leaderboard loads with fake data

---

## Lane 1 — Lighthouse static scorer

**Setup:**
```bash
npm install  # includes lighthouse + chrome-launcher
```

**Run all cohort sites:**
```bash
FIREBASE_SERVICE_ACCOUNT_JSON='...' npm run lane1
```

**Run specific sites (for testing):**
```bash
FIREBASE_SERVICE_ACCOUNT_JSON='...' npx tsx scripts/lane1-lighthouse.ts stripe vercel
```

Output: one `lighthouse/{site_id}` document per site in Firestore.

**Friday-night goal:** run all ~30 cohort candidate sites, inspect the `lh_total` distribution. If it clusters, swap in worse sites until there's a real low end.

---

## Lane 2 — Gemini agent harness

**Setup:**
```bash
pip install -r scripts/requirements.txt
playwright install chromium
```

**Run all cohort sites, 5 trials each:**
```bash
GEMINI_API_KEY=... FIREBASE_SERVICE_ACCOUNT_JSON='...' python scripts/lane2-agent.py
```

**Run specific sites, 3 trials:**
```bash
python scripts/lane2-agent.py --sites stripe irs_gov --trials 3
```

**Saturday 6pm decision gate:** if the full agent loop is unreliable, switch to scripted-navigation fallback:
```bash
python scripts/lane2-agent.py --scripted-only --sites stripe irs_gov
```
This navigates directly to the pre-registered URL and uses Gemini only for extraction — much more reliable.

Output: one `runs/{site_id}_t{trial_number}` document per trial in Firestore.

---

## Lane 3 — Frontend

Three pages, all server-rendered, all driven by the same `lib/queries.ts` interface:

| Route | What it shows |
|-------|--------------|
| `/` | Ranked leaderboard, success bar, LH score, top failure mode |
| `/site/:slug` | Sub-audit breakdown, trial log, pre-registered answer key |
| `/correlation` | Scatter chart (Lighthouse vs. success rate), Pearson r, sub-audit ranking |

**Switching to real data:** in `.env.local`, set `USE_FAKE_DATA=false` and add `FIREBASE_SERVICE_ACCOUNT_JSON`.

---

## Cohort management (`scripts/cohort.json`)

30 sites, tagged with `expected_lh` (high/medium/low) and `manual_pass` (done/TBD).

**Before running Lanes 1 & 2:**
1. For each `manual_pass: "TBD"` site, visit the URL manually
2. Confirm the task is answerable and the `answer_substring` is correct
3. Flag any sites that block you immediately (anti-bot, login wall) — swap them out if ≥5 are blocked

---

## Deploy

```bash
# Build Next.js
npm run build

# Deploy to Firebase Hosting (requires firebase CLI + project configured)
npx firebase deploy --only hosting,firestore:rules

# Or: use Cloud Run for a full SSR deployment
gcloud run deploy agentrank --source . --region us-central1
```

---

## Data schema

```
sites/{site_id}
  site_id, name, url, answer_substring, answer_note

lighthouse/{site_id}
  site_id, lh_total, lh_accessibility_tree, lh_layout_stability,
  lh_llms_txt, lh_webmcp, run_at

runs/{site_id}_t{trial_number}
  site_id, trial_number, success, step_count, duration_seconds,
  failure_mode, transcript, run_at
```

Failure modes: `success` · `blocked` · `timeout` · `wrong_extraction` · `navigation_stuck` · `error`

---

## Cut order (drop from the top if falling behind)

1. Rendered transcripts in the UI
2. Rich per-site detail pages (the minimal version is already there)
3. Page screenshots in Lane 1
4. 5 trials → 3
5. 30 sites → 20

**Never cut:** the correlation chart, pre-registered string-match scoring, and Lighthouse-score spread in the cohort.
