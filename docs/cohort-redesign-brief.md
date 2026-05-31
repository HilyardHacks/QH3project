# Phase B — Cohort Redesign Brief

**From:** Lane 2 (Gemini harness / the y-axis) → **For:** cohort-data owner (Member 4)
**Status:** harness is frozen and passed its 5-site gate; this is what the cohort needs so the y-axis actually *means* something.

---

## The goal in one sentence

Make each site's task a real **navigation** test — start the agent at the site's **homepage** and have it find a fact that's **buried a click or two deep** — so the measured agent-success rate spreads across easy → hard instead of pinning every modern site at 100%.

## Why this matters (the evidence)

- With the **current deep-link start URLs** (e.g. `stripe.com/pricing`), the agent lands *on the answer page* and wins in **1 step**. That's extraction, not browsing — it tests nothing. When we started the same site at its **homepage** (`stripe.com`), it became a real **multi-step navigation**. Homepage starts = the actual experiment.
- A health sweep of all 30 start URLs found **10 are not reachable** (see below). A dead URL fails a site no matter how agent-friendly it is, which pollutes the correlation — so these must be fixed *and* kept out of the "low readiness" story.

## What to set for each site in `scripts/cohort.json`

For all 30 sites, fill these fields (the harness reads this file directly):

| field | what to put |
|---|---|
| `url` | the site's **homepage / front door** (e.g. `https://stripe.com`), **not** a deep pricing/answer page |
| `task_hint` | names a fact **1–3 navigations deep** — a specific plan price, a named fee, a spec. **Never the answer value itself.** |
| `answer_substring` | the **exact minimal text** the agent's answer must contain (a number or one canonical phrase). **Pre-register it** — do the task by hand first. This is the scoring key and is **never changed later.** |
| `answer_note` | human-readable description of the expected answer |
| `manual_pass` | `"done"` once you've hand-verified the fact is reachable **from the homepage** and the substring matches |
| `expected_lh` | your guess at the Lighthouse tier (high/medium/low) — keep it; helps sanity-check spread |

## Fix these 10 broken URLs first (from the sweep)

**7 dead pages (HTTP 404)** — switching each `url` to the **homepage** fixes these for free (homepages are live; the deep links rotted):

| site_id | dead deep-link | use instead |
|---|---|---|
| bestbuy | `/site/geek-squad/...` | `https://www.bestbuy.com` |
| southwest | `/air/products/index.html` | `https://www.southwest.com` |
| yelp | `biz.yelp.com/advertising` | `https://www.yelp.com` (or `biz.yelp.com`) |
| microsoft | `/microsoft-365/business/compare-all-plans` | `https://www.microsoft.com` |
| irs_gov | `/filing/individuals/standard-deduction` | `https://www.irs.gov` |
| medicare | `/basics/costs/medicare-costs/...` | `https://www.medicare.gov` |
| dmv_ca | `/portal/driver-licenses-.../renewing-your-dl-id/` | `https://www.dmv.ca.gov` |

**3 anti-bot blocks (whole domain rejects bots)** — these can't be fixed by changing the URL:

| site_id | status | decision |
|---|---|---|
| amazon | 429 (rate-limited) | keep as a deliberate **blocked** finding (it was chosen as one) |
| expedia | 429 ("Bot or Not?") | keep as **blocked**, or swap for a non-blocked travel site |
| delta | 444 ("Access Denied") | keep as **blocked**, or swap |

> Keep deliberately-**blocked** (anti-bot) sites to **≤5 total** — they're a finding, not filler. The harness's blocked-before-task rule (Lane 2 deliverable #6, in progress) will tag these `failure_mode="blocked"` and **exclude** them from the readiness signal.

## Guardrails (don't skip these)

- **No 1-click answers.** If the fact is on the homepage hero, pick a deeper fact or swap the site — *no navigation = no signal.*
- **Never leak the answer** into `task_hint` (name *what* to find, not its value) — otherwise the agent can parrot it without browsing and the whole result is invalid.
- **`answer_substring` is pre-registered and never edited after the fact.** If you later think one is wrong, flag it — don't quietly change it.
- **One source of truth:** the harness reads `scripts/cohort.json`. `cohort_worklist.md` has **diverged** (different `site_id`s, blank answer columns) — reconcile it into `cohort.json` or retire it.
- **Aim for spread:** a few easy anchors (clean SaaS), a bulk of medium, several genuinely hard (gov / legacy / heavy-JS), a few blocked. The corners (slick site where the fact is buried = high-static/low-success; ugly site where it's in plain text = low-static/high-success) are the most interesting points for the demo.

## How the harness scores it (so "success" is unambiguous)

1. Agent starts at your `url`, browses (click / type / scroll / navigate), and on `done` its answer is checked: **`answer_substring` (case-insensitive) must appear in the answer** → `success`.
2. Per-site outcome buckets: `success` · `wrong_extraction` · `navigation_stuck` · `timeout` · `blocked` · `error`. **Only `success` is a pass;** `blocked` and `error` are excluded from readiness.
3. We run **N trials per site** and report the **success *rate*** — variance is real (the same site can pass or get stuck across trials), which is the whole point of a rate.

## Handoff

When **all 30 `answer_substring`s are frozen** (`manual_pass: "done"`), ping Lane 2 — that, plus the real Firebase project (Member 3), unblocks the full cohort run.
