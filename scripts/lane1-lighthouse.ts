/**
 * Lane 1 — Lighthouse static scorer
 *
 * Lighthouse 13.3.0 — agentic-browsing category, verified 2026-05-30 against stripe.com.
 *
 * Verified audit IDs (confirmed from real LHR JSON):
 *   category  : "agentic-browsing"
 *   audits    : "agent-accessibility-tree", "cumulative-layout-shift",
 *               "llms-txt", "webmcp-registered-tools"
 *   lh_total  : Math.round(categories["agentic-browsing"].score * 100)
 *   sub-audits: 1 if score === 1 (strict pass), 0 otherwise — matches lib/types.ts
 *
 * Usage:
 *   npx tsx scripts/lane1-lighthouse.ts                # run all cohort sites
 *   npx tsx scripts/lane1-lighthouse.ts stripe vercel  # run named site IDs only
 *
 * Output (in order of preference):
 *   1. Firestore  lighthouse/{site_id}  (when FIREBASE_SERVICE_ACCOUNT_JSON is set)
 *   2. data/lighthouse-results.json     (local fallback, always written)
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "fs";
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
    const cmd = [
      "npx lighthouse",
      `"${url}"`,
      "--output=json",
      `--output-path="${tmpFile}"`,
      "--quiet",
      "--only-categories=agentic-browsing",
      "--chrome-flags='--headless --no-sandbox --disable-gpu'",
    ].join(" ");

    execSync(cmd, { stdio: "pipe", timeout: 120_000 });

    const raw = JSON.parse(readFileSync(tmpFile, "utf-8"));

    // lh_total = the agentic-browsing category score. Never fabricate a substitute.
    const agenticCategory = raw.categories?.["agentic-browsing"];
    if (!agenticCategory || typeof agenticCategory.score !== "number") {
      const available = Object.keys(raw.categories ?? {}).join(", ") || "(none)";
      throw new Error(
        `No "agentic-browsing" category in Lighthouse output. ` +
        `Available: [${available}]. Confirm lighthouse >= 13.3 is installed.`
      );
    }
    const lh_total = Math.round(agenticCategory.score * 100);

    const audits = raw.audits ?? {};
    const auditPass = (id: string): number => {
      const audit = audits[id];
      if (!audit || audit.score === null) return 0;
      return audit.score === 1 ? 1 : 0;
    };

    // Log if an expected audit id is absent (catches future Lighthouse renames).
    const expectedIds = [
      "agent-accessibility-tree",
      "cumulative-layout-shift",
      "llms-txt",
      "webmcp-registered-tools",
    ];
    const absent = expectedIds.filter((id) => !(id in audits));
    if (absent.length) {
      console.warn(`  ⚠ Audit ids not found in LHR: ${absent.join(", ")}`);
    }

    return {
      site_id: "", // filled in by caller
      lh_total,
      lh_accessibility_tree: auditPass("agent-accessibility-tree"),
      lh_layout_stability:   auditPass("cumulative-layout-shift"),
      lh_llms_txt:           auditPass("llms-txt"),
      lh_webmcp:             auditPass("webmcp-registered-tools"),
      run_at: new Date().toISOString(),
    };
  } catch (err) {
    const msg = (err as Error).message ?? String(err);
    // Distinguish access failures from Lighthouse crashes so callers can label them correctly.
    if (msg.includes("NO_FCP") || msg.includes("FAILED_DOCUMENT_REQUEST")) {
      console.error(`  ✗ Access failure (site blocked Lighthouse): ${msg.slice(0, 120)}`);
    } else {
      console.error(`  ✗ Lighthouse error: ${msg.slice(0, 120)}`);
    }
    return null;
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
}

// ---------------------------------------------------------------------------
// Persistence — Firestore (primary) + local JSON (fallback, always written)
// ---------------------------------------------------------------------------

const LOCAL_PATH = path.join(process.cwd(), "data", "lighthouse-results.json");

function loadLocalResults(): Record<string, LighthouseResult> {
  if (!existsSync(LOCAL_PATH)) return {};
  try {
    return JSON.parse(readFileSync(LOCAL_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function saveLocalResults(results: Record<string, LighthouseResult>): void {
  mkdirSync(path.dirname(LOCAL_PATH), { recursive: true });
  writeFileSync(LOCAL_PATH, JSON.stringify(results, null, 2));
}

async function persist(result: LighthouseResult, local: Record<string, LighthouseResult>): Promise<"firestore" | "local"> {
  // Always write local first — zero dependencies.
  local[result.site_id] = result;
  saveLocalResults(local);

  const hasCreds =
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (hasCreds) {
    const { getAdminDb } = await import("../lib/firebase-admin");
    const db = getAdminDb();
    await db.collection("lighthouse").doc(result.site_id).set(result);
    return "firestore";
  }
  return "local";
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

  const hasCreds = !!(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS
  );

  console.log(`\nLane 1 — Lighthouse static scorer`);
  console.log(`  Sites  : ${sites.length}`);
  console.log(`  Output : ${hasCreds ? "Firestore + data/lighthouse-results.json" : "data/lighthouse-results.json (no Firebase creds)"}`);
  console.log(`${"─".repeat(52)}`);

  const local = loadLocalResults();
  const summary: { site_id: string; lh_total: number | null; status: string }[] = [];

  for (let i = 0; i < sites.length; i++) {
    const site = sites[i];
    process.stdout.write(`[${i + 1}/${sites.length}] ${site.site_id.padEnd(14)} ${site.url} … `);

    const lh = await runLighthouse(site.url);
    if (!lh) {
      summary.push({ site_id: site.site_id, lh_total: null, status: "FAILED" });
      console.log("FAILED");
      continue;
    }

    lh.site_id = site.site_id;

    try {
      const dest = await persist(lh, local);
      summary.push({ site_id: site.site_id, lh_total: lh.lh_total, status: dest });
      console.log(
        `lh_total=${String(lh.lh_total).padStart(3)}%  ` +
        `a11y=${lh.lh_accessibility_tree}  cls=${lh.lh_layout_stability}  llms=${lh.lh_llms_txt}  webmcp=${lh.lh_webmcp}  [${dest}]`
      );
    } catch (err) {
      console.error(`  Persist failed: ${(err as Error).message}`);
      summary.push({ site_id: site.site_id, lh_total: lh.lh_total, status: "WRITE_FAILED" });
    }
  }

  // X-axis spread check (the never-cut gate)
  const scored = summary.filter((r) => r.lh_total !== null).map((r) => r.lh_total as number).sort((a, b) => a - b);
  const failed = summary.filter((r) => r.lh_total === null);

  console.log(`\n${"─".repeat(52)}`);
  console.log(`X-AXIS SPREAD CHECK`);
  if (scored.length > 0) {
    const min = scored[0], max = scored[scored.length - 1];
    const mean = (scored.reduce((a, b) => a + b, 0) / scored.length).toFixed(1);
    const spread = max - min;
    console.log(`  n=${scored.length}  min=${min}%  max=${max}%  mean=${mean}%  spread=${spread}pts`);
    if (spread < 30) {
      console.log(`  ⚠ BORING BLOB: spread only ${spread}pts. Swap in lower-scoring sites.`);
    } else {
      console.log(`  ✓ Spread OK (${spread}pts ≥ 30pt threshold).`);
    }
    // Sort and print the table
    const rows = summary
      .filter((r) => r.lh_total !== null)
      .sort((a, b) => (a.lh_total as number) - (b.lh_total as number));
    console.log(`\n  lh_total  site_id`);
    rows.forEach((r) => console.log(`  ${String(r.lh_total) + "%"}`.padEnd(10) + r.site_id));
  }
  if (failed.length) {
    console.log(`\n  Failed (${failed.length}): ${failed.map((r) => r.site_id).join(", ")}`);
  }
  console.log(`\n  Results → data/lighthouse-results.json`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
