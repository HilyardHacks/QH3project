# Cohort fixes — handoff for Member 4 (cohort owner)

From: Lane 2 (harness). For: Member 4 (owns `agentrank_sites.csv`, the `answer_substring`
keys, and PREREG ratification).

This is the exact, copy-pasteable to-do list to get the cohort ready for the **final run**.
It is grounded in this session's validated data: 110 navigation runs (`lane2-runs.jsonl`,
full agent from homepage) + 110 extraction runs (`lane2-runs-extraction.jsonl`, scripted
from the deep-link answer page), across 22 currently-runnable sites, plus
`data/lighthouse-results.json` (21 sites).

**Canonical source of truth is `scripts/cohort-source/agentrank_sites.csv`.** Edit the CSV,
then Lane 2 regenerates `scripts/cohort.json` with `python scripts/build-cohort.py` (it
re-runs the anti-leak assert and auto-derives `homepage = scheme://host` of each URL).
**Do not hand-edit `cohort.json`.**

Process rule (from PREREG §2.4): **Lane 2 never silently edits an `answer_substring`.** You
own the keys. For each item below, either *confirm the registered value is still correct on
the live page*, or *flag the corrected value* and we update the CSV + re-hash PREREG together.

---

## 1. Fix the 3 broken-task answer keys (extraction 0/5 — fact not findable on the answer page)

These 3 sites scored **0/5 even on the EXTRACTION condition** — i.e. the scripted extractor
loaded the exact deep-link answer page and a Gemini read still could not produce the
registered fact. That means the problem is the **answer key or the page**, not navigation.
The full agent (navigation condition) also failed all three. For each: re-verify on the
**live page** and either confirm the substring or flag a corrected value.

### 1a. `notion` — registered `answer_substring` = `$12`
- **Page:** https://www.notion.com/pricing (this is both `url` and the extraction start page)
- **Question:** "What is the monthly per-user price of Notion's Plus plan?"
- **Observed:** extraction 0/5, all `wrong_extraction`; navigation 0/5, all `wrong_extraction`.
- **Why it likely failed:** `$12` is almost certainly **not the price currently shown** on
  the Notion pricing page. Notion has repeatedly restructured its plans (Plus/Business/
  Enterprise) and the displayed monthly figure depends on the annual-vs-monthly toggle and
  region. The extractor read *a* price but never `$12`, 5 times out of 5 — a strong signal
  the registered value is stale.
- **DO:** Open the live pricing page. Read the **monthly per-user price of the Plus plan**
  as displayed by default. If it is `$12`, confirm. If it is anything else (e.g. a different
  figure, or the page shows an annual-billed monthly-equivalent), **flag the corrected
  value to Lane 2** so we update the CSV. Note the billing toggle you read it under, and
  confirm no `$12x` annual total elsewhere on the page would create a false match.

### 1b. `target` — registered `answer_substring` = `12.89`
- **Page:** https://www.target.com/p/clorox-toiletwand-disposable-toilet-cleaning-system-toiletwand-storage-caddy-and-6-refill-heads/-/A-13025048
- **Question:** "What is the price of the Clorox ToiletWand cleaning system (caddy + 6 refill pads)?"
- **Observed:** extraction 0/5, all `wrong_extraction`. (Navigation was 5/5 `success`, but
  that is suspect given extraction failed — see note.) **Target is also absent from
  `data/lighthouse-results.json`** — Lighthouse timed out against Target's anti-bot, so
  Target has **no x-axis point** for the headline scatter.
- **Why it likely failed:** two compounding issues. (1) **Heavy anti-bot:** Target serves
  bot-detection interstitials, so the deep-link page the extractor "read" may not have been
  the real product page (hence 0/5). (2) **Possible stale/wrong price** for `12.89` on this
  specific item, or a different price element being read.
- **DO — pick one and tell Lane 2 which:**
  - **(A) Keep it as a measured site:** verify the live product URL still resolves to *that*
    Clorox ToiletWand item and confirm the current price; if it is no longer `12.89`, flag
    the corrected value. Accept that it still has **no Lighthouse point** unless Member 3 can
    re-run Lighthouse against Target successfully.
  - **(B) Reclassify as a `blocked`/anti-bot site:** if anti-bot makes it unreadable, treat
    Target like Amazon/Ticketmaster — keep the row but expect `blocked`, and note that
    near-zero success is a *finding about anti-bot*, not an answer-key error (PREREG §5).
    Remember intentional blockers are capped at **≤ 5 total** (currently amazon, ticketmaster).

### 1c. `oregon_state` — registered `answer_substring` = `15246`
- **Page:** https://financialaid.oregonstate.edu/cost-attendance
- **Question:** "What is the 2025-26 resident (in-state) undergraduate tuition and fees for the full year at OSU?"
- **Observed:** extraction 0/5, all `wrong_extraction`; navigation 0/5, all `navigation_stuck`.
- **Why it likely failed:** this row carries the cohort's own **`interaction-test (accordion)`**
  flag — the `$15,246` figure sits **behind an expandable/accordion section** on the
  cost-attendance page. The **scripted extractor cannot click** to expand it, so it never
  sees the number (0/5 `wrong_extraction`); the full agent also couldn't reach it
  (`navigation_stuck`). This is largely a *page-interaction* problem, not necessarily a
  wrong value.
- **DO:** Open the live page, expand the resident undergraduate section, and confirm whether
  the 2025-26 in-state tuition + fees still reads `$15,246`. Then **decide its role:**
  - **Keep it** as a deliberate hard "interaction-test" point (its low success is then a
    legitimate readiness finding, and it should be analyzed in the *navigation* condition,
    where interaction is allowed) — but acknowledge the **scripted extraction control will
    structurally read 0** for it, so exclude it from the extraction-control comparison or
    annotate it. If you keep it, confirm/flag the `15246` value.
  - **Or replace** the target with a fact that is visible without an accordion click (if you
    want a clean extraction-control point). That is a cohort-design call you own; tell Lane 2
    the new question + `answer_substring` if you go this way.

---

## 2. Fill in the 6 `[confirm ...]` URLs in `agentrank_sites.csv`

These 6 rows still have `start_url = [confirm ...]`, so build-cohort marks them
`runnable=false`, `manual_pass="needs_url"`, and leaves `homepage=""`. They were **excluded
from this session's runs** (that's why the data above covers only 22 sites, not 28). **Paste
the exact deep-link product/event URL into the `start_url` column** for each, then re-confirm
the registered price/fact still matches on that live page. After you save the CSV, Lane 2
runs `build-cohort.py`, which **auto-derives the homepage** as `scheme://host` of the URL you
pasted (e.g. an ikea.com product URL → `https://www.ikea.com`). Do not paste a category or
search page — it must be the specific product/event page used in the manual pass.

| `site_id` | What the URL must point to | Registered fact to re-confirm | Notes |
|---|---|---|---|
| `bestbuy` | Lenovo Legion Tower 5i — Core Ultra 7 265F, 32GB, RTX 5060Ti, 1TB, Eclipse Black | `1848` (i.e. $1,848.00, standard, not discounted) | volatile price — re-check (see §3) |
| `ikea` | KIVIK 4-seat sectional with chaise, **Grann/Bomstad black, IKEA US** | `2099` ($2,099.00 USD, not discounted) | cookie-consent wall is a known nav obstacle; volatile (§3) |
| `powells` | "Practices in Apparition" by Gabi Abrao — **Trade Paperback** edition page | `22.95` ($22.95 paperback) | make sure the URL is the paperback format, not hardcover |
| `zalando` | adidas Originals Wide Leg Leo Print Satin Pants — **PIN to `zalando.pt` (Portugal)** | `69,95 \| 69.95` (€69,95 VAT incl.) | comma is the DECIMAL — do NOT comma-strip this row; volatile (§3) |
| `amazon` | NEW JETO metal bed frame, **Queen size, 14 inch** | `53.99` ($53.99) | **INTENTIONAL BLOCKER** — expect `blocked`; price is volatile but moot if blocked |
| `ticketmaster` | Zach Bryan, **Oct 10 2026, Jordan-Hare Stadium, Auburn AL** event page | `Gregory Alan Isakov` (opening act); alt `Hare Stadium` | **INTENTIONAL BLOCKER** — expect `blocked`; do NOT use the transient resale price |

After these 6 are filled, the cohort is back to its full **28 runnable sites** and Lane 2
can run the previously-skipped sites.

---

## 3. Re-verify volatile prices immediately before the final run

Retail/SaaS prices drift. PREREG locks the *scoring rule*, but the registered values must
still describe the live page at run time. Right before the final run, re-confirm each of
these on the live page and flag any that no longer match (you own the keys — Lane 2 will not
touch them):

- `amazon` — `53.99` (price explicitly noted volatile; moot if it blocks, but confirm anyway)
- `bestbuy` — `1848`
- `ikea` — `2099`
- `zalando` — `69,95 | 69.95`
- `apple` — `1099 | 45.79` (iPhone 17 Pro starting price / financing; minor: extraction was
  4/5 with 1 `wrong_extraction`, so the key is basically fine — just confirm it didn't move)
- **Any SaaS price that may have drifted** — recheck `shopify` `$29`, `github` `$21`,
  `cloudflare` `$20 | $25`, `twilio` `0.0083`, `spotify` `12.99`, `bear` `2.99 | 29.99`,
  and (post-fix) `notion`. SaaS vendors re-price quietly; a 2-minute spot check per page
  is cheap insurance against a stale headline.

---

## 4. Ratify `PREREG.md`

`PREREG.md` is currently **DRAFT — NOT RATIFIED** (banner at the top). You own the
pre-registered scoring wording and the answer keys, so the sign-off is yours. To ratify:

- Read §2 (frozen scoring rule), §2.2 (normalization), §2.3 (exceptions: Zalando decimal
  comma, Voodoo phone, promo-never-the-answer), and §2.4 (LOCKED answer keys). Confirm the
  wording matches `agentrank_scoring_rules.md` (the spec governs on any discrepancy).
- Confirm the **failure-mode taxonomy (§4)** and the **blocked-before-task exclusion (§5)**
  read correctly. In particular, resolve the open ratification note in §5: decide whether a
  **fully-blocked site** (all trials `blocked`) is *dropped from the correlation* or *pinned
  at `success_rate = 0` and reported as a separate "blocked" series*. Lane 2 needs that
  decision pinned before the full run.
- Note §2 rule 7 / §6: the frozen harness currently builds the prompt from the neutral
  `task_hint`, **not** the per-site `question`. If you want the per-site `question` wired in,
  that **reopens the harness freeze and must be re-gated** — flag it now, not mid-run.
- **Fill the §7 commit attestation at lock time:** UTC timestamp, the
  `sha256(agentrank_sites.csv)` cohort hash, cohort size (28), and the scorer pass count.
  **Do this AFTER sections 1 and 2 above** — every CSV edit changes the hash, so the hash
  must be taken on the final, frozen CSV, and committed *before* the first final-run `runs`
  row is written (that commit ordering is the falsifiability guarantee).

---

## 5. Sanity-check the auto-derived homepages

build-cohort derives `homepage = scheme://host` of the deep-link `url`. That is usually the
right front door, but not always — and the **navigation condition starts the full agent at
`homepage`**, so a wrong front door silently makes a site harder/easier than intended.
One known case to decide on:

- **`trimet`** — deep-link `url` is `https://support.trimet.org/hc/en-us/articles/4417251761051`,
  so the derived `homepage` is **`https://support.trimet.org`** (the Zendesk-style support
  portal), **not** `https://trimet.org` (the real TriMet front door). Decide which front door
  the navigation condition should start from. If it should be `trimet.org`, we can't get that
  from URL-derivation — Lane 2 would need a small explicit homepage override (a harness/CSV
  change you'd need to sign off on). TriMet's nav condition currently scored 5/5 `success`
  from the support portal, so it works, but confirm the support portal is the intended start.

Also glance at the other derived homepages for anything that lands on a subdomain or a
localized host you didn't intend (e.g. once `zalando` is pinned to `zalando.pt`, its homepage
will derive to `https://www.zalando.pt`, a Portuguese front door — that's *intended* here as
the documented language confound, just confirm it). Spot-check the full list in
`cohort.json` after the §2 URLs are filled.

---

## What happens after you do this

Once you (a) confirm/flag the 3 broken keys in §1, (b) paste the 6 deep-link URLs in §2,
(c) re-verify the volatile prices in §3, (d) ratify + attest PREREG in §4, and (e) settle the
homepage front-doors in §5:

1. Lane 2 regenerates `cohort.json` from the CSV (`build-cohort.py` — re-runs the anti-leak
   assert, auto-derives the new homepages, and confirms the full 28-site count).
2. Lane 2 **re-runs the 3 fixed sites + the 6 newly-URL'd sites** (navigation + extraction
   conditions, frozen model/prompt/limits), and re-checks costco (its 5/5 `error` is a
   page-load `ERR_HTTP2_PROTOCOL_ERROR`, a technical issue Lane 2 owns — not an answer-key
   problem, so it is not on your list).
3. Lane 2 **re-pushes the final clean dataset** to Firestore (`runs` + `runs_extraction`),
   which Lane 3's leaderboard joins against `lighthouse` and the seeded `sites` collection.

That produces the final, pre-registered, clean y-axis for the headline scatter. Nothing
final runs until PREREG is committed (§4).
