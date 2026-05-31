> **SUPERSEDED — DO NOT EDIT.** The canonical cohort is now
> `scripts/cohort-source/agentrank_sites.csv` (28 sites, with pre-registered
> `answer_substring`s, `question`, `match_rule`, `flag`, and `tier`) plus the generated
> `scripts/cohort.json` that the harness reads. This worklist was the original 30-site
> planning scratchpad; its `site_id`s and blank answer columns have diverged from the
> canonical source. It is kept for history only — **do not edit it and do not feed it to
> the harness.** Make all cohort changes in the CSV (and regenerate `cohort.json`).

# AgentRank — Manual Cohort Pass Worklist (30 sites)

Each site is chosen to land in a different region of the correlation chart, so the
cohort has spread on both axes. For every row: visit the start URL, do the task by
hand (find the primary product/service page, extract one specific factual claim),
then fill in `answer_substring` and `answer_note`. These two columns drop straight
into the `sites` table.

Rules while you go:
- `answer_substring` = the minimal exact text the agent's output must contain. Prefer a number or a proper-noun term with one canonical phrasing.
- Reject any site that answers in one click (no navigation = no signal). Swap it.
- Flag any site that blocks you (login / Cloudflare). Keep blocked-as-finding sites to 5 or fewer.
- "Target to find" is a suggestion. If the real page offers a cleaner, more stable fact, use that instead and update the note.

---

## 1. Top anchors — modern SaaS / dev tools (expect HIGH behavioral success)

| site_id | name | start URL | target to find | answer_substring | answer_note |
|---|---|---|---|---|---|
| stripe | Stripe | https://stripe.com | standard card processing rate (percentage + per-transaction fee) | | |
| shopify | Shopify | https://www.shopify.com | monthly price of the Basic plan | | |
| github | GitHub | https://github.com | per-user monthly price of the Team plan | | |
| twilio | Twilio | https://www.twilio.com | price to send one SMS in the US | | |
| notion | Notion | https://www.notion.com | monthly price of the Plus plan | | |
| cloudflare | Cloudflare | https://www.cloudflare.com | monthly price of the Pro plan | | |

## 2. Mainstream middle — retail / food / media (expect MIXED)

| site_id | name | start URL | target to find | answer_substring | answer_note |
|---|---|---|---|---|---|
| bestbuy | Best Buy | https://www.bestbuy.com | price of one named, stable product (pick a specific model) | | |
| ikea | IKEA | https://www.ikea.com | price of a named product (e.g. BILLY bookcase) | | |
| target | Target | https://www.target.com | price of one named, stable product | | |
| dominos | Domino's | https://www.dominos.com | price of a specific named menu item | | |
| spotify | Spotify | https://www.spotify.com | monthly price of Premium Individual | | |
| nytimes | New York Times | https://www.nytimes.com | advertised digital subscription price (watch for paywall) | | |
| costco | Costco | https://www.costco.com | annual fee of the base membership tier | | |

## 3. Seeded bottom — government / legacy (expect LOW behavioral success)

| site_id | name | start URL | target to find | answer_substring | answer_note |
|---|---|---|---|---|---|
| ca_dmv | California DMV | https://www.dmv.ca.gov | a driver's license renewal fee, or the REAL ID requirement | | |
| tx_dmv | Texas DMV | https://www.txdmv.gov | a vehicle registration fee | | |
| usps | USPS | https://www.usps.com | current price of a First-Class Forever stamp | | |
| irs | IRS | https://www.irs.gov | standard deduction amount for single filers (current year) | | |
| ssa | Social Security Admin | https://www.ssa.gov | full retirement age for a given birth year | | |
| trimet | TriMet (Portland transit) | https://trimet.org | adult single-ride fare price | | |
| portland_gov | City of Portland | https://www.portland.gov | a specific permit or service fee | | |
| oregon_state | Oregon State University | https://oregonstate.edu | in-state annual tuition figure | | |

## 4. Small business / one-pagers (expect VARIABLE — trap or too-easy)

| site_id | name | start URL | target to find | answer_substring | answer_note |
|---|---|---|---|---|---|
| powells | Powell's Books | https://www.powells.com | price of one specific in-stock book | | |
| voodoo | Voodoo Doughnut | https://www.voodoodoughnut.com | price of a named doughnut, or a listed location | | |
| innout | In-N-Out | https://www.in-n-out.com | price of a specific menu item | | |
| bear | Bear (notes app) | https://bear.app | subscription price of Bear Pro | | |

## 5. Off-diagonal bets — deliberately picked to break the diagonal

| site_id | name | start URL | target to find | answer_substring | answer_note |
|---|---|---|---|---|---|
| apple | Apple | https://www.apple.com | starting price of a named product (watch for configurator burying it) | | |
| craigslist | Craigslist | https://craigslist.org | the job-posting fee in a major city | | |
| zalando | Zalando | https://www.zalando.com | price of a named product (watch for the cookie-consent wall) | | |

## 6. Intentional blockers — anti-bot (treat blocked as a finding; keep to <=5)

| site_id | name | start URL | target to find | answer_substring | answer_note |
|---|---|---|---|---|---|
| amazon | Amazon | https://www.amazon.com | price of one named, stable product | | |
| ticketmaster | Ticketmaster | https://www.ticketmaster.com | a service/processing fee, or a listed ticket price | | |

---

## Expected positions on the chart (your mental map)

- Anchors (1): top-right region. High static score, high success. These prove the rubric "works" where it works.
- Middle (2): scattered through the center. The bulk of the cloud.
- Bottom (3): bottom region. Low success regardless of static score. The DMV-style traps.
- Small business (4): wide vertical spread. Some answer in one click (high y), some trap the agent (low y). Check each.
- Off-diagonal (5): the corners. Apple/Zalando = candidates for high static + low success. Craigslist = candidate for low static + high success.
- Blockers (6): success pinned near zero, but for a different reason (couldn't get in). That reason is itself a finding.

## Surprising-result candidates (keep a running note as you go)

Any site where your hands-on experience disagrees with what you'd expect Google's
checklist to say. A slick, modern site where the fact was annoyingly buried = a
high-static / low-success candidate. An ugly, old page where the fact was sitting
right there in plain text = a low-static / high-success candidate. These corner
points are the most valuable thing you can surface for the Sunday demo.
