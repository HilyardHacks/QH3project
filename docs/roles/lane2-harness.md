# Member 2 — Gemini Agent Harness (the y-axis)

**Branch:** `harness`  ·  **Owns:** `scripts/lane2-agent.py`, the Firestore `runs` collection

> **Mission:** prove the fixed Gemini + Playwright agent loop works end-to-end, lock the harness, own the Saturday-6pm gate, and produce a complete, non-clobbering set of real `runs` rows for the full cohort.

This is the **heaviest and flakiest lane** — it's where hackathon weekends get eaten. Your discipline is: prove small, freeze, then scale. Don't negotiate with a flaky agent.

## Deliverables

- [ ] **1. Working environment proven live** _(effort S, never cut)_
  - `pip install -r scripts/requirements.txt` + `playwright install chromium`.
  - One real `gemini-2.0-flash` `generate_content` call returns text; headless Chromium screenshots one page.
  - `GEMINI_API_KEY` in `.env.local` (gitignored, **never committed**). Confirm the key's rate limit covers ~2,000 calls (30 sites × 5 trials × up to 15 steps).

- [ ] **2. Verify the SDK surface** _(effort S, never cut)_
  - Confirm `genai.configure`, `GenerativeModel('gemini-2.0-flash')`, `generate_content([text, {mime_type,image}, ...])`, and `response.text` all work as written. Especially: is the screenshot passed as **base64 string vs raw bytes** correct for the installed SDK? Fix if needed.

- [ ] **3. End-to-end loop on 5 test sites — the pre-scale gate** _(effort L, never cut)_
  - `python scripts/lane2-agent.py --sites <5 ids> --trials 1` on a spread set (e.g. stripe + vercel high; irs_gov + dmv_ca + one more low).
  - **Done when:** every run terminates (no hang past 90s), produces a valid `runs` dict, the click/navigate/done branches each fire at least once, and the 2 known-good sites return `success=true`. Record observed success/failure_mode per site.

- [ ] **4. Freeze the harness** _(effort S, never cut)_
  - After the gate: declare `GEMINI_MODEL`, `SYSTEM_PROMPT`, `TASK_TEMPLATE`, `MAX_STEPS`, `TIMEOUT_SECONDS`, viewport, and launch args **frozen** (code comment + a note to the team). No edits during the cohort run.

- [ ] **5. Crash-safe / resumable runs** _(effort M, never cut)_
  - A crash at site 20/30 + a naive re-run must not corrupt `success_rate`. Add `--resume` (skip-if-exists on doc id `{site_id}_t{trial}`). **Don't touch the frozen schema** — use deterministic doc ids, not a new batch field.

- [ ] **6. Pre-register + implement the blocked-before-task rule** _(effort S, never cut)_
  - Rule (write it down with Member 4): if a CAPTCHA/login/consent wall appears **before** the agent can act → `failure_mode='blocked'`, excluded from the readiness interpretation. Verify the existing `BLOCKED` path actually fires on a known wall site (e.g. nytimes).

- [ ] **7. Saturday 6pm DECISION GATE** _(effort M, never cut)_
  - Go/no-go on a bar stated in advance. If NO-GO → flip the whole cohort to `--scripted-only` (already implemented) and note results are scripted-nav + extraction, not autonomous navigation. **Communicate the call** — don't decide silently.

- [ ] **8. Run the full cohort** _(effort L, never cut)_
  - `runs` holds 30×5 = 150 valid docs (or the cut 30×3 / 20×5), each with an in-enum `failure_mode` and stored transcript. `getLeaderboard()` returns a real `success_rate` per site.

- [ ] **9. Sanity-check 0/5 and 1.0 sites against transcripts** _(effort M, cut if behind)_
  - For any 0/5 or suspiciously-perfect site, read the transcript: genuine failure vs. a too-generic substring false-positive/negative? **Flag mismatches to Member 4 — never edit `answer_substring` yourself** (pre-registered scoring is never-cut).

## Watch out

- **Don't scale past 5 sites until the loop is clean.** The Sat-6pm gate exists to cap this lane — honor it even if the full agent is tantalizingly close.
- **Access failures masquerade as low readiness.** Without the blocked-before-task rule, a consent wall on a .gov site looks like a true low score and pollutes the correlation.
- **Keep model/prompt/harness fixed** across the whole cohort — tuning mid-run silently changes the measurement.
- The harness already uses neutral `task_hint` (not the answer) — **re-check this stays true** after any prompt edit during gate tuning. Leaking the answer kills the headline.
- You're **downstream of the cohort pass**: don't start the full run until all 30 `answer_substring`s are frozen by Member 4.

## Definition of done

`runs` holds a complete, non-clobbered set of real trials produced by a **frozen** harness that passed the 5-site gate; the Sat-6pm decision was made on a stated bar and communicated; the blocked-before-task rule was applied; and Member 3 can read a real per-site `success_rate` + `top_failure_mode` to populate the **y-axis** of the never-cut correlation chart.

## Dependencies / blockers

- #1–#7 need a **Gemini key** (free tier likely fine — confirm limits).
- #8 needs: the **frozen cohort** (Member 4) **and** the real **Firebase project** (Member 3).
