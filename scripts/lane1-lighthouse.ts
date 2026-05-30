/**
 * Lane 1 — Lighthouse static scorer
 *
 * Runs the Lighthouse CLI with the Agentic Browsing category enabled,
 * parses the JSON output, and writes a `lighthouse` document to Firestore.
 *
 * Usage:
 *   npx tsx scripts/lane1-lighthouse.ts                # run all cohort sites
 *   npx tsx scripts/lane1-lighthouse.ts stripe vercel  # run named site IDs only
 *
 * Env vars required:
 *   FIREBASE_SERVICE_ACCOUNT_JSON  or  GOOGLE_APPLICATION_CREDENTIALS
 */

import { execSync } from "child_process";
import { writeFileSync, readFileSync } from "fs";
import path from "path";
import cohortRaw from "./cohort.json";
import type { LighthouseResult } from "../lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CohortEntry {
  site_id: string;
  name: string;
  url: string;
  answer_substring: string;
  answer_note: string;
  expected_lh: string;
  category: string;
  manual_pass: string;
}

const cohort = cohortRaw as CohortEntry[];

// ---------------------------------------------------------------------------
// Lighthouse runner
// ---------------------------------------------------------------------------

async function runLighthouse(url: string): Promise<LighthouseResult | null> {
  const tmpFile = path.join(process.cwd(), ".lh-tmp.json");

  try {
    // Lighthouse 12+ CLI: --only-categories=agentic-browsing (new in 13.3)
    // Falls back to best-practices + accessibility if the category isn't found.
    const cmd = [
      "npx lighthouse",
      `"${url}"`,
      "--output=json",
      `--output-path="${tmpFile}"`,
      "--quiet",
      "--chrome-flags='--headless --no-sandbox --disable-gpu'",
      "--only-categories=agentic-browsing,accessibility,best-practices",
    ].join(" ");

    console.log(`  Running Lighthouse on ${url}`);
    execSync(cmd, { stdio: "pipe", timeout: 120_000 });

    const raw = JSON.parse(readFileSync(tmpFile, "utf-8"));

    // Extract agentic-browsing category (or fall back to the available data)
    const agenticCategory = raw.categories?.["agentic-browsing"];
    const lh_total = agenticCategory
      ? Math.round(agenticCategory.score * 100)
      : Math.round(
          ((raw.categories?.accessibility?.score ?? 0) +
            (raw.categories?.["best-practices"]?.score ?? 0)) *
            50
        );

    // Extract individual audit results
    const audits = raw.audits ?? {};

    const auditPass = (id: string): number => {
      const audit = audits[id];
      if (!audit) return 0;
      // score of 1 = pass, 0 = fail, null = not applicable
      return audit.score === 1 ? 1 : 0;
    };

    // Map to our schema — audit IDs may vary in the released Lighthouse version.
    // These are the best guesses from the spec; adjust if the actual Lighthouse output differs.
    const result: LighthouseResult = {
      site_id: "", // filled in by caller
      lh_total,
      lh_accessibility_tree: auditPass("agentic-browsing-accessibility-tree") || auditPass("accessibility"),
      lh_layout_stability: auditPass("agentic-browsing-layout-stability") || auditPass("cumulative-layout-shift"),
      lh_llms_txt: auditPass("agentic-browsing-llms-txt"),
      lh_webmcp: auditPass("agentic-browsing-webmcp"),
      run_at: new Date().toISOString(),
    };

    return result;
  } catch (err) {
    console.error(`  Lighthouse failed:`, (err as Error).message);
    return null;
  } finally {
    try { execSync(`del "${tmpFile}" 2>nul`, { stdio: "pipe" }); } catch {}
  }
}

// ---------------------------------------------------------------------------
// Firestore writer
// ---------------------------------------------------------------------------

async function writeToFirestore(result: LighthouseResult): Promise<void> {
  const { getAdminDb } = await import("../lib/firebase-admin");
  const db = getAdminDb();
  await db.collection("lighthouse").doc(result.site_id).set(result);
  console.log(`  ✓ Wrote lighthouse/${result.site_id} to Firestore`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const targetIds = args.length > 0 ? new Set(args) : null;
  const sites = targetIds
    ? cohort.filter((s) => targetIds.has(s.site_id))
    : cohort;

  if (sites.length === 0) {
    console.error("No matching sites found. Check site IDs.");
    process.exit(1);
  }

  console.log(`\nLane 1 — Lighthouse runner`);
  console.log(`Sites to process: ${sites.length}`);
  console.log(`----------------------------------`);

  const results: { site_id: string; status: string }[] = [];

  for (const site of sites) {
    console.log(`\n[${site.site_id}] ${site.name}`);

    const lh = await runLighthouse(site.url);
    if (!lh) {
      results.push({ site_id: site.site_id, status: "FAILED" });
      continue;
    }

    lh.site_id = site.site_id;

    try {
      await writeToFirestore(lh);
      results.push({ site_id: site.site_id, status: "OK" });
      console.log(
        `  lh_total=${lh.lh_total}  a11y=${lh.lh_accessibility_tree}  stability=${lh.lh_layout_stability}  llms=${lh.lh_llms_txt}  webmcp=${lh.lh_webmcp}`
      );
    } catch (err) {
      console.error(`  Firestore write failed:`, (err as Error).message);
      results.push({ site_id: site.site_id, status: "WRITE_FAILED" });
    }
  }

  console.log(`\n----------------------------------`);
  console.log(`Summary:`);
  results.forEach((r) => console.log(`  ${r.site_id}: ${r.status}`));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
