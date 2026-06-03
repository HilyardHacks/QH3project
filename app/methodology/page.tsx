import Link from "next/link";
import type { FailureMode } from "@/lib/types";
import { FAILURE_MODES, FAILURE_MODE_META } from "@/lib/failure-modes";

// Static credibility page (move 13). NO lib/queries import → no Firestore read, safe in both
// REAL and FAKE data modes. Every frozen value below is sourced from scripts/lane2-agent.py
// (authoritative harness) and PREREG.md; see the per-section notes. No per-site answer values
// appear here — those live only on the detail page.

export const metadata = {
  title: "Methodology — AgentRank",
  description:
    "The pre-registered scoring rule, frozen harness configuration, failure-mode taxonomy, exclusion rule, and owned limitations behind AgentRank.",
};

// Plain-English failure-mode meanings (PREREG §4 + lib/types.ts comments). Color/label/emoji
// come from the single FAILURE_MODE_META so chips never diverge from the rest of the site.
const FAILURE_MEANINGS: Record<FailureMode, string> = {
  success: "The agent's final answer contained the site's pre-registered answer substring.",
  blocked:
    "Anti-bot wall, login, or CAPTCHA — the agent could not engage the task. Excluded from the readiness signal (see §4).",
  timeout: "Hit the wall-clock limit (TIMEOUT_SECONDS = 120s).",
  wrong_extraction: "Navigated fine but reported the wrong answer, or none.",
  navigation_stuck:
    "Couldn't find the path — the step budget was exhausted, or the 3-identical-actions loop-breaker fired.",
  error:
    "Harness / technical failure (API or JSON error, page-load failure, empty answer key). Excluded from the readiness signal (see §4).",
};

const HARNESS_PARAMS: { k: string; v: string }[] = [
  { k: "Model", v: "gemini-2.0-flash" },
  { k: "Max steps", v: "20" },
  { k: "Wall-clock timeout", v: "120 s" },
  { k: "Trials per site", v: "5 (default)" },
  { k: "Temperature", v: "0" },
  { k: "Max output tokens", v: "256" },
  { k: "Response format", v: "JSON (application/json)" },
  { k: "Viewport", v: "1280 × 800 (headless Chromium)" },
  { k: "Per-action timeouts", v: "goto 30s · navigate 20s · click/type 5s · load 10s" },
  { k: "Loop-breaker", v: "3 identical non-scroll actions → navigation_stuck" },
];

const TASK_TEMPLATE = `Find the page describing the primary product or service offered by this website, and extract one specific factual claim about it. {task_hint}`;

const SYSTEM_PROMPT = `You are an agent browsing a website to complete a task.
You will be given a screenshot of the current page, the page URL, title, and a text excerpt.

Decide the SINGLE BEST next action. Reply with ONLY valid JSON — no markdown, no extra text.

Available actions:
  {"action": "click",    "selector": "<CSS selector or visible text>", "reasoning": "..."}
  {"action": "type",     "selector": "<CSS selector>", "text": "<text to type>", "reasoning": "..."}
  {"action": "scroll",   "direction": "down", "reasoning": "..."}
  {"action": "navigate", "url": "<full URL>", "reasoning": "..."}
  {"action": "done",     "answer": "<your extracted answer>", "reasoning": "..."}

Rules:
- Use "done" as soon as you have found the specific factual answer requested.
- If you are blocked (login wall, CAPTCHA, anti-bot) use "done" with answer="BLOCKED".
- If you cannot find the answer after many steps, use "done" with whatever you found.
- Prefer clicking visible links/buttons over typing in search boxes.
- Keep "selector" short and likely to be unique on the page.`;

function Section({
  id,
  n,
  title,
  children,
}: {
  id: string;
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 bg-white rounded-xl border border-slate-200 p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-3">
        <span className="text-slate-400 font-mono mr-2">{n}</span>
        {title}
      </h2>
      <div className="space-y-3 text-sm text-slate-600 leading-relaxed">{children}</div>
    </section>
  );
}

function Pre({ children }: { children: string }) {
  return (
    <pre className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs font-mono text-slate-700 overflow-x-auto whitespace-pre-wrap">
      {children}
    </pre>
  );
}

export default function MethodologyPage() {
  return (
    <div className="max-w-3xl">
      <div className="mb-6">
        <Link href="/" className="text-sm text-slate-400 hover:text-slate-600 transition-colors">
          ← Leaderboard
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Methodology</h1>
        <p className="text-sm text-slate-500">
          The disclosed-method contract behind AgentRank — the scoring rule, the frozen agent
          harness, the failure taxonomy, what we exclude, and what we don&apos;t claim.
        </p>
      </div>

      {/* Integrity stance — the dark callout pattern reused from /correlation. */}
      <div className="bg-slate-900 text-white rounded-xl p-6 mb-6">
        <h2 className="font-semibold text-slate-200 mb-2 text-sm uppercase tracking-wide">
          Why this page exists
        </h2>
        <p className="text-sm leading-relaxed text-slate-200">
          AgentRank reports a <span className="font-semibold text-white">contrarian, near-null</span>{" "}
          result: Google&apos;s static Agentic-Browsing rubric barely predicts whether a real agent
          can use a site. A null is only believable if the instrument was{" "}
          <span className="font-semibold text-white">fixed and disclosed before the data existed</span>.
          So the scoring rule and every answer key were pre-registered and committed first, the agent
          harness is git-frozen, and everything that shapes the measurement is on this page. The live
          correlation (Pearson r, Spearman ρ, 95% CI, n) is on the{" "}
          <Link href="/correlation" className="text-sky-400 hover:underline font-medium">
            Correlation page
          </Link>{" "}
          — this page is the receipt that it&apos;s falsifiable.
        </p>
      </div>

      <div className="space-y-6">
        {/* 1 — Scoring ------------------------------------------------------------------ */}
        <Section id="scoring" n={1} title="Pre-registered scoring rule">
          <p>
            A run <span className="font-medium text-slate-800">succeeds</span> iff the agent&apos;s
            final answer contains the site&apos;s pre-registered <code className="font-mono text-slate-700">answer_substring</code>,
            after normalization. The base rule is a case-insensitive substring match:
          </p>
          <Pre>{`success = normalize(answer_substring) in normalize(agent_answer)
# base: answer_substring.lower() in answer.lower(), whitespace trimmed/collapsed`}</Pre>
          <p>
            Normalization tightens that base so numbers and prices match by{" "}
            <span className="font-medium text-slate-800">value</span>, not accidental character
            overlap (applied to both the agent answer and the registered value):
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Currency symbols (<code className="font-mono">$ € £</code>) stripped before matching.</li>
            <li>
              Numeric word-boundary by <code className="font-mono">Decimal</code> value —{" "}
              <code className="font-mono">$20</code> must not match <code className="font-mono">$200</code>;{" "}
              <code className="font-mono">67</code> must not match <code className="font-mono">1967</code> or <code className="font-mono">26.67%</code>.
            </li>
            <li>Whole-dollar prices ignore thousands commas and a trailing <code className="font-mono">.00</code>; meaningful cents are kept.</li>
            <li>
              <span className="font-medium">any-of:</span> a site may register several acceptable
              answers separated by <code className="font-mono">{'" | "'}</code> — matching any one
              succeeds.
            </li>
            <li>
              Classifiers (auto-detected from the value): <span className="font-mono">PERCENT</span>,{" "}
              <span className="font-mono">TIME</span>, <span className="font-mono">PHRASE</span>,{" "}
              <span className="font-mono">PHONE</span>, <span className="font-mono">LITERAL</span> —
              each with its own boundary rule.
            </li>
          </ul>
          <p className="text-slate-500">
            Pre-registered exceptions: a European decimal comma is matched as a decimal point (not
            stripped as a thousands separator); a phone-number answer is matched on digits only (e.g.
            Voodoo Doughnut); and a promo price is never the answer (the standing/recurring price is).
            The canonical spec is{" "}
            <code className="font-mono">scripts/cohort-source/agentrank_scoring_rules.md</code>{" "}
            (implemented in <code className="font-mono">scripts/scorer.py</code>, verified by{" "}
            <code className="font-mono">scripts/test_scorer.py</code>); the spec governs on any
            discrepancy.
          </p>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-slate-600">
            <p className="font-medium text-slate-700 mb-1">Why you can trust the keys</p>
            <p>
              Every <code className="font-mono">answer_substring</code> was written by hand during the
              manual cohort pass and <span className="font-medium text-slate-800">locked before the first run</span>.
              A wrong key is flagged to the cohort owner and documented — it is{" "}
              <span className="font-medium text-slate-800">never quietly changed</span>; a cohort-CSV
              hash is the tripwire. And the agent never sees the answer: its prompt is built from a
              neutral task hint describing <em>what</em> to find, never the value (the answer-leak
              guard, PREREG §6).
            </p>
          </div>
        </Section>

        {/* 2 — Harness ------------------------------------------------------------------ */}
        <Section id="harness" n={2} title="Frozen agent harness">
          <p>
            One model, one prompt, one set of limits — git-frozen so the y-axis is reproducible and
            auditable. Values below are the authoritative ones in{" "}
            <code className="font-mono">scripts/lane2-agent.py</code>.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {HARNESS_PARAMS.map(({ k, v }) => (
                  <tr key={k} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 pr-4 text-slate-500 whitespace-nowrap">{k}</td>
                    <td className="py-2 font-mono text-slate-800 tabular-nums">{v}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800">
            <p>
              <span className="font-medium">Disclosed drift:</span> the harness was re-gated on{" "}
              <span className="font-mono">2026-05-31</span> from a homepage start (the agent
              terminated at avg 3.2 / max 7 steps, never near the cap), raising{" "}
              <code className="font-mono">MAX_STEPS</code> / <code className="font-mono">TIMEOUT_SECONDS</code>{" "}
              from <span className="font-mono">15 / 90</span> to <span className="font-mono">20 / 120</span>{" "}
              for headroom. <code className="font-mono">PREREG.md §6</code> still prints the earlier{" "}
              <span className="font-mono">15 / 90</span>; the harness file is authoritative.
            </p>
          </div>
          <p className="font-medium text-slate-700">Task prompt (as currently frozen)</p>
          <Pre>{TASK_TEMPLATE}</Pre>
          <p className="text-slate-500">
            The <code className="font-mono">{"{task_hint}"}</code> is a neutral, leak-free description
            of the target fact. Wiring each site&apos;s specific <code className="font-mono">question</code>{" "}
            into the prompt is a planned change that reopens the freeze and must be re-gated first
            (PREREG §2.2 rule 7) — so this is the prompt as run today.
          </p>
          <p className="font-medium text-slate-700">System prompt (as currently frozen)</p>
          <Pre>{SYSTEM_PROMPT}</Pre>
          <p className="text-slate-500">
            <span className="font-medium text-slate-600">Two conditions (pre-registered):</span> the
            y-axis shown across this site is the <span className="font-medium">navigation</span>{" "}
            condition (homepage start, full autonomous agent → the <code className="font-mono">runs</code>{" "}
            collection). A separate <span className="font-medium">extraction</span> control (deep-link
            start, scripted navigation) is measured into <code className="font-mono">runs_extraction</code>{" "}
            and is not yet surfaced here.
          </p>
          <p className="font-medium text-slate-700">Reproduce</p>
          <Pre>{`# x-axis — Lighthouse Agentic Browsing score (per site)
npm run lane1

# y-axis — the fixed Gemini agent (homepage start, 5 trials)
python scripts/lane2-agent.py --sites <site_id> --trials 5`}</Pre>
        </Section>

        {/* 3 — Failure modes ------------------------------------------------------------ */}
        <Section id="failure-modes" n={3} title="Failure-mode taxonomy">
          <p>
            Each run records exactly one of six frozen <code className="font-mono">failure_mode</code>{" "}
            values (no new values, no renames). These chips are rendered from the same source the rest
            of the site uses, so any chip you see elsewhere is decodable here.
          </p>
          <ul className="space-y-2">
            {FAILURE_MODES.map((m) => {
              const meta = FAILURE_MODE_META[m];
              return (
                <li key={m} className="flex items-start gap-3">
                  <span
                    className="mt-0.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap"
                    style={{ backgroundColor: `${meta.color}1a`, color: meta.color }}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} />
                    {meta.emoji} {meta.label}
                  </span>
                  <span className="text-slate-600">
                    <code className="font-mono text-xs text-slate-500">{m}</code> — {FAILURE_MEANINGS[m]}
                  </span>
                </li>
              );
            })}
          </ul>
        </Section>

        {/* 4 — Exclusions --------------------------------------------------------------- */}
        <Section id="exclusions" n={4} title="Pre-registered exclusion rule">
          <p>
            The y-axis measures <span className="font-medium text-slate-800">agent readiness</span> —
            whether a site&apos;s structure lets a capable agent finish the task. Two outcomes are not
            readiness signals and are <span className="font-medium">excluded</span> from the readiness
            measurement that feeds the headline correlation:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <span className="font-mono">blocked</span> — the site rejected the agent before the task
              began (anti-bot / login wall). That&apos;s a finding about anti-bot defenses, not
              navigability. Deliberately-blocked sites are capped at ≤ 5 total.
            </li>
            <li>
              <span className="font-mono">error</span> — a harness/technical failure says nothing about
              the site.
            </li>
          </ul>
          <p>
            Runs with <code className="font-mono">failure_mode ∈ {"{ blocked, error }"}</code> are
            excluded from the readiness signal (still recorded and reported separately —{" "}
            <code className="font-mono">success</code>, <code className="font-mono">wrong_extraction</code>,{" "}
            <code className="font-mono">navigation_stuck</code>, and <code className="font-mono">timeout</code>{" "}
            are the in-task outcomes that count). This rule was fixed before the full run.
          </p>
        </Section>

        {/* 5 — Limitations -------------------------------------------------------------- */}
        <Section id="limitations" n={5} title="Limitations — owned, not spun">
          <p>
            The null result <span className="font-medium text-slate-800">is</span> the finding, so the
            honest move is to state what it does and doesn&apos;t support:
          </p>
          <ul className="list-disc pl-5 space-y-1.5">
            <li>
              <span className="font-medium text-slate-700">Small n.</span> The correlation is over
              about <span className="font-mono">27</span> joined sites (those with both a Lighthouse
              score and agent runs; the locked cohort was 28). The CI is wide — we report it rather
              than hide it.
            </li>
            <li>
              <span className="font-medium text-slate-700">Single agent, single task.</span> One model
              (<span className="font-mono">gemini-2.0-flash</span>) doing one task shape (find a
              product/service page, extract one fact). A different agent or task could rank sites
              differently; we don&apos;t claim otherwise.
            </li>
            <li>
              <span className="font-medium text-slate-700">Near-binary y-axis.</span> At temperature 0
              the agent is near-deterministic, so with one task per site success rates cluster at 0/5
              or 5/5 rather than in the middle. That compresses the vertical spread — a
              3-questions-per-site cohort expansion is in progress to add it.
            </li>
            <li>
              <span className="font-medium text-slate-700">Draft pre-registration.</span> The harness is
              git-frozen (2026-05-31), but <code className="font-mono">PREREG.md</code> is a draft
              pending the cohort owner&apos;s ratification, and <code className="font-mono">§6</code>{" "}
              still lists the pre-re-gate <span className="font-mono">15 / 90</span> limits (see §2).
            </li>
          </ul>
          <p className="text-xs text-slate-400 pt-1">
            Limitations wording is owned by the cohort owner (Member 4); this is the drafted,
            non-spin version pending sign-off.
          </p>
        </Section>
      </div>
    </div>
  );
}
