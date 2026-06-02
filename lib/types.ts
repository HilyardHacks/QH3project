// Frozen data contract — agree this in hour 1, do not change without team sign-off.

export interface Site {
  site_id: string;   // slug, e.g. "stripe"
  name: string;      // display name
  url: string;       // start URL for agent
  answer_substring: string;  // pre-registered expected answer (scoring key)
  answer_note: string;       // human-readable description of expected answer
}

export interface LighthouseResult {
  site_id: string;
  lh_total: number;               // 0–100 Agentic Browsing category score
  lh_accessibility_tree: number;  // 0 or 1 (pass/fail)
  lh_layout_stability: number;    // 0 or 1
  lh_llms_txt: number;            // 0 or 1
  lh_webmcp: number;              // 0 or 1
  screenshot_path?: string;
  run_at: string; // ISO timestamp
}

export type FailureMode =
  | "success"
  | "blocked"           // anti-bot / login wall
  | "timeout"           // hit step or time limit
  | "wrong_extraction"  // navigated fine but wrong/no answer
  | "navigation_stuck"  // couldn't find the path
  | "error";            // harness/technical failure

export interface Run {
  site_id: string;
  trial_number: number; // 1..N
  success: boolean;     // output contained answer_substring
  step_count: number;
  duration_seconds: number;
  failure_mode: FailureMode;
  transcript?: string;  // stored always, rendered only if time permits
  run_at: string;       // ISO timestamp
}

// Derived view for the leaderboard — computed from sites + lighthouse + runs
export interface SiteLeaderboardEntry {
  site_id: string;
  name: string;
  url: string;
  lh_total: number | null;
  lh_accessibility_tree: number | null;
  lh_layout_stability: number | null;
  lh_llms_txt: number | null;
  lh_webmcp: number | null;
  success_rate: number;      // 0–1
  trial_count: number;
  mean_steps: number;
  top_failure_mode: FailureMode;
  rank: number;
}

// For the correlation page
export interface CorrelationPoint {
  site_id: string;
  name: string;
  lh_total: number;
  success_rate: number;
  trial_count: number;            // # agent trials backing success_rate (the "n" per point)
  top_failure_mode: FailureMode;  // dominant non-success mode — drives dot color + tooltip
  ci_low?: number;                // Wilson 95% CI lower bound on success_rate (optional)
  ci_high?: number;               // Wilson 95% CI upper bound on success_rate (optional)
  // sub-audits for the "which audit matters" analysis
  lh_accessibility_tree: number;
  lh_layout_stability: number;
  lh_llms_txt: number;
  lh_webmcp: number;
}
