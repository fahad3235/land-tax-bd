// Land Tax BD \u2014 UI wiring. Classic scripts: rates.js, logic.js, i18n.js
// load before this file. Fully offline; state in localStorage.
(function () {
  'use strict';
  const R = LandTaxRates;
  const L = LandTaxLogic;
  const S = STRINGS;

  const LS_STATE = 'landtax.state.v1';
  const LS_RATES = 'landtax.rates.v1';

  // ?asof=YYYY-MM-DD pins "today" for deterministic tests.
  const params = new URLSearchParams(location.search);
  const asofParam = params.get('asof');
  const asof = asofParam && /^\d{4}-\d{2}-\d{2}$/.test(asofParam)
    ? new Date(asofParam + 'T00:00:00') : new Date();

  function loadJSON(key, fallback) {
    try { const v = JSON.parse(localStorage.getItem(key)); return v === null ? fallback : v; }
    catch (e) { return fallback; }
  }
  function saveJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage full/blocked */ }
  }

  let state = loadJSON(LS_STATE, null) || { lang: 'en', history: [] };
  if (!state.history) state.history = [];
  if (state.lang !== 'bn') state.lang = 'en';
  let rates = loadJSON(LS_RATES, null);
  if (!L.validateRates(rates).ok) rates = JSON.parse(JSON.stringify(R.DEFAULT_RATES));

  let lastBill = null; // { input, bill, label }

  const $ = (id) => document.getElementById(id);
  const t = (key) => S[state.lang][key] || S.en[key] || key;
  const money = (p) => L.formatMoney(p, state.lang);
  const num = (x) => (state.lang === 'bn' ? L.toBnDigits(String(x)) : String(x));

  // ---------- rendering ----------
  function applyLang() {
    document.documentElement.lang = state.lang === 'bn' ? 'bn' : 'en';
    $('title').textContent = t('title');
    $('subtitle').textContent = t('subtitle');
    $('langBtn').textContent = t('langBtn');
    document.querySelectorAll('[data-tab]').forEach((b) => {
      b.textContent = t('tab' + b.dataset.tab[0].toUpperCase() + b.dataset.tab.slice(1));
    });
    $('landTypeLabel').textContent = t('landType');
    $('areaClassLabel').textContent = t('areaClass');
    $('amountLabel').textContent = t('amount');
    $('unitLabel').textContent = t('unit');
    $('farmLabel').textContent = t('farmFamily');
    $('farmHint').textContent = t('farmHint');
    $('partlyLabel').textContent = t('partlyCommercial');
    $('partlyHint').textContent = t('partlyHint');
    $('yearsLabel').textContent = t('years');
    $('yearsHint').textContent = t('yearsHint');
    $('arrearsLabel').textContent = t('arrearsYears');
    $('arrearsHint').textContent = t('arrearsHint');
    $('calcBtn').textContent = t('calcBtn');
    $('saveBtn').textContent = t('saveBtn');
    $('disclaimer').textContent = t('disclaimer');
    fillSelects();
    updateVisibility();
    renderRateTables();
    renderHistory();
    renderDataTexts();
    updateDecEq();
    if (lastBill) renderResult(lastBill);
  }

  function fillSelects() {
    const lt = $('landType');
    const prevType = lt.value;
    lt.innerHTML = R.LAND_TYPES.map((x) =>
      '<option value="' + x + '">' + t('type_' + x) + '</option>').join('');
    lt.value = R.LAND_TYPES.includes(prevType) ? prevType : 'residential';
    const ac = $('areaClass');
    const prevClass = ac.value;
    ac.innerHTML = R.AREA_CLASSES.map((x) =>
      '<option value="' + x + '">' + t('class_' + x) + '</option>').join('');
    ac.value = R.AREA_CLASSES.includes(prevClass) ? prevClass : 'dhakaCore';
    const un = $('unit');
    const prevUnit = un.value;
    un.innerHTML = R.UNIT_LABELS.map((x) =>
      '<option value="' + x + '">' + t('unit_' + x) + '</option>').join('');
    un.value = R.UNIT_LABELS.includes(prevUnit) ? prevUnit : 'decimal';
  }
  function currentType() {
    const v = $('landType').value;
    return R.LAND_TYPES.includes(v) ? v : 'residential';
  }

  function updateVisibility() {
    const type = currentType();
    $('areaClassRow').hidden = (type === 'agricultural' || type === 'tea');
    $('farmRow').hidden = (type !== 'agricultural');
    $('partlyRow').hidden = (type !== 'residential');
  }

  function updateDecEq() {
    const v = parseFloat($('amount').value);
    const unit = $('unit').value;
    if (isFinite(v) && v > 0 && R.UNITS[unit] !== undefined) {
      const dec = L.toDecimal(v, unit);
      $('decEq').textContent = num(Math.round(dec * 100) / 100) + ' ' + t('decEq');
    } else {
      $('decEq').textContent = '';
    }
  }

  function readInput() {
    return {
      type: currentType(),
      areaClass: $('areaClass').value,
      amount: parseFloat($('amount').value),
      unit: $('unit').value,
      farmingFamily: $('farmFamily').checked,
      partlyCommercial: $('partlyCommercial').checked,
      years: parseInt($('years').value, 10),
      arrearsYears: parseInt($('arrearsYears').value, 10),
    };
  }

  function calculate(fromHook) {
    const input = fromHook || readInput();
    const v = L.validateCalc(input);
    const err = $('calcError');
    if (!v.ok) {
      const key = v.errors.includes('amountTooBig') ? 'errAmountTooBig'
        : v.errors.includes('years') ? 'errYears'
        : v.errors.includes('arrearsYears') ? 'errArrears' : 'errAmount';
      err.textContent = t(key);
      err.hidden = false;
      $('result').hidden = true;
      lastBill = null;
      return { ok: false, errors: v.errors };
    }
    err.hidden = true;
    const dec = L.toDecimal(input.amount, input.unit);
    const bill = L.calculateBill({
      type: input.type, areaClass: input.areaClass, decimal: dec,
      farmingFamily: input.farmingFamily, partlyCommercial: input.partlyCommercial,
      years: input.years, arrearsYears: input.arrearsYears, rates,
    });
    const label = t('type_' + input.type) + ' \u00b7 ' + num(Math.round(dec * 100) / 100) + ' ' + t('decEq');
    lastBill = { input, bill, label, dec };
    renderResult(lastBill);
    return { ok: true, bill };
  }

  function renderResult(lb) {
    const b = lb.bill;
    $('result').hidden = false;
    $('resAnnual').textContent = money(b.annual);
    $('resBase').textContent = money(b.base);
    $('resPenalty').textContent = money(b.penalty);
    $('resTotal').textContent = money(b.total);
    $('resAnnualLabel').textContent = t('resAnnual');
    $('resBaseLabel').textContent = t('resBase') + ' (' + num(lb.input.years) + ')';
    $('resPenaltyLabel').textContent = t('resPenalty');
    $('resTotalLabel').textContent = t('resTotal');
    const lines = b.lines.map((ln) => t('line' + ln.key[0].toUpperCase() + ln.key.slice(1)) + ': ' + money(ln.paisa)).join(' \u00b7 ');
    $('resultLines').textContent = lines;
    const notes = [];
    if (b.exempt) notes.push(t('noteExempt'));
    else if (b.reason === 'agri') notes.push(t('noteAgri'));
    else if (b.reason === 'tea') notes.push(t('noteTea'));
    else notes.push(t('noteNonAgri'));
    if (lb.input.type === 'residential' && lb.input.partlyCommercial) notes.push(t('notePartly'));
    if (b.penalty > 0) notes.push(t('notePenalty'));
    $('resNote').textContent = notes.join(' ');
    const days = L.daysToDue(asof);
    const due = L.fiscalYearEnd(asof);
    const dueStr = due.getFullYear() + '-06-30';
    let dueTxt = t('dueLine') + ' ' + (state.lang === 'bn' ? L.toBnDigits(dueStr) : dueStr) + ' \u2014 ';
    dueTxt += days > 0 ? num(days) + ' ' + t('daysLeft')
      : days === 0 ? t('dueToday') : t('dueOverdue');
    $('dueLine').textContent = dueTxt;
    $('saveMsg').hidden = true;
  }

  // ---------- rate tables ----------
  function renderRateTables() {
    $('ratesTitle').textContent = t('ratesTitle');
    $('ratesIntro').textContent = t('ratesIntro');
    $('ratesAgriTitle').textContent = t('ratesAgriTitle');
    $('ratesNonAgriTitle').textContent = t('ratesNonAgriTitle');
    $('ratesTeaTitle').textContent = t('ratesTeaTitle');
    $('ratesPenaltyTitle').textContent = t('ratesPenaltyTitle');
    $('ratesEditTitle').textContent = t('ratesEditTitle');
    $('ratesSave').textContent = t('ratesSave');
    $('ratesReset').textContent = t('ratesReset');
    $('tierNote').textContent = t('tierNote');
    $('srcNote').textContent = t('srcNote');

    const rows = R.AREA_CLASSES.map((c) => {
      const r = rates[c];
      return '<tr><td>' + t('class_' + c) + '</td><td>' + money(r.commercial) + '</td><td>' + money(r.residential) + '</td></tr>';
    }).join('');
    $('rateTable').innerHTML = '<thead><tr><th>' + t('areaClass') + '</th><th>' + t('type_commercial') + ' / ' + t('type_industrial') + '</th><th>' + t('type_residential') + '</th></tr></thead><tbody>' + rows + '</tbody>';
    const tierRows = [
      ['\u2264 200', '\u09f30.03'],
      ['201\u2013500', '\u09f36 + \u09f30.15'],
      ['501\u20131,000', '\u09f351 + \u09f30.36'],
      ['1,001\u20131,500', '\u09f3231 + \u09f30.60'],
      ['1,501\u20132,500', '\u09f3531 + \u09f30.95'],
      ['2,501\u20133,333', '\u09f31,481 + \u09f31.45'],
      ['> 3,333', '\u09f31.45'],
    ].map((r) => '<tr><td>' + (state.lang === 'bn' ? L.toBnDigits(r[0]) : r[0]) + '</td><td>' + (state.lang === 'bn' ? L.toBnDigits(r[1]) : r[1]) + '</td></tr>').join('');
    $('agriTable').innerHTML = '<thead><tr><th>' + t('tierColHolding') + ' (' + t('decEq') + ')</th><th>' + t('tierColRate') + '</th></tr></thead><tbody>' + tierRows + '</tbody>';
    $('teaRateLine').textContent = t('ratesTeaTitle') + ': ' + money(rates.teaPerDecimal) + ' / ' + t('decEq');
    $('penaltyLine').textContent = t('ratesPenaltyTitle') + ': ' + num(rates.penaltyPct) + '%';
    // Editor values.
    $('ed_dhakaCore_commercial').value = rates.dhakaCore.commercial / 100;
    $('ed_dhakaCore_residential').value = rates.dhakaCore.residential / 100;
    $('ed_districtHq_commercial').value = rates.districtHq.commercial / 100;
    $('ed_districtHq_residential').value = rates.districtHq.residential / 100;
    $('ed_other_commercial').value = rates.other.commercial / 100;
    $('ed_other_residential').value = rates.other.residential / 100;
    $('ed_tea').value = rates.teaPerDecimal / 100;
    $('ed_penalty').value = rates.penaltyPct;
  }

  function saveRates() {
    const r = {
      dhakaCore: { commercial: Math.round(parseFloat($('ed_dhakaCore_commercial').value) * 100), residential: Math.round(parseFloat($('ed_dhakaCore_residential').value) * 100) },
      districtHq: { commercial: Math.round(parseFloat($('ed_districtHq_commercial').value) * 100), residential: Math.round(parseFloat($('ed_districtHq_residential').value) * 100) },
      other: { commercial: Math.round(parseFloat($('ed_other_commercial').value) * 100), residential: Math.round(parseFloat($('ed_other_residential').value) * 100) },
      teaPerDecimal: Math.round(parseFloat($('ed_tea').value) * 100),
      penaltyPct: parseFloat($('ed_penalty').value),
    };
    const v = L.validateRates(r);
    if (!v.ok) {
      $('ratesError').textContent = t('ratesErr');
      $('ratesError').hidden = false;
      $('ratesSaved').hidden = true;
      return { ok: false, errors: v.errors };
    }
    rates = r;
    saveJSON(LS_RATES, rates);
    $('ratesError').hidden = true;
    $('ratesSaved').textContent = t('ratesSaved');
    $('ratesSaved').hidden = false;
    renderRateTables();
    return { ok: true };
  }

  // ---------- history ----------
  function renderHistory() {
    $('histEmpty').textContent = t('histEmpty');
    $('histClear').textContent = t('histClear');
    $('histTotalLabel').textContent = t('histTotal');
    const list = $('historyList');
    list.innerHTML = '';
    let total = 0;
    state.history.forEach((h) => {
      total += h.totalPaisa;
      const li = document.createElement('li');
      li.className = 'hist-item';
      const d = new Date(h.ts);
      const dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      li.innerHTML = '<div><strong>' + money(h.totalPaisa) + '</strong> \u00b7 ' + h.label +
        '<br><small>' + (state.lang === 'bn' ? L.toBnDigits(dateStr) : dateStr) + ' \u00b7 ' +
        t('resAnnual') + ' ' + money(h.annualPaisa) +
        (h.penaltyPaisa ? ' \u00b7 ' + t('resPenalty') + ' ' + money(h.penaltyPaisa) : '') +
        '</small></div>' +
        '<button class="btn small danger" data-del="' + h.id + '">' + t('histDelete') + '</button>';
      list.appendChild(li);
    });
    $('histEmpty').hidden = state.history.length > 0;
    $('histTotal').textContent = money(total);
    $('histTotalRow').hidden = state.history.length === 0;
    $('histClear').hidden = state.history.length === 0;
    list.querySelectorAll('[data-del]').forEach((b) => {
      b.addEventListener('click', () => {
        state.history = state.history.filter((h) => h.id !== b.dataset.del);
        saveJSON(LS_STATE, state);
        renderHistory();
      });
    });
  }

  function saveCurrent() {
    if (!lastBill) return { ok: false, error: 'noBill' };
    const entry = {
      id: 'h' + Date.now().toString(36) + Math.floor(Math.random() * 1000),
      ts: Date.now(),
      label: lastBill.label,
      type: lastBill.input.type,
      areaClass: lastBill.input.areaClass,
      decimal: lastBill.dec,
      years: lastBill.input.years,
      arrearsYears: lastBill.input.arrearsYears,
      annualPaisa: lastBill.bill.annual,
      penaltyPaisa: lastBill.bill.penalty,
      totalPaisa: lastBill.bill.total,
      exempt: lastBill.bill.exempt,
    };
    state.history.unshift(entry);
    saveJSON(LS_STATE, state);
    renderHistory();
    $('saveMsg').textContent = t('saved');
    $('saveMsg').hidden = false;
    return { ok: true };
  }

  // ---------- data tab ----------
  function renderDataTexts() {
    $('dataExportTitle').textContent = t('dataExport');
    $('dataExportHint').textContent = t('dataExportHint');
    $('exportDownloadBtn').textContent = t('dataDownload');
    $('exportCopyBtn').textContent = t('dataCopy');
    $('dataImportTitle').textContent = t('dataImport');
    $('dataImportHint').textContent = t('dataImportHint');
    $('importBtn').textContent = t('dataImportBtn');
    $('eraseTitle').textContent = t('eraseTitle');
    $('eraseHint').textContent = t('eraseHint');
    $('eraseBtn').textContent = t('eraseBtn');
  }

  function exportPayload() {
    return { app: R.APP, version: R.VERSION, history: state.history, rates };
  }

  function importPayload(jsonStr) {
    let obj;
    try { obj = JSON.parse(jsonStr); } catch (e) { return { ok: false, errors: ['parse'] }; }
    const v = L.validateImport(obj);
    if (!v.ok) return { ok: false, errors: v.errors };
    if (Array.isArray(obj.history)) state.history = obj.history;
    if (obj.rates) rates = obj.rates;
    saveJSON(LS_STATE, state);
    saveJSON(LS_RATES, rates);
    renderRateTables();
    renderHistory();
    return { ok: true };
  }

  function eraseAll() {
    state.history = [];
    rates = JSON.parse(JSON.stringify(R.DEFAULT_RATES));
    saveJSON(LS_STATE, state);
    saveJSON(LS_RATES, rates);
    lastBill = null;
    $('result').hidden = true;
    renderRateTables();
    renderHistory();
  }

  // ---------- tabs ----------
  function showTab(name) {
    document.querySelectorAll('[data-tab]').forEach((b) =>
      b.classList.toggle('active', b.dataset.tab === name));
    ['Calc', 'Rates', 'History', 'Data'].forEach((s) => {
      $('sec' + s).hidden = (s.toLowerCase() !== name);
    });
  }

  // ---------- events ----------
  document.querySelectorAll('[data-tab]').forEach((b) =>
    b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('landType').addEventListener('change', updateVisibility);
  $('amount').addEventListener('input', updateDecEq);
  $('unit').addEventListener('change', updateDecEq);
  $('calcBtn').addEventListener('click', () => calculate());
  $('saveBtn').addEventListener('click', saveCurrent);
  $('ratesSave').addEventListener('click', saveRates);
  $('ratesReset').addEventListener('click', () => {
    rates = JSON.parse(JSON.stringify(R.DEFAULT_RATES));
    saveJSON(LS_RATES, rates);
    $('ratesError').hidden = true;
    $('ratesSaved').textContent = t('ratesResetDone');
    $('ratesSaved').hidden = false;
    renderRateTables();
  });
  $('histClear').addEventListener('click', () => {
    state.history = [];
    saveJSON(LS_STATE, state);
    renderHistory();
  });
  $('langBtn').addEventListener('click', () => {
    state.lang = state.lang === 'bn' ? 'en' : 'bn';
    saveJSON(LS_STATE, state);
    applyLang();
  });
  $('exportDownloadBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(exportPayload(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'land-tax-bd-export.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
  $('exportCopyBtn').addEventListener('click', async () => {
    const s = JSON.stringify(exportPayload(), null, 2);
    try { await navigator.clipboard.writeText(s); $('copyMsg').textContent = t('copied'); }
    catch (e) { $('copyMsg').textContent = s.slice(0, 200); }
    $('copyMsg').hidden = false;
  });
  $('importBtn').addEventListener('click', () => {
    const r = importPayload($('importText').value);
    $('importError').hidden = r.ok;
    $('importError').textContent = r.ok ? '' : t('dataImportErr');
    $('importOk').hidden = !r.ok;
    $('importOk').textContent = r.ok ? t('dataImportOk') : '';
  });
  $('eraseBtn').addEventListener('click', () => {
    if ($('eraseConfirm').value.trim() !== 'DELETE') {
      $('eraseError').textContent = t('eraseErr');
      $('eraseError').hidden = false;
      return;
    }
    eraseAll();
    $('eraseError').hidden = true;
    $('eraseDone').textContent = t('eraseDone');
    $('eraseDone').hidden = false;
    $('eraseConfirm').value = '';
  });

  // ---------- init ----------
  updateVisibility();
  applyLang();
  showTab('calc');

  // Test hooks (used by tests/smoke.js only).
  window.__landtax = {
    state: () => ({ lang: state.lang, history: state.history, rates }),
    calculate: (input) => calculate(input),
    saveCurrent,
    setLang: (l) => { state.lang = l; saveJSON(LS_STATE, state); applyLang(); },
    setRates: (r) => { const v = L.validateRates(r); if (!v.ok) return { ok: false, errors: v.errors }; rates = r; saveJSON(LS_RATES, rates); renderRateTables(); return { ok: true }; },
    resetRates: () => { rates = JSON.parse(JSON.stringify(R.DEFAULT_RATES)); saveJSON(LS_RATES, rates); renderRateTables(); return { ok: true }; },
    exportPayload,
    importPayload,
    eraseAll,
    // Local-date string (toISOString would shift the day in +06).
    asof: asof.getFullYear() + '-' + String(asof.getMonth() + 1).padStart(2, '0') + '-' + String(asof.getDate()).padStart(2, '0'),
  };
})();
