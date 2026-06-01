/**
 * Lane 1 — Lighthouse static scorer (the experiment's x-axis)
 *
 * Runs the Lighthouse CLI with the Agentic Browsing category enabled, parses the
 * JSON output, and writes a `lighthouse` document per site. When Firebase creds
 * are present the doc goes to Firestore; otherwise results are written to a local
 * JSON file (data/lighthouse-results.json) so the x-axis spread can be checked
 * offline.
 *
 * Usage:
 *   npx tsx scripts/lane1-lighthouse.ts                # run all cohort sites
 *   npx tsx scripts/lane1-lighthouse.ts stripe vercel  # run named site IDs only
 *
 * Env vars (optional — absence triggers the local-JSON fallback):
 *   FIREBASE_SERVICE_ACCOUNT_JSON  or  GOOGLE_APPLICATION_CREDENTIALS
 *
 * ---------------------------------------------------------------------------
 * SCORING RUBRIC — LOCKED (verified against lighthouse@13.3.0 source)
 * ---------------------------------------------------------------------------
 * Category id ...... 'agentic-browsing'
 *   Source: node_modules/lighthouse/core/config/agentic-browsing-config.js
 *   lh_total = round(categories['agentic-browsing'].score * 100)  (0–100)
 *
 * The category has exactly SIX auditRefs (config lines 60–67). Their real
 * meta.id values were confirmed by grepping the audit source files:
 *   - agent-accessibility-tree     (core/audits/agentic/agent-accessibility-tree.js)
 *   - cumulative-layout-shift      (core/audits/metrics/cumulative-layout-shift.js)
 *   - llms-txt                     (core/audits/agentic/llms-txt.js)
 *   - webmcp-form-coverage         (core/audits/webmcp-form-coverage.js)
 *   - webmcp-registered-tools      (core/audits/webmcp-registered-tools.js)
 *   - webmcp-schema-validity       (core/audits/webmcp-schema-validity.js)
 *
 * lib/types.ts (LighthouseResult) keeps FOUR sub-audit fields, so the six
 * Lighthouse audits are mapped to four covariates as follows:
 *   lh_accessibility_tree  <- agent-accessibility-tree   (1:1)
 *   lh_layout_stability    <- cumulative-layout-shift     (1:1, see CLS note)
 *   lh_llms_txt            <- llms-txt                    (1:1)
 *   lh_webmcp              <- webmcp-form-coverage AND
 *                            webmcp-registered-tools AND
 *                            webmcp-schema-validity        (3 -> 1 collapse)
 *
 * >>> PRE-REGISTERED CHOICE TO FLAG TO MEMBER 1 (cohort/analysis owner) <<<
 *   The three WebMCP audits are collapsed into the single lh_webmcp 0/1 field
 *   with a strict AND (MIN) rule: lh_webmcp = 1 only if ALL THREE WebMCP audits
 *   pass, else 0. This is a deliberate, pre-registered modeling decision — it is
 *   recorded here (not in lib/types.ts, which stays a single 0/1) so the
 *   correlation analysis treats lh_webmcp as "full WebMCP support". WebMCP
 *   adoption across the public web is ~nil today, so lh_webmcp will be 0 for
 *   essentially every cohort site; do not read signal into an all-zero column.
 *
 * CLS NOTE (also flag to Member 1): cumulative-layout-shift is a NUMERIC metric
 *   audit (scoreDisplayMode NUMERIC, scored against p10=0.1 / median=0.25), not
 *   a native pass/fail. We binarize it with the same score===1 rule as the other
 *   audits, so lh_layout_stability=1 means "essentially perfect CLS" rather than
 *   a true boolean audit pass. Kept binary for a uniform 0/1 covariate contract.
 *
 * Pinned to lighthouse 13.3.0. Do not retune the rubric mid-cohort.
 * ---------------------------------------------------------------------------
 */

import { execSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from "fs";
import path from "path";
import cohortRaw from "./cohort.json";
import type { LighthouseResult } from "../lib/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// Matches the canonical scripts/cohort.json shape. Lane 1 only reads
// site_id / name / url; the rest are declared so the cast is type-safe and so
// future fields are documented. (Member 4 owns cohort.json — do not edit it here.)
interface CohortEntry {
  site_id: string;
  name: string;
  tier: string;
  url: string;
  homepage: string;
  question: string;
  task_hint: string;
  answer_substring: string;
  answer_note: string;
  match_rule: string;
  flag: string;
  runnable: boolean;
  manual_pass: string;
}

const cohort = cohortRaw as CohortEntry[];

/**
 * Outcome of one site. Either an OK LighthouseResult, or a FAILED outcome with a
 * distinct reason. A FAILED site is NEVER written as a doc — an access failure
 * (paywall / consent wall / NO_FCP / runtimeError) must not masquerade as a
 * genuine all-zero "low agent-readiness" score.
 */
type SiteOutcome =
  | { status: "OK"; result: LighthouseResult }
  | { status: "FAILED"; reason: string };

// ---------------------------------------------------------------------------
// Lighthouse runner
// ---------------------------------------------------------------------------

async function runLighthouse(url: string): Promise<SiteOutcome> {
  const tmpFile = path.join(process.cwd(), `.lh-tmp-${process.pid}.json`);

  // Run the Lighthouse CLI. IMPORTANT (Windows): chrome-launcher's temp-profile
  // cleanup (destroyTmp -> rmSync) intermittently throws EPERM on the
  // %LOCALAPPDATA%\Temp\lighthouse.* dir AFTER the report JSON is already written
  // (Chrome/Defender still holds a handle). That makes the CLI exit non-zero — so
  // execSync throws — even though the audit fully succeeded. So we record the exec
  // error but do NOT fail on it alone: we SALVAGE the report from the output file if
  // it was written, and only FAIL when no valid report exists.
  let execError: string | null = null;
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
  } catch (err) {
    execError = (err as Error).message;
  }

  try {
    // No report file at all -> a genuine failure (unreachable host, protocol error
    // before report generation, etc.), not a salvageable cleanup crash.
    if (!existsSync(tmpFile)) {
      return { status: "FAILED", reason: `lighthouse_error — ${execError ?? "no Lighthouse output produced"}` };
    }

    const raw = JSON.parse(readFileSync(tmpFile, "utf-8"));

    // (1) runtimeError gate — check BEFORE reading any scores.
    // Lighthouse still emits a JSON file (with a categories object full of null/
    // zero scores) when the page never reached a usable state — e.g. NO_FCP, a
    // consent/paywall redirect, or a protocol timeout. Treating that as a real
    // agentic-browsing result would write a bogus all-zero doc and pollute the
    // x-axis with "0 because we couldn't load it" disguised as "0 readiness".
    // So: if runtimeError is present, fail the site loudly with a distinct reason
    // and write NOTHING.
    if (raw.runtimeError && typeof raw.runtimeError.code === "string") {
      const { code, message } = raw.runtimeError;
      return {
        status: "FAILED",
        reason: `runtimeError:${code}${message ? ` — ${message}` : ""}`,
      };
    }

    // (2) The Agentic Browsing category IS the lh_total. Do NOT fabricate a
    // substitute score — a fabricated covariate would silently corrupt the
    // headline correlation. Fail loudly so the run is recorded as FAILED rather
    // than written with a fake number.
    const agenticCategory = raw.categories?.["agentic-browsing"];
    if (!agenticCategory || typeof agenticCategory.score !== "number") {
      const available = Object.keys(raw.categories ?? {}).join(", ") || "(none)";
      throw new Error(
        `No "agentic-browsing" category in Lighthouse output. Available: [${available}]. ` +
        `Confirm lighthouse >= 13.3 is installed and that the category id is correct.`
      );
    }
    const lh_total = Math.round(agenticCategory.score * 100);

    // (3) Per-audit pass/fail. score 1 = pass, otherwise 0 (null/numeric<1 -> 0).
    // Downstream (correlation, UI) assumes a strict 0/1.
    const audits = raw.audits ?? {};
    const auditPass = (id: string): number => {
      const audit = audits[id];
      if (!audit) return 0;
      return audit.score === 1 ? 1 : 0;
    };

    // Real lighthouse@13.3.0 agentic-browsing audit ids (verified against source —
    // see the LOCKED rubric in the file header). The warning below fires if an id
    // is absent from the output, so a 0 from a missing id can't quietly pass as a
    // genuine audit failure.
    const AUDIT_IDS = {
      accessibilityTree: "agent-accessibility-tree",
      layoutStability: "cumulative-layout-shift",
      llmsTxt: "llms-txt",
      // Three WebMCP audits collapsed into lh_webmcp (see header FLAG).
      webmcpFormCoverage: "webmcp-form-coverage",
      webmcpRegisteredTools: "webmcp-registered-tools",
      webmcpSchemaValidity: "webmcp-schema-validity",
    };
    const expectedIds = Object.values(AUDIT_IDS);
    const missing = expectedIds.filter((id) => !(id in audits));
    if (missing.length) {
      const agenticAudits =
        Object.keys(audits)
          .filter((k) => expectedIds.some((e) => k === e) || k.includes("webmcp") || k.includes("llms") || k.includes("agent"))
          .join(", ") || "(none)";
      console.warn(
        `  ⚠ Audit ids absent from output: ${missing.join(", ")}. ` +
        `Agentic/related audits present: ${agenticAudits}. ` +
        `These will score 0 — confirm against the lighthouse@13.3.0 source if unexpected.`
      );
    }

    // lh_webmcp = strict AND over the three WebMCP audits (pre-registered MIN rule).
    const lh_webmcp =
      auditPass(AUDIT_IDS.webmcpFormCoverage) === 1 &&
      auditPass(AUDIT_IDS.webmcpRegisteredTools) === 1 &&
      auditPass(AUDIT_IDS.webmcpSchemaValidity) === 1
        ? 1
        : 0;

    const result: LighthouseResult = {
      site_id: "", // filled in by caller
      lh_total,
      lh_accessibility_tree: auditPass(AUDIT_IDS.accessibilityTree),
      lh_layout_stability: auditPass(AUDIT_IDS.layoutStability),
      lh_llms_txt: auditPass(AUDIT_IDS.llmsTxt),
      lh_webmcp,
      run_at: new Date().toISOString(),
    };

    return { status: "OK", result };
  } catch (err) {
    // Parse / category failure on whatever the CLI produced. Prefer the exec error if any.
    return { status: "FAILED", reason: `lighthouse_error — ${execError ?? (err as Error).message}` };
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
}

// ---------------------------------------------------------------------------
// Result writers — Firestore when creds exist, else local JSON fallback
// ---------------------------------------------------------------------------

/** True when Firebase Admin credentials are configured in the environment. */
function hasFirebaseCreds(): boolean {
  return Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS
  );
}

async function writeToFirestore(result: LighthouseResult): Promise<void> {
  const { getAdminDb } = await import("../lib/firebase-admin");
  const db = getAdminDb();
  await db.collection("lighthouse").doc(result.site_id).set(result);
  console.log(`  ✓ Wrote lighthouse/${result.site_id} to Firestore`);
}

const LOCAL_RESULTS_PATH = path.join(process.cwd(), "data", "lighthouse-results.json");

/**
 * Local-JSON fallback for offline x-axis spread checks. Writes the full results
 * array to data/lighthouse-results.json (creating data/ if needed). Called once
 * at the end of a run when Firebase creds are absent — only OK results are
 * included; FAILED sites are intentionally omitted so the file never contains a
 * fabricated all-zero doc.
 */
function writeLocalResults(results: LighthouseResult[]): void {
  const dir = path.dirname(LOCAL_RESULTS_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(LOCAL_RESULTS_PATH, JSON.stringify(results, null, 2) + "\n", "utf-8");
  console.log(`  ✓ Wrote ${results.length} result(s) to ${LOCAL_RESULTS_PATH}`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const rawArgs = process.argv.slice(2);
  // --homepage scores each site's HOMEPAGE (site.homepage) instead of the deep-link
  // answer page (site.url), so the x-axis (Lighthouse) matches the agent's homepage
  // start in the navigation condition. Default stays site.url for back-compat.
  const useHomepage = rawArgs.includes("--homepage");
  const args = rawArgs.filter((a) => !a.startsWith("--"));
  const targetIds = args.length > 0 ? new Set(args) : null;
  const sites = targetIds
    ? cohort.filter((s) => targetIds.has(s.site_id))
    : cohort;

  if (sites.length === 0) {
    console.error("No matching sites found. Check site IDs.");
    process.exit(1);
  }

  const useFirestore = hasFirebaseCreds();
  console.log(`\nLane 1 — Lighthouse runner`);
  console.log(`Sites to process: ${sites.length}`);
  console.log(`Scoring page: ${useHomepage ? "HOMEPAGE (site.homepage)" : "deep-link (site.url)"}`);
  console.log(`Sink: ${useFirestore ? "Firestore" : `local JSON (${LOCAL_RESULTS_PATH})`}`);
  console.log(`----------------------------------`);

  const results: { site_id: string; status: string; reason?: string }[] = [];
  const okResults: LighthouseResult[] = [];

  for (const site of sites) {
    console.log(`\n[${site.site_id}] ${site.name}`);

    const target = useHomepage && site.homepage ? site.homepage : site.url;
    const outcome = await runLighthouse(target);
    if (outcome.status === "FAILED") {
      console.error(`  ✗ FAILED: ${outcome.reason}`);
      results.push({ site_id: site.site_id, status: "FAILED", reason: outcome.reason });
      continue;
    }

    const lh = outcome.result;
    lh.site_id = site.site_id;
    okResults.push(lh);
    console.log(
      `  lh_total=${lh.lh_total}  a11y=${lh.lh_accessibility_tree}  stability=${lh.lh_layout_stability}  llms=${lh.lh_llms_txt}  webmcp=${lh.lh_webmcp}`
    );

    if (useFirestore) {
      try {
        await writeToFirestore(lh);
        results.push({ site_id: site.site_id, status: "OK" });
      } catch (err) {
        console.error(`  Firestore write failed:`, (err as Error).message);
        results.push({ site_id: site.site_id, status: "WRITE_FAILED" });
      }
    } else {
      results.push({ site_id: site.site_id, status: "OK" });
    }
  }

  // Local fallback: write the whole OK-results array once, after the loop.
  if (!useFirestore && okResults.length > 0) {
    console.log(`\n----------------------------------`);
    writeLocalResults(okResults);
  }

  console.log(`\n----------------------------------`);
  console.log(`Summary:`);
  results.forEach((r) =>
    console.log(`  ${r.site_id}: ${r.status}${r.reason ? ` (${r.reason})` : ""}`)
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
