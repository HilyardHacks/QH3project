"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { SiteLeaderboardEntry, FailureMode } from "@/lib/types";
import { tieAwareRanks } from "@/lib/stats";
import { FAILURE_MODE_META, FAILURE_MODES } from "@/lib/failure-modes";

type SortKey = "success" | "lighthouse" | "steps" | "name";
const SORT_KEYS: SortKey[] = ["success", "lighthouse", "steps", "name"];

interface View {
  key: SortKey;
  dir: "asc" | "desc";
  failMode: FailureMode | null;
  quick: boolean; // "High Lighthouse, Low Success" quick filter
}

const MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

// Default sort direction per column: success/lighthouse high-first; steps/name low-first.
const defaultDir = (k: SortKey): "asc" | "desc" =>
  k === "name" || k === "steps" ? "asc" : "desc";

// Seed the view from the URL, validating against the allowed keys / frozen enum so a
// hand-edited or stale link can never push an out-of-range sort/filter (graceful default).
function seedView(sp: { get(name: string): string | null }): View {
  const rawSort = sp.get("sort");
  const key = SORT_KEYS.includes(rawSort as SortKey) ? (rawSort as SortKey) : "success";
  const rawDir = sp.get("dir");
  const dir = rawDir === "asc" ? "asc" : rawDir === "desc" ? "desc" : defaultDir(key);
  const rawFail = sp.get("fail");
  const failMode = (FAILURE_MODES as string[]).includes(rawFail ?? "")
    ? (rawFail as FailureMode)
    : null;
  return { key, dir, failMode, quick: sp.get("quick") === "1" };
}

// ---- small presentational helpers --------------------------------------------------------

// One bar component for BOTH success and Lighthouse (move 8) so the eye sees, row by row,
// that they don't track. Diverging green/amber/red on a 0–100 scale.
function MetricBar({
  value,
  unit = "",
  pending = false,
}: {
  value: number | null;
  unit?: string;
  pending?: boolean;
}) {
  if (pending) return <span className="text-sm text-slate-400">pending</span>;
  if (value === null) return <span className="text-sm text-slate-400">—</span>;
  const v = Math.round(value);
  const clamped = Math.max(0, Math.min(100, v));
  const fill = v >= 70 ? "bg-emerald-500" : v >= 40 ? "bg-amber-400" : "bg-red-400";
  const text = v >= 70 ? "text-emerald-700" : v >= 40 ? "text-amber-700" : "text-red-600";
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 bg-slate-100 rounded-full h-2 overflow-hidden shrink-0">
        <div className={`h-2 rounded-full ${fill}`} style={{ width: `${clamped}%` }} />
      </div>
      <span className={`text-sm font-semibold tabular-nums ${text}`}>
        {v}
        {unit}
      </span>
    </div>
  );
}

function DotStrip({ results }: { results: boolean[] }) {
  if (!results.length) return null;
  const passed = results.filter(Boolean).length;
  return (
    <div
      className="flex gap-0.5 mt-1"
      title={`${passed}/${results.length} trials passed`}
      aria-label={`${passed} of ${results.length} trials passed`}
    >
      {results.map((s, i) => (
        <span
          key={i}
          className={`inline-block w-2 h-2 rounded-sm ${s ? "bg-emerald-500" : "bg-red-400"}`}
        />
      ))}
    </div>
  );
}

function Favicon({ url }: { url: string }) {
  let domain = "";
  try {
    domain = new URL(url).hostname;
  } catch {
    domain = "";
  }
  if (!domain) return <span className="inline-block w-4 h-4 rounded bg-slate-100 shrink-0" />;
  return (
    // Plain <img>: external favicon host, no next/image domain config needed.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
      alt=""
      width={16}
      height={16}
      loading="lazy"
      className="w-4 h-4 rounded shrink-0"
    />
  );
}

function FailureBadge({ mode }: { mode: FailureMode }) {
  const meta = FAILURE_MODE_META[mode];
  if (mode === "success") {
    return (
      <span className="text-xs text-emerald-600 bg-emerald-50 rounded px-1.5 py-0.5 whitespace-nowrap">
        ✓ success
      </span>
    );
  }
  return (
    <span className="text-xs text-slate-500 bg-slate-100 rounded px-1.5 py-0.5 whitespace-nowrap">
      {meta ? `${meta.emoji} ${meta.label}` : mode}
    </span>
  );
}

function SubAudits({ entry }: { entry: SiteLeaderboardEntry }) {
  const audits = [
    { key: "lh_accessibility_tree", label: "A11y" },
    { key: "lh_layout_stability", label: "Stability" },
    { key: "lh_llms_txt", label: "llms.txt" },
    { key: "lh_webmcp", label: "WebMCP" },
  ] as const;
  return (
    <div className="flex gap-1">
      {audits.map(({ key, label }) => {
        const val = entry[key];
        if (val === null) return null;
        return (
          <span
            key={key}
            title={label}
            className={`text-xs rounded px-1 py-0.5 ${
              val === 1 ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"
            }`}
          >
            {val === 1 ? "✓" : "✗"} {label}
          </span>
        );
      })}
    </div>
  );
}

function SortHeader({
  label,
  k,
  view,
  onSort,
  align = "left",
  className = "",
}: {
  label: string;
  k: SortKey;
  view: View;
  onSort: (k: SortKey) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = view.key === k;
  return (
    <th
      aria-sort={active ? (view.dir === "asc" ? "ascending" : "descending") : "none"}
      className={`px-4 py-3 font-semibold text-slate-500 ${align === "right" ? "text-right" : "text-left"} ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 hover:text-slate-700 transition-colors ${
          active ? "text-slate-700" : ""
        }`}
      >
        {label}
        <span className="text-[10px] text-slate-400">{active ? (view.dir === "asc" ? "▲" : "▼") : "↕"}</span>
      </button>
    </th>
  );
}

// ---- main component ----------------------------------------------------------------------

export default function Leaderboard({ entries }: { entries: SiteLeaderboardEntry[] }) {
  const searchParams = useSearchParams();
  const [view, setView] = useState<View>(() => seedView(searchParams));

  const syncUrl = useCallback((next: View) => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams();
    // Only serialize non-defaults so a pristine view yields a clean URL.
    if (!(next.key === "success" && next.dir === "desc")) {
      p.set("sort", next.key);
      p.set("dir", next.dir);
    }
    if (next.failMode) p.set("fail", next.failMode);
    if (next.quick) p.set("quick", "1");
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, []);

  const update = useCallback(
    (partial: Partial<View>) => {
      // Compute next from the CURRENT view; keep the URL write OUT of the setState updater
      // (updaters must stay pure — Strict Mode double-invokes them).
      const next = { ...view, ...partial };
      setView(next);
      syncUrl(next);
    },
    [view, syncUrl]
  );

  const toggleSort = useCallback(
    (k: SortKey) =>
      update(
        view.key === k
          ? { dir: view.dir === "asc" ? "desc" : "asc" }
          : { key: k, dir: defaultDir(k) }
      ),
    [update, view.key, view.dir]
  );

  const hasFilter = view.failMode !== null || view.quick;

  // Tie-aware rank (LMArena "Rank UB") computed once over the full cohort, keyed by site.
  // Stays attached to the site regardless of the current sort, so sorting by Lighthouse
  // visibly scrambles the rank column — the whole point of move 10.
  // Tie-aware ranks (LMArena "Rank UB") computed once over MEASURED sites only — a pending,
  // 0-trial site has CI [0,1] and would otherwise grab rank 1. rankCounts lets the medal layer
  // award a medal only when a single site holds that rank (no "everyone wins gold").
  const { rankBySite, rankCounts } = useMemo(() => {
    const measured = entries.filter((e) => e.trial_count > 0);
    const ranks = tieAwareRanks(measured);
    const bySite = new Map<string, number>();
    const counts = new Map<number, number>();
    measured.forEach((e, i) => {
      bySite.set(e.site_id, ranks[i]);
      counts.set(ranks[i], (counts.get(ranks[i]) ?? 0) + 1);
    });
    return { rankBySite: bySite, rankCounts: counts };
  }, [entries]);

  const rows = useMemo(() => {
    const filtered = entries.filter((e) => {
      if (view.failMode && e.top_failure_mode !== view.failMode) return false;
      if (
        view.quick &&
        !(
          e.trial_count > 0 &&
          e.top_failure_mode !== "error" && // exclude transport/harness errors (e.g. costco) — not a behavioral miss
          e.lh_total !== null &&
          e.lh_total >= 70 &&
          e.success_rate < 0.5
        )
      )
        return false;
      return true;
    });
    const dir = view.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (view.key) {
        case "name":
          return a.name.localeCompare(b.name) * dir;
        case "steps":
          return (a.mean_steps - b.mean_steps) * dir;
        case "lighthouse": {
          // Nulls always sort last, regardless of direction.
          if (a.lh_total === null && b.lh_total === null) return 0;
          if (a.lh_total === null) return 1;
          if (b.lh_total === null) return -1;
          return (a.lh_total - b.lh_total) * dir;
        }
        case "success":
        default:
          if (a.success_rate !== b.success_rate) return (a.success_rate - b.success_rate) * dir;
          return b.trial_count - a.trial_count; // tie-break: more trials first (stable-ish)
      }
    });
  }, [entries, view]);

  return (
    <div>
      {/* Filter bar (move 10) */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-xs text-slate-400 mr-1">Filter</span>
        <button
          type="button"
          aria-pressed={view.quick}
          onClick={() => update({ quick: !view.quick })}
          className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
            view.quick
              ? "border-red-300 bg-red-50 text-red-700"
              : "border-slate-200 text-slate-500 hover:bg-slate-50"
          }`}
        >
          High Lighthouse, Low Success
        </button>
        {FAILURE_MODES.map((m) => {
          const on = view.failMode === m;
          const meta = FAILURE_MODE_META[m];
          return (
            <button
              key={m}
              type="button"
              aria-pressed={on}
              onClick={() => update({ failMode: on ? null : m })}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                on
                  ? "border-slate-400 bg-slate-100 text-slate-900"
                  : "border-slate-200 text-slate-500 hover:bg-slate-50"
              }`}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} />
              {meta.label}
            </button>
          );
        })}
        {hasFilter && (
          <button
            type="button"
            onClick={() => update({ failMode: null, quick: false })}
            className="ml-1 text-xs text-slate-400 underline hover:text-slate-600"
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-xs text-slate-400 tabular-nums">
          {rows.length} of {entries.length} sites
        </span>
      </div>

      <div className="bg-white rounded-xl border border-slate-200">
        <div className="overflow-x-auto rounded-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                <th className="text-left px-4 py-3 font-semibold text-slate-500 w-16 sticky left-0 bg-slate-50 z-10">#</th>
                <SortHeader
                  label="Site"
                  k="name"
                  view={view}
                  onSort={toggleSort}
                  className="sticky left-16 bg-slate-50 z-10"
                />
                <SortHeader label="Agent Success" k="success" view={view} onSort={toggleSort} />
                <th className="text-left px-4 py-3 font-semibold text-slate-500">Top Failure</th>
                <SortHeader label="Avg Steps" k="steps" view={view} onSort={toggleSort} />
                <SortHeader label="Lighthouse" k="lighthouse" view={view} onSort={toggleSort} />
                <th className="text-left px-4 py-3 font-semibold text-slate-500">Sub-audits</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-400">
                    No sites match this filter.{" "}
                    <button
                      type="button"
                      onClick={() => update({ failMode: null, quick: false })}
                      className="underline hover:text-slate-600"
                    >
                      Clear filters
                    </button>
                  </td>
                </tr>
              ) : (
                rows.map((entry, i) => {
                  const rank = rankBySite.get(entry.site_id);
                  const tied = rank != null && (rankCounts.get(rank) ?? 1) > 1;
                  // Medal ONLY for a solo, CI-separated leader. At n=5 the top sites tie, so a
                  // medal per shared rank would paint many "winners" — dishonest (plan §8).
                  // Tied rows show "T-<rank>"; pending (untested) rows show "—".
                  const medal = rank != null && !tied && rank <= 3 ? MEDALS[rank] : null;
                  const pct = Math.round(entry.success_rate * 100);
                  return (
                    <tr
                      key={entry.site_id}
                      className={`group border-b border-slate-100 hover:bg-slate-50 transition-colors ${
                        i === rows.length - 1 ? "border-b-0" : ""
                      }`}
                    >
                      <td className="px-4 py-3 text-slate-400 font-mono tabular-nums whitespace-nowrap sticky left-0 bg-white group-hover:bg-slate-50 transition-colors z-10">
                        {rank == null ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          <span
                            title={tied ? "Tied rank — 95% CIs overlap (indistinguishable at n=5)" : undefined}
                          >
                            {medal && (
                              <span aria-hidden="true" className="mr-0.5">
                                {medal}
                              </span>
                            )}
                            {tied ? `T-${rank}` : rank}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 sticky left-16 bg-white group-hover:bg-slate-50 transition-colors z-10">
                        <div className="flex items-center gap-2">
                          <Favicon url={entry.url} />
                          <div className="min-w-0">
                            <Link
                              href={`/site/${entry.site_id}`}
                              className="font-medium text-slate-900 hover:text-sky-600 transition-colors"
                            >
                              {entry.name}
                            </Link>
                            <div className="text-xs text-slate-400 truncate max-w-[16rem]">{entry.url}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <MetricBar value={entry.trial_count === 0 ? null : pct} unit="%" pending={entry.trial_count === 0} />
                        {entry.trial_count > 0 && (
                          <div className="text-xs text-slate-400 mt-0.5 tabular-nums">
                            n={entry.trial_count} · 95% CI {Math.round(entry.ci_low * 100)}–
                            {Math.round(entry.ci_high * 100)}%
                          </div>
                        )}
                        <DotStrip results={entry.trial_results} />
                      </td>
                      <td className="px-4 py-3">
                        {entry.trial_count === 0 ? (
                          <span className="text-xs text-slate-400 bg-slate-100 rounded px-1.5 py-0.5 whitespace-nowrap">
                            pending
                          </span>
                        ) : (
                          <FailureBadge mode={entry.top_failure_mode} />
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600 tabular-nums">{entry.mean_steps}</td>
                      <td className="px-4 py-3">
                        <MetricBar value={entry.lh_total} />
                      </td>
                      <td className="px-4 py-3">
                        <SubAudits entry={entry} />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
