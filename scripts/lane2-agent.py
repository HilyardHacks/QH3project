"""
Lane 2 — Gemini browser-agent harness

Measures, per cohort site, how a fixed Gemini agent fares on a fixed task and writes
one run document per trial to Firestore. There are two conditions ("measure both"):

  navigation  — start from the site HOMEPAGE and let the FULL AGENT browse to the
                answer. Writes to collection "runs". This is the y-axis of the
                experiment (real agent success rate).
  extraction  — start from the DEEP-LINK url and use the SCRIPTED extractor (single
                Gemini call on the loaded page). Writes to collection "runs_extraction".
                This isolates raw extractability.

The per-site gap (extraction success - navigation success) is the navigation-difficulty
signal: pages an agent CAN read once landed but CAN'T reach on its own.

Usage:
    # All cohort sites, 5 trials each — navigation condition (default)
    python scripts/lane2-agent.py

    # Specific site IDs, N trials
    python scripts/lane2-agent.py --sites stripe github --trials 3

    # Measure both conditions per site (navigation then extraction)
    python scripts/lane2-agent.py --mode both

    # Only the deep-link scripted-extraction condition
    python scripts/lane2-agent.py --mode extraction

    # Decision-gate whole-cohort fallback: force scripted runner on the deep-link url,
    # writing to the legacy "runs" collection (back-compat; overrides --mode).
    python scripts/lane2-agent.py --scripted-only --sites irs

    # Run without Firebase: write runs to local JSONL file(s) instead of Firestore
    python scripts/lane2-agent.py --sites stripe github --trials 1 --dry-run --mode both

Requirements:
    pip install -r scripts/requirements.txt
    Set GEMINI_API_KEY in .env.local (or export it)
    Set FIREBASE_SERVICE_ACCOUNT_JSON or GOOGLE_APPLICATION_CREDENTIALS
"""

import argparse
import asyncio
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from scorer import score_answer  # pure stdlib; safe before the heavy imports below

# Windows consoles default to cp1252, which can't encode the ✓/—/→ glyphs we print and would
# crash the run mid-cohort (e.g. right after the first Firestore write). Force UTF-8 output.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Load .env.local if present (simple key=value parser, no library needed)
def load_env(path=".env.local"):
    if not Path(path).exists():
        return
    for line in Path(path).read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, _, v = line.partition("=")
            os.environ.setdefault(k.strip(), v.strip())

load_env()

import google.generativeai as genai
from playwright.async_api import async_playwright, Page
import firebase_admin
from firebase_admin import credentials, firestore

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
#
# *** FROZEN HARNESS *** — passed the 5-site pre-scale gate on 2026-05-30.
# Do NOT edit any of the following during the cohort run; changing them mid-run
# silently changes the measurement (model / prompt / limits / viewport / timeouts):
#   GEMINI_MODEL, SYSTEM_PROMPT, TASK_TEMPLATE, MAX_STEPS, TIMEOUT_SECONDS,
#   the generation_config (temperature=0, max_output_tokens=256, JSON mode),
#   the 1280x800 viewport + chromium launch args, the per-action Playwright
#   timeouts (goto 30s / navigate 20s / click+type 5s / load 10s), and the
#   3-identical-actions loop-breaker. Pure bug fixes that don't change what the
#   agent sees or does are fine; anything behavioral is not.
#
# RE-FROZEN 2026-05-31 after the homepage re-gate (5 sites, `--mode both`): from a HOMEPAGE
# start the full agent terminated at avg 3.2 / max 7 steps — never near the cap; the failures
# were loop-breaker `navigation_stuck`, not step exhaustion. So MAX_STEPS / TIMEOUT_SECONDS are
# set to 20 / 120 — ample headroom (~3x the observed max) for deeper sites in the full cohort,
# without inflating cost (the agent terminates early regardless). These are FROZEN for the
# cohort run. (The original deep-link gate used 15 / 90.)

GEMINI_MODEL = "gemini-2.0-flash"      # fast, cheap, multimodal
MAX_STEPS = 20         # frozen for homepage navigation (re-gate: avg 3.2 / max 7 steps)
TIMEOUT_SECONDS = 120  # frozen; wall-clock cap matched to the step budget
DEFAULT_TRIALS = 5

TASK_TEMPLATE = (
    "Find the page describing the primary product or service offered by this website, "
    "and extract one specific factual claim about it. "
    "{task_hint}"
)

# ---------------------------------------------------------------------------
# Firebase init (lazy)
# ---------------------------------------------------------------------------

_db = None

def get_db():
    global _db
    if _db is not None:
        return _db

    if not firebase_admin._apps:
        service_account_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON")
        if service_account_json:
            cred = credentials.Certificate(json.loads(service_account_json))
        else:
            cred = credentials.ApplicationDefault()
        firebase_admin.initialize_app(cred)

    _db = firestore.client()
    return _db


def write_run(run: dict, *, collection: str = "runs", dry_run: bool = False,
              out_path: str = "lane2-runs.jsonl"):
    """Persist one run document. `collection` selects the Firestore collection
    ("runs" for navigation, "runs_extraction" for extraction); in dry-run mode
    `out_path` is the per-condition local sink. The doc id is f"{site_id}_t{trial}";
    it can collide across conditions only WITHIN a collection, and the two conditions
    write to different collections (and different dry-run files), so there is no clash."""
    doc_id = f"{run['site_id']}_t{run['trial_number']}"
    if dry_run:
        # Local-JSON sink: write the run document VERBATIM — byte-for-byte the same dict
        # we would hand Firestore .set() — one JSON object per line. The deterministic doc
        # id is derivable from site_id + trial_number at read time, so the schema stays clean.
        with open(out_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(run) + "\n")
        print(f"    [dry-run] {collection}/{doc_id}  success={run['success']}  steps={run['step_count']}  -> {out_path}")
        return
    db = get_db()
    db.collection(collection).document(doc_id).set(run)
    print(f"    ✓ Wrote {collection}/{doc_id}  success={run['success']}  steps={run['step_count']}")


def _existing_runs(dry_run: bool, out_path: str, collection: str = "runs") -> set:
    """--resume helper: the set of {site_id}_t{trial} doc ids already recorded FOR THIS
    CONDITION, so a crash + naive re-run skips finished trials instead of double-counting.
    Collection-aware: navigation checks the "runs" collection / its dry-run file, extraction
    checks "runs_extraction" / its own file — so resuming one condition never skips the
    other's trials. Uses the deterministic doc id — no new schema field."""
    existing = set()
    if dry_run:
        p = Path(out_path)
        if p.exists():
            for line in p.read_text(encoding="utf-8").splitlines():
                line = line.strip()
                if not line:
                    continue
                try:
                    r = json.loads(line)
                    existing.add(f"{r['site_id']}_t{r['trial_number']}")
                except Exception:
                    pass
    else:
        try:
            existing = {d.id for d in get_db().collection(collection).list_documents()}
        except Exception:
            existing = set()
    return existing

# ---------------------------------------------------------------------------
# Gemini client
# ---------------------------------------------------------------------------

_model = None


def get_model():
    """Lazily configure Gemini so --help and Firestore-less runs don't crash at import
    when GEMINI_API_KEY is unset; fail with a clear message only when a model is needed."""
    global _model
    if _model is None:
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            raise SystemExit(
                "GEMINI_API_KEY is not set. Add it to .env.local or export it before running Lane 2."
            )
        genai.configure(api_key=api_key)
        _model = genai.GenerativeModel(GEMINI_MODEL)
    return _model

SYSTEM_PROMPT = """You are an agent browsing a website to complete a task.
You will be given a screenshot of the current page, the page URL, title, and a text excerpt.

Decide the SINGLE BEST next action. Reply with ONLY valid JSON — no markdown, no extra text.

Available actions:
  {"action": "click",    "selector": "<CSS selector or visible text>", "reasoning": "..."}
  {"action": "type",     "selector": "<CSS selector>", "text": "<text to type>", "reasoning": "..."}
  {"action": "scroll",   "direction": "down", "reasoning": "..."}
  {"action": "navigate", "url": "<full URL>", "reasoning": "..."}
  {"action": "done",     "answer": "<your extracted answer>", "reasoning": "..."}

Rules:
- Use "done" as soon as you have found the specific factual answer requested.
- If you are blocked (login wall, CAPTCHA, anti-bot) use "done" with answer="BLOCKED".
- If you cannot find the answer after many steps, use "done" with whatever you found.
- Prefer clicking visible links/buttons over typing in search boxes.
- Keep "selector" short and likely to be unique on the page.
"""


def _response_reason(response) -> str:
    """Best-effort 'why was the body empty' for diagnostics (finish_reason / prompt block)."""
    bits = []
    try:
        fr = response.candidates[0].finish_reason
        bits.append(f"finish_reason={getattr(fr, 'name', fr)}")
    except Exception:
        pass
    try:
        br = response.prompt_feedback.block_reason
        if br:
            bits.append(f"block_reason={getattr(br, 'name', br)}")
    except Exception:
        pass
    return ", ".join(bits) or "no candidates / unknown"


async def ask_gemini(task: str, screenshot_bytes: bytes, accessible_text: str,
                     current_url: str, title: str) -> dict:
    user_content = [
        f"TASK: {task}\n\nCurrent URL: {current_url}\nPage title: {title}\n\nPage text excerpt:\n{accessible_text[:2000]}",
        # google-generativeai expects RAW image bytes here and base64-encodes them for the
        # REST payload itself. Passing a base64 *string* puts a str into a proto bytes field
        # -> TypeError/garbage, which the except below would otherwise mask as wrong_extraction.
        {"mime_type": "image/png", "data": screenshot_bytes},
    ]
    # Retry transient empty / unparseable responses: gemini-2.0-flash occasionally returns an
    # empty body on complex pages, and one blank reply shouldn't end the whole run. Model,
    # prompt, temperature, and token limits are unchanged — this only retries the same call
    # and records WHY a body was empty (finish_reason / block_reason) for diagnosis.
    last_problem = None
    for attempt in range(3):
        text = ""
        try:
            response = get_model().generate_content(
                [SYSTEM_PROMPT, *user_content],
                generation_config={
                    "temperature": 0,
                    "max_output_tokens": 256,
                    "response_mime_type": "application/json",  # constrain output to valid JSON
                },
            )
            try:
                text = (response.text or "").strip()
            except Exception:
                text = ""
            # Strip markdown fences just in case (JSON mode shouldn't add them)
            text = re.sub(r"^```(?:json)?|```$", "", text, flags=re.MULTILINE).strip()
            if not text:
                last_problem = f"empty response ({_response_reason(response)})"
            else:
                return json.loads(text)
        except Exception as e:
            snippet = (text[:120] + "…") if text else ""
            last_problem = f"{e}" + (f" | body: {snippet!r}" if snippet else "")
        print(f"      Gemini retry {attempt + 1}/3: {last_problem}")
    print(f"      Gemini error (gave up after 3): {last_problem}")
    # Distinct sentinel so a technical API/JSON failure is scored failure_mode='error',
    # not conflated with a genuine wrong_extraction in the breakdown Lane 3 plots.
    return {"action": "__error__", "reasoning": f"gemini call/parse failed: {last_problem}"}

# ---------------------------------------------------------------------------
# Agent loop
# ---------------------------------------------------------------------------

async def run_agent_on_site(
    page: Page,
    site_id: str,
    url: str,
    task: str,
    answer_substring: str,
    trial_number: int,
) -> dict:
    start = time.time()
    transcript = []
    step_count = 0

    # Guard: an empty answer_substring would make scoring (`'' in answer`) always True.
    # Never edit the pre-registered key here — just refuse to score against an empty one.
    if not (answer_substring or "").strip():
        return _build_run(site_id, trial_number, False, 0, 0, "error",
                          [{"step": 0, "error": "empty answer_substring — cannot score this site"}])

    try:
        await page.goto(url, timeout=30_000, wait_until="domcontentloaded")
    except Exception as e:
        elapsed = time.time() - start
        return {
            "site_id": site_id,
            "trial_number": trial_number,
            "success": False,
            "step_count": 0,
            "duration_seconds": int(elapsed),
            "failure_mode": "error",
            "transcript": json.dumps([{"step": 0, "error": str(e)}]),
            "run_at": datetime.now(timezone.utc).isoformat(),
        }

    # Loop-breaker state: detect the agent repeating the identical action on the same page.
    last_sig = None
    repeat_count = 0

    for step in range(MAX_STEPS):
        step_count = step + 1

        if time.time() - start > TIMEOUT_SECONDS:
            return _build_run(site_id, trial_number, False, step_count,
                              time.time() - start, "timeout", transcript)

        # Capture state
        try:
            screenshot_bytes = await page.screenshot(type="png")
            current_url = page.url
            title = await page.title()
            accessible_text = await page.evaluate(
                "() => document.body ? document.body.innerText : ''"
            )
        except Exception as e:
            return _build_run(site_id, trial_number, False, step_count,
                              time.time() - start, "error", transcript)

        # Ask Gemini
        action = await ask_gemini(task, screenshot_bytes, accessible_text, current_url, title)
        transcript.append({"step": step, "url": current_url, "action": action})
        print(f"      step {step_count}: {action.get('action')} — {action.get('reasoning', '')[:60]}")

        # A technical failure inside ask_gemini (API/JSON) -> failure_mode='error', kept
        # distinct from a genuine wrong_extraction.
        if action.get("action") == "__error__":
            return _build_run(site_id, trial_number, False, step_count,
                              time.time() - start, "error", transcript)

        # Loop-breaker: at temperature=0 a stuck agent repeats the SAME action on the SAME
        # page forever (e.g. clicking an invisible element). 3 identical non-scroll actions
        # in a row can never make progress, so stop as navigation_stuck rather than burn the
        # whole step/time budget. (scroll is exempt — repeating it is how you read a long page.)
        sig = (current_url, action.get("action"), action.get("selector"),
               action.get("url"), action.get("text"))
        repeat_count = repeat_count + 1 if sig == last_sig else 1
        last_sig = sig
        if repeat_count >= 3 and action.get("action") != "scroll":
            return _build_run(site_id, trial_number, False, step_count,
                              time.time() - start, "navigation_stuck", transcript)

        # Execute action
        if action.get("action") == "done":
            answer = action.get("answer", "")
            if answer == "BLOCKED":
                return _build_run(site_id, trial_number, False, step_count,
                                  time.time() - start, "blocked", transcript)
            success = score_answer(answer, answer_substring)
            mode = "success" if success else "wrong_extraction"
            return _build_run(site_id, trial_number, success, step_count,
                              time.time() - start, mode, transcript)

        elif action.get("action") == "click":
            selector = action.get("selector", "")
            try:
                # Try CSS selector first, then visible text
                try:
                    await page.click(selector, timeout=5_000)
                except Exception:
                    await page.click(f"text={selector}", timeout=5_000)
                await page.wait_for_load_state("domcontentloaded", timeout=10_000)
            except Exception as e:
                print(f"      click failed: {e}")

        elif action.get("action") == "type":
            try:
                await page.fill(action.get("selector", "input"), action.get("text", ""), timeout=5_000)
                await page.keyboard.press("Enter")
                await page.wait_for_load_state("domcontentloaded", timeout=10_000)
            except Exception as e:
                print(f"      type failed: {e}")

        elif action.get("action") == "scroll":
            await page.evaluate("window.scrollBy(0, window.innerHeight * 0.8)")
            await asyncio.sleep(0.5)

        elif action.get("action") == "navigate":
            nav_url = action.get("url", "")
            try:
                await page.goto(nav_url, timeout=20_000, wait_until="domcontentloaded")
            except Exception as e:
                print(f"      navigate failed: {e}")

    # Exhausted the step budget without the agent ever calling "done": it couldn't find
    # the path. That's navigation_stuck, NOT timeout (which is reserved for the wall-clock
    # limit above) — keeping them distinct so the failure-mode breakdown is meaningful.
    return _build_run(site_id, trial_number, False, step_count,
                      time.time() - start, "navigation_stuck", transcript)


def _build_run(site_id, trial_number, success, step_count, elapsed, failure_mode, transcript):
    return {
        "site_id": site_id,
        "trial_number": trial_number,
        "success": success,
        "step_count": step_count,
        "duration_seconds": int(elapsed),
        "failure_mode": failure_mode,
        "transcript": json.dumps(transcript),
        "run_at": datetime.now(timezone.utc).isoformat(),
    }

# ---------------------------------------------------------------------------
# Scripted-navigation fallback (Saturday 6pm decision gate)
# ---------------------------------------------------------------------------

async def run_scripted_extraction(
    page: Page,
    site_id: str,
    url: str,
    task: str,
    answer_substring: str,
    trial_number: int,
) -> dict:
    """Navigate directly to the URL and use Gemini only for extraction."""
    start = time.time()
    if not (answer_substring or "").strip():
        return _build_run(site_id, trial_number, False, 1, 0, "error",
                          [{"step": 1, "error": "empty answer_substring — cannot score this site"}])
    try:
        await page.goto(url, timeout=30_000, wait_until="domcontentloaded")
        accessible_text = await page.evaluate(
            "() => document.body ? document.body.innerText : ''"
        )
        screenshot_bytes = await page.screenshot(type="png")
    except Exception as e:
        return _build_run(site_id, trial_number, False, 1,
                          time.time() - start, "error", [])

    # Single Gemini extraction call on the already-loaded page
    extraction_prompt = (
        f"You are looking at a web page. Extract the following information:\n{task}\n"
        f"Reply with ONLY the extracted answer as plain text (no JSON, no explanation)."
    )
    try:
        response = get_model().generate_content(
            [extraction_prompt, {"mime_type": "image/png", "data": screenshot_bytes},
             accessible_text[:3000]],
            generation_config={"temperature": 0, "max_output_tokens": 128},
        )
        answer = response.text.strip()
    except Exception as e:
        # A real API failure is a technical error, not a wrong extraction — keep the
        # fallback's failure-mode breakdown honest for the Saturday-6pm call.
        return _build_run(site_id, trial_number, False, 1,
                          time.time() - start, "error", [{"step": 1, "error": str(e)}])

    success = score_answer(answer, answer_substring)
    mode = "success" if success else "wrong_extraction"
    transcript = [{"step": 1, "url": page.url, "action": {"action": "done", "answer": answer}}]
    return _build_run(site_id, trial_number, success, 1,
                      time.time() - start, mode, transcript)

# ---------------------------------------------------------------------------
# Condition resolution (PURE — unit-testable, no Gemini/Playwright/Firebase)
# ---------------------------------------------------------------------------

def _extraction_sink(base_out: str) -> str:
    """Derive the extraction dry-run sink from the base --out path by inserting
    '-extraction' before the suffix: 'lane2-runs.jsonl' -> 'lane2-runs-extraction.jsonl'.
    Pure path string manipulation; no filesystem access."""
    p = Path(base_out)
    # p.stem drops the final suffix; p.suffix is e.g. '.jsonl' (''. if none). Reattach the
    # parent so a path like 'out/run.jsonl' becomes 'out/run-extraction.jsonl'.
    new_name = f"{p.stem}-extraction{p.suffix}"
    return str(p.with_name(new_name))


def resolve_condition(site: dict, condition: str, base_out: str = "lane2-runs.jsonl") -> dict:
    """Resolve a (site, condition) pair into the concrete run plan. PURE: no network,
    no Gemini/Playwright/Firebase — safe to import and unit-test standalone.

    Returns a dict with:
      start_url   — where this condition begins browsing
      runner_name — "agent" (full agent) or "scripted" (single-call extraction)
      collection  — Firestore collection to write to
      dry_sink    — local JSONL sink path for --dry-run

    navigation -> homepage start + full agent  -> collection "runs",            base sink
    extraction -> deep-link start + scripted   -> collection "runs_extraction",  '-extraction' sink
    """
    if condition == "navigation":
        return {
            "start_url": site.get("homepage", ""),
            "runner_name": "agent",
            "collection": "runs",
            "dry_sink": base_out,
        }
    if condition == "extraction":
        return {
            "start_url": site.get("url", ""),
            "runner_name": "scripted",
            "collection": "runs_extraction",
            "dry_sink": _extraction_sink(base_out),
        }
    raise ValueError(f"unknown condition: {condition!r} (expected 'navigation' or 'extraction')")


# Expand a --mode value into the ordered list of conditions to run.
_MODE_CONDITIONS = {
    "navigation": ["navigation"],
    "extraction": ["extraction"],
    "both": ["navigation", "extraction"],  # navigation first, then extraction
}


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--sites", nargs="*", help="Site IDs to run (default: all)")
    parser.add_argument("--trials", type=int, default=DEFAULT_TRIALS)
    parser.add_argument("--mode", choices=["navigation", "extraction", "both"],
                        default="navigation",
                        help="Which condition(s) to measure per site. "
                             "navigation = homepage start + full agent -> 'runs'; "
                             "extraction = deep-link start + scripted -> 'runs_extraction'; "
                             "both = navigation then extraction. (default: navigation)")
    parser.add_argument("--scripted-only", action="store_true",
                        help="BACK-COMPAT whole-cohort fallback (Saturday-6pm call): force the "
                             "scripted runner on the deep-link url, writing to the legacy 'runs' "
                             "collection — regardless of --mode.")
    parser.add_argument("--dry-run", action="store_true",
                        help="Write runs to a local JSONL file instead of Firestore (no Firebase creds needed)")
    parser.add_argument("--out", default="lane2-runs.jsonl",
                        help="Local sink path when --dry-run is set (default: lane2-runs.jsonl; "
                             "the extraction condition writes to a '-extraction' sibling)")
    parser.add_argument("--resume", action="store_true",
                        help="Skip (site, trial) pairs already recorded — crash-safe re-runs "
                             "(collection-aware: each condition resumes against its own collection)")
    args = parser.parse_args()

    cohort_path = Path(__file__).parent / "cohort.json"
    cohort = json.loads(cohort_path.read_text())

    if args.sites:
        cohort = [s for s in cohort if s["site_id"] in args.sites]

    if not cohort:
        print("No matching sites.")
        sys.exit(1)

    # --scripted-only is a BACK-COMPAT override of --mode: it forces a single legacy
    # condition — scripted runner on the DEEP-LINK url, writing to the "runs" collection
    # and the base --out sink (exactly the pre-"measure both" behavior). It is NOT the same
    # as --mode extraction (which writes to "runs_extraction"). Used only for the whole-cohort
    # Saturday-6pm fallback when the full agent is deemed too flaky to be the y-axis.
    # OPERATIONAL CAVEAT: --scripted-only shares the "runs" collection + {site_id}_t{trial}
    # doc-id scheme with --mode navigation, so do NOT --resume across a MIX of navigation and
    # --scripted-only writes into the same "runs" (each would skip the other's trials). Run the
    # scripted fallback as a clean re-run (or into a separate sink/collection) if you've already
    # written navigation rows.
    if args.scripted_only:
        conditions = ["__legacy_scripted__"]
        mode_desc = "scripted-only (legacy: scripted on deep-link -> 'runs')"
    else:
        conditions = _MODE_CONDITIONS[args.mode]
        mode_desc = f"mode={args.mode} ({' then '.join(conditions)})"

    print(f"\nLane 2 — Gemini harness  [{mode_desc}]")
    print(f"Sites: {len(cohort)}  Trials: {args.trials}  Model: {GEMINI_MODEL}")
    if args.dry_run:
        print(f"Dry-run: writing to {args.out} (no Firestore)")
    print("-" * 60)

    # Per-condition resume sets: each condition resumes against its OWN collection / sink,
    # so resuming navigation never skips extraction trials and vice-versa.
    def _resume_set(collection: str, out_path: str) -> set:
        if not args.resume:
            return set()
        s = _existing_runs(args.dry_run, out_path, collection)
        print(f"Resume[{collection}]: {len(s)} run(s) already recorded will be skipped")
        return s

    # Precompute, per condition name, the resolved plan + resume set so we don't recompute
    # per trial. For --scripted-only we synthesize the legacy plan directly.
    plans = {}        # condition -> {start_url_key, runner_name, collection, dry_sink}
    resume_sets = {}  # condition -> set of existing doc ids
    if args.scripted_only:
        plans["__legacy_scripted__"] = {
            "runner_name": "scripted",
            "collection": "runs",
            "dry_sink": args.out,
            "url_key": "url",  # deep-link url
        }
        resume_sets["__legacy_scripted__"] = _resume_set("runs", args.out)
    else:
        for cond in conditions:
            # resolve_condition needs a site for start_url, but collection/sink/runner are
            # site-independent — resolve once with a probe row to read those fields.
            probe = resolve_condition({"homepage": "", "url": ""}, cond, args.out)
            plans[cond] = {
                "runner_name": probe["runner_name"],
                "collection": probe["collection"],
                "dry_sink": probe["dry_sink"],
                "url_key": "homepage" if cond == "navigation" else "url",
            }
            resume_sets[cond] = _resume_set(probe["collection"], probe["dry_sink"])

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
        )
        try:
            for site in cohort:
                print(f"\n[{site['site_id']}] {site['name']}")
                # SKIP-GUARD: a cohort row is runnable only if it has a real deep-link URL.
                # Placeholder rows (the 6 "[confirm ... product page URL]" markers) carry
                # runnable=false and a literal "[confirm..." url — running them would just goto a
                # bogus URL and burn trials/Gemini calls. Skip them cleanly. Default runnable=True
                # so older cohorts (no 'runnable' field) still run unchanged. This guard covers
                # the extraction condition's deep-link url; navigation has an extra blank-homepage
                # guard below.
                url = (site.get("url") or "")
                if site.get("runnable", True) is False or not url or url.startswith("[confirm"):
                    print(f"  skipped (needs URL) — runnable={site.get('runnable', True)} url={url!r}")
                    continue
                # IMPORTANT: never inject the answer value (answer_substring / answer_note) into the
                # prompt — the model could then echo the answer without browsing, which would
                # invalidate success_rate and the headline correlation. Use the neutral task_hint,
                # which names WHAT to find, not its value.
                hint = (site.get("task_hint") or "").strip()
                task = TASK_TEMPLATE.format(task_hint=f"Specifically, find: {hint}." if hint else "")

                for cond in conditions:
                    plan = plans[cond]
                    collection = plan["collection"]
                    dry_sink = plan["dry_sink"]
                    start_url = (site.get(plan["url_key"]) or "")
                    existing = resume_sets[cond]
                    cond_label = "scripted-only" if cond == "__legacy_scripted__" else cond

                    # Navigation starts from the homepage; placeholder rows (and any runnable
                    # row missing a homepage) have a blank homepage and cannot be navigated.
                    # The extraction/legacy conditions use the deep-link url, already guarded
                    # above, so this only fires for navigation.
                    if not start_url:
                        print(f"  [{cond_label}] skipped — no start URL "
                              f"(blank {plan['url_key']}); cannot run this condition")
                        continue

                    for trial in range(1, args.trials + 1):
                        doc_id = f"{site['site_id']}_t{trial}"
                        if args.resume and doc_id in existing:
                            print(f"  [{cond_label}] Trial {trial}/{args.trials}: "
                                  f"skip (already have {collection}/{doc_id})")
                            continue
                        print(f"  [{cond_label}] Trial {trial}/{args.trials}")
                        context = await browser.new_context(
                            viewport={"width": 1280, "height": 800},
                            user_agent=(
                                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                                "AppleWebKit/537.36 (KHTML, like Gecko) "
                                "Chrome/124.0.0.0 Safari/537.36"
                            ),
                        )
                        page = await context.new_page()

                        if plan["runner_name"] == "scripted":
                            run = await run_scripted_extraction(
                                page, site["site_id"], start_url,
                                task, site["answer_substring"], trial,
                            )
                        else:
                            run = await run_agent_on_site(
                                page, site["site_id"], start_url,
                                task, site["answer_substring"], trial,
                            )

                        await context.close()
                        write_run(run, collection=collection,
                                  dry_run=args.dry_run, out_path=dry_sink)
        finally:
            await browser.close()

    print("\n✓ Lane 2 complete.")


if __name__ == "__main__":
    asyncio.run(main())
