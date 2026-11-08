# Land Tax BD — ভূমি উন্নয়ন কর ক্যালকুলেটর

Offline, bilingual (EN / বাংলা) Bangladesh **Land Development Tax (ভূমি উন্নয়ন কর)** calculator. Enter a parcel's land type, area class and size; get the annual tax, multi-year totals, the arrears penalty, and the 30 June payment deadline — with a full rate table you can edit to match your land office's current demand notice.

## Problem

Every landowner in Bangladesh owes an annual land development tax, but the amount depends on a tangle of rules: land type (agricultural / tea-garden / residential / commercial / industrial), area class (Dhaka core thanas / district-HQ municipality / other area), the tiered agricultural schedule, the 25-bigha farming-family exemption, and a 6.25% penalty on long-overdue arrears. The current Act sets rates by gazette, so the last published statutory schedule is easy to lose track of. This app puts the whole calculation — with its sources — in one offline page.

## Features

1. **Tax calculator** — land type, area class, area in decimal / bigha / katha / acre / sq ft / sq m, years to pay (1–10), years already overdue (0–10).
2. **1976 schedule engine** — agricultural tier rates (3 paisa–৳1.45/decimal), tea/orchard flat rate, and the three area-class non-agricultural rates, all in integer paisa (no float error).
3. **2023 Act rules** — farming-family exemption up to 25 bigha (8.25 acre); land partly used commercially is taxed wholly at the commercial rate; 6.25% annual penalty on arrears beyond the 3-year grace period; payment due by 30 June with a live days-left countdown.
4. **Editable rate table** — every default rate (and the penalty %) can be changed and is saved on the device, with one-tap reset to the published defaults.
5. **Saved calculations** — history with per-row delete, running total, JSON export / strict import, typed-DELETE erase-all.
6. **Bilingual UI** — EN / বাংলা toggle persisted, Bengali digits, 390px mobile layout, zero network requests.

## Rate sources (read before relying on a figure)

- **Defaults** are the last published statutory schedule: *Land Development Tax Ordinance, 1976*, s.3 (bdlaws.minlaw.gov.bd, Act Print 519) — agricultural tiers (≤2 acre: 3 paisa/decimal, min ৳1; 2–5 acre: ৳6 + 15 paisa; 5–10: ৳51 + 36 paisa; 10–15: ৳231 + 60 paisa; 15–25: ৳531 + 95 paisa; 25–33.33: ৳1,481 + ৳1.45), tea/coffee/rubber/orchard ৳1.10/decimal, non-agricultural Dhaka core ৳100 commercial / ৳20 residential, district HQ ৳20 / ৳6, other areas ৳15 / ৳5 per decimal.
- **Structure** follows the *Land Development Tax Act, 2023* (Act No. 31 of 2023, in force 1 July 2024): rates are set by gazette notification; agricultural land up to 25 bigha held by a farming person/family is exempt (above that the whole holding is taxable); pay by 30 June each year; up to 3 years may be paid in advance; arrears unpaid for 3 consecutive years carry a 6.25% annual penalty and are recoverable by certificate case; the demand is never time-barred.
- **Verify before paying:** the 2023 Act sets rates by gazette, so the 1976 defaults may differ from your land office's current demand notice. Edit the rates in the Rate Table tab to match your notice. This app is a personal estimator, not an official bill.

## Hand-verified examples

| Case | Expected |
|---|---|
| Residential, Dhaka core, 10 decimal, 1 yr | ৳200.00 |
| Residential, Dhaka core, 10 decimal, 2 yrs | ৳400.00 |
| Same + 5 overdue years | penalty ৳25.00, total ৳425.00 |
| Agricultural, farming family, 100 decimal (≤25 bigha) | exempt, ৳0 |
| Agricultural, farming family, 826 decimal | ৳168.36 (tier iii: ৳51 + 326 × ৳0.36) |
| Agricultural, 2,500 decimal (25 acre) | ৳1,481.00 |
| Tea/orchard, 100 decimal | ৳110.00 |
| Commercial, other area, 10 decimal | ৳150.00 |
| 1 bigha residential, Dhaka core | 33 decimal → ৳660.00 |

## Stack

Vanilla HTML/CSS/JS, no dependencies, no build step, no network calls. State in `localStorage` (`landtax.state.v1`, `landtax.rates.v1`). All app sources are pure ASCII — Bengali strings are `\uXXXX` escapes in JS and `&#...;` entities in HTML (see `TEST_RESULTS.md`), so the files survive any transport intact.

## Prerequisites

Any modern browser. For tests: Node.js 18+ and a headless Chromium (the smoke test uses the Playwright `headless_shell` binary if present, or `CHROME_BIN`).

## Install & run

```sh
# No install step. Serve the folder or open the file directly:
python3 -m http.server 8000
# then open http://localhost:8000/
# or open index.html directly (file:// works; add ?asof=YYYY-MM-DD to pin "today")
```

## Dev commands

```sh
node tests/logic.test.js   # 85 node unit tests
node tests/smoke.js        # 56 headless-Chrome checks (raw CDP)
```

## Testing

- `tests/logic.test.js`: 85/85 — conversions, every agricultural tier boundary + continuity, exemption edges (825 vs 826 decimal), all six non-agricultural rates, tea rate, penalty math, full bills, money/Bengali-digit formatting, fiscal-year due dates, validation, import validation.
- `tests/smoke.js`: 56/56 — form-driven and hook-driven calculations, validation errors, conditional rows, history save + reload persistence, rate edit + reset, BN toggle + persistence, export/import/erase, 390px no-overflow, zero non-file network requests, 0 console/page errors.
- See `TEST_RESULTS.md` for the full record, including the three test-expectation corrections and the two app bugs found by the smoke test.

## Deployment

Static site — any static host or GitHub Pages (publish the repo root). Live: https://fahad3235.github.io/land-tax-bd/

## Limitations

- **Rates are defaults, not live law.** The 1976 schedule is the last published statutory table; the 2023 Act sets rates by gazette. If your land office charges different rates, edit them in the app.
- **Above 33.33 acre** the 1976 agricultural schedule is silent; the app continues at the last marginal rate (৳1.45/decimal) and labels this as an extrapolation, not statute.
- **Penalty is a simplified model:** 6.25% of one year's tax per overdue year beyond the 3-year grace period. Real certificate-case recovery may compute differently.
- **Area conventions:** 1 bigha = 33 decimal, 1 katha = 1.65 decimal, 1 acre = 100 decimal, 1 decimal = 435.6 sq ft — the standard Bangladesh conventions (the Act itself equates 25 bigha with 8.25 acre). Local bigha sizes vary by district; the app converts by these standard figures.
- **Not legal or tax advice.** For disputes, the demand notice from your union land office / AC (Land) is authoritative.

## Status

Complete MVP — calculator, rate table + editor, history, data tools, bilingual UI, 85 unit + 56 smoke tests green. No known open defects.
