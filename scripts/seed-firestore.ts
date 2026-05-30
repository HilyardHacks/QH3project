/**
 * Seed fake data to Firestore — run once to populate the DB for Lane 3 dev.
 *
 * Usage:
 *   npx tsx scripts/seed-firestore.ts
 *
 * Requires: FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS
 */

import { FAKE_SITES, FAKE_LIGHTHOUSE, FAKE_RUNS } from "../lib/fake-data";

async function main() {
  const { getAdminDb } = await import("../lib/firebase-admin");
  const db = getAdminDb();

  console.log("Seeding Firestore with fake data...\n");

  // Sites
  for (const site of FAKE_SITES) {
    await db.collection("sites").doc(site.site_id).set(site);
    console.log(`  sites/${site.site_id}`);
  }

  // Lighthouse
  for (const lh of FAKE_LIGHTHOUSE) {
    await db.collection("lighthouse").doc(lh.site_id).set(lh);
    console.log(`  lighthouse/${lh.site_id}`);
  }

  // Runs — store each as sites/{site_id}/runs/{trial_number}
  for (const run of FAKE_RUNS) {
    const docId = `${run.site_id}_t${run.trial_number}`;
    await db.collection("runs").doc(docId).set(run);
    console.log(`  runs/${docId}`);
  }

  console.log("\nDone. Firestore seeded with 3 sites × (1 LH + 5 runs) = 18 documents.");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
