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
npm install  # includes lighthouse@^13.3 (the Agentic Browsing category) + chrome-launcher
```

> Lane 1 requires **Lighthouse ≥ 13.3** — the Agentic Browsing category does not exist before it.
> Run `npx lighthouse <url> --output=json` once and confirm the real `agentic-browsing` category
> id and audit ids, then correct `auditIds` in `scripts/lane1-lighthouse.ts`. The script now
> **fails loudly** (no fabricated score) if the category is missing.

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
First run `npm run seed:sites` to load all cohort sites into the `sites` collection — Lanes 1 & 2
write `lighthouse`/`runs` keyed by `site_id`, and the leaderboard only shows sites that have a
matching `sites` row.

---

## Cohort management (`scripts/cohort.json`)

30 sites, tagged with `expected_lh` (high/medium/low) and `manual_pass` (done/TBD). Each row also
has a `task_hint` (what the agent is told to find) and `answer_substring` (the pre-registered
scoring key). **`task_hint` must never contain the `answer_substring` value** — the agent gets the
hint, so leaking the value lets it answer without browsing and invalidates the result.

**Before running Lanes 1 & 2 (only 5/30 are `done` — finish the rest):**
1. For each `manual_pass: "TBD"` site, visit the URL manually
2. Confirm the task is answerable, the `answer_substring` is the *exact* on-page value, and the
   `task_hint` names the target without revealing it
3. Tighten short/generic substrings (e.g. `$1`, `$4`, `free`, `62`) that would false-positive on
   incidental page text; pre-register 2–3 accepted variants per site if formatting may vary
4. Flag any sites that block you immediately (anti-bot, login wall) — swap them out if ≥5 are blocked

---

## Deploy

This is a **server-rendered** Next.js app (pages are async server components that read
Firestore via `firebase-admin`), so it cannot be deployed as a static site. Two options:

```bash
# Option A — Firebase Hosting with framework-aware SSR (Google-track story).
# One-time: enable the web frameworks integration in the firebase CLI.
firebase experiments:enable webframeworks
firebase deploy --only hosting,firestore:rules   # builds + deploys the SSR backend

# Option B — Cloud Run, full SSR from source.
gcloud run deploy agentrank --source . --region us-central1
```

> The old `public: ".next"` + `/index.html` rewrite would serve a blank page for an SSR app —
> `firebase.json` now uses `frameworksBackend` instead. Test one deploy before demo day.

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
