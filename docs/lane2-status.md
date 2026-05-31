# Lane 2 (Harness) — Status & Next Steps

_Updated 2026-05-31 · Branch: `harness`_

Human-readable handoff. (The AI assistant's session memory also persists, so a fresh chat
picks up with full context — just say "continue Lane 2".)

## ✅ Done (committed on `harness`)

- **Harness hardened + frozen** (`2edc2f4`): raw-bytes image, JSON mode + retry, de-masked errors, empty-substring guard, 3-identical-actions loop-breaker, `--dry-run`/`--out`, UTF-8 stdout, browser try/finally, 5s fill timeout.
- **`--resume`** (`7872c12`): crash-safe re-runs (skip-if-exists on doc id), proven.
- **Firebase wired + verified**: `service-account.json` + `GOOGLE_APPLICATION_CREDENTIALS`; write/read/delete to `agentrank-quackhacks` OK.
- **Cohort brief delivered** (`docs/cohort-redesign-brief.md`), and **cohort received back from Member 4** → `scripts/cohort-source/` (28 sites: `agentrank_sites.csv` + `agentrank_cohort.md` + `agentrank_scoring_rules.md`). Strong: pre-registered discriminating answers, off-diagonal picks, 2 blockers.

## ✅ Scorer upgrade (#1) — DONE this session (UNCOMMITTED)

The pre-registered scoring contract is now implemented and adversarially verified.

- **New `scripts/scorer.py`** — pure stdlib (`re`, `decimal`); NO google/playwright/firebase imports, never raises, blank registered → `False`. `score_answer(agent_answer, answer_substring) -> bool` implements `agentrank_scoring_rules.md`: any-of (split `" | "`); strip `$`/`€`/`£`; **numeric word-boundary** via maximal-number-run **Decimal-value** match (`$20`≠`$200`, `67`≠`1967`/`26.67%`); trailing `.00`/zeros and US thousands-commas handled for free; Zalando comma-as-decimal (`69,95`); percent / time / phrase / phone(≥7-digit) / literal classifiers.
- **`scripts/test_scorer.py`** — self-contained runner, **275/275 pass** (`python scripts/test_scorer.py`).
- **Wired into `scripts/lane2-agent.py`** — 3-line diff (1 import + the two `success = score_answer(answer, answer_substring)` sites). FROZEN config, the `failure_mode` enum, and every `answer_substring` are untouched; both empty-substring guards kept.
- **Adversarially reviewed** (8-agent workflow: 3 test-authors → implementer → 4 reviewers that ran the suite). Contract reviewer **PASS, 0 violations**; false-negative reviewer **no defects**. Fixed 2 confirmed over-matches: TIME colon-boundary (`4:30`≠`4:30:15`) and NUMBER-PHRASE right-boundary (`90 days`≠`90 dayschallenge`) — both align with those rows' `match_rule` ("exact"/"exact phrase").
- **Flags for Member 4** (pre-registered scoring — I did NOT change these): test `notion_neg_3` was mislabeled (`$12` *does* match "$12x12 = $144" by the value-presence rule); LITERAL is substring per "case-normalize" so `DevHub`⊂`DevHubbed` / `Isakov`⊂`Isakovich` match (pinned with a test; tightening is their call); out-of-contract by current rules → phone embedded-digit, word-form numerals ("ninety"), space-grouped thousands ("15 750"), euro-comma percent ("2,9%").
- ⚠️ A review agent also added `.claude/settings.local.json` to `.gitignore` (correct hygiene, but unrequested) — keep or drop before committing.

## ⛔ Still before the full run

**From Member 4** — fill the **6 placeholder URLs** (`[confirm …]`): `bestbuy`, `ikea`, `powells`, `zalando`, `amazon`, `ticketmaster` (exact product/event pages); plus the scorer flags above.

**On the harness (the fresh-chat work, in order):**
1. ~~**Upgrade the scorer**~~ ✅ **DONE** (above).
2. ~~**Convert** CSV → `scripts/cohort.json` (#3)~~ ✅ **DONE** — `scripts/build-cohort.py` (pure stdlib, re-runnable) generates the canonical **28-site** `cohort.json` from `agentrank_sites.csv`: maps `start_url`→`url` (deep links kept verbatim), carries `question`/`task_hint`/`match_rule`/`flag`/`tier`/`runnable`, renames ids (`dmv_ca`→`ca_dmv`, `irs_gov`→`irs`), marks the 6 `[confirm…]` rows `runnable:false`, and **hard-asserts no answer leak** into `question`/`task_hint`. A skip-guard in `lane2-agent.py` skips non-runnable/placeholder rows so the harness never `goto()`s a placeholder. ⚠️ **Cross-lane:** the `site_id` renames + drop-to-28 affect `seed-sites.ts`, Lane 1 keys, Lane 3 joins — re-run `npm run seed:sites` once finalized. *(Uncommitted.)*
3. **Per-site question** (#2) — feed each site's leak-free `question` to the agent (replace the generic "primary product/service" `TASK_TEMPLATE`, wrong for gov/info pages). **Behavioral → reopens the freeze; needs a live `GEMINI_API_KEY` re-gate + your sign-off.** *(Not yet started — gated on you.)*
4. **Re-gate** (#4) a few new sites (a gov + an off-diagonal), then re-freeze.

**Also blocking the run (your/Member 4's call):** the **deep-link vs homepage** decision — the cohort URLs are deep links that land on the answer page (~1-step extraction, not navigation). Either rewrite to homepages or consciously re-scope to "extraction reliability."

## Then

- **Full run** (28×5 → Firestore; Firebase ✓), then sanity-check 0/5 & perfect sites (#9–10). Re-verify volatile prices (amazon/bestbuy/ikea/zalando) right before.
- **#6 blocked-before-task rule** — verify `BLOCKED` fires on amazon/ticketmaster (folds in naturally now).

## Parallel / other lanes

- **Lane 1** Lighthouse scoring (x-axis) — independent, runnable now.
- **Lane 3** frontend builds on fake data → wire to real `runs` after the run; `npm run seed:sites` once `cohort.json` is final.

## Resuming in a new chat

Scorer (#1) **and** the CSV→`cohort.json` converter (#3) are both **done** (working tree, **not committed**). Key files: `scripts/scorer.py` + `scripts/test_scorer.py` (`python scripts/test_scorer.py` → 275/275), `scripts/build-cohort.py` → `scripts/cohort.json` (28 sites). **Remaining is mostly gated on you/the team:** the **deep-link-vs-homepage decision**, the **6 `[confirm…]` URLs** (Member 4), then **#2 per-site question + #4 re-gate** (behavioral, needs a live `GEMINI_API_KEY`), `PREREG.md` ratify+commit (Member 4), then the **full run**. To continue the harness coding once those land, say **"continue Lane 2 — wire the per-site question + re-gate."**
