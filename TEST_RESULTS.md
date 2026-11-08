# Land Tax BD — TEST_RESULTS.md

Run: 2026-11-08, 14:00 slot (run #274). All tests run on the ASCII-escaped
sources (Bengali as `\uXXXX` in JS, `&#...;` in HTML; `grep -rP '[^\x00-\x7F]'`
over js/css/tests/index.html returns 0 matches).

## Node unit tests — 85/85 green

Command: `node tests/logic.test.js`

Coverage: default rates vs the 1976 schedule (all 6 non-agri rates, tea ৳1.10,
penalty 6.25%, exemption threshold 825 decimal); unit conversions (bigha 33,
katha 1.65, acre 100, sq ft 435.6, sq m); every agricultural tier boundary
(200/500/1000/1500/2500/3333/4000 decimal) plus tier continuity; the ৳1
minimum; exemption edges (825 exempt vs 826 taxable at ৳168.36); all
non-agricultural rates; the partly-commercial rule; penalty at 0/3/5/10
arrears years; three full bills; money formatting (EN/BN); fiscal-year end
and days-to-due (2026-11-08 → 234 days to 2027-06-30); validateCalc /
validateRates / validateImport (incl. wrong app/version, bad history item).

### Test-expectation corrections (test-side, not app bugs)

1. `agri 4000 dec`: expected 365500, code returned 365600. Recomputed by hand:
   268885 + 667 × 145 = 268885 + 96715 = 365600. **Code was right; test fixed.**
2. `agri 826 dec farming family`: expected 9990 (tier-ii math), code returned
   16836. Recomputed: 826 decimal = 8.26 acre → tier iii: 5100 + 326 × 36 =
   16836. **Code was right; test fixed.**
3. `daysToDue after 2027-06-30`: expected -1, code returned 365. The function
   rolls into the next fiscal year (2027-07-01 → 365 days to 2028-06-30),
   which is the intended behaviour for a tax app. **Test fixed to assert the
   roll-forward.**

## Headless-Chrome smoke tests — 56/56 green

Command: `node tests/smoke.js` (raw CDP, Playwright headless_shell-1187,
`file://.../index.html?asof=2026-11-08`)

Coverage: page title, 4 tabs, calculator visible by default, test hooks,
`?asof=` pin; form-driven calc (residential/Dhaka core/10 decimal → annual
৳200.00, total ৳200.00, due line "234 days left" + "2027-06-30"); hook-driven
calcs (2-year ৳400.00; 5 arrears years penalty ৳25.00/total ৳425.00; farming
family 100 dec exempt ৳0 with exempt note; 826 dec ৳168.36; tea 100 dec
৳110.00; commercial other 10 dec ৳150.00; 1 bigha → ৳660.00; partly-commercial
→ commercial rate ৳1,000.00); validation (amount 0 → inline error, result
hidden); conditional rows (agricultural shows farm row, hides area class;
residential shows partly-commercial row); history save + reload persistence
(total ৳200.00); rate table (3 non-agri rows, 7 tier rows, tea ৳1.10,
penalty 6.25%); rate edit (Dhaka residential → ৳25 ⇒ ৳250.00) + reset
(⇒ ৳200.00); BN toggle (Bengali title/digits, land type preserved,
persists after reload, back to EN); export payload (`land-tax-bd` v1);
import valid payload, wrong-app rejection with data intact, eraseAll
(history cleared, rates restored); 390px no-overflow on calculator and
rates tabs; zero non-file network requests; **0 console/page errors**.

### Real app bugs found by the smoke test (both fixed, suite re-run green)

1. **Missing headings**: `renderRateTables()` referenced `ratesTeaTitle` /
   `ratesPenaltyTitle`, which did not exist in `index.html` → `TypeError`
   during init, so `window.__landtax` was never set (form still worked
   because its listeners attach before init). Fixed by adding the two `<h3>`
   elements. 56/56 after the fix.
2. **Select reset on language toggle**: `fillSelects()` rebuilt the `<select>`
   options and then read `.value` (already reset to the first option), so
   toggling language reset land type to Agricultural. Fixed by capturing the
   previous value before rebuilding and restoring it (defaults: residential /
   dhakaCore / decimal). Also added `updateVisibility()` to `applyLang()` so
   conditional rows follow the preserved type.
3. **Timezone shift in `asof` hook**: `toISOString()` returned 2026-11-07
   for a 2026-11-08 local date in +06. Fixed with a local-date formatter.

## Verification notes

- Rate facts were verified against primary/secondary sources before coding:
  the 1976 schedule was read verbatim from bdlaws.minlaw.gov.bd
  (Act Print 519, s.3); the 2023 Act facts (gazette-set rates, 25-bigha
  exemption, 30 June deadline, 3-year advance, 6.25% penalty, never
  time-barred) were confirmed by two independent sources.
- Tier continuity was verified arithmetically: each tier's top equals the
  next tier's base (600/5100/23100/53100/148100).
- No fabricated data: the only shipped numbers are the cited schedule, the
  standard BD area conversions, and the app's own documented extrapolations
  (post-33.33-acre marginal rate; penalty model).
