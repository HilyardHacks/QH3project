# Lane 2 (Harness) — Status & Next Steps

_Updated 2026-05-31 · Branch: `harness`_

Human-readable handoff. (The AI assistant's session memory also persists, so a fresh chat
picks up with full context — just say "continue Lane 2".)

## ✅ Done (committed on `harness`)

- **Harness hardened + frozen** (`2edc2f4`): raw-bytes image, JSON mode + retry, de-masked errors, empty-substring guard, 3-identical-actions loop-breaker, `--dry-run`/`--out`, UTF-8 stdout, browser try/finally, 5s fill timeout.
- **`--resume`** (`7872c12`): crash-safe re-runs (skip-if-exists on doc id), proven.
- **Firebase wired + verified**: `service-account.json` + `GOOGLE_APPLICATION_CREDENTIALS`; write/read/delete to `agentrank-quackhacks` OK.
- **Cohort brief delivered** (`docs/cohort-redesign-brief.md`), and **cohort received back from Member 4** → `scripts/cohort-source/` (28 sites: `agentrank_sites.csv` + `agentrank_cohort.md` + `agentrank_scoring_rules.md`). Strong: pre-registered discriminating answers, off-diagonal picks, 2 blockers.

## ⛔ Before the full run can happen

**From Member 4** — fill the **6 placeholder URLs** (`[confirm …]`): `bestbuy`, `ikea`, `powells`, `zalando`, `amazon`, `ticketmaster` (exact product/event pages).

**On the harness (Lane 2 — the fresh-chat work):**
1. **Upgrade the scorer** to implement `agentrank_scoring_rules.md` faithfully — today's plain substring check is insufficient. Needs: any-of (split `" | "`), strip `$`/`€`, strip thousands-commas + trailing `.00` (whole-dollar), keep decimals, **numeric word-boundary** (`$20`≠`$200`), Zalando comma-decimal exception, Voodoo digit-normalize. *(Never-cut credibility piece.)*
2. **Per-site question** — feed each site's `question` to the agent (the generic "primary product/service" task is wrong for gov/info pages; questions are leak-free). Reopens the provisional freeze (expected).
3. **Convert** `scripts/cohort-source/agentrank_sites.csv` → `scripts/cohort.json` (carry `question`/`match_rule`/`flag`/`tier`).
4. **Re-gate** a few new sites (a gov + an off-diagonal), then re-freeze.

## Then

- **Full run** (28×5 → Firestore; Firebase ✓), then sanity-check 0/5 & perfect sites (#9–10). Re-verify volatile prices (amazon/bestbuy/ikea/zalando) right before.
- **#6 blocked-before-task rule** — verify `BLOCKED` fires on amazon/ticketmaster (folds in naturally now).

## Parallel / other lanes

- **Lane 1** Lighthouse scoring (x-axis) — independent, runnable now.
- **Lane 3** frontend builds on fake data → wire to real `runs` after the run; `npm run seed:sites` once `cohort.json` is final.

## Resuming in a new chat

Say **"continue Lane 2 — start the scorer upgrade."** The cohort source is in `scripts/cohort-source/`; the scoring spec is `agentrank_scoring_rules.md`. Order: scorer upgrade (#1) + CSV→cohort.json (#3) → per-site question (#2) → re-gate (#4).
