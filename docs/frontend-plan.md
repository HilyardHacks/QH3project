# AgentRank — Frontend Plan & Handoff

> **Purpose:** a self-contained brief so a *fresh* chat can do the frontend work without the
> originating conversation. Read this top-to-bottom, then read the "Files to read first" list.
> Everything you need — the design spec, the reference-site teardown (with observed specifics),
> the data contract, and pickup steps — is here.

---

## 0. How to use this doc (for the next chat)
You are improving the frontend of **AgentRank**, a Next.js 14 + Recharts + Tailwind site.
1. Read §1–§3 for context, §4 for the codebase map.
2. The work is §5 (the design spec) — 14 concrete moves, prioritized, each with a Recharts/Tailwind how-to.
3. §6 lists the small data-plumbing changes some moves need.
4. §7 has visual references (open these live).
5. §8 = sequencing + an integrity caveat you must respect.
6. Start with the "Suggested first PR" in §10.

---

## 1. What AgentRank is (60 seconds)
We test whether Google's **Lighthouse 13.3 "Agentic Browsing"** static audit predicts whether a real
AI agent can actually use a site. We rank ~27 named websites by how often a **fixed Gemini browser
agent** completes a fixed task, with the Lighthouse score as a covariate.
- **x-axis** = Lighthouse Agentic Browsing score (0–100), scored on each site's **homepage**.
- **y-axis** = the agent's **navigation success rate** (fraction of trials it found the answer).
- **The headline is a scatter of x vs y**, and **the finding is contrarian/null**: the static rubric
  barely predicts real agent success. The story lives in the **off-diagonal outliers**.

## 2. The current finding (real data, in Firestore now)
- **n = 27 · Pearson r = −0.14 · Spearman ρ = −0.11 · 95% CI [−0.48, 0.29].** No detectable relationship.
- **Off-diagonal (the demo gold):**
  - *High Lighthouse, 0% success:* `tx_dmv` (100), `ssa` (100), `portland` (100), `voodoo` (100) — genuine `navigation_stuck`/`timeout`.
  - *Low Lighthouse, ~100% success:* `bear` (12), `craigslist` (24), `innout` (28), `spotify` (29), `powells` (3→80%).
  - `costco` (98) fails at 0% but that's a **transport error** (`net::ERR_HTTP2_PROTOCOL_ERROR`), not behavioral — annotate, don't headline it.
- **Best single sub-audit:** `llms.txt` (r≈0.51 vs success); the other three (a11y tree, layout stability, WebMCP) ≈0.
- **Caveat that shapes the UI:** the y-axis is currently **near-binary** (most sites are 0/5 or 5/5; only `powells` is 4/5) because the agent is near-deterministic at temp 0 with one task per site. **A cohort expansion to 3 questions/site (easy/medium/hard) is in progress** and will give the scatter real vertical spread — see `docs/cohort-expansion-brief.md`.

## 3. Data state
Live Firestore (`agentrank-quackhacks`) holds: `sites=27`, `lighthouse=27`, `runs=135` (27×5 nav),
`runs_extraction=135`. The frontend reads REAL data when `GOOGLE_APPLICATION_CREDENTIALS` or
`FIREBASE_SERVICE_ACCOUNT_JSON` is set (it is, via `.env.local`). `npm run dev` / `npm run build`
log `[AgentRank] data mode: REAL`.

---

## 4. Codebase map — files to read first
- `components/CorrelationChart.tsx` — **the centerpiece scatter** (Recharts `ScatterChart`, a `CustomDot`, a trend `ReferenceLine`, a `CustomTooltip`; axes hard-coded `domain={[0,100]}` / `[0,1]`; **labels every point** today).
- `app/correlation/page.tsx` — computes `r`, `rho`, `ci`, `n`, sub-audit correlations, and the auto-"surprising" pick; renders `<CorrelationChart>`.
- `lib/queries.ts` — `getLeaderboard()`, `getSiteDetail()`, `getCorrelationPoints()`, and the stats fns (`pearsonR`, `spearmanRho`, `bootstrapCI`, `linearRegression`). **Reuse these — don't reinvent the math.**
- `lib/types.ts` — the frozen contract. `SiteLeaderboardEntry` already has `rank, success_rate, trial_count, mean_steps, top_failure_mode, lh_total, lh_*` sub-audits. `CorrelationPoint` currently has only `site_id, name, lh_total, success_rate, lh_*` (see §6).
- `app/page.tsx` — the leaderboard. `app/site/[slug]/page.tsx` — per-site detail (has `runs` with `transcript`).
- Stack: Next.js 14 App Router (server components), Recharts, Tailwind. Charts must be `"use client"`.

---

## 5. The design spec — 14 moves (prioritized)
Distilled from a live teardown of **Artificial Analysis**, **Our World in Data**, and eval
leaderboards (**SWE-bench / LMArena / HF Open LLM**). All three converged on: *make the absence of a
trend and the outliers visually self-evident.*

### A. The reframe (cheapest, highest impact)
**1. Title-as-claim.** A DOM `<h1>` above the chart asserting the finding ("Google's rubric barely
predicts agent success — ρ = −0.11, n = 27"), `text-sm text-slate-500` stats subtitle. (OWID pattern.)

**2. Shade the two "surprise" quadrants.** Split at the medians; tint the contrarian corners.
```tsx
<ReferenceArea x1={0} x2={50} y1={0.6} y2={1} fill="#34d399" fillOpacity={0.08}
  label={{ value:"Lighthouse under-predicts", position:"insideTopLeft", fill:"#059669", fontSize:11 }} />
<ReferenceArea x1={70} x2={100} y1={0} y2={0.4} fill="#f87171" fillOpacity={0.08}
  label={{ value:"Lighthouse over-predicts", position:"insideBottomRight", fill:"#dc2626", fontSize:11 }} />
<ReferenceLine x={medianLh} stroke="#cbd5e1" strokeDasharray="4 4" />
<ReferenceLine y={medianSuccess} stroke="#cbd5e1" strokeDasharray="4 4" />
```
Demote the existing trend line to a faint dashed guide (`stroke="#bbb"`). (AA "most attractive quadrant" + OWID.)

### B. Scatter (`CorrelationChart.tsx`)
**3. Color dots by dominant failure mode** (turns the scatter into a second readout — *why* high-LH sites fail). Replace the success-threshold coloring in `CustomDot`:
```ts
const FAIL_COLORS = { success:'#10b981', blocked:'#64748b', timeout:'#f59e0b',
  wrong_extraction:'#8b5cf6', navigation_stuck:'#fb923c', error:'#ef4444' };
```
Add a clickable chip legend (Tailwind pills) that **dims** non-matching dots (`fillOpacity 0.15`) rather than removing them. Needs `top_failure_mode` on the point (§6). (AA + OWID.)

**4. Label only the outliers, with a text-halo.** Stop labeling all 27 (current overlap mush). Label only quadrant-outliers + top/bottom-3; render two stacked `<text>` at the same x/y — a `stroke="#fff" strokeWidth={3} paintOrder="stroke"` underlay + a colored fill on top — so names stay legible. Others are hover-only. (OWID halo technique.)

**5. Focus-a-few / fade-the-rest** (OWID's signature). Default-focus the named outliers, grey-wash the rest; click to refocus; sync to `?focus=tx_dmv~bear` via `useSearchParams` so framings are shareable.
```ts
const dim = focused.size > 0 && !focused.has(d.site_id);
// fillOpacity={dim?0.12:0.9}; render label only when !dim; style={{transition:'opacity 120ms'}}
```

**6. Residual-rich tooltip.** Beyond name/LH/success%, show the **per-point residual** (the punchline):
`const delta = Math.round((d.success_rate - (slope*d.lh_total+intercept))*100)` → "**+38 pts vs Lighthouse prediction**" (green/red), plus a failure-mode swatch and `n` trials. Set `cursor={{strokeDasharray:'3 3'}}`. (AA + OWID card tooltip.)

**7. CI error bars + crop axes.** Add vertical Wilson-CI bars (`<ErrorBar dataKey="ciError" direction="y" />`) so small-n uncertainty is visible. Replace hard `[0,100]`/`[0,1]` with a **padded data range** so a clustered cloud isn't squished:
```ts
const lhDomain=[Math.max(0,Math.floor((Math.min(...xs)-5)/5)*5), Math.min(100,Math.ceil((Math.max(...xs)+5)/5)*5)];
```
(LMArena CI + AA cropped, unit-formatted axes.)

### C. Leaderboard (`app/page.tsx`)
**8. Inline success bar + value, diverging color.** A `h-2` track with a width-`%` fill colored green/amber/red. Render the Lighthouse column with the *same* component so the eye sees, row by row, that they don't track. (SWE-bench/HF.)

**9. Score ± Wilson CI + n** ("never a bare number"). `60% ± 18 (n=5)` in muted text. Compute a Wilson interval client-side from successes/trials (no dep). (LMArena.)

**10. Click-to-sort + "watch it scramble" + facet filters.** Make the table a client component with `sortKey`/`sortDir`. The killer interaction: let a skeptic re-sort by Lighthouse vs by success and *see the order scramble*. Add failure-mode pill filters + a "High Lighthouse, Low Success" quick filter (`lh_total>=70 && success_rate<0.5`). Keep filter state in `searchParams` (shareable). (SWE-bench/LMArena/HF.)

**11. Polish:** sticky site column (`sticky left-0 bg-white`) + favicon (`https://www.google.com/s2/favicons?domain=${url}&sz=32`), 🥇🥈🥉 medals, **tie-aware ranks** (sites whose CIs overlap share a rank — honest about indistinguishability), and a per-trial **dot-strip** (`🟩🟩🟥🟩🟥`) so 3/5 vs 5/5 flakiness shows. (SWE-bench + LMArena.)

### D. Detail page & credibility
**12. `/site/[slug]`:** render the stored `transcript` as a per-trial accordion (✓/✗, `step_count`, `duration_seconds`, failure-mode badge) + Lighthouse sub-audit ✓/✗ chips. This is your SWE-bench "logs + trajs" — the receipts that sell a contrarian claim.

**13. `/methodology` page** (the credibility payload — the "Leaderboard Illusion" lesson is that leaderboards win/lose trust on disclosed methodology): the **pre-registered scoring rule** in a `<code>` block + the date frozen; the **frozen-harness params** table (model / prompt / `MAX_STEPS=20` / `TIMEOUT=120` / viewport); a plain-English glossary of each `FailureMode`; and an owned **Limitations** paragraph (small n, single agent, single task). Source content: the freeze banner in `scripts/lane2-agent.py` + `PREREG.md`. Link it from every ⓘ tooltip.

### E. Demo/share
**14. Download-chart-as-PNG** (`html-to-image`'s `toPng` on the chart ref) + **copy-link** — judges screenshot the headline chart. (AA per-chart toolbar.)

---

## 6. Data-plumbing changes some moves need
- **Add `top_failure_mode` + `trial_count` (+ optional `ci_low/ci_high`) to `CorrelationPoint`** (`lib/types.ts`) and populate them in `getCorrelationPoints()` (`lib/queries.ts`) — they already exist on `SiteLeaderboardEntry`, just aren't carried through. Needed by moves 3, 6, 7.
- **Wilson CI helper** (small pure fn) for moves 7 & 9 — binomial CI from `(successes, trials)`. Don't reuse the scatter's bootstrap for per-site proportions.
- Pass `slope`/`intercept` (already computed in `app/correlation/page.tsx`) into the tooltip for the residual (move 6).

---

## 7. Visual references (open these live)
Distilled observations from the teardown — open each and replicate the specifics.

- **Artificial Analysis — `artificialanalysis.ai/models`** (the Intelligence-vs-Price scatter). *Steal:* the translucent "most attractive quadrant" rect (observed `rgba(144,238,144,0.25)`), per-point category colors, **cropped, unit-formatted axes** (their Intelligence axis runs 20→75, not 0→100), inline labels on only the notable points, and the per-chart toolbar (download-image, copy-link, x-axis tab switcher). The scatter is custom SVG; their bar charts use Recharts.
- **Our World in Data — `ourworldindata.org/grapher/life-expectancy-vs-gdp-per-capita`**. *Steal:* **title-as-claim with year**, **direct on-point labels with a white text-halo** (labels rendered twice — stroke underlay + colored fill), **categorical color + clickable legend**, **bubble size = a 3rd metric** (`<ZAxis>` area scaling, clamped min radius), the **focus-a-few/fade-the-rest** interaction (selection persists in the URL), and a **multi-row card tooltip** with units per row.
- **SWE-bench — `swebench.com`** (+ its repo `github.com/SWE-bench/swe-bench.github.io`). *Steal:* the per-entry schema (verified ✓, oss badge, date, org logo, **logs/trajs links**, warning), 🥇🥈🥉 medals, 🆕 badge, click-to-sort, benchmark tabs.
- **LMArena — `lmarena.ai/leaderboard`**. *Steal:* **Score ± 95% CI + vote count as a triple**, the **"Rank (UB)" tie-aware rank** (overlapping CIs ⇒ same rank), category tabs.
- **HF Open LLM Leaderboard — `huggingface.co/spaces/open-llm-leaderboard/open_llm_leaderboard`** (+ its About page). *Steal:* the **methodology/About page** (each metric defined + a reproduce command), model-type icon legend, 📄 per-model drill-down, "Flagged" handling, column-visibility toggles.
- **Build-it kits:** Tremor (`tremor.so`), shadcn/ui charts, Recharts examples gallery, Observable Plot / Nivo for richer annotation patterns.

*(Want actual PNG screenshots checked into `docs/frontend-refs/`? Ask and they can be captured — they weren't included here to keep the handoff text-durable.)*

---

## 8. Sequencing + integrity caveat
- **Pays off on current data:** the reframe (1–2), selective labels (4), failure-mode color (3), residual tooltip (6), the whole leaderboard set (8–11), methodology (13), detail page (12).
- **Lands fully after the 3-question cohort expansion** (more y-spread): focus-fade (5) and error bars (7) get dramatically better.
- **⚠️ Integrity:** quadrant shading + axis cropping can *dramatize*. Keep the printed **r / ρ / CI / n** as the honest anchor, and don't crop so hard you manufacture a slope. The null result **is** the finding — represent it clearly, don't fish for a correlation.

---

## 9. Vibe-coding tips (carried over)
- **Prompt with pictures, not adjectives** — paste a screenshot of the target + current state, ask for the diff.
- **Start from a kit (Tremor/shadcn) + a stolen layout**, not raw `<div>`s — polish is mostly inherited.
- **Lock design tokens once** (5-color palette, one type scale, one radius/shadow, spacing scale) in `tailwind.config`.
- **One hero done great** — the scatter is the money shot; everything else supports it.
- **Tiny reversible steps, commit often, scope each prompt to one component** ("only touch CorrelationChart").
- **Sweat the unglamorous states** — loading/empty/error/mobile; this is what reads as "shipped."
- **Numbers:** `tabular-nums`, fixed decimals, units, right-align in tables.
- **Run Lighthouse on your own site** (meta) as a free polish/contrast pass.

---

## 10. Suggested first PR
Do the **scatter overhaul** (moves 1–6) in `CorrelationChart.tsx` + the §6 plumbing — it's the
centerpiece, the data already supports it, and it's self-contained. Then the **leaderboard set
(8–11)**, then the **`/methodology` page (13)**. Keep `npm run build` green (`data mode: REAL`) after each.

> Sibling docs: `docs/cohort-expansion-brief.md` (the 3-questions-per-site sourcing task) and
> `docs/lane2-status.md` (data pipeline / harness status).
