# Lane 2 (Harness) — Status & Next Steps

_Updated 2026-05-31 · Branch: `harness`_

This is the human-readable handoff. (The harness's own session memory also persists for the
AI assistant, so a fresh chat picks up with full context.)

## ✅ Done (committed on `harness`)

- **Harness hardened + frozen** (`2edc2f4`): raw-bytes image input, **JSON mode + 3× retry** (kills prose/empty-response failures), de-masked technical errors, empty-substring guard, **3-identical-actions loop-breaker**, `--dry-run`/`--out` local sink, UTF-8 stdout, browser try/finally, 5s fill timeout. Frozen-measurement surface documented in the file's banner.
- **`--resume`** (`7872c12`): crash-safe re-runs (skip-if-exists on `{site_id}_t{trial}`) — proven (re-run skipped all rows, 0 new).
- **5-site gate passed** + validated on hard *homepage* tasks via a probe (stripe homepage → real multi-step success; the deep-link 1-step "win" is gone).
- **Firebase wired + verified**: `service-account.json` (gitignored) + `.env.local` → `GOOGLE_APPLICATION_CREDENTIALS`; write/read/delete to project `agentrank-quackhacks` succeeded.
- **Cohort-redesign brief** for Member 4 (`d84825b`): [docs/cohort-redesign-brief.md](./cohort-redesign-brief.md).

## ⛔ The one thing blocking the finish

**Full cohort run (#8)** → waits on **the redesigned + frozen cohort** (Member 4 / your groupmate). Firebase is no longer a blocker. Everything downstream (real success rates → the leaderboard + correlation scatter → the 0/5-and-perfect-site sanity checks) sits behind the full run.

## 👉 Exactly what to do next (James)

1. **Send the brief to your groupmate** — team chat (paste it or share `docs/cohort-redesign-brief.md`). *This is the critical path:* the full run can't start until they switch sites to **homepage starts + buried facts** and freeze all 30 `answer_substring`s.
2. **Get the branch pushed.** `harness` has unpushed commits; pushing has 403'd for your account, so either fix repo access or have a teammate with push rights push it — so the team can pull the brief + harness. (Until then, the brief lives in chat.)
3. **Pre-write the Saturday-6pm go/no-go bar** (#7) — e.g. *"≥4/5 of the gate sites terminate cleanly + the 2 known-good pass → run the full agent; otherwise switch the whole cohort to `--scripted-only`."* No dependencies; decide it in advance.
4. **When the cohort is frozen → open a fresh chat** and say *"continue Lane 2 — run the full cohort."* The assistant will: run 30×5 to Firestore, then sanity-check any 0/5 or perfect sites against transcripts (#9–10).

## 🟢 Can proceed in parallel (not blocked)

- **Me/Lane 2:** **#6** — the blocked-before-task rule + a live wall-site check (nytimes/amazon), so anti-bot walls score `blocked` (excluded), not fake low-readiness. The only unstarted Lane-2 build item; can be done anytime.
- **Lane 1:** Lighthouse scoring (the x-axis) — fully independent, runnable now.
- **Lane 3:** frontend already builds on fake data; wire to real `runs` after #8.
- **Seeding:** once the cohort is locked, `npm run seed:sites` populates Firestore `sites`.

## Resuming with the AI in a new chat

Memory carries the full state — just start a new chat and say **"continue Lane 2."** Good first asks: *"do #6 (blocked-rule)"* now, or *"run the full cohort"* once the groupmate has frozen `cohort.json`.
