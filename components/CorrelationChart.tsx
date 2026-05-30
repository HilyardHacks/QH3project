"use client";

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Label,
} from "recharts";
import { CorrelationPoint } from "@/lib/types";

interface Props {
  points: CorrelationPoint[];
  slope: number;
  intercept: number;
  r: number;
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { payload: CorrelationPoint }[] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-sm px-3 py-2 text-sm">
      <p className="font-semibold text-slate-900">{d.name}</p>
      <p className="text-slate-500">Lighthouse: <span className="font-mono text-slate-700">{d.lh_total}</span></p>
      <p className="text-slate-500">Success rate: <span className="font-mono text-slate-700">{Math.round(d.success_rate * 100)}%</span></p>
    </div>
  );
}

function CustomDot(props: {
  cx?: number;
  cy?: number;
  payload?: CorrelationPoint;
}) {
  const { cx, cy, payload } = props;
  if (!cx || !cy || !payload) return null;
  const rate = payload.success_rate;
  const fill = rate >= 0.7 ? "#10b981" : rate >= 0.4 ? "#f59e0b" : "#ef4444";
  return (
    <g>
      <circle cx={cx} cy={cy} r={6} fill={fill} fillOpacity={0.8} stroke="white" strokeWidth={1.5} />
      <text x={cx + 9} y={cy + 4} fontSize={11} fill="#64748b">{payload.name}</text>
    </g>
  );
}

export default function CorrelationChart({ points, slope, intercept, r }: Props) {
  // Build trend line from min to max x
  const xs = points.map((p) => p.lh_total);
  const xMin = Math.max(0, Math.min(...xs) - 5);
  const xMax = Math.min(100, Math.max(...xs) + 5);
  const trendData = [
    { lh_total: xMin, success_rate: Math.max(0, Math.min(1, slope * xMin + intercept)) },
    { lh_total: xMax, success_rate: Math.max(0, Math.min(1, slope * xMax + intercept)) },
  ];

  const scatterData = points.map((p) => ({
    ...p,
    // Recharts ScatterChart needs x/y keys
    lh_total: p.lh_total,
    success_rate: p.success_rate,
  }));

  return (
    <div>
      <div className="flex items-center gap-4 mb-4">
        <div className="bg-sky-50 border border-sky-200 rounded-lg px-4 py-3 text-center">
          <p className="text-2xl font-bold text-sky-700 tabular-nums">{r.toFixed(2)}</p>
          <p className="text-xs text-sky-600 mt-0.5">Pearson r</p>
        </div>
        <p className="text-sm text-slate-500 max-w-sm">
          {Math.abs(r) >= 0.7
            ? "Strong correlation — Lighthouse score is a good predictor of agent success."
            : Math.abs(r) >= 0.4
            ? "Moderate correlation — Lighthouse score has some predictive power."
            : "Weak correlation — Google's rubric barely predicts real agent success. That's the finding."}
        </p>
      </div>
      <ResponsiveContainer width="100%" height={420}>
        <ScatterChart margin={{ top: 20, right: 60, bottom: 40, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis
            dataKey="lh_total"
            type="number"
            domain={[0, 100]}
            tick={{ fontSize: 12, fill: "#94a3b8" }}
            tickLine={false}
          >
            <Label value="Lighthouse Agentic Browsing Score (0–100)" offset={-10} position="insideBottom" style={{ fontSize: 12, fill: "#64748b" }} />
          </XAxis>
          <YAxis
            dataKey="success_rate"
            type="number"
            domain={[0, 1]}
            tickFormatter={(v) => `${Math.round(v * 100)}%`}
            tick={{ fontSize: 12, fill: "#94a3b8" }}
            tickLine={false}
          >
            <Label value="Agent Success Rate" angle={-90} position="insideLeft" style={{ fontSize: 12, fill: "#64748b" }} />
          </YAxis>
          <Tooltip content={<CustomTooltip />} />
          {/* Trend line */}
          <Scatter data={trendData} line={{ stroke: "#94a3b8", strokeDasharray: "4 4", strokeWidth: 1.5 }} shape={() => null} />
          {/* Data points */}
          <Scatter data={scatterData} shape={<CustomDot />} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
