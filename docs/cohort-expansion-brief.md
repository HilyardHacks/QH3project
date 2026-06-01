# Cohort Expansion — task brief for the cohort sourcing team

_From: Member 2 (harness) · Re: growing the AgentRank cohort_

## Why this matters (read first)
AgentRank ranks websites by how often a fixed Gemini agent completes a real task on them, with
Google's Lighthouse "Agentic Browsing" score as a covariate. Our headline scatter currently has
**n = 27 sites**, and our single biggest weakness is **thin n** — the correlation's confidence
interval is wide. **More high-quality, leak-free sites directly strengthens the result.** Your job
is to source more sites and write the locked answer key for them.

## What to deliver
**Target: 25 sites each** (≈50 new total). For **each website, write THREE questions** — one
**easy**, one **medium**, one **hard** (difficulty = *how hard for the agent to find*, defined below).
So each of you produces **25 sites × 3 = 75 question rows**.
> If we instead split 25 total, that's ~13 sites each — Member 2 will confirm the number.

Difficulty is a *measured axis*: we want to test whether agents (and Lighthouse) hold up as the
task gets harder on the **same** site. So **all three questions should target the same website.**

## The 7 golden rules (this is the whole game — quality > quantity)
1. **Leak-free.** The `question` and `task_hint` must NOT contain the answer. The agent is given
   the `task_hint` and must *browse* to find the value. ✅ "What is Stripe's standard online card
   rate?" ❌ "Is Stripe's rate 2.9%?"
2. **Discriminating answer.** The `answer_substring` must be a value that is **unique on the page** —
   not one that also appears elsewhere and could match by accident. Mind numeric boundaries
   (`$20` must not match `$200`). Note any near-collisions in `answer_note`.
3. **Stable fact.** Pick facts that won't change before the demo. Avoid promos, inventory, and
   live/transient values. If a price is volatile, still use it but put `volatile` in `flag`.
4. **Machine-scorable.** The answer must reduce to a **short substring** our pre-registered scorer
   can match — a price, a number, a proper noun, a short fixed phrase. **Never** an essay or a
   sentence. Use `" | "` to list acceptable alternates (e.g. `$20 | $25`).
5. **Real, live URLs.** Give the `homepage` (where the agent starts) **and** the `answer_url`
   (the page the fact lives on). Both must load right now. Prefer sites without a hard login/anti-bot
   wall; if there's a consent/anti-bot obstacle, still allowed — put it in `flag`.
6. **No duplicate domains.** Don't reuse any domain already in `scripts/cohort.json` (the existing 27:
   stripe, shopify, github, twilio, notion, cloudflare, bestbuy, ikea, target, spotify, costco,
   dmv.ca.gov, txdmv.gov, usps, irs, ssa, trimet, portland.gov, oregonstate.edu, powells,
   voodoodoughnut, in-n-out, bear.app, apple, craigslist, amazon, ticketmaster). Don't collide with
   each other either — **split categories up front** (e.g. one takes retail + SaaS, the other takes
   gov + local/small-biz).
7. **Pre-registration discipline.** You are writing the *locked answer key*. Values are frozen
   **before** any agent runs — that's our credibility. Double-check every answer by actually opening
   the page yourself.

## Difficulty = how hard for the AGENT to find (not human trivia difficulty)
- **easy** — fact on a simple, mostly-static page **≤1 step** from the homepage, plainly visible,
  few distractor values. (e.g. a headline price on the main pricing page.)
- **medium** — needs **2–3 navigation steps** (a menu, a search, a sub-page) or the page is heavier;
  the fact is visible once you get there; a few similar values to disambiguate.
- **hard** — behind an **interaction** (accordion / tab / dropdown / toggle), a heavy SPA, **deep**
  multi-step navigation, or many near-duplicate values needing care. Make it *hard, not impossible* —
  a human should still be able to get it in under a minute.

## The template — fill one row PER QUESTION (3 rows per site)
A spreadsheet/CSV with these columns (this maps 1:1 onto our pipeline):

| column | what goes in it |
|---|---|
| `site` | short base id, same for all 3 rows of a site (e.g. `rei`) |
| `name` | display name (e.g. `REI`) |
| `category` | retail / saas / gov / media / travel / local_small_biz / nonprofit … |
| `homepage` | root URL the agent starts at (e.g. `https://www.rei.com`) |
| `answer_url` | the page where the fact actually lives |
| `difficulty` | `easy` \| `medium` \| `hard` |
| `question` | natural-language question, **leak-free** |
| `task_hint` | the neutral phrasing we feed the agent (question minus the answer) |
| `answer_substring` | the exact short string to match; `" | "` for alternates |
| `answer_note` | where it is on the page + why it's unique + any collision/volatility |
| `match_rule` | e.g. `strip $; numeric word-boundary` · `exact` · `any-of` · `case-normalize (proper noun)` |
| `flag` | `anti-bot` / `consent-wall` / `volatile` / blank |

### Quality bar — examples from our existing locked cohort (this is the standard)
- **easy-style** (price 1 step from home): Stripe → `answer_substring` `2.9%`,
  `match_rule` `exact; case/space-normalize`.
- **medium-style** (sub-page + disambiguation): Costco Gold Star fee → `$65`,
  `match_rule` `strip $; numeric word-boundary ($65 != $650)`, note: "Executive $130 on same page."
- **hard-style** (behind an accordion + disambiguation): Oregon State 2026-27 resident tuition →
  `16014`, `flag` `interaction-test (accordion)`, note: "non-resident $40,392 discriminates."
- **any-of**: Cloudflare Pro → `$20 | $25`; Bear Pro → `2.99 | 29.99`.

### Don't do this
- ❌ Leaks: "Is Costco's membership **$65**?"  → the agent never has to browse.
- ❌ Non-discriminating: `answer_substring` `5` on a page full of `5`s.
- ❌ Not scorable: "Summarize Apple's return policy."  → no short substring to match.
- ❌ Volatile-and-unflagged: a Buy-box price that changes hourly, with no `volatile` flag.

## Self-check before you submit (per row)
- [ ] I opened `answer_url` and the `answer_substring` literally appears there.
- [ ] The `question`/`task_hint` does **not** contain the answer.
- [ ] The `answer_substring` is unique on the page (no accidental match elsewhere).
- [ ] The difficulty label honestly reflects how many steps/interaction it took me.
- [ ] Domain isn't already in the 27, and isn't claimed by my teammate.

## Logistics
- **Format:** one shared Google Sheet (or a CSV each), columns exactly as above.
- **Split:** agree on categories first so you don't pick the same sites.
- **Deadline:** _[Member 2 to set]_.
- **Ratify:** Member 4 (cohort owner) does a consistency pass + locks it into `cohort.json` and
  `agentrank_scoring_rules.md` before any runs — so coordinate naming/`match_rule` with them.
