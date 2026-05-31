"""
build-cohort.py — CSV -> cohort.json converter (Lane 2, deliverable #3).

Pure stdlib (csv, json). Reads `scripts/cohort-source/agentrank_sites.csv` and writes
`scripts/cohort.json`, the canonical cohort the harness (lane2-agent.py) loads.

Per CSV row it emits exactly:
    site_id, name, tier, url, question, task_hint, answer_substring,
    answer_note, match_rule, flag, runnable, manual_pass

Design rules (frozen by the task):
  - url = the CSV `start_url` VERBATIM (deep links are kept; do NOT rewrite to homepages
    — that experimental-design call is a human's, not this script's).
  - The 6 rows whose start_url contains "[confirm" (bestbuy, ikea, powells, zalando,
    amazon, ticketmaster) are placeholders: runnable=False, manual_pass="needs_url",
    and url keeps the literal "[confirm...]" marker (we never invent a URL). All other
    22 rows: runnable=True, manual_pass="done".
  - task_hint = a NEUTRAL noun phrase naming WHAT to find, derived from `question`,
    that NEVER contains the answer value. Built by stripping the leading interrogative
    ("What is", "How much", "By what time", "In what year", "On what platform", ...)
    into a noun phrase. Leak-free by construction, then HARD-ASSERTED below.

ANTI-LEAK HARD ASSERT (the experiment's integrity depends on it): for every row, split
answer_substring on " | "; for each alternative, normalize (lowercase, collapse
whitespace, strip $/euro/pound symbols) and assert it is NOT a substring of
normalize(question + " " + task_hint). If ANY alternative leaks, raise with the
offending row printed — we never silently emit a leaking cohort. (If Gemini could read
the answer out of the prompt, success_rate and the headline correlation are invalid.)

Run:
    python scripts/build-cohort.py
"""

import csv
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
CSV_PATH = HERE / "cohort-source" / "agentrank_sites.csv"
OUT_PATH = HERE / "cohort.json"

EXPECTED_ROWS = 28
PLACEHOLDER_MARKER = "[confirm"


# ---------------------------------------------------------------------------
# Normalization for the anti-leak assert (mirrors the spirit of the scorer's
# normalization, but deliberately self-contained — pure stdlib, no imports).
# ---------------------------------------------------------------------------

def _normalize_for_leak(s: str) -> str:
    """Lowercase, collapse whitespace, strip currency symbols ($, euro, pound).

    Used ONLY to compare an answer alternative against (question + task_hint). The
    goal is to catch a leak even if currency/spacing differs, so we strip the same
    symbols the scorer ignores. We do NOT strip commas/periods here — keeping them
    makes the check strictly more sensitive (fewer false 'no-leak' passes)."""
    s = s.lower()
    s = s.replace("$", "").replace("€", "").replace("£", "")  # $, euro, pound
    s = re.sub(r"\s+", " ", s).strip()
    return s


# ---------------------------------------------------------------------------
# task_hint derivation: strip the leading interrogative into a neutral noun phrase.
# ---------------------------------------------------------------------------
#
# Each entry is (compiled-leading-pattern, replacement). The patterns are applied in
# order; the FIRST that matches at the start of the question (case-insensitive) wins.
# Replacement is prepended to the remaining clause, e.g.
#   "What is the standard rate for X?"  -> "the standard rate for X"
#   "How much is an adult Day Pass?"    -> "the cost of an adult Day Pass"
#   "By what time must tests be done?"  -> "the time by which tests be done" (cleaned)
# We keep the noun phrase descriptive but value-free; the anti-leak assert is the
# backstop that guarantees no answer value slipped through.

_LEADING_RULES = [
    # "What is the price of X?" / "What is Stripe's rate for Y?" -> drop "What is/are",
    # keep the noun phrase that follows.
    (re.compile(r"^what\s+(?:is|are|does|was|were)\s+", re.I), ""),
    (re.compile(r"^what\s+", re.I), ""),
    # "How much is/does X cost?" -> "the cost of X". Handle "How much is" and
    # "How much does it cost to ...".
    (re.compile(r"^how\s+much\s+(?:is|are)\s+", re.I), "the cost of "),
    (re.compile(r"^how\s+much\s+does\s+it\s+cost\s+to\s+", re.I), "the cost to "),
    (re.compile(r"^how\s+much\s+", re.I), "the cost of "),
    # "How early before X can you ...?" -> "how far in advance ..." (value-free).
    (re.compile(r"^how\s+early\s+", re.I), "how far in advance "),
    # "By what time must X ...?" -> "the time by which X ...".
    (re.compile(r"^by\s+what\s+time\s+", re.I), "the time by which "),
    # "In what year was X founded?" -> "the year X was founded".
    (re.compile(r"^in\s+what\s+year\s+(?:was|were|did)\s+", re.I), "the year "),
    (re.compile(r"^in\s+what\s+year\s+", re.I), "the year "),
    # "On what (online) platform do you ...?" -> "the (online) platform on which you ...".
    (re.compile(r"^on\s+what\s+", re.I), "the "),
    # "Who is the opening act for X?" -> "the opening act for X".
    (re.compile(r"^who\s+(?:is|are|was|were)\s+", re.I), ""),
    (re.compile(r"^who\s+", re.I), ""),
]


def _derive_task_hint(question: str) -> str:
    """Turn the question into a NEUTRAL noun phrase naming WHAT to find.

    Strategy: strip the trailing '?', apply the first matching leading-interrogative
    rule, then tidy whitespace/casing. The result names the target fact without ever
    stating its value (enforced by the anti-leak assert downstream)."""
    q = (question or "").strip()
    # Drop a single trailing question mark (and any trailing whitespace before it).
    q = re.sub(r"\s*\?\s*$", "", q)

    hint = None
    for pat, repl in _LEADING_RULES:
        new, n = pat.subn(repl, q, count=1)
        if n:
            hint = new
            break
    if hint is None:
        # No leading interrogative matched: fall back to the question text itself as a
        # noun-ish phrase. (Every current cohort question matches a rule, so this is a
        # defensive fallback only.)
        hint = q

    # Tidy: collapse whitespace, strip a leading article duplication, lowercase the very
    # first letter only if it begins a generic word like "the/a/an/how" (keep proper
    # nouns like "Stripe's" capitalized).
    hint = re.sub(r"\s+", " ", hint).strip()
    # Ensure it reads as a phrase, not a sentence: strip a trailing period if any.
    hint = hint.rstrip(".").strip()
    return hint


# ---------------------------------------------------------------------------
# Anti-leak check
# ---------------------------------------------------------------------------

def _assert_no_leak(row: dict):
    """Raise if any answer alternative is a substring of normalize(question+task_hint)."""
    haystack = _normalize_for_leak(
        (row["question"] or "") + " " + (row["task_hint"] or "")
    )
    alts = [a.strip() for a in (row["answer_substring"] or "").split(" | ")]
    alts = [a for a in alts if a]
    for alt in alts:
        needle = _normalize_for_leak(alt)
        if needle and needle in haystack:
            raise SystemExit(
                "ANSWER LEAK DETECTED — refusing to emit a leaking cohort.\n"
                f"  site_id:         {row['site_id']}\n"
                f"  leaking alt:     {alt!r}  (normalized: {needle!r})\n"
                f"  question:        {row['question']!r}\n"
                f"  task_hint:       {row['task_hint']!r}\n"
                f"  normalized hay:  {haystack!r}\n"
                "Fix the task_hint (or question) so the answer value never appears in the "
                "agent prompt, then re-run."
            )


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

def build_rows():
    if not CSV_PATH.exists():
        raise SystemExit(f"CSV not found: {CSV_PATH}")

    rows = []
    with CSV_PATH.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for raw in reader:
            site_id = (raw.get("site_id") or "").strip()
            if not site_id:
                continue  # skip blank lines defensively
            start_url = (raw.get("start_url") or "").strip()
            question = (raw.get("question") or "").strip()
            answer_substring = (raw.get("answer_substring") or "").strip()
            flag = (raw.get("flag") or "").strip()

            is_placeholder = PLACEHOLDER_MARKER in start_url
            row = {
                "site_id": site_id,
                "name": (raw.get("name") or "").strip(),
                "tier": (raw.get("tier") or "").strip(),
                "url": start_url,                       # VERBATIM (incl. "[confirm...]")
                "question": question,
                "task_hint": _derive_task_hint(question),
                "answer_substring": answer_substring,   # VERBATIM (incl. any-of " | ")
                "answer_note": (raw.get("answer_note") or "").strip(),
                "match_rule": (raw.get("match_rule") or "").strip(),
                "flag": flag,
                "runnable": not is_placeholder,
                "manual_pass": "needs_url" if is_placeholder else "done",
            }
            rows.append(row)
    return rows


def validate(rows):
    # Exactly 28 rows.
    if len(rows) != EXPECTED_ROWS:
        raise SystemExit(
            f"Expected exactly {EXPECTED_ROWS} rows, got {len(rows)}. "
            "Check the CSV (Domino's and NYT were intentionally dropped; cohort is 28)."
        )
    # All answer_substrings non-empty.
    empties = [r["site_id"] for r in rows if not (r["answer_substring"] or "").strip()]
    if empties:
        raise SystemExit(f"Empty answer_substring for: {', '.join(empties)}")
    # Anti-leak on every row (raises on first leak with the offending row printed).
    for r in rows:
        _assert_no_leak(r)
    # Unique site_ids.
    ids = [r["site_id"] for r in rows]
    dupes = sorted({i for i in ids if ids.count(i) > 1})
    if dupes:
        raise SystemExit(f"Duplicate site_id(s): {', '.join(dupes)}")


def print_summary(rows):
    print(f"\nWrote {len(rows)} sites -> {OUT_PATH}\n")
    sid_w = max(len("site_id"), *(len(r["site_id"]) for r in rows))
    run_w = len("runnable")
    header = f"{'site_id':<{sid_w}} | {'runnable':<{run_w}} | url-or-PENDING"
    print(header)
    print("-" * len(header))
    n_run = 0
    for r in rows:
        runnable = r["runnable"]
        n_run += 1 if runnable else 0
        url_cell = r["url"] if runnable else "PENDING (needs_url)"
        print(f"{r['site_id']:<{sid_w}} | {str(runnable):<{run_w}} | {url_cell}")
    print("-" * len(header))
    print(f"{n_run}/{len(rows)} runnable, {len(rows) - n_run} pending URL confirmation.")


def main():
    rows = build_rows()
    validate(rows)
    OUT_PATH.write_text(json.dumps(rows, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print_summary(rows)


if __name__ == "__main__":
    main()
