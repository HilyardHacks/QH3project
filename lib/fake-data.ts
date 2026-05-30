// Three hand-written fake rows — the deliverable of hour 1.
// Lane 3 builds the entire frontend against these.
// Lanes 1 & 2 replace them with real data.

import { Site, LighthouseResult, Run, SiteLeaderboardEntry, CorrelationPoint } from "./types";

export const FAKE_SITES: Site[] = [
  {
    site_id: "stripe",
    name: "Stripe",
    url: "https://stripe.com/pricing",
    answer_substring: "2.9%",
    answer_note: "Stripe online card transaction fee: 2.9% + 30¢",
  },
  {
    site_id: "irs_gov",
    name: "IRS.gov",
    url: "https://www.irs.gov/filing/individuals/standard-deduction",
    answer_substring: "14,600",
    answer_note: "2024 standard deduction for single filers: $14,600",
  },
  {
    site_id: "dmv_ca",
    name: "California DMV",
    url: "https://www.dmv.ca.gov/portal/driver-licenses-identification-cards/renewing-your-dl-id/",
    answer_substring: "41",
    answer_note: "CA driver license renewal fee: $41",
  },
];

export const FAKE_LIGHTHOUSE: LighthouseResult[] = [
  {
    site_id: "stripe",
    lh_total: 82,
    lh_accessibility_tree: 1,
    lh_layout_stability: 1,
    lh_llms_txt: 0,
    lh_webmcp: 0,
    run_at: "2026-05-30T10:00:00Z",
  },
  {
    site_id: "irs_gov",
    lh_total: 44,
    lh_accessibility_tree: 0,
    lh_layout_stability: 0,
    lh_llms_txt: 0,
    lh_webmcp: 0,
    run_at: "2026-05-30T10:05:00Z",
  },
  {
    site_id: "dmv_ca",
    lh_total: 31,
    lh_accessibility_tree: 0,
    lh_layout_stability: 1,
    lh_llms_txt: 0,
    lh_webmcp: 0,
    run_at: "2026-05-30T10:10:00Z",
  },
];

export const FAKE_RUNS: Run[] = [
  // Stripe — 4/5 success
  { site_id: "stripe", trial_number: 1, success: true,  step_count: 3, duration_seconds: 14, failure_mode: "success",           run_at: "2026-05-30T11:00:00Z" },
  { site_id: "stripe", trial_number: 2, success: true,  step_count: 4, duration_seconds: 18, failure_mode: "success",           run_at: "2026-05-30T11:03:00Z" },
  { site_id: "stripe", trial_number: 3, success: true,  step_count: 3, duration_seconds: 12, failure_mode: "success",           run_at: "2026-05-30T11:06:00Z" },
  { site_id: "stripe", trial_number: 4, success: false, step_count: 7, duration_seconds: 35, failure_mode: "wrong_extraction",  run_at: "2026-05-30T11:09:00Z" },
  { site_id: "stripe", trial_number: 5, success: true,  step_count: 3, duration_seconds: 13, failure_mode: "success",           run_at: "2026-05-30T11:12:00Z" },

  // IRS — 2/5 success
  { site_id: "irs_gov", trial_number: 1, success: true,  step_count: 6,  duration_seconds: 42, failure_mode: "success",            run_at: "2026-05-30T11:20:00Z" },
  { site_id: "irs_gov", trial_number: 2, success: false, step_count: 15, duration_seconds: 90, failure_mode: "timeout",            run_at: "2026-05-30T11:23:00Z" },
  { site_id: "irs_gov", trial_number: 3, success: false, step_count: 9,  duration_seconds: 60, failure_mode: "navigation_stuck",   run_at: "2026-05-30T11:26:00Z" },
  { site_id: "irs_gov", trial_number: 4, success: true,  step_count: 8,  duration_seconds: 55, failure_mode: "success",            run_at: "2026-05-30T11:29:00Z" },
  { site_id: "irs_gov", trial_number: 5, success: false, step_count: 15, duration_seconds: 90, failure_mode: "timeout",            run_at: "2026-05-30T11:32:00Z" },

  // CA DMV — 1/5 success
  { site_id: "dmv_ca", trial_number: 1, success: false, step_count: 15, duration_seconds: 90, failure_mode: "timeout",           run_at: "2026-05-30T11:40:00Z" },
  { site_id: "dmv_ca", trial_number: 2, success: false, step_count: 12, duration_seconds: 78, failure_mode: "navigation_stuck",  run_at: "2026-05-30T11:43:00Z" },
  { site_id: "dmv_ca", trial_number: 3, success: true,  step_count: 7,  duration_seconds: 48, failure_mode: "success",           run_at: "2026-05-30T11:46:00Z" },
  { site_id: "dmv_ca", trial_number: 4, success: false, step_count: 15, duration_seconds: 90, failure_mode: "blocked",           run_at: "2026-05-30T11:49:00Z" },
  { site_id: "dmv_ca", trial_number: 5, success: false, step_count: 15, duration_seconds: 90, failure_mode: "timeout",           run_at: "2026-05-30T11:52:00Z" },
];

// Pre-computed leaderboard view over the fake rows
export const FAKE_LEADERBOARD: SiteLeaderboardEntry[] = [
  {
    site_id: "stripe",
    name: "Stripe",
    url: "https://stripe.com/pricing",
    lh_total: 82,
    lh_accessibility_tree: 1,
    lh_layout_stability: 1,
    lh_llms_txt: 0,
    lh_webmcp: 0,
    success_rate: 0.8,
    trial_count: 5,
    mean_steps: 4,
    top_failure_mode: "success",
    rank: 1,
  },
  {
    site_id: "irs_gov",
    name: "IRS.gov",
    url: "https://www.irs.gov/filing/individuals/standard-deduction",
    lh_total: 44,
    lh_accessibility_tree: 0,
    lh_layout_stability: 0,
    lh_llms_txt: 0,
    lh_webmcp: 0,
    success_rate: 0.4,
    trial_count: 5,
    mean_steps: 10.6,
    top_failure_mode: "timeout",
    rank: 2,
  },
  {
    site_id: "dmv_ca",
    name: "California DMV",
    url: "https://www.dmv.ca.gov",
    lh_total: 31,
    lh_accessibility_tree: 0,
    lh_layout_stability: 1,
    lh_llms_txt: 0,
    lh_webmcp: 0,
    success_rate: 0.2,
    trial_count: 5,
    mean_steps: 12.8,
    top_failure_mode: "timeout",
    rank: 3,
  },
];

export const FAKE_CORRELATION_POINTS: CorrelationPoint[] = FAKE_LEADERBOARD.map((e) => ({
  site_id: e.site_id,
  name: e.name,
  lh_total: e.lh_total ?? 0,
  success_rate: e.success_rate,
  lh_accessibility_tree: e.lh_accessibility_tree ?? 0,
  lh_layout_stability: e.lh_layout_stability ?? 0,
  lh_llms_txt: e.lh_llms_txt ?? 0,
  lh_webmcp: e.lh_webmcp ?? 0,
}));
