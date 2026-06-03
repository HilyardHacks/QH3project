import Link from "next/link";
import { notFound } from "next/navigation";
import { getSiteDetail } from "@/lib/queries";
import InfoLink from "@/components/InfoLink";
import TrialAccordion from "@/components/TrialAccordion";

// Lighthouse sub-audit ✓/✗ chip. On this page the sub-audit fields are plain 0|1 (a non-null
// LighthouseResult), so no null branch is needed — matches the leaderboard's chip language.
function SubAuditChip({ label, value }: { label: string; value: number }) {
  return (
    <span
      className={`text-xs rounded px-1.5 py-0.5 ${
        value === 1 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"
      }`}
    >
      {value === 1 ? "✓" : "✗"} {label}
    </span>
  );
}

export default async function SiteDetailPage({ params }: { params: { slug: string } }) {
  const data = await getSiteDetail(params.slug);
  if (!data) notFound();

  const { site, lighthouse, runs } = data;
  const successes = runs.filter((r) => r.success).length;
  const successRate = runs.length > 0 ? Math.round((successes / runs.length) * 100) : 0;
  const meanSteps =
    runs.length > 0
      ? (runs.reduce((s, r) => s + r.step_count, 0) / runs.length).toFixed(1)
      : "—";

  const failureCounts: Record<string, number> = {};
  runs.forEach((r) => {
    failureCounts[r.failure_mode] = (failureCounts[r.failure_mode] ?? 0) + 1;
  });

  const rateColor = successRate >= 70 ? "text-emerald-600" : successRate >= 40 ? "text-amber-600" : "text-red-500";

  return (
    <div>
      <div className="mb-6">
        <Link href="/" className="text-sm text-slate-400 hover:text-slate-600 transition-colors">
          ← Leaderboard
        </Link>
      </div>

      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{site.name}</h1>
          <a
            href={site.url}
            target="_blank"
            rel="noreferrer"
            className="text-sky-600 text-sm hover:underline mt-1 inline-block"
          >
            {site.url} ↗
          </a>
        </div>
        <div className="text-right">
          <div className={`text-5xl font-bold tabular-nums ${rateColor}`}>{successRate}%</div>
          <div className="text-sm text-slate-400 mt-1">Agent success rate</div>
          <div className="text-xs text-slate-400">{runs.length} trials</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Lighthouse scores */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-4 flex items-center justify-between">
            Lighthouse Agentic Browsing
            {lighthouse ? (
              <span
                className={`text-lg font-bold tabular-nums ${
                  lighthouse.lh_total >= 70 ? "text-emerald-600" : lighthouse.lh_total >= 40 ? "text-amber-600" : "text-red-500"
                }`}
              >
                {lighthouse.lh_total}
              </span>
            ) : (
              <span className="text-slate-400 text-sm">Not run yet</span>
            )}
          </h2>
          {lighthouse ? (
            <div className="flex flex-wrap gap-2">
              <SubAuditChip label="A11y Tree" value={lighthouse.lh_accessibility_tree} />
              <SubAuditChip label="Layout Stability" value={lighthouse.lh_layout_stability} />
              <SubAuditChip label="llms.txt" value={lighthouse.lh_llms_txt} />
              <SubAuditChip label="WebMCP" value={lighthouse.lh_webmcp} />
            </div>
          ) : (
            <p className="text-sm text-slate-400">Run Lane 1 to populate Lighthouse scores.</p>
          )}
        </div>

        {/* Behavioral summary */}
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-900 mb-4">Behavioral Summary</h2>
          {runs.length > 0 ? (
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Successes</span>
                <span className="font-medium text-slate-900">
                  {successes} / {runs.length}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Mean steps</span>
                <span className="font-medium text-slate-900 tabular-nums">{meanSteps}</span>
              </div>
              <div className="border-t border-slate-100 pt-3 mt-3">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Failure breakdown</p>
                {Object.entries(failureCounts).map(([mode, count]) => (
                  <div key={mode} className="flex justify-between text-sm py-0.5">
                    <span className="text-slate-500 capitalize">{mode.replace(/_/g, " ")}</span>
                    <span className="text-slate-700 font-mono">{count}×</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-400">No runs yet. Execute Lane 2 to populate.</p>
          )}
        </div>
      </div>

      {/* Pre-registered answer */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-8">
        <h2 className="font-semibold text-amber-900 mb-1">
          Pre-registered scoring key
          <InfoLink anchor="scoring" label="How scoring works" />
        </h2>
        <p className="text-sm text-amber-700">
          <span className="font-medium">Expected answer substring:</span>{" "}
          <code className="bg-amber-100 px-1.5 py-0.5 rounded font-mono text-amber-800">{site.answer_substring}</code>
        </p>
        <p className="text-xs text-amber-600 mt-1">{site.answer_note}</p>
        <p className="text-xs text-amber-500 mt-2">
          Registered before any agent runs. Success = agent's final output contains this substring (case-insensitive).
        </p>
      </div>

      {/* Trial log — each trial expands to the agent's step-by-step trajectory (move 12). */}
      {runs.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-baseline justify-between gap-3">
            <h2 className="font-semibold text-slate-900">Trial log</h2>
            <span className="text-xs text-slate-400">Click a trial to see the agent&apos;s trajectory</span>
          </div>
          <div>
            {[...runs]
              .sort((a, b) => a.trial_number - b.trial_number)
              .map((run) => (
                <TrialAccordion key={run.trial_number} run={run} />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
