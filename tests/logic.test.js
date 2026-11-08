// Land Tax BD \u2014 node unit tests (no dependencies).
// Usage: node tests/logic.test.js  (exit non-zero on failure)
// All expected values were hand-computed from the 1976 schedule
// (bdlaws.minlaw.gov.bd, Act Print 519, s.3) and the 2023 Act rules.
const R = require('../js/rates.js');
const L = require('../js/logic.js');

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('ok - ' + name); }
  else { fail++; console.log('FAIL - ' + name + (extra ? ' :: ' + extra : '')); }
}
function close(a, b, eps) { return Math.abs(a - b) <= (eps || 1e-9); }

// ---- default rates match the 1976 schedule ----
check('dhakaCore commercial 10000 paisa (\u09f3100)', R.DEFAULT_RATES.dhakaCore.commercial === 10000);
check('dhakaCore residential 2000 paisa (\u09f320)', R.DEFAULT_RATES.dhakaCore.residential === 2000);
check('districtHq commercial 2000 (\u09f320)', R.DEFAULT_RATES.districtHq.commercial === 2000);
check('districtHq residential 600 (\u09f36)', R.DEFAULT_RATES.districtHq.residential === 600);
check('other commercial 1500 (\u09f315)', R.DEFAULT_RATES.other.commercial === 1500);
check('other residential 500 (\u09f35)', R.DEFAULT_RATES.other.residential === 500);
check('tea 110 paisa (\u09f31.10)', R.DEFAULT_RATES.teaPerDecimal === 110);
check('penalty 6.25%', R.DEFAULT_RATES.penaltyPct === 6.25);
check('exempt threshold 825 decimal (25 bigha)', R.EXEMPT_DECIMAL === 825);

// ---- unit conversions ----
check('1 bigha = 33 decimal', L.toDecimal(1, 'bigha') === 33);
check('2.5 bigha = 82.5 decimal', L.toDecimal(2.5, 'bigha') === 82.5);
check('1 katha = 1.65 decimal', L.toDecimal(1, 'katha') === 1.65);
check('1 acre = 100 decimal', L.toDecimal(1, 'acre') === 100);
check('435.6 sqft = 1 decimal', close(L.toDecimal(435.6, 'sqft'), 1, 1e-9));
check('100 sqm = 2.4711 decimal', close(L.toDecimal(100, 'sqm'), 2.4711, 1e-3), String(L.toDecimal(100, 'sqm')));
check('10 decimal = 10 decimal', L.toDecimal(10, 'decimal') === 10);
check('unknown unit NaN', isNaN(L.toDecimal(10, 'marla')));

// ---- agricultural tiers (1976 s.3(a)) ----
check('agri 100 dec = 300 paisa (\u09f33)', L.agriTierPaisa(100) === 300);
check('agri 10 dec = 100 paisa (\u09f31 minimum)', L.agriTierPaisa(10) === 100);
check('agri 33 dec = 100 paisa (99p rounds to min \u09f31)', L.agriTierPaisa(33) === 100);
check('agri 34 dec = 102 paisa', L.agriTierPaisa(34) === 102);
check('agri 200 dec = 600 paisa (tier i top)', L.agriTierPaisa(200) === 600);
check('agri 201 dec = 615 paisa', L.agriTierPaisa(201) === 615);
check('agri 500 dec = 5100 paisa (\u09f351, tier ii top)', L.agriTierPaisa(500) === 5100);
check('agri 1000 dec = 23100 paisa (\u09f3231, tier iii top)', L.agriTierPaisa(1000) === 23100);
check('agri 1500 dec = 53100 paisa (\u09f3531, tier iv top)', L.agriTierPaisa(1500) === 53100);
check('agri 2500 dec = 148100 paisa (\u09f31481, tier v top)', L.agriTierPaisa(2500) === 148100);
check('agri 3000 dec = 220600 paisa (\u09f32206)', L.agriTierPaisa(3000) === 220600);
check('agri 3333 dec = 268885 paisa (\u09f32688.85, tier vi top)', L.agriTierPaisa(3333) === 268885);
check('agri 4000 dec = 365600 paisa (\u09f33656, extrapolation at \u09f31.45)', L.agriTierPaisa(4000) === 365600);
check('agri 0 dec = 0', L.agriTierPaisa(0) === 0);
// Tier continuity: each tier top equals the next tier base.
check('tier continuity 200/500/1000/1500/2500',
  L.agriTierPaisa(200) === 600 && L.agriTierPaisa(500) === 5100 &&
  L.agriTierPaisa(1000) === 23100 && L.agriTierPaisa(1500) === 53100 &&
  L.agriTierPaisa(2500) === 148100);

// ---- exemption (2023 Act: farming family up to 25 bigha = 825 dec) ----
const agri = (dec, farm) => L.annualTax({ type: 'agricultural', decimal: dec, farmingFamily: farm });
check('agri 825 dec farming family exempt', agri(825, true).exempt && agri(825, true).paisa === 0);
check('agri 100 dec farming family exempt', agri(100, true).exempt);
check('agri 826 dec farming family taxable 16836 paisa (tier iii: 5100 + 326\u00d736)', !agri(826, true).exempt && agri(826, true).paisa === 16836, String(agri(826, true).paisa));
check('agri 100 dec non-farming taxable 300 paisa', !agri(100, false).exempt && agri(100, false).paisa === 300);

// ---- tea / orchard ----
check('tea 100 dec = 11000 paisa (\u09f3110)', L.annualTax({ type: 'tea', decimal: 100 }).paisa === 11000);

// ---- non-agricultural ----
const na = (type, cls, dec, partly) => L.annualTax({ type, areaClass: cls, decimal: dec, partlyCommercial: !!partly });
check('residential dhakaCore 10 dec = \u09f3200', na('residential', 'dhakaCore', 10).paisa === 20000);
check('commercial dhakaCore 10 dec = \u09f31000', na('commercial', 'dhakaCore', 10).paisa === 100000);
check('industrial dhakaCore 10 dec = \u09f31000 (same as commercial)', na('industrial', 'dhakaCore', 10).paisa === 100000);
check('residential districtHq 10 dec = \u09f360', na('residential', 'districtHq', 10).paisa === 6000);
check('commercial districtHq 10 dec = \u09f3200', na('commercial', 'districtHq', 10).paisa === 20000);
check('residential other 10 dec = \u09f350', na('residential', 'other', 10).paisa === 5000);
check('commercial other 10 dec = \u09f3150', na('commercial', 'other', 10).paisa === 15000);
check('residential dhakaCore partly-commercial charged at commercial rate',
  na('residential', 'dhakaCore', 10, true).paisa === 100000);
check('fractional decimal rounds to paisa (2.5 dec residential other = \u09f312.50)',
  na('residential', 'other', 2.5).paisa === 1250);

// ---- penalty (6.25% per year beyond 3-year grace) ----
check('penalty 0 yrs = 0', L.penaltyPaisa(20000, 0) === 0);
check('penalty 3 yrs = 0 (grace)', L.penaltyPaisa(20000, 3) === 0);
check('penalty 5 yrs on \u09f3200 = \u09f325', L.penaltyPaisa(20000, 5) === 2500);
check('penalty 10 yrs on \u09f3200 = \u09f387.50', L.penaltyPaisa(20000, 10) === 8750);
check('penalty on 0 annual = 0', L.penaltyPaisa(0, 10) === 0);

// ---- full bill ----
const bill1 = L.calculateBill({ type: 'residential', areaClass: 'dhakaCore', decimal: 10, years: 2, arrearsYears: 0 });
check('bill 2 yrs residential dhakaCore 10 dec: annual 20000 base 40000 total 40000',
  bill1.annual === 20000 && bill1.base === 40000 && bill1.penalty === 0 && bill1.total === 40000);
const bill2 = L.calculateBill({ type: 'residential', areaClass: 'dhakaCore', decimal: 10, years: 1, arrearsYears: 5 });
check('bill 1 yr + 5 arrears: total 22500', bill2.total === 22500 && bill2.penalty === 2500);
const bill3 = L.calculateBill({ type: 'agricultural', decimal: 100, farmingFamily: true, years: 1, arrearsYears: 0 });
check('bill exempt agri: total 0, exempt true', bill3.total === 0 && bill3.exempt === true);

// ---- formatting ----
check('formatMoney 20000 en = \u09f3200.00', L.formatMoney(20000, 'en') === '\u09f3200.00', L.formatMoney(20000, 'en'));
check('formatMoney 1234567 en = \u09f312,345.67', L.formatMoney(1234567, 'en') === '\u09f312,345.67');
check('formatMoney 20000 bn = \u09f3\u09e8\u09e6\u09e6.\u09e6\u09e6', L.formatMoney(20000, 'bn') === '\u09f3\u09e8\u09e6\u09e6.\u09e6\u09e6');
check('formatMoney 0 = \u09f30.00', L.formatMoney(0, 'en') === '\u09f30.00');
check('formatMoney 100 = \u09f31.00', L.formatMoney(100, 'en') === '\u09f31.00');
check('toBnDigits 2026 = \u09e8\u09e6\u09e8\u09ec', L.toBnDigits('2026') === '\u09e8\u09e6\u09e8\u09ec');
check('toBnDigits mixed', L.toBnDigits('a12b') === 'a\u09e7\u09e8b');

// ---- fiscal year / due date ----
check('FY end for 2026-11-08 is 2027-06-30',
  L.fiscalYearEnd(new Date(2026, 10, 8)).getTime() === new Date(2027, 5, 30).getTime());
check('FY end for 2026-03-15 is 2026-06-30',
  L.fiscalYearEnd(new Date(2026, 2, 15)).getTime() === new Date(2026, 5, 30).getTime());
check('days to due from 2026-11-08 = 234', L.daysToDue(new Date(2026, 10, 8)) === 234, String(L.daysToDue(new Date(2026, 10, 8))));
check('days to due on 2027-06-30 = 0', L.daysToDue(new Date(2027, 5, 30)) === 0);
check('after 30 June the next FY applies: 2027-07-01 -> 365 days to 2028-06-30',
  L.daysToDue(new Date(2027, 6, 1)) === 365, String(L.daysToDue(new Date(2027, 6, 1))));

// ---- validation ----
const good = { type: 'residential', areaClass: 'dhakaCore', amount: 10, unit: 'decimal', years: 1, arrearsYears: 0 };
check('validateCalc accepts good input', L.validateCalc(good).ok);
check('validateCalc rejects amount 0', L.validateCalc({ ...good, amount: 0 }).errors.includes('amount'));
check('validateCalc rejects negative amount', L.validateCalc({ ...good, amount: -5 }).errors.includes('amount'));
check('validateCalc rejects years 0', L.validateCalc({ ...good, years: 0 }).errors.includes('years'));
check('validateCalc rejects years 11', L.validateCalc({ ...good, years: 11 }).errors.includes('years'));
check('validateCalc rejects arrears -1', L.validateCalc({ ...good, arrearsYears: -1 }).errors.includes('arrearsYears'));
check('validateCalc rejects arrears 11', L.validateCalc({ ...good, arrearsYears: 11 }).errors.includes('arrearsYears'));
check('validateCalc rejects bad type', L.validateCalc({ ...good, type: 'palace' }).errors.includes('type'));
check('validateCalc rejects bad unit', L.validateCalc({ ...good, unit: 'marla' }).errors.includes('unit'));
check('validateCalc rejects huge area', L.validateCalc({ ...good, amount: 1e9 }).errors.includes('amountTooBig'));
check('validateRates accepts defaults', L.validateRates(R.DEFAULT_RATES).ok);
check('validateRates rejects negative rate',
  !L.validateRates({ ...R.DEFAULT_RATES, other: { commercial: -1, residential: 500 } }).ok);
check('validateRates rejects penalty 101',
  !L.validateRates({ ...R.DEFAULT_RATES, penaltyPct: 101 }).ok);

// ---- import validation ----
check('validateImport accepts good payload',
  L.validateImport({ app: 'land-tax-bd', version: 1, history: [], rates: R.DEFAULT_RATES }).ok);
check('validateImport rejects wrong app',
  L.validateImport({ app: 'dua-bd', version: 1 }).errors.includes('app'));
check('validateImport rejects wrong version',
  L.validateImport({ app: 'land-tax-bd', version: 2 }).errors.includes('version'));
check('validateImport rejects bad history item',
  L.validateImport({ app: 'land-tax-bd', version: 1, history: [{ totalPaisa: 'x' }] }).errors.includes('historyItem'));
check('validateImport rejects bad rates',
  L.validateImport({ app: 'land-tax-bd', version: 1, rates: { penaltyPct: 500 } }).errors.includes('rates'));
check('validateImport rejects non-object', L.validateImport(null).errors.includes('notObject'));

console.log('\n' + (pass + fail) + ' checks, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
