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
import { readFileSync, unlinkSync } from "fs";
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
  task_hint?: string;
}

const cohort = cohortRaw as CohortEntry[];

// ---------------------------------------------------------------------------
// Lighthouse runner
// ---------------------------------------------------------------------------

async function runLighthouse(url: string): Promise<LighthouseResult | null> {
  const tmpFile = path.join(process.cwd(), `.lh-tmp-${process.pid}.json`);

  try {
    // Requires Lighthouse >= 13.3 — the Agentic Browsing category shipped May 2026.
    const cmd = [
      "npx lighthouse",
      `"${url}"`,
      "--output=json",
      `--output-path="${tmpFile}"`,
      "--quiet",
      "--chrome-flags='--headless --no-sandbox --disable-gpu'",
      "--only-categories=agentic-browsing",
    ].join(" ");

    console.log(`  Running Lighthouse on ${url}`);
    execSync(cmd, { stdio: "pipe", timeout: 120_000 });

    const raw = JSON.parse(readFileSync(tmpFile, "utf-8"));

    // The Agentic Browsing category IS the lh_total. Do NOT fabricate a substitute
    // score — a fabricated covariate would silently corrupt the headline correlation.
    // Fail loudly so the run is recorded as FAILED rather than written with a fake number.
    const agenticCategory = raw.categories?.["agentic-browsing"];
    if (!agenticCategory || typeof agenticCategory.score !== "number") {
      const available = Object.keys(raw.categories ?? {}).join(", ") || "(none)";
      throw new Error(
        `No "agentic-browsing" category in Lighthouse output. Available: [${available}]. ` +
        `Confirm lighthouse >= 13.3 is installed and that the category id is correct.`
      );
    }
    const lh_total = Math.round(agenticCategory.score * 100);

    // Per-audit pass/fail. score 1 = pass, otherwise 0. Downstream (correlation, UI) assumes 0/1.
    const audits = raw.audits ?? {};
    const auditPass = (id: string): number => {
      const audit = audits[id];
      if (!audit) return 0;
      return audit.score === 1 ? 1 : 0;
    };

    // NOTE: these audit ids are best-guesses from the spec. Verify them against real
    // Lighthouse 13.3 JSON once (npx lighthouse <url> --output=json, grep raw.audits keys)
    // and correct here before the cohort run. The warning below fires if an id is absent,
    // so a 0 from a typo'd id can't masquerade as a genuine audit failure unnoticed.
    const auditIds = {
      lh_accessibility_tree: "agentic-browsing-accessibility-tree",
      lh_layout_stability: "agentic-browsing-layout-stability",
      lh_llms_txt: "agentic-browsing-llms-txt",
      lh_webmcp: "agentic-browsing-webmcp",
    };
    const missing = Object.values(auditIds).filter((id) => !(id in audits));
    if (missing.length) {
      const agenticAudits = Object.keys(audits).filter((k) => k.includes("agentic")).join(", ") || "(none)";
      console.warn(
        `  ⚠ Unknown audit ids: ${missing.join(", ")}. ` +
        `Agentic audits actually present: ${agenticAudits}. Update auditIds in lane1-lighthouse.ts.`
      );
    }

    const result: LighthouseResult = {
      site_id: "", // filled in by caller
      lh_total,
      lh_accessibility_tree: auditPass(auditIds.lh_accessibility_tree),
      lh_layout_stability: auditPass(auditIds.lh_layout_stability),
      lh_llms_txt: auditPass(auditIds.lh_llms_txt),
      lh_webmcp: auditPass(auditIds.lh_webmcp),
      run_at: new Date().toISOString(),
    };

    return result;
  } catch (err) {
    console.error(`  Lighthouse failed:`, (err as Error).message);
    return null;
  } finally {
    try { unlinkSync(tmpFile); } catch {}
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
