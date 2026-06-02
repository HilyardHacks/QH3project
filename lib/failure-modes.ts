import type { FailureMode } from "./types";

// One source of truth for how each frozen FailureMode is presented (color/label/emoji).
// Pure (only a type import) → safe in both server and client components. Reused by the
// leaderboard, the scatter legend (future refactor), and the /methodology glossary.
export const FAILURE_MODE_META: Record<
  FailureMode,
  { label: string; color: string; emoji: string }
> = {
  success: { label: "Success", color: "#10b981", emoji: "✓" },
  blocked: { label: "Blocked", color: "#64748b", emoji: "⛔" },
  timeout: { label: "Timeout", color: "#f59e0b", emoji: "⏱" },
  wrong_extraction: { label: "Wrong extraction", color: "#8b5cf6", emoji: "⚠" },
  navigation_stuck: { label: "Navigation stuck", color: "#fb923c", emoji: "🔀" },
  error: { label: "Error", color: "#ef4444", emoji: "💥" },
};

// Canonical enum order — the frozen six values.
export const FAILURE_MODES = Object.keys(FAILURE_MODE_META) as FailureMode[];
