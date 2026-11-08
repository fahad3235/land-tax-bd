// Land Tax BD \u2014 headless-Chrome smoke test via raw CDP (no puppeteer dependency).
// Usage: node tests/smoke.js
// Exits non-zero on any failed assertion; fails on page console errors.
// ?asof=2026-11-08 pins "today" so the due-date line is deterministic.
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const PORT = 9347;
const FILE = 'file://' + path.resolve(__dirname, '..', 'index.html') + '?asof=2026-11-08';
let failures = 0;
let count = 0;
const pageErrors = [];
function check(name, cond, extra) {
  count++;
  console.log((cond ? 'ok - ' : 'FAIL - ') + name + (cond ? '' : ' :: ' + (extra || '')));
  if (!cond) failures++;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  // NOTE: /opt/meta-chromium/chrome refuses raw launches in this VM
  // ("Hatch WebGL domain policy is required for browser startup").
  // The unpatched Playwright headless_shell serves the same CDP purpose.
  const CHROME_BIN = process.env.CHROME_BIN ||
    require('os').homedir() + '/.cache/ms-playwright/chromium_headless_shell-1187/chrome-linux/headless_shell';
  const chrome = spawn(CHROME_BIN, [
    '--headless=new', '--no-sandbox', '--disable-gpu',
    '--remote-debugging-port=' + PORT, '--user-data-dir=/tmp/landtax-smoke-' + process.pid,
    'about:blank',
  ], { stdio: 'ignore' });
  let targets = [];
  for (let i = 0; i < 50 && targets.length === 0; i++) {
    await wait(200);
    try {
      targets = JSON.parse(await new Promise((res, rej) => {
        http.get('http://127.0.0.1:' + PORT + '/json/list', (r) => {
          let d = ''; r.on('data', (c) => (d += c)); r.on('end', () => res(d));
        }).on('error', rej);
      }));
    } catch (e) { /* retry */ }
  }
  if (!targets.length) { console.log('FAIL - chrome did not start'); process.exit(2); }
  const wsUrl = targets[0].webSocketDebuggerUrl;
  const ws = new WebSocket(wsUrl);
  await new Promise((res) => { ws.onopen = res; });
  let seq = 0; const pending = new Map();
  ws.onmessage = (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      pageErrors.push(JSON.stringify(msg.params.args));
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      pageErrors.push(JSON.stringify(msg.params.exceptionDetails).slice(0, 300));
    }
  };
  const send = (method, params) => new Promise((res) => {
    const id = ++seq; pending.set(id, res); ws.send(JSON.stringify({ id, method, params }));
  });
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: FILE });
  await wait(1500);
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.result && r.result.exceptionDetails) return { error: JSON.stringify(r.result.exceptionDetails).slice(0, 300) };
    return r.result ? r.result.result.value : undefined;
  };
  const calc = (input) => ev(`JSON.stringify(window.__landtax.calculate(${JSON.stringify(input)}))`);

  check('page title contains Land Tax', (await ev('document.title'))?.includes('Land Tax'));
  check('4 tabs present', (await ev(`document.querySelectorAll('[data-tab]').length`)) === 4);
  check('calculator section visible', (await ev(`document.getElementById('secCalc').hidden`)) === false);
  check('test hooks present', (await ev(`typeof window.__landtax.calculate`)) === 'function');
  check('asof pinned to 2026-11-08', (await ev(`window.__landtax.asof`)) === '2026-11-08');
  check('disclaimer renders', (await ev(`document.getElementById('disclaimer').textContent.length`)) > 40);
  check('default land type is residential', (await ev(`document.getElementById('landType').value`)) === 'residential');

  // Form-driven default flow: residential, Dhaka core, 10 decimal, 1 yr.
  await ev(`document.getElementById('amount').value = '10'`);
  await ev(`document.getElementById('calcBtn').click()`);
  check('form calc shows result', (await ev(`document.getElementById('result').hidden`)) === false);
  check('form calc annual = \u09f3200.00', (await ev(`document.getElementById('resAnnual').textContent`)) === '\u09f3200.00');
  check('form calc total = \u09f3200.00', (await ev(`document.getElementById('resTotal').textContent`)) === '\u09f3200.00');
  check('due line shows 234 days left', (await ev(`document.getElementById('dueLine').textContent`)).includes('234'),
    await ev(`document.getElementById('dueLine').textContent`));
  check('due line names 2027-06-30', (await ev(`document.getElementById('dueLine').textContent`)).includes('2027-06-30'));

  // Hook calculations: all hand-verified values.
  const res = JSON.parse(await calc({ type: 'residential', areaClass: 'dhakaCore', amount: 10, unit: 'decimal', farmingFamily: false, partlyCommercial: false, years: 2, arrearsYears: 0 }));
  check('hook: 2 yrs residential dhakaCore 10 dec total 40000 paisa', res.ok && res.bill.total === 40000, JSON.stringify(res));
  const pen = JSON.parse(await calc({ type: 'residential', areaClass: 'dhakaCore', amount: 10, unit: 'decimal', farmingFamily: false, partlyCommercial: false, years: 1, arrearsYears: 5 }));
  check('hook: 5 arrears yrs penalty 2500, total 22500', pen.ok && pen.bill.penalty === 2500 && pen.bill.total === 22500, JSON.stringify(pen));
  const ex = JSON.parse(await calc({ type: 'agricultural', areaClass: 'dhakaCore', amount: 100, unit: 'decimal', farmingFamily: true, partlyCommercial: false, years: 1, arrearsYears: 0 }));
  check('hook: farming family 100 dec exempt, total 0', ex.ok && ex.bill.exempt === true && ex.bill.total === 0, JSON.stringify(ex));
  check('exempt note shown', (await ev(`document.getElementById('resNote').textContent`)).includes('Exempt'));
  const ag = JSON.parse(await calc({ type: 'agricultural', areaClass: 'dhakaCore', amount: 826, unit: 'decimal', farmingFamily: true, partlyCommercial: false, years: 1, arrearsYears: 0 }));
  check('hook: farming family 826 dec taxable 16836 paisa', ag.ok && ag.bill.total === 16836, JSON.stringify(ag));
  const tea = JSON.parse(await calc({ type: 'tea', areaClass: 'dhakaCore', amount: 100, unit: 'decimal', farmingFamily: false, partlyCommercial: false, years: 1, arrearsYears: 0 }));
  check('hook: tea 100 dec = 11000 paisa', tea.ok && tea.bill.total === 11000, JSON.stringify(tea));
  const com = JSON.parse(await calc({ type: 'commercial', areaClass: 'other', amount: 10, unit: 'decimal', farmingFamily: false, partlyCommercial: false, years: 1, arrearsYears: 0 }));
  check('hook: commercial other 10 dec = 15000 paisa', com.ok && com.bill.total === 15000, JSON.stringify(com));
  const big = JSON.parse(await calc({ type: 'residential', areaClass: 'dhakaCore', amount: 1, unit: 'bigha', farmingFamily: false, partlyCommercial: false, years: 1, arrearsYears: 0 }));
  check('hook: 1 bigha = 33 dec -> 66000 paisa', big.ok && big.bill.total === 66000, JSON.stringify(big));
  const part = JSON.parse(await calc({ type: 'residential', areaClass: 'dhakaCore', amount: 10, unit: 'decimal', farmingFamily: false, partlyCommercial: true, years: 1, arrearsYears: 0 }));
  check('hook: partly-commercial residential charged at commercial rate', part.ok && part.bill.total === 100000, JSON.stringify(part));

  // Validation: amount 0 shows inline error, hides result.
  const bad = JSON.parse(await calc({ type: 'residential', areaClass: 'dhakaCore', amount: 0, unit: 'decimal', farmingFamily: false, partlyCommercial: false, years: 1, arrearsYears: 0 }));
  check('hook: amount 0 rejected', bad.ok === false && bad.errors.includes('amount'), JSON.stringify(bad));
  check('inline error visible', (await ev(`document.getElementById('calcError').hidden`)) === false);
  check('result hidden after failed calc', (await ev(`document.getElementById('result').hidden`)) === true);

  // Visibility rules: agricultural shows farm row, hides area class; tea hides both.
  await ev(`document.getElementById('landType').value = 'agricultural'; document.getElementById('landType').dispatchEvent(new Event('change'))`);
  check('agricultural shows farm row', (await ev(`document.getElementById('farmRow').hidden`)) === false);
  check('agricultural hides area class', (await ev(`document.getElementById('areaClassRow').hidden`)) === true);
  await ev(`document.getElementById('landType').value = 'residential'; document.getElementById('landType').dispatchEvent(new Event('change'))`);
  check('residential shows partly-commercial row', (await ev(`document.getElementById('partlyRow').hidden`)) === false);
  check('residential shows area class', (await ev(`document.getElementById('areaClassRow').hidden`)) === false);

  // Save to history + reload persistence.
  await calc({ type: 'residential', areaClass: 'dhakaCore', amount: 10, unit: 'decimal', farmingFamily: false, partlyCommercial: false, years: 1, arrearsYears: 0 });
  await ev(`document.getElementById('saveBtn').click()`);
  check('save message shown', (await ev(`document.getElementById('saveMsg').hidden`)) === false);
  check('history has 1 entry', (await ev(`window.__landtax.state().history.length`)) === 1);
  await send('Page.navigate', { url: FILE });
  await wait(1200);
  check('history persists after reload', (await ev(`window.__landtax.state().history.length`)) === 1);
  check('history total shows \u09f3200.00', (await ev(`document.getElementById('histTotal').textContent`)) === '\u09f3200.00');

  // Rate table tab renders.
  await ev(`document.querySelector('[data-tab="rates"]').click()`);
  check('rates section visible', (await ev(`document.getElementById('secRates').hidden`)) === false);
  check('non-agri table has 3 rows', (await ev(`document.querySelectorAll('#rateTable tbody tr').length`)) === 3);
  check('agri tier table has 7 rows', (await ev(`document.querySelectorAll('#agriTable tbody tr').length`)) === 7);
  check('tea rate line shows \u09f31.10', (await ev(`document.getElementById('teaRateLine').textContent`)).includes('\u09f31.10'));
  check('penalty line shows 6.25%', (await ev(`document.getElementById('penaltyLine').textContent`)).includes('6.25%'));

  // Rate editor: change Dhaka-core residential to \u09f325, recalc, reset.
  await ev(`document.getElementById('ed_dhakaCore_residential').value = '25'`);
  await ev(`document.getElementById('ratesSave').click()`);
  check('rates saved message', (await ev(`document.getElementById('ratesSaved').hidden`)) === false);
  const edited = JSON.parse(await calc({ type: 'residential', areaClass: 'dhakaCore', amount: 10, unit: 'decimal', farmingFamily: false, partlyCommercial: false, years: 1, arrearsYears: 0 }));
  check('edited rate applies: 10 dec = 25000 paisa', edited.ok && edited.bill.total === 25000, JSON.stringify(edited));
  await ev(`document.getElementById('ratesReset').click()`);
  const reset = JSON.parse(await calc({ type: 'residential', areaClass: 'dhakaCore', amount: 10, unit: 'decimal', farmingFamily: false, partlyCommercial: false, years: 1, arrearsYears: 0 }));
  check('reset restores 20000 paisa', reset.ok && reset.bill.total === 20000, JSON.stringify(reset));

  // Language toggle: Bangla title + Bengali digits + persistence.
  await ev(`document.getElementById('langBtn').click()`);
  check('BN toggle: title in Bengali', (await ev(`document.getElementById('title').textContent`)) === '\u09ad\u09c2\u09ae\u09bf \u0989\u09a8\u09cd\u09a8\u09af\u09bc\u09a8 \u0995\u09b0 \u09ac\u09bf\u09a1\u09bf');
  check('BN toggle: total uses Bengali digits', (await ev(`document.getElementById('resTotal').textContent`)).match(/[\u09E6-\u09EF]/) !== null);
  check('BN toggle: land type preserved (residential)', (await ev(`document.getElementById('landType').value`)) === 'residential');
  await send('Page.navigate', { url: FILE });
  await wait(1200);
  check('BN toggle persists after reload', (await ev(`window.__landtax.state().lang`)) === 'bn');
  await ev(`document.getElementById('langBtn').click()`);
  check('back to EN', (await ev(`window.__landtax.state().lang`)) === 'en');

  // Data: export payload + import validation + eraseAll.
  const payload = await ev(`JSON.stringify(window.__landtax.exportPayload())`);
  check('export payload is land-tax-bd v1', payload.includes('"app":"land-tax-bd"') && payload.includes('"version":1'));
  const imp = await ev(`JSON.stringify(window.__landtax.importPayload(JSON.stringify({app:'land-tax-bd',version:1,history:[{id:'t1',ts:1,label:'x',type:'residential',areaClass:'dhakaCore',decimal:10,years:1,arrearsYears:0,annualPaisa:20000,penaltyPaisa:0,totalPaisa:20000,exempt:false}]})))`);
  check('import valid payload ok', imp.includes('"ok":true'), imp);
  check('import applied 1 history entry', (await ev(`window.__landtax.state().history.length`)) === 1);
  const badImp = await ev(`JSON.stringify(window.__landtax.importPayload('{"app":"dua-bd","version":1}'))`);
  check('import wrong app rejected', badImp.includes('"ok":false'));
  check('invalid import leaves data intact', (await ev(`window.__landtax.state().history.length`)) === 1);
  await ev(`window.__landtax.eraseAll()`);
  check('eraseAll clears history', (await ev(`window.__landtax.state().history.length`)) === 0);
  check('eraseAll restores default rates', (await ev(`window.__landtax.state().rates.dhakaCore.residential`)) === 2000);

  // Mobile 390px: no horizontal overflow.
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: FILE });
  await wait(1200);
  const overflow = await ev(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
  check('390px no horizontal overflow', overflow <= 0, 'overflow=' + overflow);
  await ev(`document.querySelector('[data-tab="rates"]').click()`);
  const overflowR = await ev(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
  check('390px no overflow on rates tab', overflowR <= 0, 'overflow=' + overflowR);

  // Zero network requests: app is fully offline (only file:// loads).
  const reqs = await ev(`performance.getEntriesByType('resource').map(r => r.name).filter(n => !n.startsWith('file://')).length`);
  check('zero non-file network requests', reqs === 0, 'non-file=' + reqs);

  check('no console/page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

  chrome.kill();
  console.log('\n' + count + ' checks, ' + failures + ' failed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('FAIL - harness error: ' + e.message); try { chrome.kill(); } catch (_) {} process.exit(2); });
