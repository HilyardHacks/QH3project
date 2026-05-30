/**
 * Seed the `sites` collection from the REAL cohort (scripts/cohort.json).
 *
 * This is the production source of truth for Lanes 1 & 2. Run it before the real cohort
 * runs so every cohort site_id has a matching `sites` row — otherwise getLeaderboard()
 * (which maps over the `sites` collection) silently drops any site that only has
 * lighthouse/runs data, and getSiteDetail() returns null for it.
 *
 * Usage:
 *   npx tsx scripts/seed-sites.ts            # seed all cohort sites
 *   npm run seed:sites
 *
 * Requires: FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS
 *
 * (seed-firestore.ts is the separate fake-demo seeder for the 3 hand-written rows.)
 */

import cohortRaw from "./cohort.json";
import type { Site } from "../lib/types";

// cohort.json carries cohort-only config (expected_lh, category, manual_pass, task_hint)
// that is NOT part of the frozen `sites` contract — strip it so only contract fields land.
type CohortRow = Site & Record<string, unknown>;

async function main() {
  const { getAdminDb } = await import("../lib/firebase-admin");
  const db = getAdminDb();

  const cohort = cohortRaw as CohortRow[];
  console.log(`Seeding ${cohort.length} sites from cohort.json into the 'sites' collection...\n`);

  for (const row of cohort) {
    const site: Site = {
      site_id: row.site_id,
      name: row.name,
      url: row.url,
      answer_substring: row.answer_substring,
      answer_note: row.answer_note,
    };
    await db.collection("sites").doc(site.site_id).set(site);
    console.log(`  sites/${site.site_id}`);
  }

  console.log(`\nDone. ${cohort.length} sites written to the 'sites' collection.`);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
