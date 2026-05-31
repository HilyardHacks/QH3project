# AgentRank - scoring rules and cohort flags

This document defines how the scorer (Lane 2) decides success, plus the cohort flags
the analysis depends on. It pairs with `agentrank_sites.csv`.

## The scoring contract

Success on a single run = the agent's final output contains the site's pre-registered
`answer_substring`, after the normalization below. Every answer was written by hand,
before any agent run, during the manual cohort pass.

Normalization (applied to both the agent output and the registered value before matching):

1. Case-insensitive; trim and collapse whitespace.
2. Strip currency symbols ($, euro) before matching.
3. Numeric word-boundary match: a numeric value must not match as a sub-run of a longer
   number. So "$20" must NOT match "$200", and "$65" must NOT match "$650".
4. Whole-dollar prices: strip thousands commas and a trailing ".00" on both sides, then
   match the digit core. "1848" matches "$1,848.00", "$1,848", and "$1848".
5. Prices with meaningful cents: keep the decimal. "12.89", "0.78", "5.60".
6. any-of: a site may register several acceptable substrings (separated by " | " in the
   CSV). Success = the output contains ANY one of them.
7. Per-site question: each site carries a specific question in the `question` column. The
   agent prompt is parameterized per site. The task SHAPE is constant (navigate to find one
   pre-registered fact and report it); only the target fact changes. This is required for
   informational/government pages, where "extract any claim" would unfairly fail a capable
   agent that extracts a different true fact.

## Exceptions and special handling

- Zalando (zalando.pt): the comma is the DECIMAL separator ("69,95"). Do NOT apply the
  comma-stripping rule to this row. Match the literal "69,95" or "69.95" via any-of.
- Voodoo Doughnut: ZIP is the primary answer. The phone-number alternative needs digit-only
  normalization (strip all non-digits) to match "5032414704".
- Promo prices are never the answer. Where a page shows a promo next to the real price
  (Spotify "$0 for 3 months", NYT "$1/week", Amazon "$43.99 store-card offer"), the registered
  value is always the standing/recurring price.

## Intentional blockers (keep to <= 5)

- Amazon, Ticketmaster. Expected failure_mode = `blocked` (anti-bot). Near-zero behavioral
  success is the FINDING ("anti-bot defenses are themselves an agent-readiness factor"), not a
  measurement error. The registered substrings are only for the rare get-through.

## Off-diagonal points (the surprising-result demo)

- Apple - high Lighthouse expected, low behavioral success likely (heavy SPA).
- Craigslist - low Lighthouse expected (plain HTML, no llms.txt/WebMCP), high behavioral
  success likely. The mirror of Apple.
- Zalando - second high-static/low-behavioral candidate; note the Portuguese-language confound
  when interpreting its low score (language friction is partly orthogonal to structural readiness).

Apple + Craigslist together are the strongest single slide for "the rubric does not predict
real agent success."

## Stability and URL notes

- Re-verify volatile values near runtime: Amazon price drifts; confirm the Best Buy, IKEA, and
  Zalando product prices are still standard (not newly discounted) before the full runs.
- Confirm every start_url is the exact page used in the manual pass. Product/event URLs marked
  "[confirm ...]" must be filled with the specific page; do not leave a category or search page.
- Cohort size: 28 sites (Domino's and NYT were dropped during the pass for gated/promo pricing).
  The media slot is open if you want to add one (e.g., YouTube Premium).
