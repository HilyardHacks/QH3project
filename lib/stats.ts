// Pure, dependency-free statistics shared by server queries AND client components.
// No server/firebase imports live here, so this module is safe to bundle into the client.

// ---------------------------------------------------------------------------
// Wilson 95% score interval for a binomial proportion (successes / trials).
// ---------------------------------------------------------------------------
// Per-site success-rate uncertainty for the leaderboard + scatter. This is NOT the
// scatter's correlation CI (that stays the deterministic bootstrap in queries.ts).
// Clamped to [0, 1]; trials === 0 → the maximally-uncertain {lo: 0, hi: 1}.
export function wilsonCI(
  successes: number,
  trials: number,
  z = 1.959963984540054 // 95%
): { lo: number; hi: number } {
  if (trials <= 0) return { lo: 0, hi: 1 };
  const p = successes / trials;
  const z2 = z * z;
  const denom = 1 + z2 / trials;
  const center = p + z2 / (2 * trials);
  const margin = z * Math.sqrt((p * (1 - p) + z2 / (4 * trials)) / trials);
  return {
    lo: Math.max(0, (center - margin) / denom),
    hi: Math.min(1, (center + margin) / denom),
  };
}

// ---------------------------------------------------------------------------
// Tie-aware "Rank (UB)" — LMArena style.
// ---------------------------------------------------------------------------
// A site's rank = 1 + the number of sites that SIGNIFICANTLY beat it (their CI lower bound
// is strictly greater than this site's CI upper bound). Sites whose CIs overlap with everyone
// above them share a rank — honest about statistical indistinguishability at small n.
// Returns one rank per input entry, in the SAME order as the input (does not reorder).
export function tieAwareRanks(
  entries: { ci_low: number; ci_high: number }[]
): number[] {
  return entries.map(
    (e) => 1 + entries.filter((other) => other.ci_low > e.ci_high).length
  );
}
