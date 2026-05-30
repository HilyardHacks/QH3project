# **AgentRank — Execution Framework (v2)**

*A behavioral leaderboard for the agentic web. Scoped for a 48-hour, three-person hackathon. This version supersedes the first draft and bakes in the decisions from the design review: the frozen data contract, pre-registered scoring, cohort-variance de-risking, a named harness decision gate, an explicit cut order, and the on-demand feature as a clearly secondary add.*

---

## **The one-line version**

Google just shipped a checklist for how agent-ready a website is — and explicitly refused to rank sites or prove the checklist predicts anything. We build the leaderboard and run the experiment that tests whether the checklist actually matters, using Google's own model as the test agent.

## **The thesis**

Three things became true in the last month, and the intersection is the opening:

* **Agents are now a real traffic source.** AI crawlers and agent traffic are growing at triple-digit annual rates, on a web that was built for humans clicking buttons, not for agents navigating an accessibility tree.  
* **Google shipped a standard.** Lighthouse 13.3.0 (May 7, 2026\) added the Agentic Browsing audit category as a default audit — checking WebMCP, accessibility-tree quality, layout stability, and llms.txt.  
* **Google deliberately left the validation undone.** They publish pass/fail signals per audit, not a ranked score, and explicitly say the standards are still emerging. Nobody has shown the rubric predicts whether agents can complete real tasks.

**THESIS STATEMENT:**

“We treat Google's rubric as a hypothesis and test it empirically against real agent behavior on real sites. The headline output is a public leaderboard ranked by *measured* agent success, with the Lighthouse static score as a covariate — and a scatter plot showing how much (or how little) the rubric actually predicts.”

---

## **What we ship**

**Core (must exist by Sunday — this is the demo):**

1. **The leaderboard.** 25–50 recognizable sites ranked by how often a Gemini agent completes a fixed task on each. The number is a range on purpose; see *Scope discipline*.  
2. **The correlation chart.** A scatter of Lighthouse Agentic Browsing score (x) vs. behavioral success rate (y). This single chart is the scientific result and the center of the pitch.  
3. **Minimal per-site detail pages.** Lighthouse sub-scores, behavioral success rate, and the dominant failure mode per site. Anything richer is polish, not core.

**Secondary (build only if the core is locked — see *Expansion ladder*):**

4. **"Test your own site" box.** A URL input that returns a live Lighthouse score (always works) and optionally a live agent *trajectory* (works most of the time, framed as experimental, hard-timeout). Explicitly additive — never on the critical path of the demo.  
   ---

   ## **The method, locked**

   ### **The fixed task**

One task type, run on every site: **"Find the page describing the primary product or service offered, and extract one specific factual claim about it."** Same shape across the cohort — Stripe → a price; a DMV → a renewal fee or "REAL ID"; a dentist → a named service.

The task is held constant so the *website* is the unit of analysis. Two caveats the first draft missed:

* The task is not equally hard on every site (informational lookup vs. pricing-page navigation vs. one-page static site). That's acceptable **only if pre-checked.** Every cohort site gets a manual pass before lock (see *The cohort*).  
* If the task turns out too easy across the board (everything succeeds), **make it harder** — require navigating two levels deep, or extracting a more buried fact. Task difficulty is the one behavioral lever we control after the fact.

  ### **Scoring — pre-registered string match (this is non-negotiable)**

Success is **not** decided by eyeballing transcripts. For every site, *before any runs*, we write down the expected answer as a substring. **Success \= the agent's final output contains the pre-registered substring.** Deterministic, fast, reproducible, and it takes the humans out of the loop. A judge *will* ask "how did you score success?" and the answer is "pre-registered exact-match, decided before we saw any agent output."

This is why the manual cohort pass is mandatory: it's the same pass that produces every site's answer string and confirms the task is actually answerable there.

### **The agent and harness**

Gemini via Google AI Studio. Fixed model, fixed prompt, fixed harness. Use the most reliable available browser-agent loop (Google's published browser-use patterns, or a thin Playwright wrapper) and **resist customizing it.** This is the heaviest lane; its owner should be the most comfortable with agent tooling.

### **The runs**

Each (site, task) pair runs **5 times** to get a rate, not a binary. Default 50 sites × 5 \= 250 runs (\~a few hours, parallelizable). Both numbers are levers: drop to 3 trials and/or 25 sites the moment time tightens.

### **The static score**

Shell out to the official Lighthouse CLI with the Agentic Browsing category enabled. Parse the JSON. **Reimplement nothing** — the static layer is Google's, and saying so early is part of the pitch (see *Risk register*).

### **The output, per site**

Lighthouse total \+ sub-scores, behavioral success rate, mean step count, dominant failure mode. Per cohort: the static-vs-behavioral correlation and a rank-ordering of which sub-audits actually predict success.

---

## **The data contract (the real deliverable of hour one)**

The first draft called the three lanes independent. They are not — all three read and write one database, and **no schema was specified.** That gap is where hackathon weekends die: three people build for 30 hours against three different mental models, then lose Saturday night to integration.

**Fix:** in the first 60 minutes, all three people agree on the schema below, freeze it, and write three fake rows by hand. Lane 3 builds the entire frontend against the fake rows. Lanes 1 and 2 fill them in. The contract *is* the schema plus the agreed `failure_mode` values.

A minimal three-table shape (denormalize freely; Firestore collections are fine):

**`sites`** — pre-registered config, written by hand before any runs:

* `site_id` (slug, e.g. `stripe`)  
* `name` (display)  
* `url` (start URL)  
* `answer_substring` (the pre-registered expected answer, for scoring)  
* `answer_note` (what the answer is, for humans)

**`lighthouse`** — one row per site, deterministic, no model calls:

* `site_id`  
* `lh_total` (Agentic Browsing category score, 0–100 or 0–1)  
* `lh_accessibility_tree`, `lh_layout_stability`, `lh_llms_txt`, `lh_webmcp` (per-audit, pass/fail or 0–1)  
* `screenshot_path` (optional)

**`runs`** — one row per trial:

* `site_id`  
* `trial_number` (1..N)  
* `success` (bool — did output contain `answer_substring`)  
* `step_count`  
* `duration_seconds`  
* `failure_mode` (agreed enum below)  
* `transcript` (stored always; rendered in UI only if time permits)

**Agreed `failure_mode` values** (Lane 2 emits these, Lane 3 displays them — agree the list now): `success`, `blocked` (anti-bot / login wall), `timeout`, `wrong_extraction` (navigated fine, wrong/no answer), `navigation_stuck` (couldn't find the path), `error` (harness/technical).

The leaderboard is a query/view over these: per `site_id`, `success_rate = mean(success)`, `mean_steps`, `top_failure_mode`, joined to `lh_total`.

---

## **Architecture — three lanes, now genuinely independent**

The lanes are only independent *because* the contract above exists. With it frozen, cross-blocking is minimal.

**Lane 1 — Crawler & static scorer.** Takes a URL, runs the Lighthouse CLI with Agentic Browsing enabled, parses JSON, writes a `lighthouse` row. Optionally grabs a screenshot. Fully deterministic, no model calls, fast to iterate, **de-risk-able Friday night.**

**Lane 2 — Behavioral agent harness.** Takes a (site, task) pair, runs the Gemini browser agent, scores against `answer_substring`, writes a `runs` row with success/steps/duration/failure\_mode/transcript. The heaviest and flakiest lane — owned by whoever is best with agent tooling.

**Lane 3 — Leaderboard front end.** Next.js/React reading the DB. `/` \= ranked leaderboard, `/site/:domain` \= detail page, `/correlation` \= scatter \+ "which sub-audits matter" analysis. Deploy on Firebase Hosting or Cloud Run for the Google-track story; custom `.tech` domain on top. Builds entirely against fake rows until real data lands.

**Database:** Firestore — path of least resistance for Google-track eligibility, free tier.

---

## **The cohort — pick for variance, not just fame**

The leaderboard is only striking if there's real spread. Variance behaves differently on the two axes:

**Behavioral variance (the y-axis) is likely to be large — if you seed the low end deliberately.** A Gemini agent will genuinely behave differently on Stripe than on a creaky county DMV portal than on a dentist's Wix one-pager. But if you pick 50 competently-built modern web apps, they may *all* score high and you have no contrast. So deliberately seed the bottom with legacy government sites, small-business sites, and anything you expect to trap an agent on a consent wall or a clunky search box.

**Lighthouse variance (the x-axis) is the real risk.** Two mechanisms to watch:

* llms.txt and WebMCP are three weeks old — **almost nobody has adopted them**, so those sub-audits may be all-fail (no signal).  
* Accessibility-tree quality and layout stability overlap with ordinary accessibility/performance hygiene, which many competent sites get incidentally right. So Lighthouse totals can cluster in a narrow band rather than spreading cleanly.

If the x-axis clusters, the scatter is a vertical smear and the correlation is weak. **But a weak correlation is not a failed result** — "Google shipped a rubric and it barely predicts real agent success" is arguably a *stronger* pitch than "the rubric works." The construct-validity framing protects us either way. What we cannot afford is *discovering* a flat correlation Sunday morning.

**The de-risk (Friday night, cheap):** Lane 1 is deterministic and fast, so run \~50–60 candidate sites through the Lighthouse CLI *before locking the cohort* and look at the distribution. If totals cluster, swap in worse sites until there's a real low end. Inspect the sub-audits individually — if llms.txt/WebMCP are 0% across the board (likely), we already know the predictive sub-audits will be accessibility-tree and layout stability, and we know our "which sub-audit matters" story in advance.

**When forced to choose, bias the cohort toward Lighthouse spread,** because that's the axis we *cannot* tune after the fact. Behavioral spread we can fix by adjusting task difficulty; Lighthouse scores are what they are per site.

---

## **Risk register — with named decision gates**

**1\. Lane integration (project-killing).** Mitigated entirely by the frozen schema \+ fake rows in hour one. No further action if that's done.

**2\. The behavioral harness eats the weekend (high — the doc's own flagged risk).** The stated fallback ("fewer sites, fewer trials") addresses *volume*, not the actual failure mode, which is *the agent loop being flaky*. The real fallback is **reducing agent autonomy, not site count**: if a general browser agent can't complete tasks reliably, drop to **scripted Playwright navigation per site, with Gemini doing only the extraction step** from the final page. We lose some "agent navigates autonomously" story but keep a real, scoreable behavioral result and the correlation chart.

**DECISION GATE — Saturday 6:00pm:** if the harness is not reliably completing the task on the 5 test sites, switch to scripted-navigation \+ Gemini-extraction. Named time, named alternative. Do not negotiate with a flaky agent past Saturday night.

**3\. Some sites block us (low–medium).** Cloudflare/login/rate limits. Reframe as a finding — *"anti-bot defenses are themselves a major agent-readability factor"* — not a project-killer. Threshold: keep blocked-as-finding sites to **≤5**; beyond that it's noise, so swap them out during the manual pass.

**4\. Flat correlation (medium).** Covered above — knowable Friday night, and presentable as a finding if framed early. The mitigation is *knowing which story you're telling by Saturday morning.*

**5\. Judges pattern-match to existing static scorers (AgentScore / SoberAI).** In the **first 30 seconds**, state plainly: the static layer is Google's, not ours; our contribution is the *behavioral validation.* That distinction must land early or the whole project gets misread.

---

## **Scope discipline**

**In scope:** one task type, run 5× per site; one agent (Gemini), one harness, one prompt; one static-score source (Lighthouse CLI, unmodified); a static leaderboard regenerated on demand, not real-time.

**Out of scope (stay out):** multiple task types; multiple agents in the *core* (the teaser in *Expansion* is capped); real-time re-scoring; reimplementing any Lighthouse audit.

**Cut order — drop from the top as you fall behind:**

1. **Rendered agent transcripts in the UI.** Log them always (cheap); building a pretty trajectory view is a time sink for little demo value. Show step-count \+ failure-mode instead.  
2. **Rich per-site detail pages.** The minimal version (sub-scores \+ success rate \+ one failure tag) is enough. Polish is Sunday-morning-only.  
3. **Page screenshots.** Adds a moving part to Lane 1 for marginal value. Cut without hesitation if Lane 1 runs late.  
4. **5 trials → 3\.** Still a rate, not a binary. Low-regret lever; pull the moment compute or harness time gets tight.  
5. **50 sites → 25–30.** The correlation holds at n≈25 if the spread is good, and every extra site is another chance to hit a blocker. **Fewer, more-discriminating sites demo better and risk less.** 50 named sites *sounds* more impressive; 25 with a clean contrast *is* more impressive.

**Never cut:** the correlation chart (it's the thesis), the pre-registered string-match scoring (it's the credibility), and Lighthouse-score spread in the cohort (it's whether there's a result at all).

---

## **Expansion ladder — within the weekend only**

If the core ships early, spend the surplus on pitch leverage, in this order:

1. **A rehearsed "surprising result" pair (highest leverage, nearly free).** Find the one site with a high Lighthouse score but low behavioral success (or vice versa) and build a 30-second narrative around it: *"Google's rubric says this site is agent-ready. Watch what actually happens."* One concrete, rehearsed counterexample beats ten more sites.  
2. **Rank-order which sub-audits predict success.** The most quotable scientific output — *"of Google's four checks, only accessibility-tree quality predicted whether the agent succeeded; WebMCP presence didn't matter at all."* Small amount of analysis on data we already have.  
3. **The "test your own site" box.** URL in → instant Lighthouse score (always works) → optional live agent *trajectory*, not a scored pass/fail (arbitrary sites have no pre-registered answer, so we show navigation behavior, not success). **Hard 60–90s timeout** with a graceful "didn't finish — here's how far it got." Mostly a thin frontend wrapper on the Lane-1/Lane-2 worker that already exists. Green-light only once the rehearsed leaderboard demo is untouchable.  
4. **One second-agent teaser (strictly last).** Run the *same task on 3–5 sites* with Claude or GPT and show a single bar: *"the rubric's predictive power isn't even consistent across agents."* Caps the "future work" beat without metastasizing. Only if everything above is locked.  
   ---

   ## **The pitch (2 minutes)**

**Framing:** *"Everyone at this hackathon is building an agent. We tested whether the web is ready for them. Google shipped the checklist — we ran the experiment."*

**Beats:**

* Lighthouse added Agentic Browsing as a default audit three weeks ago.  
* Google explicitly didn't rank sites or validate the rubric.  
* We did both — on named sites people recognize, with Gemini (Google's own model) as the test agent.  
* Headline: a leaderboard **plus** a correlation chart showing which parts of Google's new standard actually matter for real agent success.

**The screenshot that sells itself:** the leaderboard (Stripe \~92%, the DMV \~18%) beside the scatter showing Lighthouse explains only part of that variance. One slide, whole pitch.

**Demo script:** open on the leaderboard → click into the rehearsed surprising entry (high static / low behavioral) → close on the correlation chart and the one-line sub-audit finding.

---

## **Phase plan (ordered by what most protects a working Sunday demo)**

**Friday, hour 0–1 — all three together:** freeze the schema, agree the `failure_mode` enum, write 3 fake rows. *Nothing else starts first.*

**Friday evening — parallel:**

* *Lane 1 owner:* run \~50–60 candidate sites through the Lighthouse CLI; inspect the distribution; lock the cohort for **score spread \+ name recognition.**  
* *One person:* manual cohort pass — do the task on every candidate, record each `answer_substring`, flag/swap any site that blocks you or answers in one click.  
* *Lane 3 owner:* build the leaderboard, detail, and correlation pages against the fake rows.

**Friday night — Lane 2 owner:** get the harness completing the task **end-to-end on 5 test sites**, even ugly. Prove the loop before scaling.

**Saturday morning:** cohort locked, scoring locked, correlation story (strong vs. weak) known. Begin full runs.

**Saturday 6:00pm — DECISION GATE:** harness reliable on the 5 test sites? If not → scripted-navigation \+ Gemini-extraction.

**Saturday:** full cohort runs (drop to 3 trials / 25 sites the moment it's tight); wire leaderboard \+ correlation to real data. **Core demo should be rehearsable by Saturday night.**

**Sunday AM:** find \+ rehearse the surprising site; add the sub-audit finding line; minimal polish. *Only if core is untouchable:* the on-demand box, then the second-agent teaser.

**Sunday:** rehearse the 2-minute pitch; lock slides.

---

## **Definition of done (by Sunday)**

* Leaderboard live at a `.tech` domain, 25–50 sites ranked by behavioral success.  
* Minimal per-site detail pages (Lighthouse sub-scores \+ success rate \+ dominant failure mode).  
* Correlation page: scatter \+ a short, honest writeup of which sub-audits best predict behavioral success.  
* A rehearsed 2-minute demo that opens on the leaderboard, clicks a surprising entry, and closes on the correlation chart.  
* Scoring is pre-registered and reproducible, and we can say so in one sentence.  
  ---

  ## **The one mistake to not repeat**

The first draft's plan called the three lanes independent while coupling them through an unspecified database. They become independent *only* once the schema is frozen and fake rows exist. Treat the schema as the deliverable of hour one, and the rest of this plan holds.

---

## **How this differentiates from what already exists**

A judge *will* ask "doesn't this already exist?" There are two distinct neighborhoods of prior work, and AgentRank sits in the unoccupied gap between them. The differentiation only lands if we name both precisely — vagueness here reads as not having done the homework.

### **Neighborhood 1 — Static agent-readiness scanners**

These inspect a site's structure and output a 0–100 readiness score. They never run an agent. As of mid-2026 there are at least five:

* **Google Lighthouse (Agentic Browsing audit).** The static layer we actually use. Inspects accessibility-tree quality, layout stability, llms.txt, WebMCP. Publishes pass/fail per audit; explicitly declines to rank sites or validate that the rubric predicts real task completion.  
* **Cloudflare Agent Readiness Score (isitagentready.com).** The most recognizable incumbent — free, public, launched April 2026, backed by a weekly-updated Cloudflare Radar adoption dataset, exposed via the URL Scanner API. Scores four dimensions (discoverability, content accessibility, bot access control, protocol discovery) and returns remediation prompts. This is the name to address in the first 30 seconds, because it's the one with brand weight.  
* **AgentScore (agentscore.site), GEO Metrics Agent Readiness Score, Fern's agent-score.** Smaller static scanners in the same category — crawlability, structure, technical SEO, documentation-site readiness. Same shape: inspect, score, suggest fixes.

**Why we're different from all of them:** every one of these is a *static, predictive proxy*. They ask "does this site have the signals an agent should need?" None runs a real agent through a real task and measures whether it succeeds. That measured-behavior axis is the one they structurally do not have. Critically, **their own critics already make our case** — the most-shared analyses of Cloudflare's score warn that it's "structurally misleading if you stop at the composite number" and invoke Goodhart's law: a site can ship a WebMCP tool that does nothing, pass the check, raise its score, and change nothing for real agents. The gap between "passes the rubric" and "an agent can actually use it" is exactly the gap nobody has measured. We don't compete with these tools — **their score is one axis of our chart.**

### **Neighborhood 2 — Agent benchmarks**

These *do* run agents through real tasks and measure completion — but they're built to answer a different question:

* **WebArena (CMU).** Self-contained replicas of real web apps (e-commerce, Reddit, GitLab, CMS); success \= agent achieves the final goal.  
* **TAU-bench (Sierra).** Customer-service domains with an LLM-simulated user and policy documents the agent must follow; introduced the pass^k metric for measuring success across repeated trials.  
* **OSWorld / OSWorld-style computer-use benchmarks.** Agents on real computer tasks across operating systems; the source of the widely-cited "12% → 66% in one year" figure.

**Why we're different from all of them:** every one of these **holds the website constant and varies the agent.** The site (or its replica) is the fixed test environment, and the thing being scored is the *model*. Their output is a *leaderboard of agents* — a statement about which models are getting better on a fixed substrate. **AgentRank inverts the axes: we hold the agent constant (one Gemini, one prompt, one harness) and vary the website, so the thing being scored is the *site*.** Nobody is producing a leaderboard of *websites* ranked by measured agent success. That inversion is the contribution.

The one-sentence answer to "isn't this WebArena?": *"WebArena scores agents on a fixed site; we score sites with a fixed agent. The website is our unit of analysis, not the model."*

### **The gap itself — the join nobody has made**

The two neighborhoods have never been connected. The static scanners predict agent-readiness and never run an agent. The agent benchmarks measure real success and never check it against a static readiness score. **AgentRank is the join:** static readiness score (Lighthouse, optionally Cloudflare) on the x-axis, measured behavioral success on the y-axis, and the correlation between them in the middle. That specific plot — does the static rubric actually predict real agent success, across real named sites — exists in neither literature.

This isn't a speculative gap. The "benchmark score doesn't predict real-world outcome" pattern is already well-documented for agents generally: enterprise agentic systems show a \~37% gap between lab benchmark scores and real-world deployment, and the same year agents hit 66% lab success, \~89% of enterprise agent projects never reached production. We're running the specific, untested version of that established pattern — *static readiness score vs. real navigation* — in the one place no one has looked.

### **The defensible one-liner**

*"There are now half a dozen tools that score your site for agent-readiness, and a whole field of benchmarks that score agents on fixed sites. Nobody has scored **sites** by **measured** agent success, or checked whether the readiness scores predict it. The static scanners are one axis of our chart; the behavioral measurement is the axis they don't have; and the correlation between them is the experiment Google — and everyone else — left undone."*

### **Caveat — verify the day before**

This landscape is moving weekly, and "AgentScore" specifically is a crowded, ambiguous name (at least three unrelated products use it). Re-run this scan the day before presenting — a new entrant or a Cloudflare update could change which name a judge has in their head. The *structural* point is stable and won't move: **the scanners are static, we're behavioral, the benchmarks vary the agent while we vary the site, and the join between static-score and measured-success is empty.** That's the moat for a weekend.

* 

