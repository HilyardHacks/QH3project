/**
 * analyze-correlation.ts — throwaway local analysis (NO Firestore).
 *
 * Recomputes the headline correlation EXACTLY as the deployed /correlation page does,
 * by reusing the real functions from lib/queries (pearsonR / spearmanRho / bootstrapCI /
 * joinedN / linearRegression). Mirrors getCorrelationPoints: x = homepage lh_total,
 * y = NAVIGATION success_rate (the `runs` collection), one point per site with a LH score.
 *
 * Sources (read-only, from repo root):
 *   data/lighthouse-results.json   (the NEW homepage Lighthouse run)
 *   lane2-runs.jsonl               (navigation runs -> the headline y-axis)
 *   lane2-runs-extraction.jsonl    (extraction runs -> a secondary correlation)
 *   scripts/cohort.json            (names + canonical site ordering)
 *
 * Run:  npx tsx scripts/analyze-correlation.ts
 */
import { readFileSync } from "fs";
import path from "path";
import cohort from "./cohort.json";
import {
  pearsonR,
  spearmanRho,
  bootstrapCI,
  joinedN,
  linearRegression,
} from "../lib/queries";

const root = process.cwd();

interface LH {
  site_id: string;
  lh_total: number;
  lh_accessibility_tree: number;
  lh_layout_stability: number;
  lh_llms_txt: number;
  lh_webmcp: number;
}
interface Run {
  site_id: string;
  success: boolean;
  failure_mode: string;
}

const lh: LH[] = JSON.parse(
  readFileSync(path.join(root, "data", "lighthouse-results.json"), "utf8")
);
const lhMap = new Map(lh.map((r) => [r.site_id, r]));

function loadRuns(file: string): Map<string, Run[]> {
  const bySite = new Map<string, Run[]>();
  const lines = readFileSync(path.join(root, file), "utf8")
    .split(/\r?\n/)
    .filter(Boolean);
  for (const l of lines) {
    const r: Run = JSON.parse(l);
    const arr = bySite.get(r.site_id) ?? [];
    arr.push(r);
    bySite.set(r.site_id, arr);
  }
  return bySite;
}
const navBySite = loadRuns("lane2-runs.jsonl");
const extBySite = loadRuns("lane2-runs-extraction.jsonl");

function successRate(runs: Run[] | undefined): number {
  if (!runs || runs.length === 0) return 0;
  return runs.filter((r) => r.success).length / runs.length;
}
function topFailure(runs: Run[] | undefined): string {
  if (!runs || runs.length === 0) return "—";
  const counts = new Map<string, number>();
  runs.forEach((r) => {
    if (r.failure_mode === "success") return;
    counts.set(r.failure_mode, (counts.get(r.failure_mode) ?? 0) + 1);
  });
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return top ? top[0] : "success";
}

// Build points exactly like getCorrelationPoints(): iterate the cohort (== `sites`),
// keep only sites with a non-null lh_total, y = navigation success_rate.
interface Pt {
  site_id: string;
  name: string;
  lh_total: number;
  success_rate: number;
  successes: number;
  trials: number;
  top_failure: string;
  ext_success_rate: number;
  lh_accessibility_tree: number;
  lh_layout_stability: number;
  lh_llms_txt: number;
  lh_webmcp: number;
}

const points: Pt[] = [];
for (const c of cohort as any[]) {
  const l = lhMap.get(c.site_id);
  if (!l) continue; // lh_total === null -> excluded (matches the frontend filter)
  const navRuns = navBySite.get(c.site_id);
  const extRuns = extBySite.get(c.site_id);
  points.push({
    site_id: c.site_id,
    name: c.name,
    lh_total: l.lh_total,
    success_rate: successRate(navRuns),
    successes: (navRuns ?? []).filter((r) => r.success).length,
    trials: (navRuns ?? []).length,
    top_failure: topFailure(navRuns),
    ext_success_rate: successRate(extRuns),
    lh_accessibility_tree: l.lh_accessibility_tree,
    lh_layout_stability: l.lh_layout_stability,
    lh_llms_txt: l.lh_llms_txt,
    lh_webmcp: l.lh_webmcp,
  });
}

// ---- Headline: homepage LH vs NAVIGATION success (the demo number) ----
const xy = points.map((p) => ({ x: p.lh_total, y: p.success_rate }));
const r = pearsonR(xy);
const rho = spearmanRho(xy);
const ci = bootstrapCI(xy, spearmanRho);
const n = joinedN(xy);
const { slope, intercept } = linearRegression(xy);

// ---- Secondary: homepage LH vs EXTRACTION success ----
const xyExt = points.map((p) => ({ x: p.lh_total, y: p.ext_success_rate }));
const rExt = pearsonR(xyExt);
const rhoExt = spearmanRho(xyExt);

// ---- Sub-audit Pearson r (mirrors the correlation page) ----
const subAudits = [
  ["lh_accessibility_tree", "Accessibility Tree"],
  ["lh_layout_stability", "Layout Stability"],
  ["lh_llms_txt", "llms.txt"],
  ["lh_webmcp", "WebMCP"],
] as const;
const subAuditR = subAudits
  .map(([key, label]) => ({
    label,
    r: pearsonR(points.map((p) => ({ x: (p as any)[key], y: p.success_rate }))),
  }))
  .sort((a, b) => Math.abs(b.r) - Math.abs(a.r));

// ---- Auto-"surprising" site (biggest LH-rank vs success-rank gap) ----
const byLh = [...points].sort((a, b) => b.lh_total - a.lh_total);
const bySucc = [...points].sort((a, b) => b.success_rate - a.success_rate);
const surprising = points
  .map((p) => {
    const lhRank = byLh.findIndex((x) => x.site_id === p.site_id);
    const succRank = bySucc.findIndex((x) => x.site_id === p.site_id);
    return { p, gap: Math.abs(lhRank - succRank), lhRank, succRank };
  })
  .sort((a, b) => b.gap - a.gap)[0];

// ---- Print ----
const pct = (v: number) => `${Math.round(v * 100)}%`;
console.log("\n=== AgentRank headline correlation (homepage LH vs NAVIGATION success) ===");
console.log(`n (joined sites)   : ${n}`);
console.log(`Pearson r          : ${r.toFixed(4)}`);
console.log(`Spearman rho       : ${rho.toFixed(4)}`);
console.log(`95% CI (bootstrap) : [${ci.lo.toFixed(4)}, ${ci.hi.toFixed(4)}]`);
console.log(`trend slope/intcpt : ${slope.toFixed(5)} / ${intercept.toFixed(4)}`);
console.log(`CI reliable?       : ${!(n < 5 || ci.lo === ci.hi)}`);

console.log("\n--- Per-site (sorted by Lighthouse desc) ---");
console.log("site_id           LH   nav_succ  (n)   top_failure        ext_succ");
for (const p of [...points].sort((a, b) => b.lh_total - a.lh_total)) {
  console.log(
    `${p.site_id.padEnd(16)} ${String(p.lh_total).padStart(3)}   ${pct(p.success_rate).padStart(5)}  (${p.successes}/${p.trials})  ${p.top_failure.padEnd(17)} ${pct(p.ext_success_rate).padStart(5)}`
  );
}

console.log("\n--- Sub-audit Pearson r vs nav success ---");
subAuditR.forEach((s, i) => console.log(`${i === 0 ? "🥇 " : "   "}${s.label.padEnd(20)} r = ${s.r.toFixed(4)}`));

console.log("\n--- Off-diagonal (the story) ---");
const hiLoLow = points.filter((p) => p.lh_total >= 80 && p.success_rate <= 0.4);
const loLoHi = points.filter((p) => p.lh_total <= 40 && p.success_rate >= 0.6);
console.log(`HIGH LH (>=80) but LOW nav (<=40%): ${hiLoLow.map((p) => `${p.site_id}(LH${p.lh_total}/${pct(p.success_rate)})`).join(", ") || "none"}`);
console.log(`LOW LH (<=40) but HIGH nav (>=60%): ${loLoHi.map((p) => `${p.site_id}(LH${p.lh_total}/${pct(p.success_rate)})`).join(", ") || "none"}`);
if (surprising) {
  console.log(
    `\nAuto-surprising pick: ${surprising.p.name} (${surprising.p.site_id}) — LH rank #${surprising.lhRank + 1}, success rank #${surprising.succRank + 1}, gap ${surprising.gap}`
  );
}

console.log("\n=== Secondary: homepage LH vs EXTRACTION success ===");
console.log(`Pearson r    : ${rExt.toFixed(4)}`);
console.log(`Spearman rho : ${rhoExt.toFixed(4)}`);
console.log(
  `nav mean succ: ${pct(points.reduce((s, p) => s + p.success_rate, 0) / points.length)}   ext mean succ: ${pct(points.reduce((s, p) => s + p.ext_success_rate, 0) / points.length)}`
);
console.log("");
