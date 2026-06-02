import type {
  Site,
  LighthouseResult,
  Run,
  SiteLeaderboardEntry,
  CorrelationPoint,
  FailureMode,
} from "./types";
import {
  FAKE_LEADERBOARD,
  FAKE_CORRELATION_POINTS,
  FAKE_SITES,
  FAKE_LIGHTHOUSE,
  FAKE_RUNS,
} from "./fake-data";
import { wilsonCI } from "./stats";

// ---------------------------------------------------------------------------
// Data-source gate (REAL vs FAKE)
// ---------------------------------------------------------------------------
// Foot-gun fixed: previously USE_FAKE = forceFake || !FIREBASE_SERVICE_ACCOUNT_JSON,
// which silently served FAKE data even when GOOGLE_APPLICATION_CREDENTIALS pointed
// at a real service account. Now: REAL data is used when EITHER credential mechanism
// is present, UNLESS USE_FAKE_DATA === "true" forces fake.
const FORCE_FAKE = process.env.USE_FAKE_DATA === "true";
const HAS_SA_JSON = !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const HAS_ADC = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
const HAS_CREDENTIALS = HAS_SA_JSON || HAS_ADC;
const USE_FAKE = FORCE_FAKE || !HAS_CREDENTIALS;

// Single, explicit server-side log so it's never a mystery which data backs a render.
function describeDataMode(): string {
  if (FORCE_FAKE) return "FAKE (USE_FAKE_DATA=true forces fake)";
  if (!HAS_CREDENTIALS) {
    return "FAKE (no FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS present)";
  }
  const cred = HAS_SA_JSON ? "FIREBASE_SERVICE_ACCOUNT_JSON" : "GOOGLE_APPLICATION_CREDENTIALS";
  return `REAL (credential: ${cred})`;
}

// Log once per server process (module load), not per request.
if (typeof window === "undefined") {
  // eslint-disable-next-line no-console
  console.log(`[AgentRank] data mode: ${describeDataMode()}`);
}

// ---------------------------------------------------------------------------
// Leaderboard
// ---------------------------------------------------------------------------

export async function getLeaderboard(): Promise<SiteLeaderboardEntry[]> {
  if (USE_FAKE) return FAKE_LEADERBOARD;

  const { getAdminDb } = await import("./firebase-admin");
  const db = getAdminDb();

  const [sitesSnap, lhSnap, runsSnap] = await Promise.all([
    db.collection("sites").get(),
    db.collection("lighthouse").get(),
    db.collection("runs").get(),
  ]);

  const sites = sitesSnap.docs.map((d) => d.data() as Site);
  const lhMap = new Map<string, LighthouseResult>(
    lhSnap.docs.map((d) => [d.id, d.data() as LighthouseResult])
  );
  const runsBySite = new Map<string, Run[]>();
  runsSnap.docs.forEach((d) => {
    const run = d.data() as Run;
    const arr = runsBySite.get(run.site_id) ?? [];
    arr.push(run);
    runsBySite.set(run.site_id, arr);
  });

  const entries: SiteLeaderboardEntry[] = sites.map((site) => {
    const lh = lhMap.get(site.site_id);
    const runs = runsBySite.get(site.site_id) ?? [];
    return computeEntry(site, lh, runs);
  });

  entries.sort((a, b) => b.success_rate - a.success_rate);
  entries.forEach((e, i) => (e.rank = i + 1));

  return entries;
}

// ---------------------------------------------------------------------------
// Single site detail
// ---------------------------------------------------------------------------

export async function getSiteDetail(slug: string): Promise<{
  site: Site;
  lighthouse: LighthouseResult | null;
  runs: Run[];
} | null> {
  if (USE_FAKE) {
    const site = FAKE_SITES.find((s) => s.site_id === slug);
    if (!site) return null;
    const lh = FAKE_LIGHTHOUSE.find((l) => l.site_id === slug) ?? null;
    const runs = FAKE_RUNS.filter((r) => r.site_id === slug);
    return { site, lighthouse: lh, runs };
  }

  const { getAdminDb } = await import("./firebase-admin");
  const db = getAdminDb();

  const [siteDoc, lhDoc, runsSnap] = await Promise.all([
    db.collection("sites").doc(slug).get(),
    db.collection("lighthouse").doc(slug).get(),
    db.collection("runs").where("site_id", "==", slug).get(),
  ]);

  if (!siteDoc.exists) return null;

  return {
    site: siteDoc.data() as Site,
    lighthouse: lhDoc.exists ? (lhDoc.data() as LighthouseResult) : null,
    runs: runsSnap.docs.map((d) => d.data() as Run),
  };
}

// ---------------------------------------------------------------------------
// Correlation page
// ---------------------------------------------------------------------------

export async function getCorrelationPoints(): Promise<CorrelationPoint[]> {
  if (USE_FAKE) return FAKE_CORRELATION_POINTS;

  const entries = await getLeaderboard();
  return entries
    .filter((e) => e.lh_total !== null)
    .map((e) => ({
      site_id: e.site_id,
      name: e.name,
      lh_total: e.lh_total!,
      success_rate: e.success_rate,
      trial_count: e.trial_count,
      top_failure_mode: e.top_failure_mode,
      // CI already computed once on the leaderboard entry — reuse it, don't recompute.
      ci_low: e.ci_low,
      ci_high: e.ci_high,
      lh_accessibility_tree: e.lh_accessibility_tree ?? 0,
      lh_layout_stability: e.lh_layout_stability ?? 0,
      lh_llms_txt: e.lh_llms_txt ?? 0,
      lh_webmcp: e.lh_webmcp ?? 0,
    }));
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeEntry(
  site: Site,
  lh: LighthouseResult | undefined,
  runs: Run[]
): SiteLeaderboardEntry {
  const successes = runs.filter((r) => r.success).length;
  const success_rate = runs.length > 0 ? successes / runs.length : 0;
  const ci = wilsonCI(successes, runs.length);
  // Per-trial success ordered by trial_number, for the leaderboard dot-strip (🟩🟥…).
  const trial_results = [...runs]
    .sort((a, b) => a.trial_number - b.trial_number)
    .map((r) => r.success);
  const mean_steps =
    runs.length > 0
      ? runs.reduce((s, r) => s + r.step_count, 0) / runs.length
      : 0;

  // Dominant FAILURE mode — exclude "success" so a mostly-successful site doesn't report
  // top_failure_mode === "success". If there are no failures, report "success"; if there
  // are no runs at all, report "error" (no data yet).
  const failureCounts = new Map<FailureMode, number>();
  runs.forEach((r) => {
    if (r.failure_mode === "success") return;
    failureCounts.set(r.failure_mode, (failureCounts.get(r.failure_mode) ?? 0) + 1);
  });
  const topFailure = [...failureCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const top_failure_mode: FailureMode =
    runs.length === 0 ? "error" : (topFailure ?? "success");

  return {
    site_id: site.site_id,
    name: site.name,
    url: site.url,
    lh_total: lh?.lh_total ?? null,
    lh_accessibility_tree: lh?.lh_accessibility_tree ?? null,
    lh_layout_stability: lh?.lh_layout_stability ?? null,
    lh_llms_txt: lh?.lh_llms_txt ?? null,
    lh_webmcp: lh?.lh_webmcp ?? null,
    success_rate,
    trial_count: runs.length,
    mean_steps: Math.round(mean_steps * 10) / 10,
    top_failure_mode,
    ci_low: ci.lo,
    ci_high: ci.hi,
    trial_results,
    rank: 0,
  };
}

// ---------------------------------------------------------------------------
// Pearson correlation — used on the /correlation page
// ---------------------------------------------------------------------------

export function pearsonR(points: { x: number; y: number }[]): number {
  const n = points.length;
  if (n < 2) return 0;

  const meanX = points.reduce((s, p) => s + p.x, 0) / n;
  const meanY = points.reduce((s, p) => s + p.y, 0) / n;

  let num = 0, denomX = 0, denomY = 0;
  for (const p of points) {
    const dx = p.x - meanX;
    const dy = p.y - meanY;
    num += dx * dy;
    denomX += dx * dx;
    denomY += dy * dy;
  }

  const denom = Math.sqrt(denomX * denomY);
  return denom === 0 ? 0 : num / denom;
}

// Linear regression — returns {slope, intercept} for the trend line
export function linearRegression(points: { x: number; y: number }[]): { slope: number; intercept: number } {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: 0 };

  const meanX = points.reduce((s, p) => s + p.x, 0) / n;
  const meanY = points.reduce((s, p) => s + p.y, 0) / n;

  let num = 0, denom = 0;
  for (const p of points) {
    num += (p.x - meanX) * (p.y - meanY);
    denom += (p.x - meanX) ** 2;
  }

  const slope = denom === 0 ? 0 : num / denom;
  const intercept = meanY - slope * meanX;
  return { slope, intercept };
}

// ---------------------------------------------------------------------------
// Number of joined points (sites with a non-null Lighthouse total).
// This is the cohort n that backs every correlation statistic on /correlation.
// ---------------------------------------------------------------------------
export function joinedN(points: { x: number; y: number }[]): number {
  return points.length;
}

// ---------------------------------------------------------------------------
// Spearman rank correlation (rho)
// ---------------------------------------------------------------------------
// Rank-transform BOTH axes (average-rank tie handling), then run Pearson on the
// ranks. Perfectly-monotone data must give rho = 1 (or -1). This is robust to
// outliers and non-linearity, which matters with our small site cohort.

// Average-rank transform: ties share the mean of the ranks they would occupy.
function averageRanks(values: number[]): number[] {
  const n = values.length;
  const indexed = values.map((v, i) => ({ v, i }));
  indexed.sort((a, b) => a.v - b.v);

  const ranks = new Array<number>(n);
  let i = 0;
  while (i < n) {
    let j = i;
    // Extend over the tie group (equal values).
    while (j + 1 < n && indexed[j + 1].v === indexed[i].v) j++;
    // Ranks are 1-based; average rank of the tie group [i..j].
    const avgRank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) ranks[indexed[k].i] = avgRank;
    i = j + 1;
  }
  return ranks;
}

export function spearmanRho(points: { x: number; y: number }[]): number {
  const n = points.length;
  if (n < 2) return 0;

  const xRanks = averageRanks(points.map((p) => p.x));
  const yRanks = averageRanks(points.map((p) => p.y));

  // Pearson on the ranks. Reuse pearsonR to keep one definition of correlation.
  return pearsonR(xRanks.map((rx, i) => ({ x: rx, y: yRanks[i] })));
}

// ---------------------------------------------------------------------------
// Deterministic bootstrap 95% CI for a correlation coefficient
// ---------------------------------------------------------------------------
// We need a CI that is IDENTICAL across renders (server re-renders, refreshes,
// SSR vs client) so the published number never drifts. A seeded PRNG (mulberry32
// with a FIXED seed) makes the resampling reproducible. ~2000 resamples; for each,
// draw n points with replacement and recompute the statistic, then take the
// 2.5th / 97.5th percentiles of the resampled distribution.

const BOOTSTRAP_SEED = 0x9e3779b9; // fixed constant — do NOT change (keeps CI stable)
const BOOTSTRAP_RESAMPLES = 2000;

// mulberry32: tiny, fast, deterministic 32-bit PRNG. Returns a function yielding
// floats in [0, 1).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface CorrelationCI {
  lo: number;
  hi: number;
}

/**
 * Deterministic bootstrap 95% CI for a correlation statistic.
 * @param points  the joined (x, y) sample
 * @param statFn  the statistic to bootstrap (defaults to Spearman rho)
 */
export function bootstrapCI(
  points: { x: number; y: number }[],
  statFn: (pts: { x: number; y: number }[]) => number = spearmanRho
): CorrelationCI {
  const n = points.length;
  if (n < 2) {
    const s = statFn(points);
    return { lo: s, hi: s };
  }

  const rand = mulberry32(BOOTSTRAP_SEED);
  const stats: number[] = new Array(BOOTSTRAP_RESAMPLES);

  for (let b = 0; b < BOOTSTRAP_RESAMPLES; b++) {
    const sample: { x: number; y: number }[] = new Array(n);
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(rand() * n);
      sample[i] = points[idx];
    }
    stats[b] = statFn(sample);
  }

  stats.sort((a, b) => a - b);

  // 2.5th and 97.5th percentiles via nearest-rank on the sorted resamples.
  const loIdx = Math.floor(0.025 * (BOOTSTRAP_RESAMPLES - 1));
  const hiIdx = Math.ceil(0.975 * (BOOTSTRAP_RESAMPLES - 1));
  return { lo: stats[loIdx], hi: stats[hiIdx] };
}
