// Land Tax BD \u2014 pure calculation logic (no DOM). Node-testable.
// Money is integer paisa throughout; results round to the nearest paisa.

const R = (typeof require === 'function')
  ? require('./rates.js')
  : LandTaxRates;

const BN_DIGITS = ['\u09e6', '\u09e7', '\u09e8', '\u09e9', '\u09ea', '\u09eb', '\u09ec', '\u09ed', '\u09ee', '\u09ef'];

function toBnDigits(x) {
  return String(x).replace(/[0-9]/g, (d) => BN_DIGITS[+d]);
}

// Convert an area amount in the given unit to decimals (float).
function toDecimal(value, unit) {
  const per = R.UNITS[unit];
  if (per === undefined || !isFinite(value)) return NaN;
  return value * per;
}

// Agricultural tier tax (1976 schedule s.3(a)) on a total holding of `dec`
// decimals, in paisa. No exemption applied here \u2014 see annualTax().
function agriTierPaisa(dec) {
  if (!(dec > 0) || !isFinite(dec)) return 0;
  for (const t of R.AGRI_TIERS) {
    if (dec <= t.upTo) {
      const prevUpTo = R.AGRI_TIERS[R.AGRI_TIERS.indexOf(t) - 1]
        ? R.AGRI_TIERS[R.AGRI_TIERS.indexOf(t) - 1].upTo : 0;
      let total = t.base + Math.round((dec - prevUpTo) * t.marginal);
      if (t.minTotal !== undefined) total = Math.max(total, t.minTotal);
      return total;
    }
  }
  return 0;
}

// Annual tax for one parcel, in paisa. `input`:
// { type, areaClass, decimal, farmingFamily, partlyCommercial, rates }
// Returns { paisa, exempt, reason, lines: [{key, paisa}] }.
function annualTax(input) {
  const rates = input.rates || R.DEFAULT_RATES;
  const dec = input.decimal;
  const lines = [];
  if (input.type === 'agricultural') {
    if (input.farmingFamily && dec <= R.EXEMPT_DECIMAL) {
      return { paisa: 0, exempt: true, reason: 'exempt25', lines: [] };
    }
    const p = agriTierPaisa(dec);
    lines.push({ key: 'agriTier', paisa: p });
    return { paisa: p, exempt: false, reason: 'agri', lines };
  }
  if (input.type === 'tea') {
    const p = Math.round(dec * rates.teaPerDecimal);
    lines.push({ key: 'tea', paisa: p });
    return { paisa: p, exempt: false, reason: 'tea', lines };
  }
  // Non-agricultural: commercial and industrial share the commercial rate.
  let use = input.type; // residential | commercial | industrial
  if (use === 'residential' && input.partlyCommercial) use = 'commercial';
  const rateKey = (use === 'residential') ? 'residential' : 'commercial';
  const rate = rates[input.areaClass][rateKey];
  const p = Math.round(dec * rate);
  lines.push({ key: 'nonAgri', paisa: p, rate });
  return { paisa: p, exempt: false, reason: 'nonAgri', lines };
}

// Penalty on arrears: 6.25% of the annual tax per year beyond the 3-year
// grace period (2023 Act: arrears unpaid for 3 consecutive years carry a
// 6.25% annual penalty). Simplified model \u2014 see README.
function penaltyPaisa(annualPaisa, arrearsYears, penaltyPct) {
  const pct = (penaltyPct === undefined) ? R.DEFAULT_RATES.penaltyPct : penaltyPct;
  const beyond = Math.max(0, (arrearsYears || 0) - R.PENALTY_GRACE_YEARS);
  if (beyond <= 0 || annualPaisa <= 0) return 0;
  return Math.round(annualPaisa * (pct / 100) * beyond);
}

// Full bill: { annual, base, penalty, total, exempt, reason, lines }.
function calculateBill(input) {
  const annual = annualTax(input);
  const years = input.years || 1;
  const base = annual.paisa * years;
  const penalty = penaltyPaisa(annual.paisa, input.arrearsYears || 0,
    (input.rates || R.DEFAULT_RATES).penaltyPct);
  return {
    annual: annual.paisa,
    base,
    penalty,
    total: base + penalty,
    exempt: annual.exempt,
    reason: annual.reason,
    lines: annual.lines,
  };
}

// Fiscal-year end: the tax year runs 1 July\u201330 June; this year's tax is due
// 30 June of the fiscal year containing `asof` (a Date).
function fiscalYearEnd(asof) {
  const y = asof.getFullYear();
  // If asof is before 1 July, the current FY ends 30 June of the same year;
  // otherwise 30 June of the next year.
  const endYear = (asof.getMonth() < 6) ? y : y + 1;
  return new Date(endYear, 5, 30);
}
function daysToDue(asof) {
  const end = fiscalYearEnd(asof);
  const ms = end.getTime() - new Date(asof.getFullYear(), asof.getMonth(), asof.getDate()).getTime();
  return Math.round(ms / 86400000);
}

// ---- formatting ----
function formatMoney(paisa, lang) {
  const neg = paisa < 0;
  const abs = Math.abs(Math.round(paisa));
  const taka = Math.floor(abs / 100);
  const p = abs % 100;
  const intPart = taka.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  let s = '\u09f3' + intPart + '.' + String(p).padStart(2, '0');
  if (lang === 'bn') s = toBnDigits(s);
  return (neg ? '-' : '') + s;
}
function formatDecimal(dec, lang) {
  let s = (Math.round(dec * 100) / 100).toString();
  if (lang === 'bn') s = toBnDigits(s);
  return s;
}

// ---- validation ----
function validateCalc(input) {
  const errors = [];
  if (!R.LAND_TYPES.includes(input.type)) errors.push('type');
  if (input.type !== 'agricultural' && input.type !== 'tea' &&
      !R.AREA_CLASSES.includes(input.areaClass)) errors.push('areaClass');
  if (!R.UNIT_LABELS.includes(input.unit)) errors.push('unit');
  const v = input.amount;
  if (typeof v !== 'number' || !isFinite(v) || v <= 0) errors.push('amount');
  else {
    const dec = toDecimal(v, input.unit);
    if (!isFinite(dec) || dec > R.MAX_DECIMAL) errors.push('amountTooBig');
  }
  if (!Number.isInteger(input.years) || input.years < 1 || input.years > R.MAX_YEARS) errors.push('years');
  if (!Number.isInteger(input.arrearsYears) || input.arrearsYears < 0 || input.arrearsYears > R.MAX_YEARS) errors.push('arrearsYears');
  return { ok: errors.length === 0, errors };
}

function validateRates(rates) {
  const errors = [];
  if (!rates || typeof rates !== 'object') return { ok: false, errors: ['rates'] };
  for (const c of R.AREA_CLASSES) {
    if (!rates[c] || typeof rates[c] !== 'object') { errors.push('rates.' + c); continue; }
    for (const k of ['commercial', 'residential']) {
      const v = rates[c][k];
      if (typeof v !== 'number' || !isFinite(v) || v < 0 || v > 1000000) errors.push('rates.' + c + '.' + k);
    }
  }
  if (typeof rates.teaPerDecimal !== 'number' || !isFinite(rates.teaPerDecimal) ||
      rates.teaPerDecimal < 0 || rates.teaPerDecimal > 1000000) errors.push('rates.teaPerDecimal');
  if (typeof rates.penaltyPct !== 'number' || !isFinite(rates.penaltyPct) ||
      rates.penaltyPct < 0 || rates.penaltyPct > 100) errors.push('rates.penaltyPct');
  return { ok: errors.length === 0, errors };
}

// ---- history / import ----
function validateImport(payload) {
  const errors = [];
  if (!payload || typeof payload !== 'object') return { ok: false, errors: ['notObject'] };
  if (payload.app !== R.APP) errors.push('app');
  if (payload.version !== R.VERSION) errors.push('version');
  if (payload.history !== undefined) {
    if (!Array.isArray(payload.history)) errors.push('history');
    else {
      for (const h of payload.history) {
        if (!h || typeof h !== 'object' || typeof h.totalPaisa !== 'number' ||
            typeof h.type !== 'string' || typeof h.label !== 'string') {
          errors.push('historyItem'); break;
        }
      }
    }
  }
  if (payload.rates !== undefined && !validateRates(payload.rates).ok) errors.push('rates');
  return { ok: errors.length === 0, errors };
}

const LandTaxLogic = {
  toBnDigits, toDecimal, agriTierPaisa, annualTax, penaltyPaisa,
  calculateBill, fiscalYearEnd, daysToDue, formatMoney, formatDecimal,
  validateCalc, validateRates, validateImport,
};

if (typeof module !== 'undefined' && module.exports) module.exports = LandTaxLogic;
