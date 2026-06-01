# Future Improvements — What to Build Next

> **The throughline:** AgentRank turns Google's *static* rubric into a *behavioral* measurement. The expansion path runs: **harden the result → make failures legible → package it as a product → publish a versioned dataset fed back to Lighthouse.**

Ideas are tiered by horizon. The 🟢 weekend-stretch tier is what we should implement **if the core locks early** — each is high-value and mostly already built. The 🟡 and 🔭 tiers are the post-hackathon roadmap.

---

## 🟢 Weekend-stretch — implement if the core is locked

These have the highest value-per-hour and reuse assets that already exist.

### 1. Spearman ρ + bootstrap CI (do this regardless)
Replace the bare Pearson `r` with Spearman rank correlation, a 10k-resample bootstrap 95% CI, and an explicit `n`. **Highest credibility-per-hour in the project** — pure client-side math on data we already have, and it defends the thin n before a judge can attack it. _(This is also a never-cut frontend deliverable.)_

### 2. Per-step transcript replay — "depth for free"
The full agent transcript (URL / action / reasoning per step) is **already stored on every run and currently thrown away in the UI.** Render it as a step-by-step timeline and mark the exact step that flipped the run into its `failure_mode`. A judge watching the agent get stuck in a nav loop at step 4 on IRS.gov is far more convincing than a 20% bar — and it makes the failure labels auditable.

### 3. The Goodhart Exhibit 🔥 — the most memorable demo moment
Author **one throwaway HTML page** that scores *high* on Lighthouse 13.3 Agentic Browsing (declare an `llms.txt`, stub a WebMCP manifest, clean accessibility tree) but hides the real answer behind a JS interaction or consent gate so the agent **fails** it. Run it through both lanes live and plot it as a labeled outlier. ~1 hour (both lanes already take an arbitrary URL), and it turns the abstract "static audits can be gamed" critique into a literal counterexample the judges watched you build.

### 4. Sub-audit attribution — the most quotable Google-track line
Beyond the `lh_total` scatter, split the cohort by pass/fail on each of the 4 sub-audits and show the mean success-rate gap each one buys (with a CI). Produces lines like *"of Google's 4 checks, only accessibility-tree predicted agent success; WebMCP did nothing."* The data is already in `CorrelationPoint`.

### 5. Difficulty residual baseline — defuses the #1 confound
Run the existing `--scripted-only` extraction on each answer page; `full-agent success − extraction-only success` isolates **navigation/agent-readiness** from "is this fact just hard to read." Directly answers the obvious judge question "how do you know it's the site and not the question?" Nearly free — the scripted path already exists.

### 6. Pre-registration receipt
Commit the answer key as a timestamped, git-hashed artifact **before** any run and show the commit hash/time on the correlation page. Turns the thin-n weakness into the project's strongest integrity claim.

---

## 🟡 Post-hackathon — the product roadmap

### Probe API — the wedge everything sits on
`POST /probe {url, task_hint, expected_substring, trials}` → the run document we already produce. **90% built** — just un-hardcode the cohort. Every product idea below is a thin client on this one endpoint.

### Cross-agent replication
Swap Gemini → Claude/GPT behind the *identical* loop to get a second success-rate column. Tests whether Lighthouse predicts **agents in general** or just Gemini — upgrades the claim from "Gemini behaves this way" to "agents behave this way."

### Generational replication — does navigability matter *more or less* as agents improve?
Run the **identical frozen cohort/task/scorer** across the whole **Flash family** (1.5 Flash → 2.0 Flash → 2.5 Flash → Flash-Lite → future Flash) via a single `--model` flag, and compute the Lighthouse↔success correlation **per model generation**. Holding the family constant **isolates one variable — capability over time** — which the cross-provider study can't. The headline question: *as Flash models get smarter, does the static "agent-readiness" rubric predict success more or less?*
- **Correlation decays across generations** → smarter agents power through badly-built sites, so a static readiness rubric is a **moving target that ages out** — a spicy, contrarian finding.
- **Correlation holds** → navigability is a fundamental site property that gates **every** generation → the rubric is **durable**, which validates Google's premise.

The deliverable is a **meta-scatter**: x = model generation, y = predictiveness (correlation strength). One picture answers "is agent-readiness scoring future-proof?" Nearly free to run (shared API/vision/price tier; only `GEMINI_MODEL` varies). Caveat: a model that aces or fails *everything* has no spread → its correlation is undefined, and that ceiling/floor is itself a data point ("this generation is past the discriminating zone"). Pairs naturally with the measure-both `gap` (navigation vs extraction) — you can track whether the **navigation gap's** predictiveness specifically rises or falls per generation.

### Report back to the Lighthouse / Chrome team
Package the sub-audit analysis (per-audit Spearman + CI vs. measured success) as a GitHub issue/discussion on the Lighthouse repo, with our dataset linked. This is the **first external validation of Google's own audit** — the cleanest sponsor-track narrative ("we validated Google's rubric") and reframes us from "cute leaderboard" to "empirical contribution."

### Failure-mode remediation report
Turn the transcript + `failure_mode` into a per-site "here's the exact step the agent got lost, and the fix" card, grounded in *behaviorally observed* failure points. This is the part teams actually pay for — and the defensible differentiator over Lighthouse's generic advice ("the agent literally got stuck on this link," not "consider improving accessibility").

### Lighthouse-for-Agents CI check
A GitHub Action that probes critical URLs on every PR and fails the build if agent `success_rate` drops below a threshold. Same ergonomics as Lighthouse-CI, but the metric is **behavioral** — it catches what the static gate misses.

---

## 🔭 The big vision — AgentRank-Bench

A **canonical, versioned behavioral benchmark for the agentic web** — the "WebArena for live sites." Our frozen `lib/types.ts` contract already *is* the schema; we just need an exporter + a datasheet that pins the agent (`gemini-2.0-flash`), the task template, and the pre-registered scoring rule as the version contract.

Around it:
- **"Submit your site" flywheel** — a `/submit` form takes one cohort row, queues it for the fixed agent, and renders it into the public leaderboard. A benchmark becomes canonical only when sites *want* to be measured (and have incentive to fix their score and re-submit).
- **Behavior-earned badge + API** — `/api/score/[slug]` + an embeddable "Agent-Ready: measured" SVG. Third-party-measured (with a public transcript as proof), unlike a self-run static audit. Positions us as the behavioral ground truth *alongside* Lighthouse, not against it.
- **Longitudinal re-runs** — every batch is dated via `run_at` (already in the contract). Weekly re-scoring turns the one-shot scatter into a time series, and a within-site before/after when a site ships `llms.txt`/WebMCP is the closest we get to a **causal** claim.

> This is the empirical layer Lighthouse 13.3 explicitly refused to build — and our 48-hour scatter is its first data point.
