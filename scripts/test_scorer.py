"""
Self-contained test runner for scripts/scorer.py — no pytest required.

Run:
    python scripts/test_scorer.py

Prints "PASS n/n" and exits 0 if every asserted case matches; otherwise prints
each FAILED case as (id, agent_answer, expected, actual) and exits non-zero.

The asserted table = ALL provided authored cases (verbatim) PLUS additional cases
written here to cover every one of the 28 cohort rows and every special match type.

DISPUTED CASES (excluded from the asserted table — they contradict the SPEC and
must NOT be hacked around; see scorer.py and the task's disputed_cases):
  - notion_neg_3: registered "$12", answer
      "Billed annually the Plus plan totals $12x12 = $144 per user per year."
    Authored expected = False, but the answer contains a maximal numeric token "12"
    (bounded by '$' and 'x'), which the SPEC's NUMBER rule says MUST match reg_val 12.
    The case's own rationale concedes "this answer contains a literal '12' token."
    So the correct SPEC result is True; the authored False is wrong. Excluded.
"""

import os
import sys

# Make sure we import the sibling scorer.py regardless of CWD.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from scorer import score_answer


# ---------------------------------------------------------------------------
# CASES: (id, agent_answer, answer_substring, expected)
# ---------------------------------------------------------------------------
# Block A — all provided authored cases, verbatim (minus the disputed one).
AUTHORED_CASES = [
    # --- positives (one per site, two phrasings each) ---
    ("stripe_1", "Stripe's standard rate for online domestic card payments is 2.9% + 30 cents per successful charge.", "2.9%", True),
    ("stripe_2", "The pricing page lists a standard processing fee of 2.9% plus 30¢ per transaction for online domestic cards.", "2.9%", True),
    ("shopify_1", "The Shopify Basic plan costs $29 per month when billed annually.", "$29", True),
    ("shopify_2", "Basic is the entry-level tier at USD 29/month.", "$29", True),
    ("github_1", "GitHub Enterprise is priced at $21 per user/month, billed annually.", "$21", True),
    ("github_2", "The per-user monthly price for the Enterprise plan is shown as $21.", "$21", True),
    ("twilio_1", "Sending one outbound SMS to a US number costs $0.0083 on Twilio.", "0.0083", True),
    ("twilio_2", "The US SMS price is 0.0083 USD per message according to the pricing table.", "0.0083", True),
    ("notion_1", "Notion's Plus plan is $12 per user per month billed annually.", "$12", True),
    ("notion_2", "The monthly per-seat price of the Plus plan is twelve dollars, shown on the page as $12.", "$12", True),
    ("cloudflare_1", "Cloudflare's Pro plan is $25 per month, or $20/month when billed annually.", "$20 | $25", True),
    ("cloudflare_2", "The Pro plan costs $20 monthly (annual billing).", "$20 | $25", True),
    ("bestbuy_1", "The Lenovo Legion Tower 5i is priced at $1,848.00 in Eclipse Black.", "1848", True),
    ("bestbuy_2", "This Legion Tower 5i gaming desktop costs $1848 (standard, not discounted).", "1848", True),
    ("ikea_1", "The KIVIK 4-seat sectional with chaise (Grann/Bomstad black) is $2,099.00.", "2099", True),
    ("ikea_2", "Price shown after passing the cookie wall: $2099 USD for the KIVIK sectional.", "2099", True),
    ("target_1", "The Clorox ToiletWand cleaning system (caddy + 6 refill pads) is $12.89.", "12.89", True),
    ("target_2", "Listed price for the ToiletWand system is 12.89 dollars.", "12.89", True),
    ("spotify_1", "Spotify Premium Individual is $12.99/month (the $0 for 3 months is just a new-user promo).", "12.99", True),
    ("spotify_2", "The recurring monthly price after any trial is 12.99 USD.", "12.99", True),
    ("costco_1", "Costco's Gold Star (base) membership is $65 per year; the Executive tier is $130.", "$65", True),
    ("costco_2", "The annual fee for the standard Gold Star membership is $65.", "$65", True),
    ("ca_dmv_1", "Written tests are not available at DMV offices after 4:30 p.m.", "4:30", True),
    ("ca_dmv_2", "You must finish any written test before 4:30 in the afternoon at a field office.", "4:30", True),
    ("tx_dmv_1", "You can renew your Texas vehicle registration online up to 90 days before it expires.", "90 days", True),
    ("tx_dmv_2", "Online renewal opens 90 days prior to the expiration date.", "90 days", True),
    ("usps_1", "A First-Class Forever stamp (1 oz) currently costs $0.78.", "0.78", True),
    ("usps_2", "The Forever stamp price is 0.78 dollars for the first ounce.", "0.78", True),
    ("irs_1", "The 2025 standard deduction for a single filer is $15,750.", "15750", True),
    ("irs_2", "For a single filer in tax year 2025 the standard deduction amount is 15750 dollars.", "15750", True),
    ("ssa_1", "For anyone born in 1960 or later, the full retirement age is 67.", "67", True),
    ("ssa_2", "Full retirement age: 67 years for the 1960-or-later birth cohort.", "67", True),
    ("trimet_1", "An adult Day Pass on TriMet costs $5.60.", "5.60", True),
    ("trimet_2", "The adult Day Pass is priced at 5.6 dollars on the support page.", "5.60", True),
    ("portland_1", "Food cart permit applications are submitted and fees are paid online through DevHub.", "DevHub", True),
    ("portland_2", "You apply and pay on the city's DevHub platform.", "DevHub", True),
    ("oregon_state_1", "OSU 2025-26 resident undergraduate tuition and fees total $15,246 for the full year.", "15246", True),
    ("oregon_state_2", "After expanding the accordion, in-state full-year tuition and fees show as 15246 USD.", "15246", True),
    ("powells_1", "'Practices in Apparition' by Gabi Abrao is $22.95 in Trade Paperback at Powell's.", "22.95", True),
    ("powells_2", "The Trade Paperback edition is listed at 22.95 dollars.", "22.95", True),
    ("voodoo_1", "The Old Town Portland Voodoo Doughnut (22 SW 3rd Ave) is in ZIP code 97204.", "97204", True),
    ("voodoo_2", "Address: 22 SW 3rd Ave, Portland, OR 97204.", "97204", True),
    ("innout_1", "In-N-Out was founded in 1948, with its first store in Baldwin Park.", "1948", True),
    ("innout_2", "The history timeline shows the company began in 1948.", "1948", True),
    ("bear_1", "Bear Pro is $2.99/month or $29.99/year.", "2.99 | 29.99", True),
    ("bear_2", "The yearly Bear Pro subscription is priced at $29.99.", "2.99 | 29.99", True),
    ("apple_1", "The iPhone 17 Pro starts at $1,099 (or $45.79/mo with financing).", "1099 | 45.79", True),
    ("apple_2", "Monthly financing for the iPhone 17 Pro works out to $45.79 per month.", "1099 | 45.79", True),
    ("craigslist_1", "Posting a job in the US job categories on Craigslist costs $75.", "75", True),
    ("craigslist_2", "Job posts in these categories are 75 dollars each (most other fees are $5).", "75", True),
    ("zalando_1", "The adidas Originals Wide Leg Leo Print satin pants cost 69,95 euros (VAT included) on zalando.pt.", "69,95 | 69.95", True),
    ("zalando_2", "Price shown for the satin pants is €69.95 including VAT.", "69,95 | 69.95", True),
    ("amazon_1", "The NEW JETO metal bed frame in Queen 14-inch is $53.99.", "53.99", True),
    ("amazon_2", "Queen size (14 inch) price for this bed frame is 53.99 dollars.", "53.99", True),
    ("ticketmaster_1", "The opening act for Zach Bryan on October 10, 2026 is Gregory Alan Isakov.", "Gregory Alan Isakov", True),
    ("ticketmaster_2", "Support for that Zach Bryan show is Gregory Alan Isakov (Jordan-Hare Stadium, Auburn).", "Gregory Alan Isakov", True),

    # --- negatives ---
    ("stripe_neg_1", "Stripe's standard online card processing rate is 12.9% plus 30 cents per transaction.", "2.9%", False),
    ("stripe_neg_2", "The pricing page lists a fee of 29% for that tier.", "2.9%", False),
    ("stripe_neg_3", "The standard processing cost works out to about 2.9 cents per dollar handled.", "2.9%", False),
    ("stripe_neg_4", "BLOCKED", "2.9%", False),
    ("shopify_neg_1", "Shopify's Basic plan is billed at $290 per year when paid annually.", "$29", False),
    ("shopify_neg_2", "The Shopify (mid-tier) plan shown on the same page costs $79 a month.", "$29", False),
    ("shopify_neg_3", "The entry plan runs $2,900 for an enterprise annual commitment.", "$29", False),
    ("shopify_neg_4", "", "$29", False),
    ("github_neg_1", "GitHub's Enterprise plan is listed at $210 per user for an annual prepay.", "$21", False),
    ("github_neg_2", "The Team plan on the same pricing page is $4 per user per month.", "$21", False),
    ("github_neg_3", "The Enterprise tier costs $121 per user per month.", "$21", False),
    ("twilio_neg_1", "Sending one SMS to a US number on Twilio costs $0.0079 per message.", "0.0083", False),
    ("twilio_neg_2", "The per-message US MMS price shown is $0.0200.", "0.0083", False),
    ("twilio_neg_3", "Inbound carrier fees add about $0.083 per message in some cases.", "0.0083", False),
    ("twilio_neg_4", "BLOCKED", "0.0083", False),
    ("notion_neg_1", "Notion's Plus plan is $120 per user when billed annually up front.", "$12", False),
    ("notion_neg_2", "The Business plan on the same page is priced at $18 per user per month.", "$12", False),
    # notion_neg_3 intentionally EXCLUDED — see disputed_cases / module docstring.
    ("notion_neg_4", "The starter tier costs $1,200 for a 10-seat annual bundle.", "$12", False),
    ("cloudflare_neg_1", "Cloudflare's Business plan, shown on the same plans page, is $200 per month.", "$20 | $25", False),
    ("cloudflare_neg_2", "The Enterprise tier is priced at $250 per month on the same page.", "$20 | $25", False),
    ("cloudflare_neg_3", "The Pro plan costs $22 per month.", "$20 | $25", False),
    ("cloudflare_neg_4", "", "$20 | $25", False),
    ("bestbuy_neg_1", "The Lenovo Legion Tower 5i is priced at $1,848.50 on the product page.", "1848", False),
    ("bestbuy_neg_2", "The configured price comes to $18480 after the upgrade bundle.", "1848", False),
    ("bestbuy_neg_3", "The cart total with accessories shows $21,848.", "1848", False),
    ("bestbuy_neg_4", "A similar Legion config is listed at $1,749.99.", "1848", False),
    ("ikea_neg_1", "The KIVIK 4-seat sectional with chaise is $20,990 in this configuration.", "2099", False),
    ("ikea_neg_2", "The KIVIK sectional is currently $1,999.00 (reduced).", "2099", False),
    ("ikea_neg_3", "A smaller KIVIK loveseat on the same page is $899.00.", "2099", False),
    ("target_neg_1", "The Clorox ToiletWand system is $12.99 at this Target store.", "12.89", False),
    ("target_neg_2", "The refill-only pack on the same page is $128.99.", "12.89", False),
    ("target_neg_3", "The bundle is listed at $1.89 in the promo strip.", "12.89", False),
    ("target_neg_4", "BLOCKED", "12.89", False),
    ("spotify_neg_1", "Spotify Premium Individual is $11.99 per month right now.", "12.99", False),
    ("spotify_neg_2", "The Premium Duo plan on the same page is $16.99 per month.", "12.99", False),
    ("spotify_neg_3", "It is $0 for the first 3 months as a new-user promo.", "12.99", False),
    ("costco_neg_1", "Costco's Executive membership is $650 if you prepay a decade up front.", "$65", False),
    ("costco_neg_2", "The Executive tier annual fee shown on the same page is $130.", "$65", False),
    ("costco_neg_3", "The Gold Star fee is listed as $6.50 per month equivalent.", "$65", False),
    ("costco_neg_4", "The annual fee comes to $165 after a service add-on.", "$65", False),
    ("ca_dmv_neg_1", "Written tests must be completed by 14:30 at California DMV offices.", "4:30", False),
    ("ca_dmv_neg_2", "The cutoff time noted in step 3 is 4:300 hours (typo on page).", "4:30", False),
    ("ca_dmv_neg_3", "Tests close at 5:30 p.m. at DMV field offices.", "4:30", False),
    ("ca_dmv_neg_4", "BLOCKED", "4:30", False),
    ("tx_dmv_neg_1", "You can renew your Texas registration online up to 190 days before expiration.", "90 days", False),
    ("tx_dmv_neg_2", "Online renewal opens 90 weeks ahead in some legacy systems.", "90 days", False),
    ("tx_dmv_neg_3", "You may renew up to 12 months after expiration absent a citation.", "90 days", False),
    ("tx_dmv_neg_4", "Renewal is allowed up to 900 days for some commercial fleets.", "90 days", False),
    ("usps_neg_1", "A First-Class Forever stamp (1 oz) now costs $0.61.", "0.78", False),
    ("usps_neg_2", "The metered 1 oz rate shown is $0.788.", "0.78", False),
    ("usps_neg_3", "A large-envelope (flat) starts at $1.63 per the table.", "0.78", False),
    ("usps_neg_4", "", "0.78", False),
    ("irs_neg_1", "The 2025 standard deduction for married filing jointly is $31,500.", "15750", False),
    ("irs_neg_2", "Head of household gets a 2025 standard deduction of $23,625.", "15750", False),
    ("irs_neg_3", "The single-filer figure rounds to about $157,500 across a decade.", "15750", False),
    ("irs_neg_4", "BLOCKED", "15750", False),
    ("ssa_neg_1", "For someone born in 1967, the planner shows a reduced benefit schedule.", "67", False),
    ("ssa_neg_2", "The 1955 row of the reduction table lists a 26.67% benefit reduction.", "67", False),
    ("ssa_neg_3", "The early-retirement reduction can total $670 over the period.", "67", False),
    ("ssa_neg_4", "Full retirement age for that cohort is 66 and 10 months.", "67", False),
    ("trimet_neg_1", "An adult Day Pass on TriMet is $2.80.", "5.60", False),
    ("trimet_neg_2", "The adult Day Pass costs $56.00 for a monthly bundle.", "5.60", False),
    ("trimet_neg_3", "The Day Pass is listed at $5.65 in the fare chart.", "5.60", False),
    ("portland_neg_1", "You submit the Portland food cart application through the city's online Permitting Portal.", "DevHub", False),
    ("portland_neg_2", "Applications are filed via the Developer Hub system online.", "DevHub", False),
    ("portland_neg_3", "BLOCKED", "DevHub", False),
    ("portland_neg_4", "", "DevHub", False),
    ("oregon_state_neg_1", "Non-resident undergraduate tuition and fees for 2025-26 at OSU are $40,392.", "15246", False),
    ("oregon_state_neg_2", "The resident full-year cost shows $152,460 across the program.", "15246", False),
    ("oregon_state_neg_3", "In-state tuition and fees come to $15,426 for the year.", "15246", False),
    ("powells_neg_1", "'Practices in Apparition' is $24.95 in Trade Paperback on Powell's.", "22.95", False),
    ("powells_neg_2", "The hardcover edition on the same page is $29.95.", "22.95", False),
    ("powells_neg_3", "The used copy is listed at $12.95.", "22.95", False),
    ("voodoo_neg_1", "The Old Town Portland Voodoo Doughnut is in ZIP 97205.", "97204", False),
    ("voodoo_neg_2", "The location address is 22 SW 3rd Ave, suite 972040.", "97204", False),
    ("voodoo_neg_3", "BLOCKED", "97204", False),
    ("innout_neg_1", "In-N-Out's first drive-thru opened in 1958 per the timeline.", "1948", False),
    ("innout_neg_2", "The company history references the year 19480 in a footnote reference number.", "1948", False),
    ("innout_neg_3", "The timeline notes a major expansion milestone in 1988.", "1948", False),
    ("bear_neg_1", "Bear Pro is shown at $3.99 per month on the page.", "2.99 | 29.99", False),
    ("bear_neg_2", "A legacy lifetime unlock was $299.99 historically.", "2.99 | 29.99", False),
    ("bear_neg_3", "The annual plan is $39.99 per year.", "2.99 | 29.99", False),
    ("bear_neg_4", "", "2.99 | 29.99", False),
    ("apple_neg_1", "The iPhone 17 Pro Max starts at $1,199.", "1099 | 45.79", False),
    ("apple_neg_2", "Financing on a higher-storage tier runs $54.79 per month.", "1099 | 45.79", False),
    ("apple_neg_3", "A bundle total reaches $10990 with AppleCare added.", "1099 | 45.79", False),
    ("apple_neg_4", "BLOCKED", "1099 | 45.79", False),
    ("craigslist_neg_1", "Posting a job in most US markets on Craigslist costs $750 for a premium tier.", "75", False),
    ("craigslist_neg_2", "Most other Craigslist posting categories cost $5 to post.", "75", False),
    ("craigslist_neg_3", "A job post in that region is $175 in the high-cost metro.", "75", False),
    ("craigslist_neg_4", "The fee shown is $7.50 per listing.", "75", False),
    ("zalando_neg_1", "The adidas Originals satin pants are 6995 euros listed without separators.", "69,95 | 69.95", False),
    ("zalando_neg_2", "The price shown is 69 euros even.", "69,95 | 69.95", False),
    ("zalando_neg_3", "A bundle of these pants is 6,995 euros for a wholesale lot.", "69,95 | 69.95", False),
    ("zalando_neg_4", "The satin pants cost 69,99 euros (VAT incl.).", "69,95 | 69.95", False),
    ("amazon_neg_1", "The NEW JETO metal bed frame in Full size is $52.99.", "53.99", False),
    ("amazon_neg_2", "The King variant on the same page is $56.99.", "53.99", False),
    ("amazon_neg_3", "With the store-card promo it shows $43.99.", "53.99", False),
    ("amazon_neg_4", "BLOCKED", "53.99", False),
    ("ticketmaster_neg_1", "The opening act for Zach Bryan on October 10, 2026 is Levi Turner.", "Gregory Alan Isakov", False),
    ("ticketmaster_neg_2", "The opener is Gregory Isakov, per the event page.", "Gregory Alan Isakov", False),
    ("ticketmaster_neg_3", "BLOCKED", "Gregory Alan Isakov", False),
    ("ticketmaster_neg_4", "", "Gregory Alan Isakov", False),

    # --- blank registered-value guards ---
    ("blank_reg_neg_1", "Stripe's standard online card rate is 2.9% plus 30 cents per transaction.", "", False),
    ("blank_reg_neg_2", "GitHub Enterprise is $21 per user per month.", "   ", False),

    # --- explicit per-type cases supplied with the SPEC ---
    ("stripe_percent_true", "Stripe's standard rate for online domestic card payments is 2.9% + 30 cents per transaction, as shown on the pricing page.", "2.9%", True),
    ("stripe_percent_false_diff", "For international cards Stripe charges an additional 1.5% bringing the rate to 3.9% per transaction.", "2.9%", False),
    ("stripe_percent_false_subnum", "The premium processing tier is billed at 12.9% per transaction for this option.", "2.9%", False),
    ("ca_dmv_time_true", "Written tests are unavailable at California DMV offices after 4:30 p.m.", "4:30", True),
    ("ca_dmv_time_false_prefix", "Some offices run their last appointment block at 14:30 in the afternoon.", "4:30", False),
    ("tx_dmv_phrase_true", "You can renew your Texas vehicle registration online up to 90 days before it expires.", "90 days", True),
    ("tx_dmv_phrase_false_prefix", "In some states renewal opens as early as 190 days before the expiration date.", "90 days", False),
    ("portland_literal_true", "Food cart permit applications are submitted and fees paid on the DevHub platform.", "DevHub", True),
    ("portland_literal_false_wrongname", "You submit your application and pay the fees through the city's CityConnect portal.", "DevHub", False),
    ("ticketmaster_literal_true", "The opening act for Zach Bryan on October 10, 2026 is Gregory Alan Isakov.", "Gregory Alan Isakov", True),
    ("ticketmaster_literal_false_wrongname", "The listed opener for that Zach Bryan show is Sierra Ferrell.", "Gregory Alan Isakov", False),
    ("cloudflare_anyof_true_20", "Cloudflare's Pro plan costs $20 per month when billed annually.", "$20 | $25", True),
    ("cloudflare_anyof_true_25", "The Pro plan is $25 a month if you pay month to month.", "$20 | $25", True),
    ("cloudflare_anyof_false_neither", "The Business plan shown on the same plans page is $200 per month.", "$20 | $25", False),
    ("bear_anyof_true_monthly", "Bear Pro is priced at $2.99 per month.", "2.99 | 29.99", True),
    ("bear_anyof_true_yearly", "Alternatively Bear Pro costs $29.99 billed once per year.", "2.99 | 29.99", True),
    ("apple_anyof_true_full", "The iPhone 17 Pro has a starting price of $1099.", "1099 | 45.79", True),
    ("apple_anyof_true_financing", "It is shown as $45.79/mo with Apple's financing option.", "1099 | 45.79", True),
    ("zalando_commadecimal_true_comma", "The adidas Originals satin pants cost 69,95 euros, VAT included, on zalando.pt.", "69,95 | 69.95", True),
    ("zalando_commadecimal_true_dot", "The price displayed is 69.95 EUR including tax.", "69,95 | 69.95", True),
    ("zalando_commadecimal_false_6995", "The internal catalog reference for this item is number 6995.", "69,95 | 69.95", False),
    ("zalando_commadecimal_false_69", "These pants are available in 69 stores across Portugal.", "69,95 | 69.95", False),
    ("voodoo_phone_true_dashed", "You can reach the Old Town Portland Voodoo Doughnut location at 503-241-4704.", "5032414704", True),
    ("voodoo_phone_true_parens", "Call (503) 241-4704 for the Old Town shop's hours.", "5032414704", True),
    ("voodoo_zip_true", "The Old Town Portland location at 22 SW 3rd Ave has ZIP code 97204.", "97204", True),
    ("voodoo_zip_false", "The location is at 22 SW 3rd Avenue in downtown Portland.", "97204", False),
    ("trimet_trailingzero_true_currency", "An adult Day Pass on TriMet costs $5.60.", "5.60", True),
    ("trimet_trailingzero_true_short", "The adult day pass is 5.6 dollars for the day.", "5.60", True),
    ("bestbuy_trailing00_true", "The Lenovo Legion Tower 5i is listed at $1,848.00 at standard price.", "1848", True),
    ("bestbuy_trailing00_false_subrun", "The full order total came to $11848.00 including tax and delivery.", "1848", False),
]


# ---------------------------------------------------------------------------
# Block B — my own additional cases (cover every row + every special type +
# the scorer's hard guarantees). These are NOT from the authored set.
# ---------------------------------------------------------------------------
EXTRA_CASES = [
    # --- hard input guards (the SPEC's must-never-raise / must-never-match-all rules) ---
    ("guard_none_answer", None, "75", False),                 # None agent_answer -> False
    ("guard_none_reg", "the fee is $75", None, False),        # None answer_substring -> False
    ("guard_both_none", None, None, False),
    ("guard_blank_answer_ws", "   \n\t ", "75", False),       # whitespace-only answer -> False
    ("guard_blank_reg_tabs", "the fee is $75", "\t\n ", False),
    ("guard_blocked_self", "BLOCKED", "BLOCKED", True),       # BLOCKED matches only literal BLOCKED
    ("guard_blocked_vs_num", "BLOCKED", "75", False),
    ("guard_anyof_one_blank", "the price is 75 dollars", "75 | ", True),   # blank alt dropped, real alt matches
    ("guard_anyof_all_blank", "the price is 75 dollars", " | ", False),    # all-blank any-of -> False
    ("guard_anyof_leading_blank", "the price is $20", " | $20", True),

    # --- NUMBER type: value-equality, trailing zeros, maximal-token boundary ---
    ("num_trailing_zeros_more", "the fare is 5.600 dollars", "5.60", True),    # 5.600 == 5.60
    ("num_thousands_plain", "deduction of 15,750 dollars", "15750", True),
    ("num_subrun_left_block", "total $157500 over a decade", "15750", False),  # 157500 != 15750
    ("num_subrun_right_block", "reference 215750 on file", "15750", False),
    ("num_decimal_currency_euro", "the item is €53.99 incl VAT", "53.99", True),
    ("num_decimal_currency_pound", "priced at £12.89 in the UK store", "12.89", True),
    ("num_zip_not_phone_5digit", "the ZIP is 97204 downtown", "97204", True),  # 5 digits -> NUMBER, not phone
    ("num_two_tokens_one_matches", "It is $130 for Executive but $65 for Gold Star.", "$65", True),
    ("num_trailing_comma_prose", "founded in 1948, in Baldwin Park", "1948", True),  # trailing comma not part of token
    ("num_leading_dollar_space", "the price is $ 29 per month", "$29", True),  # '$ 29' -> token 29

    # --- COMMA-DECIMAL (European) type ---
    ("cd_token_comma_match", "costs 69,95 euros today", "69,95", True),
    ("cd_token_dot_matches_comma_reg", "costs 69.95 euros today", "69,95", True),  # answer dot token == reg 69.95
    ("cd_thousands_not_decimal", "a wholesale lot is 6,995 euros", "69,95", False), # 6,995 -> 6995 thousands
    ("cd_bare_int_no_match", "available in 69 stores", "69,95", False),
    ("cd_wrong_cents", "the price is 69,99 euros", "69,95", False),

    # --- PERCENT type ---
    ("pct_exact", "the rate is 2.9% per charge", "2.9%", True),
    ("pct_subnum_block", "the premium rate is 12.9% per charge", "2.9%", False),
    ("pct_no_percent_sign", "about 2.9 cents on the dollar", "2.9%", False),
    ("pct_with_space", "the rate is 2.9 % per charge", "2.9%", True),  # '<number> %' (space) still matches
    ("pct_int_reg", "a 29 % surcharge applies", "29%", True),

    # --- TIME type ---
    ("time_exact", "tests close after 4:30 p.m.", "4:30", True),
    ("time_left_digit_block", "closes at 14:30 sharp", "4:30", False),
    ("time_right_digit_block", "the code 4:305 is unrelated", "4:30", False),
    ("time_wrong", "closes at 5:30 in the evening", "4:30", False),
    ("time_two_digit_hour", "opens at 10:15 daily", "10:15", True),
    # Review regression: an HH:MM:SS timestamp is a DIFFERENT (more precise) time and
    # must not match the "exact" 4:30 — the colon guard, not just the digit guard.
    ("time_seconds_block", "the job runs at 4:30:15 every morning", "4:30", False),
    ("time_seconds_zero_block", "scheduled 4:30:00 utc daily", "4:30", False),

    # --- NUMBER-LED PHRASE type ---
    ("phrase_exact", "renew up to 90 days early", "90 days", True),
    ("phrase_left_digit_block", "renew up to 190 days early", "90 days", False),
    ("phrase_wrong_word", "opens 90 weeks ahead", "90 days", False),
    ("phrase_case_insensitive", "renew up to 90 DAYS early", "90 days", True),
    ("phrase_extra_whitespace", "renew up to 90  days early", "90 days", True),  # collapsed whitespace
    # Review regression: a glued tail is a different word/product, not the "exact phrase".
    ("phrase_glued_tail_block", "sign up for the 90 dayschallenge fitness plan", "90 days", False),
    ("phrase_glued_tail_x_block", "the 90 daysx promo runs now", "90 days", False),

    # --- PHONE / long-digit type ---
    ("phone_dashed", "reach us at 503-241-4704", "5032414704", True),
    ("phone_parens_spaces", "call (503) 241 4704 now", "5032414704", True),
    ("phone_dotted", "dial 503.241.4704 anytime", "5032414704", True),
    ("phone_embedded_ok", "ref id 15032414704999 line", "5032414704", True),  # substring of digit stream
    ("phone_absent", "no number listed on this page", "5032414704", False),

    # --- LITERAL type ---
    ("lit_proper_noun", "submit and pay via DevHub online", "DevHub", True),
    ("lit_case_insensitive", "submit and pay via devhub online", "DevHub", True),
    ("lit_no_space_guard", "filed via the Developer Hub system", "DevHub", False),  # 'devhub' != 'developer hub'
    ("lit_multiword", "opener is Gregory Alan Isakov tonight", "Gregory Alan Isakov", True),
    ("lit_partial_name_block", "opener is Gregory Isakov tonight", "Gregory Alan Isakov", False),
    ("lit_whitespace_collapse", "opener is Gregory   Alan\n Isakov tonight", "Gregory Alan Isakov", True),
    # PIN (review finding): LITERAL is normalized SUBSTRING per the pre-registered
    # "case-normalize (proper noun)" match_rule, so it intentionally has NO word boundary
    # — a longer word starting with the registered token still matches. This pins that
    # documented behavior so it can't change silently. Whether to tighten LITERAL to a
    # word boundary (so "DevHubbed"/"Isakovich" stop matching) is a Member 4 decision,
    # since it would alter pre-registered scoring semantics. Contrast: the numeric word-
    # boundary IS pre-registered (rule 3) and is enforced.
    ("lit_embedded_prefix_pin", "we migrated to the DevHubbed v2 intranet", "DevHub", True),

    # --- per-site coverage reinforcement (the 28 rows, distinct phrasings) ---
    ("cov_stripe", "processing is 2.9% plus 30c", "2.9%", True),
    ("cov_shopify", "Basic is $29 monthly", "$29", True),
    ("cov_github", "Enterprise is $21 per seat", "$21", True),
    ("cov_twilio", "US SMS is $0.0083 each", "0.0083", True),
    ("cov_notion", "Plus is $12 a seat", "$12", True),
    ("cov_cloudflare_25", "Pro is $25 month-to-month", "$20 | $25", True),
    ("cov_bestbuy", "the desktop is $1,848.00", "1848", True),
    ("cov_ikea", "the sectional is $2,099", "2099", True),
    ("cov_target", "the system is $12.89", "12.89", True),
    ("cov_spotify", "Premium is $12.99 monthly", "12.99", True),
    ("cov_costco", "Gold Star is $65 a year", "$65", True),
    ("cov_ca_dmv", "tests end at 4:30 pm", "4:30", True),
    ("cov_tx_dmv", "renew 90 days early online", "90 days", True),
    ("cov_usps", "Forever stamp is $0.78", "0.78", True),
    ("cov_irs", "single deduction is $15,750", "15750", True),
    ("cov_ssa", "full retirement age is 67", "67", True),
    ("cov_trimet", "Day Pass is $5.60", "5.60", True),
    ("cov_portland", "apply on DevHub", "DevHub", True),
    ("cov_oregon_state", "in-state is $15,246", "15246", True),
    ("cov_powells", "paperback is $22.95", "22.95", True),
    ("cov_voodoo", "ZIP is 97204 in Old Town", "97204", True),
    ("cov_innout", "founded 1948 in Baldwin Park", "1948", True),
    ("cov_bear_monthly", "Bear Pro is $2.99 monthly", "2.99 | 29.99", True),
    ("cov_apple_full", "iPhone 17 Pro from $1099", "1099 | 45.79", True),
    ("cov_craigslist", "job posts are $75 each", "75", True),
    ("cov_zalando", "pants are 69,95 euros", "69,95 | 69.95", True),
    ("cov_amazon", "Queen frame is $53.99", "53.99", True),
    ("cov_ticketmaster", "opener Gregory Alan Isakov", "Gregory Alan Isakov", True),
]


def main():
    cases = AUTHORED_CASES + EXTRA_CASES
    failures = []
    for cid, agent_answer, answer_substring, expected in cases:
        try:
            actual = score_answer(agent_answer, answer_substring)
        except Exception as e:  # score_answer must NEVER raise — treat a raise as a failure
            failures.append((cid, agent_answer, expected, f"RAISED {e!r}"))
            continue
        if actual != expected:
            failures.append((cid, agent_answer, expected, actual))

    total = len(cases)
    if failures:
        print(f"FAILED {len(failures)}/{total}")
        for cid, agent_answer, expected, actual in failures:
            print(f"  FAILED [{cid}]")
            print(f"    agent_answer: {agent_answer!r}")
            print(f"    expected:     {expected}")
            print(f"    actual:       {actual}")
        sys.exit(1)

    print(f"PASS {total}/{total}")
    sys.exit(0)


if __name__ == "__main__":
    main()
