# PRE-REGISTRATION — AgentRank (DRAFT)

> **STATUS: DRAFT — NOT RATIFIED.** Wording is owned by Member 4 (cohort owner), who
> ratifies the final text. This draft fixes the experimental commitments so they can be
> reviewed and frozen. **Nothing in the experiment's measurement design may change after
> this file is committed.**
>
> **THIS FILE MUST BE COMMITTED BEFORE THE FIRST `runs` ROW IS WRITTEN.** The git
> ordering — pre-registration committed *before* any agent-success data exists — is the
> entire falsifiability guarantee. If a reviewer cannot see, in the commit history, that
> the hypothesis, the scoring rule, and every `answer_substring` were fixed *before* the
> first run, the result is not pre-registered and the headline claim is not defensible.
> Do not run the cohort until this is committed.

---

## 1. Hypothesis

**Primary hypothesis (H1):** Google Lighthouse 13.3's *Agentic Browsing* static audit
score predicts the real-world success rate of a fixed browser agent on a fixed
fact-finding task. Concretely: across the cohort, a site's Lighthouse Agentic Browsing
score (`lh_total`, 0–100, the x-axis) is **positively correlated** with that site's
measured agent **success rate** (`success_rate`, 0–1, the y-axis).

**Null hypothesis (H0):** there is no positive correlation between the Lighthouse
Agentic Browsing score and measured agent success rate.

**Why it might be falsified (the interesting case):** the cohort deliberately includes
off-diagonal sites — a slick, high-static-score site where the target fact is buried
behind a heavy SPA (predicted high static / low success), and a plain-HTML site where
the fact sits in the open (predicted low static / high success). If these corner points
dominate, the static rubric does **not** predict real agent success, and that is the
reportable finding.

**Headline artifact:** a scatter plot of Lighthouse score (x) vs measured agent success
rate (y), one point per cohort site, with the correlation as the summary statistic.

---

## 2. FROZEN scoring rule

Scoring is **pre-registered and frozen**. The canonical specification is
`scripts/cohort-source/agentrank_scoring_rules.md`; the implementation is
`scripts/scorer.py` (verified by `scripts/test_scorer.py`, **275/275 passing**). This
section restates the contract; the spec file governs if there is any discrepancy.

### 2.1 Per-run success

A single run **succeeds** iff the agent's final answer **contains** the site's
pre-registered `answer_substring`, after the normalization below.

```
success = (normalized answer_substring is present in normalized agent answer)
```

The base rule is a **case-insensitive substring match** with whitespace trimmed and
collapsed. The classifiers and exceptions below tighten that base rule so that numbers
and prices match by *value*, not by accidental sub-string overlap.

### 2.2 Normalization (applied to BOTH the agent answer and the registered value)

1. **Case-insensitive**; trim and collapse internal whitespace.
2. **Currency strip** — remove currency symbols (`$`, `€`, `£`) before matching.
3. **Numeric word-boundary (Decimal value)** — a numeric value must not match as a
   sub-run of a longer number. Matching is by the maximal-number-run's **`Decimal`
   value**, not by raw characters: `$20` must NOT match `$200`; `$65` must NOT match
   `$650`; `67` must NOT match `1967` or `26.67%`.
4. **Whole-dollar prices** — strip thousands commas and a trailing `.00` on both sides,
   then match the digit core: `1848` matches `$1,848.00`, `$1,848`, and `$1848`.
5. **Prices with meaningful cents** — keep the decimal: `12.89`, `0.78`, `5.60`.
6. **any-of** — a site may register several acceptable substrings, separated by `" | "`
   in the CSV. Success = the agent answer contains **ANY one** of them.
7. **Per-site question** — each site carries a specific, leak-free `question` (and a
   leak-free `task_hint` derived from it). The task *shape* is constant (navigate to find
   one pre-registered fact and report it), only the target fact changes. This per-site
   parameterization is required for informational/government pages, where "extract any
   claim" would unfairly fail a capable agent that extracts a different true fact.
   **Status:** the cohort carries `question` per site, but the frozen harness currently
   builds the prompt from the neutral `task_hint` (generic task template); wiring the
   per-site `question` into the prompt is a planned, pre-run change that **reopens the
   harness freeze and must be re-gated** before the full run. This file will be re-checked
   against the actual frozen prompt at ratification.

**Classifier-specific handling** (the scorer auto-classifies from the registered value):

- **PERCENT** — value matched with a percent boundary (`26.67%` is not a match for `67`).
- **TIME** — colon-boundary aware (`4:30` does NOT match `4:30:15`).
- **PHRASE** — right word-boundary enforced (`90 days` does NOT match `90 dayschallenge`).
- **PHONE** — digit-only normalization (strip all non-digits), match a ≥7-digit run
  (e.g. Voodoo Doughnut's `5032414704`).
- **LITERAL** — case-normalized substring match for proper-noun / phrase answers.

### 2.3 Pre-registered exceptions (from the scoring-rules spec)

- **Zalando (zalando.pt):** the comma is the DECIMAL separator (`69,95`). The
  comma-stripping rule is NOT applied to this row; match literal `69,95` or `69.95`
  via any-of.
- **Voodoo Doughnut:** ZIP is the primary answer; the phone-number alternative uses
  digit-only normalization to match `5032414704`.
- **Promo prices are never the answer.** Where a page shows a promo next to the real
  price (e.g. Spotify "$0 for 3 months", Amazon store-card offers), the registered value
  is always the standing / recurring price.

### 2.4 LOCKED answer keys

**Every `answer_substring` is LOCKED before any run.** The canonical source is
`scripts/cohort-source/agentrank_sites.csv` (and the generated `scripts/cohort.json`).
The registered values were written by hand during the manual cohort pass, *before* any
agent run. **No `answer_substring` may be edited after the first run.** If a registered
value is later believed to be wrong, it is **flagged to Member 4 (cohort owner)** and
documented — it is **never quietly changed**. Changing a key after data exists voids the
pre-registration.

---

## 3. Aggregation

- **N trials per site.** The same site can pass on one trial and get stuck on another;
  variance is real and is the point of measuring a rate. The planned default is
  **N = 5** trials per site (`DEFAULT_TRIALS = 5` in the frozen harness).
- **Per-site success rate** is the mean of the per-trial successes:

  ```
  success_rate(site) = mean(success over that site's trials)        # in [0, 1]
  ```

- The headline correlation is computed over the cohort's `(lh_total, success_rate)`
  points (see §5 for which points are included).

### 3.1 Two measurement conditions (the "measure both" design)

Each site is measured under **two pre-registered conditions**, so we can separate
*reading* a page from *finding* it:

| Condition | Start URL | Agent | Firestore collection | Measures |
|---|---|---|---|---|
| **navigation** | site **homepage** (front door) | full autonomous agent | `runs` | navigation + extraction |
| **extraction** | site **deep-link** (answer page) | scripted nav + single Gemini extraction | `runs_extraction` | extraction only (control) |

Both conditions use the **same** frozen model / prompt / limits / scorer; only the
start URL and the navigation driver differ. Each produces its own `success_rate` per
site under the identical scoring rule (§2).

**Pre-registered analysis:**
- `success_rate_nav` (homepage + full agent) is the primary y-axis — it tests whether
  the agent can *browse* a site, which is what the Lighthouse Agentic Browsing score
  claims to predict.
- `success_rate_ext` (deep-link + scripted) is a **control** for "can the agent even
  read the answer page," holding navigation difficulty out.
- The **navigation gap** `gap(site) = success_rate_ext − success_rate_nav` isolates the
  cost of navigation. We pre-register correlating `lh_total` against **all three**:
  `success_rate_nav`, `success_rate_ext`, and `gap`. The directional prediction is that
  the rubric tracks navigability (the gap / nav) more than raw extraction.

The Saturday-6pm decision (§6 note) governs only whether the **navigation** condition's
full-agent data is clean enough to headline; if not, the cohort falls back to scripted
extraction (`--scripted-only` → `runs`) and the result is reported as *extraction
reliability*, not autonomous navigation. The `extraction` control runs regardless.

---

## 4. Failure-mode taxonomy (6 values, frozen)

Each run records exactly one `failure_mode`, drawn from the frozen 6-value enum in
`lib/types.ts`. No new values, no renames (Lane 3's frontend reads these):

| value | meaning |
|---|---|
| `success` | the agent's answer contained the `answer_substring` |
| `blocked` | anti-bot / login wall / CAPTCHA — the agent could not engage the task |
| `timeout` | hit the wall-clock time limit (`TIMEOUT_SECONDS`) |
| `wrong_extraction` | navigated fine but reported the wrong / no answer |
| `navigation_stuck` | could not find the path (step-budget exhausted, or repeated-action loop) |
| `error` | harness / technical failure (API/JSON failure, page-load error, empty answer key) |

Harness mapping (frozen): step-exhaustion and the 3-identical-actions loop-breaker emit
`navigation_stuck`; the wall-clock limit emits `timeout`; an `answer == "BLOCKED"` sentinel
emits `blocked`; an internal API/parse/load failure emits `error`.

---

## 5. Blocked-before-task rule (readiness signal)

The y-axis is meant to measure **agent readiness** — whether a site's *structure* lets a
capable agent complete the task. Two outcomes are **NOT** readiness signals and are
**EXCLUDED** from the readiness measurement:

- **`blocked`** — the site rejected the agent before the task could begin (anti-bot /
  login wall). Near-zero behavioral success here is a *finding about anti-bot defenses*,
  not a measurement of navigational readiness. Deliberately-blocked sites (e.g. Amazon,
  Ticketmaster) are kept to **≤ 5 total**.
- **`error`** — a harness/technical failure says nothing about the site's readiness.

**Pre-registered exclusion:** runs with `failure_mode ∈ {blocked, error}` are excluded
from the readiness signal that feeds the headline correlation. (They are still recorded
and reported separately — the blocked outcomes are themselves a finding.) `success`,
`wrong_extraction`, `navigation_stuck`, and `timeout` are the in-task outcomes that count
toward the readiness signal. **This rule is fixed before the full run.**

> Operational note for ratification (Member 4 + Lane 2): pin down whether a fully-blocked
> site (all trials `blocked`) is dropped from the correlation entirely or pinned at
> `success_rate = 0` and reported as a separate "blocked" series. The exclusion of
> *individual* `blocked`/`error` runs from the readiness signal is fixed regardless.

---

## 6. Frozen harness configuration (for reproducibility)

The measurement instrument is frozen (passed the 5-site pre-scale gate; commit
`2edc2f4`, plus `--resume` in `7872c12`). No tuning mid-run.

- **Model:** `gemini-2.0-flash`
- **`MAX_STEPS` = 15**, **`TIMEOUT_SECONDS` = 90**, **`DEFAULT_TRIALS` = 5**
- **Generation config:** `temperature = 0`, `max_output_tokens = 256`, JSON response mode
- **Viewport:** 1280 × 800; chromium launch args fixed; per-action Playwright timeouts
  fixed (goto 30s / navigate 20s / click+type 5s / load 10s)
- **Loop-breaker:** 3 identical non-scroll actions → `navigation_stuck`
- **Answer-leak guard:** the agent prompt is built from the neutral `task_hint` (with the
  per-site `question` wiring pending re-gate, see §2 rule 7), **never** from the answer
  value. The model must browse to find the fact.

---

## 7. Commit attestation (fill in at commit time)

To be completed **at the moment this file is committed**, before the first run:

- **Commit timestamp (UTC):** `__________________________`  *(placeholder)*
- **Cohort hash:** `sha256(scripts/cohort-source/agentrank_sites.csv) = __________________________`  *(placeholder)*
  - Reference value at draft time (subject to change before lock):
    `fcd0ee7c7794644f487d90027c61632b3f8b85ba43cbe38e87b2e22a6d6cc21d`
- **Cohort size at lock:** 28 sites *(confirm at lock)*
- **Scorer attestation:** `scripts/test_scorer.py` → `__/__ passing` at lock
  *(275/275 at draft time)*

The cohort hash binds this pre-registration to the exact `answer_substring` set in use.
Any later change to the CSV changes the hash and breaks the attestation — which is the
intended tripwire.

---

*Draft prepared by Lane 2 (harness). Ratification, final wording, and the commit-time
attestation are Member 4's call. Do not write any `runs` row until this file is committed.*
