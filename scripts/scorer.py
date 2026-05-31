"""
Lane 2 scoring engine — AgentRank.

Pure stdlib (re, decimal). NO google / playwright / firebase imports, so this module
stays importable under any Python and never drags in the heavy harness deps.

Public API:
    score_answer(agent_answer: str, answer_substring: str) -> bool

Returns True iff the agent's final answer text contains the pre-registered answer,
under the normalization / matching rules in
`scripts/cohort-source/agentrank_scoring_rules.md` (the source of truth).

Design guarantees:
  - NEVER mutates answer_substring (the pre-registered value is read-only).
  - NEVER raises: every classifier is guarded; on any internal parse error the
    alternative is simply treated as "no match".
  - Blank/empty/whitespace answer_substring  -> False (must never "match all").
  - Blank agent_answer                        -> False.
"""

import re
from decimal import Decimal, InvalidOperation

__all__ = ["score_answer"]


# ---------------------------------------------------------------------------
# Normalization (literal / time / phrase paths)
# ---------------------------------------------------------------------------

def _normalize(s: str) -> str:
    """Lowercase, collapse all whitespace runs to a single space, trim.

    Used for the LITERAL, TIME, and NUMBER-LED-PHRASE paths so that
    "Gregory   Alan\nIsakov" matches "Gregory Alan Isakov", case-insensitively.
    """
    return re.sub(r"\s+", " ", s).strip().lower()


# ---------------------------------------------------------------------------
# Numeric token extraction
# ---------------------------------------------------------------------------
#
# A "numeric token" is a MAXIMAL number run in the answer, parsed to its Decimal
# *value*. Maximality is what gives us the numeric word-boundary for free:
#   - "67"   is its own token in "1960" -> token 1960, never 67.
#   - "$20"  yields token 20, and "$200" yields token 200 — so 20 != 200.
#   - "1848" matches "$1,848.00" because that token's value is Decimal("1848.00")
#            == Decimal("1848").
#
# Comma is ambiguous, so we disambiguate by SHAPE inside the run, not globally:
#   - groups of ",\d{3}" are US thousands separators           -> strip them.
#   - a single ",\d{2}" at the very end is a EUROPEAN DECIMAL   -> turn into '.'.
# WHY a dedicated comma branch (not a blanket strip): the Zalando row registers
# "69,95" where the comma is the decimal point. Blindly stripping commas would
# turn the answer's "69,95" into 6995 and the price would never match. So we keep
# the comma's meaning: ",\d{2}$" is cents (value 69.95), ",\d{3}" is thousands.
#
# We match number runs that may contain commas and an optional dot-decimal tail.
# The currency symbol / surrounding spaces are deliberately NOT part of the token.
# A comma is only consumed when it sits BETWEEN digits ("(?:,\d+)*"), so a trailing
# comma in prose ("...founded in 1948, with...") is left out of the token — otherwise
# the run would be "1948," and fail to parse, silently dropping a real match.
_NUMBER_RUN_RE = re.compile(r"\d+(?:,\d+)*(?:\.\d+)?")


def _run_to_decimal(run: str):
    """Convert one raw number run (already maximal) to a Decimal value, or None.

    Handles three comma situations:
      * US thousands + optional decimal:  "1,848.00", "15,750"  -> strip commas
      * European decimal (single ,\\d{2} at end, no dot): "69,95" -> "69.95"
      * plain int/decimal: "200", "0.0083", "53.99"
    Anything that doesn't cleanly parse returns None (treated as "no token").
    """
    try:
        if "," in run:
            if "." in run:
                # A dot means the dot is the decimal point, so every comma is a
                # thousands separator: "1,848.00" -> "1848.00".
                cleaned = run.replace(",", "")
            elif re.fullmatch(r"\d{1,3}(?:,\d{3})+", run):
                # Pure US thousands grouping, no decimal: "15,750", "152,460".
                cleaned = run.replace(",", "")
            elif re.fullmatch(r"\d+,\d{2}", run):
                # Single comma + EXACTLY two trailing digits, no dot -> European
                # decimal (cents). "69,95" -> "69.95". WHY: comma is the decimal
                # separator on zalando.pt; we must NOT strip it into 6995.
                cleaned = run.replace(",", ".")
            else:
                # Ambiguous / malformed comma usage we don't trust -> skip.
                return None
        else:
            cleaned = run
        return Decimal(cleaned)
    except (InvalidOperation, ValueError):
        return None


def _numeric_tokens(answer: str):
    """All maximal numeric tokens in the answer, as Decimal values."""
    tokens = []
    for m in _NUMBER_RUN_RE.finditer(answer):
        val = _run_to_decimal(m.group(0))
        if val is not None:
            tokens.append(val)
    return tokens


def _has_numeric_value(answer: str, reg_val: Decimal) -> bool:
    """True iff some maximal numeric token in the answer == reg_val by Decimal VALUE.

    Decimal value-equality is the whole point: Decimal("5.60") == Decimal("5.6")
    and Decimal("1848") == Decimal("1848.00"), so trailing ".00"/zeros are free and
    we never have to special-case "strip a trailing .00".
    """
    return any(tok == reg_val for tok in _numeric_tokens(answer))


# ---------------------------------------------------------------------------
# Per-alternative classifiers (each returns True/False; never raises)
# ---------------------------------------------------------------------------

# Classification patterns (anchored, applied to the RAW trimmed alternative).
_RE_COMMA_DECIMAL = re.compile(r"^\d+,\d{2}$")            # "69,95"
_RE_PERCENT       = re.compile(r"^[\d.,]+%$")             # "2.9%"
_RE_TIME          = re.compile(r"^\d{1,2}:\d{2}$")        # "4:30"
_RE_NUMBER        = re.compile(r"^[$€£]?\s?\d[\d,]*(?:\.\d+)?$")  # "$29","1848","12.89"
_RE_NUMBER_PHRASE = re.compile(r"^\d[\d,]*(?:\.\d+)?\s+\S.*$")              # "90 days"

# A <number>% occurrence inside the answer (for the PERCENT path). The number part
# is captured so we can compare by Decimal value (so "12.9%" != "2.9%").
_RE_ANSWER_PERCENT = re.compile(r"(\d[\d,]*(?:\.\d+)?)\s*%")


def _strip_currency(s: str) -> str:
    """Remove a leading currency symbol ($, euro, pound) and surrounding spaces."""
    return s.replace("$", "").replace("€", "").replace("£", "").strip()


def _match_comma_decimal(alt: str, answer: str) -> bool:
    """COMMA-DECIMAL (European): "69,95". reg_val = Decimal('69.95'); match if any
    numeric token in the answer equals it by value. Comma is the decimal sep, so we
    do NOT strip it into 6995 (Zalando exception)."""
    try:
        reg_val = Decimal(alt.replace(",", "."))
    except (InvalidOperation, ValueError):
        return False
    return _has_numeric_value(answer, reg_val)


def _match_percent(alt: str, answer: str) -> bool:
    """PERCENT: "2.9%". reg_val = Decimal of the numeric part. Match iff the answer
    contains <number>% whose number == reg_val. "12.9%" must NOT match "2.9%"
    (because we compare the full number before % by Decimal value)."""
    num_part = alt[:-1].strip()  # drop trailing '%'
    try:
        reg_val = Decimal(num_part.replace(",", ""))
    except (InvalidOperation, ValueError):
        return False
    for m in _RE_ANSWER_PERCENT.finditer(answer):
        run = m.group(1)
        val = _run_to_decimal(run)
        if val is not None and val == reg_val:
            return True
    return False


def _match_time(alt: str, answer: str) -> bool:
    """TIME: "4:30". Literal match with DIGIT-or-COLON boundaries on the normalized
    answer: (?<![\\d:])4:30(?![\\d:]). The digit guards reject "14:30" (left) and
    "4:300" (right); the COLON guards reject an HH:MM:SS timestamp like "4:30:15"
    (a different, more precise time that merely starts with 4:30). The ca_dmv row's
    match_rule is "exact", so 4:30 must not match a longer time token containing it."""
    norm = _normalize(answer)
    pat = re.compile(r"(?<![\d:])" + re.escape(alt) + r"(?![\d:])")
    return pat.search(norm) is not None


def _match_phone(alt: str, answer: str) -> bool:
    """PHONE / long digit run: alt is all digits after removing separators and has
    length >= 7. Strip every non-digit from BOTH sides and do a substring match, so
    "503-241-4704" / "(503) 241-4704" both contain "5032414704"."""
    alt_digits = re.sub(r"\D", "", alt)
    if len(alt_digits) < 7:
        return False
    answer_digits = re.sub(r"\D", "", answer)
    return alt_digits in answer_digits


def _match_number(alt: str, answer: str) -> bool:
    """NUMBER: "$29","1848","12.89","0.0083","15,750","$20". reg_val = Decimal after
    stripping currency and thousands commas (keep the decimal). Match iff any maximal
    numeric token in the answer == reg_val by Decimal value. The maximal-token rule
    gives the numeric word-boundary automatically ("$20" != token 200; "1848"
    matches "$1,848.00" because that token's value is 1848.00 == 1848)."""
    core = _strip_currency(alt).replace(",", "")
    try:
        reg_val = Decimal(core)
    except (InvalidOperation, ValueError):
        return False
    return _has_numeric_value(answer, reg_val)


def _match_number_phrase(alt: str, answer: str) -> bool:
    """NUMBER-LED PHRASE: "90 days". Require the leading number as a LEFT-bounded
    token immediately followed by the literal remaining words (normalized, case-
    insensitive). "190 days" must NOT match "90 days" (the leading number token in
    "190 days" is 190, not a left-bounded 90)."""
    m = re.match(r"^(\d[\d,]*(?:\.\d+)?)\s+(\S.*)$", alt)
    if not m:
        return False
    lead_num, rest = m.group(1), m.group(2)
    # Normalize the literal tail (collapse whitespace, lowercase) and the answer.
    rest_norm = _normalize(rest)
    norm_answer = _normalize(answer)
    # Left-bounded number token: not preceded by a digit (so "190" can't satisfy a
    # leading "90"), the exact remaining words after a single space, and a RIGHT word
    # boundary so a glued tail can't leak ("90 dayschallenge" must NOT match "90 days").
    # tx_dmv's match_rule is "exact phrase", so BOTH ends must be bounded — the left
    # number guard alone is not enough. The leading number may carry thousands commas;
    # match them literally as written.
    pat = re.compile(
        r"(?<!\d)" + re.escape(lead_num) + r"\s+" + re.escape(rest_norm) + r"(?![A-Za-z0-9])"
    )
    return pat.search(norm_answer) is not None


def _match_literal(alt: str, answer: str) -> bool:
    """LITERAL (default): normalized substring match (lowercase, collapse whitespace,
    trim). Used for proper nouns / phrases like "DevHub", "Gregory Alan Isakov"."""
    alt_norm = _normalize(alt)
    if not alt_norm:
        return False
    return alt_norm in _normalize(answer)


# ---------------------------------------------------------------------------
# Dispatch
# ---------------------------------------------------------------------------

def _match_alternative(alt: str, answer: str) -> bool:
    """Classify ONE alternative by its own shape, then match it against the answer.
    Order matters: comma-decimal / percent / time / phone / number / number-phrase
    are tried before falling back to LITERAL. Any internal error -> no match."""
    try:
        if _RE_COMMA_DECIMAL.match(alt):
            return _match_comma_decimal(alt, answer)
        if _RE_PERCENT.match(alt):
            return _match_percent(alt, answer)
        if _RE_TIME.match(alt):
            return _match_time(alt, answer)
        # PHONE: all digits after stripping separators AND length >= 7. We check the
        # digit-only length here so a 5-digit ZIP like "97204" is NOT treated as a
        # phone (it falls through to NUMBER), while "5032414704" is.
        alt_digits = re.sub(r"\D", "", alt)
        if alt_digits == re.sub(r"[\s\-().]", "", alt) and len(alt_digits) >= 7:
            # The alt is purely a (separated) digit run of length >= 7.
            return _match_phone(alt, answer)
        if _RE_NUMBER.match(alt):
            return _match_number(alt, answer)
        if _RE_NUMBER_PHRASE.match(alt):
            return _match_number_phrase(alt, answer)
        return _match_literal(alt, answer)
    except Exception:
        # Hard guarantee: never raise. A misbehaving alternative = no match.
        return False


def score_answer(agent_answer: str, answer_substring: str) -> bool:
    """True iff `agent_answer` contains the pre-registered `answer_substring`.

    ANY-OF: split answer_substring on " | " (space-pipe-space), trim each
    alternative, drop blanks, and succeed iff ANY surviving alternative matches.
    Blank/whitespace answer_substring (or all-blank alternatives) -> False.
    Blank agent_answer -> False.
    """
    try:
        # Guard inputs. We must never treat a blank registered value as "match all",
        # and a blank agent answer can never contain anything.
        if answer_substring is None or agent_answer is None:
            return False
        if not str(answer_substring).strip():
            return False
        if not str(agent_answer).strip():
            return False

        answer = str(agent_answer)
        # ANY-OF: split on the exact " | " delimiter (space-pipe-space).
        alternatives = [a.strip() for a in str(answer_substring).split(" | ")]
        alternatives = [a for a in alternatives if a]  # drop blank alternatives
        if not alternatives:
            return False

        return any(_match_alternative(alt, answer) for alt in alternatives)
    except Exception:
        # Top-level hard guard: scoring never raises.
        return False
