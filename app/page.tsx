import { Suspense } from "react";
import Link from "next/link";
import { getLeaderboard } from "@/lib/queries";
import Leaderboard from "@/components/Leaderboard";

export default async function LeaderboardPage() {
  const entries = await getLeaderboard();

  // Stats strip — guarded for partial / empty data. Only average over sites that actually
  // have runs, so sites still pending (0 trials) don't drag a misleading 0% into the headline.
  const totalRuns = entries.reduce((s, e) => s + e.trial_count, 0);
  const sitesWithRuns = entries.filter((e) => e.trial_count > 0);
  const avgSuccess =
    sitesWithRuns.length === 0
      ? null
      : Math.round(
          (sitesWithRuns.reduce((s, e) => s + e.success_rate, 0) / sitesWithRuns.length) * 100
        );

  return (
    <div>
      {/* Hero */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 mb-2">Is the web ready for agents?</h1>
        <p className="text-slate-500 max-w-2xl">
          Google shipped the Agentic Browsing checklist — we ran the experiment. Each site below was tested 5× with a
          fixed Gemini agent completing a real task. Static Lighthouse scores are on the right.{" "}
          <Link href="/correlation" className="text-sky-600 hover:underline font-medium">
            See the correlation →
          </Link>
        </p>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: "Sites tested", value: entries.length, sub: null as string | null },
          {
            label: "Avg success rate",
            value: avgSuccess === null ? "—" : avgSuccess + "%",
            // Disclose the cohort behind the headline % (unweighted per-site mean) so the
            // hero figure isn't a bare number — matches the per-row "never a bare number" rule.
            sub: `unweighted mean across ${sitesWithRuns.length} sites · ${totalRuns} runs`,
          },
          { label: "Total agent runs", value: totalRuns, sub: null as string | null },
        ].map(({ label, value, sub }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 px-5 py-4">
            <p className="text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
            <p className="text-sm text-slate-500 mt-0.5">{label}</p>
            {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
          </div>
        ))}
      </div>

      {/* Interactive leaderboard — client component (sort/filter via ?sort/?fail/?quick).
          Suspense wraps it because it reads those params with useSearchParams. */}
      <Suspense
        fallback={
          <div className="bg-white rounded-xl border border-slate-200 h-64 flex items-center justify-center text-sm text-slate-400">
            Loading leaderboard…
          </div>
        }
      >
        <Leaderboard entries={entries} />
      </Suspense>

      <p className="text-xs text-slate-400 mt-4 text-center">
        Scoring is pre-registered exact-match, decided before any agent runs. Behavioral results use Gemini (fixed model + prompt).
        Static scores use{" "}
        <a href="https://developer.chrome.com/docs/lighthouse" target="_blank" rel="noreferrer" className="underline">
          Lighthouse 13.3 Agentic Browsing category
        </a>
        , unmodified. Ranks are tie-aware — sites whose 95% CIs overlap share a rank.
      </p>
    </div>
  );
}
