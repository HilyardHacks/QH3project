"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  ReferenceArea,
  Label,
} from "recharts";
import { CorrelationPoint, FailureMode } from "@/lib/types";

interface Props {
  points: CorrelationPoint[];
  slope: number;
  intercept: number;
  r: number;
  rho: number;
  ci: { lo: number; hi: number };
  n: number;
}

// Failure-mode color map (move 3) — turns the scatter into a second readout (WHY a site
// fails, not just whether it succeeded). Keys are the frozen FailureMode enum (lib/types.ts).
const FAIL_COLORS: Record<FailureMode, string> = {
  success: "#10b981",
  blocked: "#64748b",
  timeout: "#f59e0b",
  wrong_extraction: "#8b5cf6",
  navigation_stuck: "#fb923c",
  error: "#ef4444",
};

const FAIL_LABELS: Record<FailureMode, string> = {
  success: "Success",
  blocked: "Blocked",
  timeout: "Timeout",
  wrong_extraction: "Wrong extraction",
  navigation_stuck: "Navigation stuck",
  error: "Error",
};

// Fixed quadrant split (move 2) — NOT data medians. LH 50 = "the rubric approves";
// success 0.5 = "the agent succeeds on a majority of trials". Fixed, neutral thresholds
// are robust to the near-binary y-axis (a data median collapses to 0 or 1) and don't move
// with the sample — so the shading can't be tuned to dramatize a null result (plan §8).
const LH_SPLIT = 50;
const SUCCESS_SPLIT = 0.5;

const FOCUS_SEP = "~";
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

// Residual-rich tooltip (move 6): name, LH, success% ± Wilson CI + n, the per-point
// residual vs the least-squares fit (the punchline), and a failure-mode swatch.
function CustomTooltip({
  active,
  payload,
  slope,
  intercept,
}: {
  active?: boolean;
  payload?: { payload: CorrelationPoint }[];
  slope: number;
  intercept: number;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  // Defensive: trend-line rows (and any malformed point) carry no top_failure_mode — never
  // render a card for them. The empty trend shape already keeps them out of the item tooltip;
  // this guard removes the hidden coupling so a future visible trend marker can't break it.
  if (!d || d.top_failure_mode == null) return null;
  // ONE clamped prediction drives both the residual delta and the displayed %, so the line
  // stays internally consistent even if the least-squares fit exits [0,1] at this point.
  const predClamped = clamp01(slope * d.lh_total + intercept);
  const delta = Math.round((d.success_rate - predClamped) * 100);
  const predPct = Math.round(predClamped * 100);
  const sign = delta > 0 ? "+" : "";
  const ciTxt =
    d.ci_low != null && d.ci_high != null
      ? ` (95% CI ${Math.round(d.ci_low * 100)}–${Math.round(d.ci_high * 100)}%)`
      : "";
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-md px-3 py-2 text-sm min-w-[210px]">
      <p className="font-semibold text-slate-900 mb-1">{d.name}</p>
      <p className="text-slate-500">
        Lighthouse: <span className="font-mono text-slate-700">{d.lh_total}</span>
      </p>
      <p className="text-slate-500">
        Success:{" "}
        <span className="font-mono text-slate-700">{Math.round(d.success_rate * 100)}%</span>
        <span className="text-slate-400">
          {ciTxt} · n={d.trial_count}
        </span>
      </p>
      <p
        className={`mt-1 font-medium tabular-nums ${
          delta > 0 ? "text-emerald-600" : delta < 0 ? "text-red-600" : "text-slate-500"
        }`}
      >
        {sign}
        {delta} pts vs Lighthouse-predicted {predPct}%
      </p>
      <p className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500">
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: FAIL_COLORS[d.top_failure_mode] ?? "#64748b" }}
        />
        {FAIL_LABELS[d.top_failure_mode] ?? d.top_failure_mode}
      </p>
    </div>
  );
}

export default function CorrelationChart({ points, slope, intercept, r, rho, ci, n }: Props) {
  const searchParams = useSearchParams();

  // Focus selection (move 5): which site_ids are "focused". Seeded once from ?focus=a~b so
  // a framing is shareable. Empty set = nothing focused = every point at full opacity.
  const [focused, setFocused] = useState<Set<string>>(() => {
    const raw = searchParams.get("focus");
    if (!raw) return new Set<string>();
    // Intersect the seeded ids with the loaded cohort so a stale/shared ?focus= link with
    // only-unknown ids degrades to nothing-focused (full opacity) instead of dimming the
    // whole chart with no labels and no explanation.
    const known = new Set(points.map((p) => p.site_id));
    return new Set(raw.split(FOCUS_SEP).filter((id) => known.has(id)));
  });

  // Failure-mode legend filter (move 3): clicking a chip isolates that mode by dimming the
  // rest (it never removes points). null = no filter.
  const [activeMode, setActiveMode] = useState<FailureMode | null>(null);

  // Mirror focus to the URL without a server round-trip (no Firestore refetch / scroll jump).
  const writeFocusToUrl = useCallback((next: Set<string>) => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (next.size) params.set("focus", [...next].join(FOCUS_SEP));
    else params.delete("focus");
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, []);

  const toggleFocus = useCallback(
    (siteId: string) => {
      setFocused((prev) => {
        const next = new Set(prev);
        if (next.has(siteId)) next.delete(siteId);
        else next.add(siteId);
        writeFocusToUrl(next);
        return next;
      });
    },
    [writeFocusToUrl]
  );

  const clearAll = useCallback(() => {
    setActiveMode(null);
    setFocused(() => {
      const empty = new Set<string>();
      writeFocusToUrl(empty);
      return empty;
    });
  }, [writeFocusToUrl]);

  // ----- derived values (hooks must run before the early empty-data return) -----
  const predicted = useCallback((lh: number) => slope * lh + intercept, [slope, intercept]);

  // Always-on labels (move 4): the biggest residuals (off-diagonal outliers — the story)
  // plus the four axis extremes. Everything else is hover-only, killing the 27-label mush.
  const labeledIds = useMemo(() => {
    const ids = new Set<string>();
    if (points.length === 0) return ids;
    const residual = (p: CorrelationPoint) => p.success_rate - predicted(p.lh_total);
    [...points]
      .sort((a, b) => Math.abs(residual(b)) - Math.abs(residual(a)))
      .slice(0, 8)
      .forEach((p) => ids.add(p.site_id));
    const extreme = (cmp: (a: CorrelationPoint, b: CorrelationPoint) => number) =>
      [...points].sort(cmp)[0];
    ids.add(extreme((a, b) => b.success_rate - a.success_rate).site_id);
    ids.add(extreme((a, b) => a.success_rate - b.success_rate).site_id);
    ids.add(extreme((a, b) => b.lh_total - a.lh_total).site_id);
    ids.add(extreme((a, b) => a.lh_total - b.lh_total).site_id);
    return ids;
  }, [points, predicted]);

  // Failure modes actually present, in the canonical enum order (stable legend).
  const presentModes = useMemo(() => {
    const seen = new Set<FailureMode>(points.map((p) => p.top_failure_mode));
    return (Object.keys(FAIL_COLORS) as FailureMode[]).filter((m) => seen.has(m));
  }, [points]);

  const isActive = useCallback(
    (p: CorrelationPoint) => {
      const modeOk = !activeMode || p.top_failure_mode === activeMode;
      const focusOk = focused.size === 0 || focused.has(p.site_id);
      return modeOk && focusOk;
    },
    [activeMode, focused]
  );

  // ----- move 14: per-chart export toolbar (Download PNG + Copy link) -----
  const chartRef = useRef<HTMLDivElement>(null);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [pngState, setPngState] = useState<"idle" | "working" | "done" | "error">("idle");
  // Separate reset timers per control so one action's reset can't clobber the other's pending one.
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pngTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
      if (pngTimer.current) clearTimeout(pngTimer.current);
    },
    []
  );
  const scheduleReset = useCallback(
    (ref: { current: ReturnType<typeof setTimeout> | null }, reset: () => void, ms: number) => {
      if (ref.current) clearTimeout(ref.current);
      ref.current = setTimeout(reset, ms);
    },
    []
  );

  const handleDownload = useCallback(async () => {
    const node = chartRef.current;
    if (!node) return; // clicked before mount
    setPngState("working");
    try {
      // Explicit dims (not a contingency): a detached clone can recompute the ResponsiveContainer
      // to 0-width and silently emit a blank PNG that does NOT reject.
      const rect = node.getBoundingClientRect();
      const { toPng } = await import("html-to-image"); // client-only, lazy — out of SSR + bundle
      const dataUrl = await toPng(node, {
        width: Math.ceil(rect.width),
        height: Math.ceil(rect.height),
        pixelRatio: Math.max(2, typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1),
        backgroundColor: "#ffffff", // captured root div has no bg of its own (it's on the page card)
        cacheBust: true,
        style: { padding: "16px", background: "#ffffff" }, // breathing room at capture time only
        filter: (el) => !(el instanceof HTMLElement && el.dataset.htmlToImageIgnore === "true"),
      });
      if (!dataUrl || dataUrl.length < 5000) throw new Error("empty capture"); // blank-PNG sanity check
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = "agentrank-correlation.png";
      a.click();
      setPngState("done");
      scheduleReset(pngTimer, () => setPngState("idle"), 1500);
    } catch {
      setPngState("error");
      scheduleReset(pngTimer, () => setPngState("idle"), 2000);
    }
  }, [scheduleReset]);

  const handleCopy = useCallback(async () => {
    if (typeof window === "undefined") return;
    const url = window.location.href; // already carries the current ?focus= framing (writeFocusToUrl)
    try {
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
        setCopyState("copied");
        scheduleReset(copyTimer, () => setCopyState("idle"), 2000);
        return;
      }
      throw new Error("no clipboard");
    } catch {
      // Fallback for non-secure contexts / rejected permission: hidden textarea + execCommand.
      let ok = false;
      try {
        const ta = document.createElement("textarea");
        ta.value = url;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
      if (ok) {
        setCopyState("copied");
        scheduleReset(copyTimer, () => setCopyState("idle"), 2000);
      } else {
        // Total failure: surface the raw URL below and KEEP it visible (no auto-hide) so the user
        // can actually select + copy it by hand; it clears on the next copy attempt.
        setCopyState("error");
      }
    }
  }, [scheduleReset]);

  // Guard the empty/partial-data case (e.g. Lane 1 hasn't run yet) so Math.min/max over an
  // empty array can't produce an Infinity axis domain and NaN stats.
  if (points.length === 0) {
    return (
      <div className="flex items-center justify-center h-[460px] text-sm text-slate-400">
        No correlation data yet — run Lane 1 (Lighthouse) and Lane 2 (agent) to populate the scatter.
      </div>
    );
  }

  // Faint least-squares guide (demoted) across the visible x-range.
  const xs = points.map((p) => p.lh_total);
  const xMin = Math.max(0, Math.min(...xs) - 5);
  const xMax = Math.min(100, Math.max(...xs) + 5);
  // Do NOT clamp the endpoints independently — that would bend the drawn segment off the true
  // least-squares slope if one end exits [0,1]. Pass the raw fit and let the YAxis domain clip
  // the visible portion, preserving the honest slope.
  const trendData = [
    { lh_total: xMin, success_rate: predicted(xMin) },
    { lh_total: xMax, success_rate: predicted(xMax) },
  ];

  const hasSelection = activeMode !== null || focused.size > 0;

  // Per-point custom dot: failure-mode color, dim when not active, click to focus, and a
  // white text-halo label for the chosen few.
  const renderDot = (props: { cx?: number; cy?: number; payload?: CorrelationPoint }) => {
    const { cx, cy, payload } = props;
    if (cx == null || cy == null || !payload) return <g />;
    const active = isActive(payload);
    const fill = FAIL_COLORS[payload.top_failure_mode] ?? "#64748b";
    // When a focus set exists, only focused points are labeled; otherwise the outlier set.
    const wantsLabel =
      focused.size > 0 ? focused.has(payload.site_id) : labeledIds.has(payload.site_id);
    const showLabel = active && wantsLabel;
    // High-LH points cluster on the right edge — anchor their labels leftward so long names
    // (e.g. "Social Security Administration") don't overflow the plot.
    const rightSide = payload.lh_total > 75;
    return (
      <g
        role="button"
        tabIndex={0}
        aria-pressed={focused.has(payload.site_id)}
        aria-label={`Focus ${payload.name}`}
        opacity={active ? 1 : 0.15}
        cursor="pointer"
        style={{ transition: "opacity 120ms" }}
        onClick={() => toggleFocus(payload.site_id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggleFocus(payload.site_id);
          }
        }}
      >
        <circle cx={cx} cy={cy} r={6} fill={fill} fillOpacity={0.9} stroke="white" strokeWidth={1.5} />
        {showLabel && (
          <text
            x={rightSide ? cx - 9 : cx + 9}
            y={cy + 4}
            textAnchor={rightSide ? "end" : "start"}
            fontSize={11}
            fontWeight={600}
            fill={fill}
            stroke="#fff"
            strokeWidth={3}
            style={{ paintOrder: "stroke", pointerEvents: "none" }}
          >
            {payload.name}
          </text>
        )}
      </g>
    );
  };

  const findingTone =
    Math.abs(r) >= 0.7 ? "strong" : Math.abs(r) >= 0.4 ? "moderate" : "weak";

  return (
    <div>
      {/* Per-chart toolbar (move 14). These buttons are SIBLINGS above the captured node, so
          they never appear in the exported PNG (data-html-to-image-ignore is belt-and-suspenders). */}
      <div className="mb-3 flex items-center justify-end gap-2" data-html-to-image-ignore="true">
        <button
          type="button"
          onClick={handleDownload}
          disabled={pngState === "working"}
          aria-label="Download the correlation chart as a PNG image"
          className="inline-flex min-w-[120px] items-center justify-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-60"
        >
          {pngState === "working"
            ? "Exporting…"
            : pngState === "done"
            ? "✓ Saved"
            : pngState === "error"
            ? "Export failed"
            : "⬇ Download PNG"}
        </button>
        <button
          type="button"
          onClick={handleCopy}
          aria-label="Copy a shareable link to this chart view"
          className="inline-flex min-w-[104px] items-center justify-center gap-1.5 rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-500 transition-colors hover:bg-slate-50"
        >
          {copyState === "copied" ? "✓ Copied!" : copyState === "error" ? "Copy failed" : "🔗 Copy link"}
        </button>
        <span role="status" aria-live="polite" className="sr-only">
          {pngState === "working" ? "Exporting image." : ""}
          {pngState === "done" ? "Image saved." : ""}
          {pngState === "error" ? "Export failed; please take a screenshot instead." : ""}
          {copyState === "copied" ? "Link copied to clipboard." : ""}
          {copyState === "error" ? "Copy failed; the link is shown below for manual copying." : ""}
        </span>
      </div>
      {/* Escape hatch when both clipboard paths fail (hardened browser): show the raw URL. */}
      {copyState === "error" && (
        <input
          readOnly
          value={typeof window !== "undefined" ? window.location.href : ""}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Shareable link (select to copy manually)"
          className="mb-3 w-full rounded border border-slate-200 px-2 py-1 text-xs text-slate-500"
        />
      )}
      {/* Captured node — MUST keep the r/ρ/CI/n stat-card row below so the exported PNG always
          carries the honest anchor (plan §8). Do not move the stat cards out of this div. */}
      <div ref={chartRef}>
      <div className="flex flex-wrap items-center gap-4 mb-4">
        <div className="bg-sky-50 border border-sky-200 rounded-lg px-4 py-3 text-center">
          <p className="text-2xl font-bold text-sky-700 tabular-nums">{r.toFixed(2)}</p>
          <p className="text-xs text-sky-600 mt-0.5">Pearson r</p>
        </div>
        <div className="bg-indigo-50 border border-indigo-200 rounded-lg px-4 py-3 text-center">
          <p className="text-2xl font-bold text-indigo-700 tabular-nums">{rho.toFixed(2)}</p>
          <p className="text-xs text-indigo-600 mt-0.5">Spearman ρ</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-center">
          <p className="text-base font-semibold text-slate-700 tabular-nums">
            [{ci.lo.toFixed(2)}, {ci.hi.toFixed(2)}]
          </p>
          <p className="text-xs text-slate-500 mt-0.5">95% CI (bootstrap)</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-center">
          <p className="text-2xl font-bold text-slate-700 tabular-nums">n={n}</p>
          <p className="text-xs text-slate-500 mt-0.5">joined sites</p>
        </div>
        <p className="text-sm text-slate-500 max-w-sm">
          {findingTone === "strong"
            ? "Strong correlation — Lighthouse score is a good predictor of agent success."
            : findingTone === "moderate"
            ? "Moderate correlation — Lighthouse score has some predictive power."
            : "Weak correlation — Google's rubric barely predicts real agent success. That's the finding."}
        </p>
      </div>

      {/* Failure-mode chip legend (move 3): click to isolate a mode by dimming the rest. */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-xs text-slate-400 mr-1">Dominant failure mode:</span>
        {presentModes.map((m) => {
          const on = activeMode === m;
          return (
            <button
              key={m}
              type="button"
              aria-pressed={on}
              onClick={() => setActiveMode(on ? null : m)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                on
                  ? "border-slate-400 bg-slate-100 text-slate-900"
                  : "border-slate-200 text-slate-500 hover:bg-slate-50"
              }`}
            >
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: FAIL_COLORS[m] }} />
              {FAIL_LABELS[m]}
            </button>
          );
        })}
        {hasSelection && (
          <button
            type="button"
            onClick={clearAll}
            className="ml-1 text-xs text-slate-400 underline hover:text-slate-600"
          >
            Clear
          </button>
        )}
      </div>

      <ResponsiveContainer width="100%" height={460}>
        <ScatterChart margin={{ top: 24, right: 70, bottom: 44, left: 24 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="lh_total"
            type="number"
            domain={[0, 100]}
            tick={{ fontSize: 12, fill: "#94a3b8" }}
            tickLine={false}
          >
            <Label
              value="Lighthouse Agentic Browsing Score (0–100)"
              offset={-10}
              position="insideBottom"
              style={{ fontSize: 12, fill: "#64748b" }}
            />
          </XAxis>
          <YAxis
            dataKey="success_rate"
            type="number"
            domain={[0, 1]}
            tickFormatter={(v) => `${Math.round(v * 100)}%`}
            tick={{ fontSize: 12, fill: "#94a3b8" }}
            tickLine={false}
          >
            <Label
              value="Agent Success Rate"
              angle={-90}
              position="insideLeft"
              style={{ fontSize: 12, fill: "#64748b" }}
            />
          </YAxis>

          {/* Surprise quadrants (move 2): tint the two contrarian corners. */}
          <ReferenceArea
            x1={0}
            x2={LH_SPLIT}
            y1={SUCCESS_SPLIT}
            y2={1}
            fill="#34d399"
            fillOpacity={0.07}
            stroke="none"
            label={{
              value: "Lighthouse under-predicts",
              position: "insideTopLeft",
              fill: "#059669",
              fontSize: 11,
            }}
          />
          <ReferenceArea
            x1={LH_SPLIT}
            x2={100}
            y1={0}
            y2={SUCCESS_SPLIT}
            fill="#f87171"
            fillOpacity={0.07}
            stroke="none"
            label={{
              value: "Lighthouse over-predicts",
              position: "insideBottomRight",
              fill: "#dc2626",
              fontSize: 11,
            }}
          />
          <ReferenceLine x={LH_SPLIT} stroke="#cbd5e1" strokeDasharray="4 4" />
          <ReferenceLine y={SUCCESS_SPLIT} stroke="#cbd5e1" strokeDasharray="4 4" />

          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            content={(props) => (
              <CustomTooltip
                active={props.active}
                payload={props.payload as { payload: CorrelationPoint }[]}
                slope={slope}
                intercept={intercept}
              />
            )}
          />

          {/* Demoted least-squares guide (drawn behind the dots). */}
          <Scatter
            data={trendData}
            line={{ stroke: "#cbd5e1", strokeDasharray: "5 5", strokeWidth: 1.5 }}
            shape={() => <g />}
            isAnimationActive={false}
            legendType="none"
          />
          {/* Data points */}
          <Scatter data={points} shape={renderDot} isAnimationActive={false} />
        </ScatterChart>
      </ResponsiveContainer>
      </div>
    </div>
  );
}
