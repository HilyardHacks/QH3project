import { Suspense } from "react";
import Link from "next/link";
import {
  getCorrelationPoints,
  pearsonR,
  spearmanRho,
  bootstrapCI,
  joinedN,
  linearRegression,
} from "@/lib/queries";
import CorrelationChart from "@/components/CorrelationChart";
import InfoLink from "@/components/InfoLink";

// Manual override for the "most interesting data point" callout. When set to a
// site_id string, that site is pinned as the surprising case (e.g. to feature a
// known divergent example in the demo). When null (default), the page
// auto-picks the site with the biggest Lighthouse-vs-behavioral rank gap.
const PINNED_SURPRISE_SITE_ID: string | null = null;

export default async function CorrelationPage() {
  const points = await getCorrelationPoints();

  const xyPairs = points.map((p) => ({ x: p.lh_total, y: p.success_rate }));
  const r = pearsonR(xyPairs);
  // Spearman rank correlation + deterministic bootstrap 95% CI on rho, plus the
  // joined cohort n. These are surfaced alongside (not instead of) Pearson r.
  const rho = spearmanRho(xyPairs);
  const ci = bootstrapCI(xyPairs, spearmanRho);
  const n = joinedN(xyPairs);
  // A percentile bootstrap collapses to a zero-width interval at boundary
  // correlations (ρ = ±1) or tiny n, which can read as false certainty — flag it.
  const ciUnreliable = n < 5 || ci.lo === ci.hi;
  const { slope, intercept } = linearRegression(xyPairs);

  // Title-as-claim (move 1): the headline asserts the finding instead of asking a question.
  // Tone tracks |r| so it stays honest if the data shifts — weak |r| ⇒ the contrarian claim.
  const claim =
    n < 2
      ? "Not enough joined data yet"
      : Math.abs(r) >= 0.7
      ? "Google's rubric predicts agent success"
      : Math.abs(r) >= 0.4
      ? "Google's rubric only partly predicts agent success"
      : "Google's rubric barely predicts agent success";

  // Sub-audit correlation: which single audit best predicts success?
  const subAudits = [
    { key: "lh_accessibility_tree" as const, label: "Accessibility Tree" },
    { key: "lh_layout_stability" as const, label: "Layout Stability" },
    { key: "lh_llms_txt" as const, label: "llms.txt" },
    { key: "lh_webmcp" as const, label: "WebMCP" },
  ];

  const subAuditCorrelations = subAudits.map(({ key, label }) => {
    const pairs = points.map((p) => ({ x: p[key], y: p.success_rate }));
    return { label, r: pearsonR(pairs) };
  }).sort((a, b) => Math.abs(b.r) - Math.abs(a.r));

  // Find the "surprising" entry: biggest gap between LH rank and success rank.
  const byLh = [...points].sort((a, b) => b.lh_total - a.lh_total);
  const bySuccess = [...points].sort((a, b) => b.success_rate - a.success_rate);
  const rankInfo = (siteId: string) => {
    const lhRank = byLh.findIndex((x) => x.site_id === siteId);
    const successRank = bySuccess.findIndex((x) => x.site_id === siteId);
    return { lhRank, successRank, gap: Math.abs(lhRank - successRank) };
  };

  const autoSurprising = points.reduce((best, p) => {
    const { lhRank, successRank, gap } = rankInfo(p.site_id);
    return gap > best.gap ? { site: p, gap, lhRank, successRank } : best;
  }, { site: points[0], gap: 0, lhRank: 0, successRank: 0 });

  // Manual override: if PINNED_SURPRISE_SITE_ID is set and matches a real point,
  // pin that site; otherwise fall back to the auto-picked divergent site.
  const pinnedPoint =
    PINNED_SURPRISE_SITE_ID !== null
      ? points.find((p) => p.site_id === PINNED_SURPRISE_SITE_ID)
      : undefined;
  const surprisingEntry = pinnedPoint
    ? { site: pinnedPoint, ...rankInfo(pinnedPoint.site_id) }
    : autoSurprising;

  return (
    <div>
      <div className="mb-6">
        <Link href="/" className="text-sm text-slate-400 hover:text-slate-600 transition-colors">
          ← Leaderboard
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">
          {claim}{" "}
          <span className="text-slate-400 font-semibold tabular-nums">
            — ρ&nbsp;=&nbsp;{rho.toFixed(2)}, n&nbsp;=&nbsp;{n}
          </span>
        </h1>
        <p className="text-sm text-slate-500 max-w-2xl">
          Each point is one site. x = Google&apos;s Lighthouse Agentic Browsing score (scored on the
          homepage); y = the measured success rate of a fixed Gemini agent completing a real task. The
          dashed line is a least-squares fit; the tinted corners flag where the static rubric and real
          agent behavior disagree.
        </p>
      </div>

      {/* The scatter chart — Suspense wraps the client chart because it reads ?focus via
          useSearchParams (App Router requires a boundary for static rendering). */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-8">
        <Suspense
          fallback={
            <div className="flex h-[460px] items-center justify-center text-sm text-slate-400">
              Loading chart…
            </div>
          }
        >
          <CorrelationChart points={points} slope={slope} intercept={intercept} r={r} rho={rho} ci={ci} n={n} />
        </Suspense>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Sub-audit ranking */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-4">Which sub-audit predicts success?</h2>
          <p className="text-xs text-slate-400 mb-4">Pearson r between each single audit and behavioral success rate.</p>
          <div className="space-y-3">
            {subAuditCorrelations.map(({ label, r: subR }, i) => (
              <div key={label}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-700 font-medium">
                    {i === 0 && "🥇 "}{label}
                  </span>
                  <span className={`font-mono font-semibold ${Math.abs(subR) >= 0.5 ? "text-sky-600" : "text-slate-400"}`}>
                    r = {subR.toFixed(2)}
                  </span>
                </div>
                <div className="bg-slate-100 rounded-full h-1.5 overflow-hidden">
                  <div
                    className={`h-1.5 rounded-full ${Math.abs(subR) >= 0.5 ? "bg-sky-500" : "bg-slate-300"}`}
                    style={{ width: `${Math.abs(subR) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Surprising site callout — shown when auto-picked gap is notable, or always when pinned */}
        {(surprisingEntry.gap > 1 || pinnedPoint) && surprisingEntry.site && (
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h2 className="font-semibold text-slate-900 mb-2">The most interesting data point</h2>
            <p className="text-sm text-slate-500 mb-4">
              {pinnedPoint
                ? "A hand-picked case where the static rubric and real agent behavior diverge."
                : "This site has the biggest gap between its Lighthouse rank and its behavioral rank — the case where the static rubric gets it wrong."}
            </p>
            <Link
              href={`/site/${surprisingEntry.site.site_id}`}
              className="block rounded-lg border border-slate-200 hover:border-sky-300 hover:bg-sky-50 transition-colors p-4"
            >
              <p className="font-semibold text-slate-900 mb-1">{surprisingEntry.site.name}</p>
              <div className="text-sm text-slate-500 space-y-1">
                <p>
                  Lighthouse rank: <span className="font-mono text-slate-700">#{surprisingEntry.lhRank + 1}</span>
                  {" "}(score: {surprisingEntry.site.lh_total})
                </p>
                <p>
                  Behavioral rank: <span className="font-mono text-slate-700">#{surprisingEntry.successRank + 1}</span>
                  {" "}({Math.round(surprisingEntry.site.success_rate * 100)}% success)
                </p>
                <p className="text-sky-600 font-medium mt-2">View site detail →</p>
              </div>
            </Link>
          </div>
        )}
      </div>

      {/* One-liner finding — only a real claim once there are >=2 joined points */}
      {n >= 2 ? (
        <div className="bg-slate-900 text-white rounded-xl p-6">
          <h2 className="font-semibold text-slate-200 mb-2 text-sm uppercase tracking-wide">The finding</h2>
          <p className="text-lg font-medium leading-relaxed">
            {Math.abs(r) >= 0.7
              ? <>Google's Agentic Browsing rubric (r&nbsp;=&nbsp;{r.toFixed(2)}) is a strong predictor of real agent success. The best single indicator: <span className="text-sky-400">{subAuditCorrelations[0].label}</span> (r&nbsp;=&nbsp;{subAuditCorrelations[0].r.toFixed(2)}).</>
              : Math.abs(r) >= 0.4
              ? <>Google's Agentic Browsing rubric (r&nbsp;=&nbsp;{r.toFixed(2)}) has moderate predictive power. The most predictive sub-audit: <span className="text-sky-400">{subAuditCorrelations[0].label}</span> (r&nbsp;=&nbsp;{subAuditCorrelations[0].r.toFixed(2)}). <span className="text-slate-300">{subAuditCorrelations[subAuditCorrelations.length - 1].label} predicted nothing</span> (r&nbsp;=&nbsp;{subAuditCorrelations[subAuditCorrelations.length - 1].r.toFixed(2)}).</>
              : <>Google's Agentic Browsing rubric barely predicts real agent success (r&nbsp;=&nbsp;{r.toFixed(2)}). The most predictive sub-audit: <span className="text-sky-400">{subAuditCorrelations[0].label}</span> — but the rubric as a whole is not a reliable proxy for whether an agent can actually complete a task.</>
            }
          </p>
          <p className="text-sm text-slate-400 mt-3 font-mono">
            Pearson r&nbsp;=&nbsp;{r.toFixed(2)} · Spearman ρ&nbsp;=&nbsp;{rho.toFixed(2)} · 95% CI&nbsp;[{ci.lo.toFixed(2)},&nbsp;{ci.hi.toFixed(2)}]{ciUnreliable ? " (CI unreliable at this n)" : ""} · n&nbsp;=&nbsp;{n}<InfoLink anchor="limitations" label="Limitations & sample size" />
          </p>
        </div>
      ) : (
        <div className="bg-slate-900 text-white rounded-xl p-6">
          <h2 className="font-semibold text-slate-200 mb-2 text-sm uppercase tracking-wide">The finding</h2>
          <p className="text-lg font-medium leading-relaxed text-slate-300">
            Not enough joined data yet — once Lighthouse scores (x-axis) and agent runs (y-axis)
            are populated, the correlation appears here. <span className="font-mono">n&nbsp;=&nbsp;{n}</span>
          </p>
        </div>
      )}

      {/* Methodology note */}
      <p className="text-xs text-slate-400 mt-6 max-w-2xl">
        <span className="font-semibold text-slate-500">Methodology:</span>
        <InfoLink anchor="scoring" label="Scoring rule" />{" "}
        Scoring is pre-registered case-insensitive substring matching, fixed before any agent runs.
        Cohort n&nbsp;=&nbsp;{n} joined sites (those with a Lighthouse score). Reported correlations are
        Pearson r and Spearman ρ; the 95% confidence interval is a deterministic seeded bootstrap
        (2,000 resamples) on ρ, so it is identical across renders.
      </p>
    </div>
  );
}
