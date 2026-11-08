// Land Tax BD \u2014 default rate table and unit conversions.
// Sources:
//  - Land Development Tax Ordinance, 1976 (bdlaws.minlaw.gov.bd, act-print-519),
//    section 3 schedule (repealed by the 2023 Act, but the last published
//    statutory per-decimal schedule; used here as the editable default).
//  - Land Development Tax Act, 2023 (Act No. 31 of 2023), in force 1 July 2024:
//    rates are set by gazette notification; agricultural land up to 25 bigha
//    (8.25 acre) held by a farming person/family is exempt (above that the
//    whole holding is taxable); pay by 30 June each year; up to 3 years may be
//    paid in advance; arrears unpaid for 3 consecutive years carry a 6.25%
//    annual penalty and are recoverable by certificate case; the demand is
//    never time-barred; collection is electronic.
// All money is integer paisa (1 BDT = 100 paisa). Rates are paisa per decimal.
// 1 bigha = 33 decimal (the convention the 2023 Act itself uses:
// 25 bigha = 8.25 acre); 1 katha = 1.65 decimal; 1 acre = 100 decimal;
// 1 decimal = 435.6 sq ft; 1 sq m = 10.7639 sq ft.

const LandTaxRates = {
  APP: 'land-tax-bd',
  VERSION: 1,
  // Non-agricultural rates, paisa per decimal. Commercial and industrial
  // share one rate in the 1976 schedule; residential covers "residential or
  // other purposes".
  DEFAULT_RATES: {
    dhakaCore: { commercial: 10000, residential: 2000 },
    districtHq: { commercial: 2000, residential: 600 },
    other: { commercial: 1500, residential: 500 },
    teaPerDecimal: 110, // tea / coffee / rubber / orchard, paisa per decimal
    penaltyPct: 6.25, // annual penalty on arrears beyond the 3-year grace
  },
  // Agricultural tiers (1976 schedule s.3(a)), total holding in decimals.
  // Each tier: [upperBoundDecimals, basePaisa, marginalPaisaPerDecimal].
  // Bases are continuous with the previous tier (verified in tests).
  AGRI_TIERS: [
    { upTo: 200, base: 0, marginal: 3, minTotal: 100 }, // <=2 acre: 3p/dec, min \u09f31
    { upTo: 500, base: 600, marginal: 15 },
    { upTo: 1000, base: 5100, marginal: 36 },
    { upTo: 1500, base: 23100, marginal: 60 },
    { upTo: 2500, base: 53100, marginal: 95 },
    { upTo: 3333, base: 148100, marginal: 145 },
    // Schedule ends at 33.33 acre; beyond that the app continues at the
    // last marginal rate (documented extrapolation, not statute).
    { upTo: Infinity, base: 268885, marginal: 145 },
  ],
  EXEMPT_DECIMAL: 825, // 25 bigha = 8.25 acre (farming person/family)
  // Area units -> decimals per unit.
  UNITS: {
    decimal: 1,
    bigha: 33,
    katha: 1.65,
    acre: 100,
    sqft: 1 / 435.6,
    sqm: 10.7639 / 435.6,
  },
  UNIT_LABELS: ['decimal', 'bigha', 'katha', 'acre', 'sqft', 'sqm'],
  AREA_CLASSES: ['dhakaCore', 'districtHq', 'other'],
  LAND_TYPES: ['agricultural', 'tea', 'residential', 'commercial', 'industrial'],
  MAX_DECIMAL: 1000000, // sanity cap: 10,000 acre
  MAX_YEARS: 10,
  MAX_ADVANCE_YEARS: 3,
  PENALTY_GRACE_YEARS: 3,
};

if (typeof module !== 'undefined' && module.exports) module.exports = LandTaxRates;
