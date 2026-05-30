# Member 4 — Cohort Manual Pass & Scoring Integrity

**Branch:** `cohort-data`  ·  **Owns:** `scripts/cohort.json`, `PREREG.md`

> **Mission:** make the experiment defensible — a leak-free, false-positive-resistant, **pre-registered** answer key for all 30 sites *before any agent runs*. This is the credibility anchor of the whole project.

Your work is verification, not engineering, but it's on the critical path: **Lane 2's full run is blocked until all 30 answer keys are frozen.** On Friday, all 4 members split the 25 sites (~6 each) to get the visiting done fast — but you own consolidation, `PREREG.md`, and the final consistency checks.

## Deliverables

- [ ] **1. Write `PREREG.md` — committed BEFORE the first real run** _(effort S, never cut)_
  - States: (a) scoring = case-insensitive exact-substring match (`answer_substring.lower() in answer.lower()`), (b) 5 trials/site, `success_rate = mean(success)`, (c) the **blocked-before-task rule** (CAPTCHA/consent/login wall before the agent can act → `failure_mode='blocked'`, counts as failure, excluded from the readiness interpretation), (d) substrings locked before runs.
  - **Done when:** `git log` shows `PREREG.md` committed earlier than Lane 2's first `runs` write.

- [ ] **2. Manual-pass the 25 TBD sites** _(effort L, never cut)_
  - For each: URL loads, the answer is on-page within 1–3 clicks, `answer_substring` = the **exact rendered string**, flip `manual_pass` to `"done"`.
  - Sites: linear, cloudflare, notion, github, shopify, dropbox, doordash, spotify, nytimes, reddit, amazon, target, bestbuy, southwest, delta, expedia, yelp, apple, microsoft, openai, uscis, medicare, usps, ssa, wix_help.
  - **Done when:** `python -c "import json;d=json.load(open('scripts/cohort.json'));print(sum(1 for x in d if x['manual_pass']=='TBD'))"` prints `0`.

- [ ] **3. Tighten too-generic substrings** _(effort M, never cut)_
  - Lengthen substrings that false-positive under substring matching to unique, answer-bearing tokens that don't appear elsewhere on the page. Known offenders: `cloudflare 'Pro'`, `nytimes '$1'`, `southwest 'free'`, `ssa '62'`, `wix 'Light'`, `target '5%'`, `notion '$10'`, `openai '$20'`, `linear '$8'`, `github '$4'`.
  - Document each fix in `PREREG.md` (e.g. `$1` → `first month for $1`).

- [ ] **4. Audit `task_hint` for value-leak across all 30** _(effort S, never cut)_
  - `task_hint` is injected into the agent prompt verbatim. For every row, assert `answer_substring` ∉ `task_hint` **and** the answer value from `answer_note` is not in `task_hint`. Re-check the 25 new ones after editing substrings.

- [ ] **5. Triage trivial / blocked sites** _(effort M, never cut)_
  - Tag each: `trivial` (answer on the literal start URL — undermines "find the page"), `normal`, or `blocked-likely` (wall blocks task start). For trivial sites, deepen the `task_hint` to require a sub-page or note it. **Keep `blocked-likely` ≤ 5**; if more, swap for similar-`expected_lh` sites so the high-SaaS↔low-.gov spread is preserved.

- [ ] **6. Cross-check the 5 already-"done" sites** _(effort S, never cut)_
  - Re-verify stripe, vercel, wikipedia, irs_gov, dmv_ca to the same bar (exact on-page, non-generic, leak-free, not stale). `dmv_ca '41'` is generic-risk — confirm it appears as the renewal fee and tighten if it collides.

- [ ] **7. Re-seed `sites` from the finalized cohort** _(effort S, cut if behind)_
  - After substrings are locked, `npm run seed:sites` against the real Firebase project so every `site_id` has a contract-only `sites` row with the corrected key. Spot-check 3 previously-generic sites show the tightened substring.

## Watch out

- **Substring matching is case-insensitive and any-position.** A generic token like `Pro`, `$1`, `free`, `62`, `5%` will register a **false success** against unrelated text in the agent's verbose answer. Pick long, unique tokens.
- **Prices are dated and drift.** IRS standard deduction, Medicare Part B premium, SaaS pricing all change. Confirm the substring matches what the page renders **today (2026-05-30)**, not a remembered 2024 value — or a correct agent gets scored wrong.
- **Formatting traps:** `$14,600` vs `14600` vs `14,600`; `$10.99` vs `US$10.99`. Capture the exact on-page glyphs the agent will read back.
- **Task-difficulty confound:** if high-LH SaaS sites have trivially-findable prices while low-LH .gov sites bury theirs, the correlation is contaminated by difficulty, not readiness. Flag trivial sites; keep navigation depth roughly comparable across the LH range.
- Don't quietly shrink the cohort below the never-cut Lighthouse-spread requirement when swapping blocked sites.

## Definition of done

All 30 rows have `manual_pass='done'` with an exact, on-page, unique `answer_substring` captured as rendered today; every `task_hint` is confirmed leak-free; each site is triaged with `blocked-likely ≤ 5` and the high↔low Lighthouse spread preserved; `PREREG.md` is committed **before** the first real run; and the finalized key is seeded into `sites`. At that point the scoring is pre-registered and falsifiable — and no substring can register a false success.

## Dependencies / blockers

- #1, #2, #3, #5, #6 need **nothing** (just the cohort + a browser).
- #7 needs the real **Firebase project** (Member 3).
- **You block Lane 2's full run** — get all 30 frozen ASAP.
