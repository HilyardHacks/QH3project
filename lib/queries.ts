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

const USE_FAKE = process.env.USE_FAKE_DATA === "true" || !process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

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
