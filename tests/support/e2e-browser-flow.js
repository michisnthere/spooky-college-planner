// tests/support/e2e-browser-flow.js
// Task 22: browser-level end-to-end flow. Drives the real frontend in headless Chrome.
//
// Prerequisites:
//   - Backend running on E2E_API_BASE_URL (default http://localhost:3000) with CORS_ORIGIN including the app origin.
//   - Frontend served over HTTP at E2E_APP_URL (default http://localhost:5500).
//   - puppeteer-core resolvable through NODE_PATH (it is not a repo dependency), and a Chrome binary at E2E_CHROME_PATH.
//
// Run: node tests/support/e2e-browser-flow.js
// Exit code 0 means every check passed. Test rows are removed at the end by deleting the browser's student.
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');

require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const { Pool } = require('pg');
const puppeteer = require('puppeteer-core');

const APP = (process.env.E2E_APP_URL || 'http://localhost:5500').replace(/\/+$/, '');
const API = (process.env.E2E_API_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const CHROME = process.env.E2E_CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const SHOT_DIR = process.env.E2E_SHOT_DIR || path.join(os.tmpdir(), 'spooky-e2e');
const TOTAL_DAYS = 120; // Same cycle as deadline-tracker.js and deadlineController.js.

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
}

function localDate(offsetDays) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const expectedPercent = (days) => Math.min(100, Math.max(0, ((TOTAL_DAYS - days) / TOTAL_DAYS) * 100));

const COLLEGES = [
  { name: 'E2E Browser Soon University', state: 'MA', location: 'Boston, MA', rate: '42.5', days: 1 },
  { name: 'E2E Browser Mid College', state: 'OH', location: 'Columbus, OH', rate: '38', days: 60 },
  { name: 'E2E Browser Far Institute', state: 'CA', location: 'Pasadena, CA', rate: '55', days: 400 },
];
const SOON = COLLEGES[0];
const MID = COLLEGES[1];
const FAR = COLLEGES[2];
const MID_NEW_DAYS = 30;
// The form turns a code into the full name, so the saved college shows the full name.
const FULL_STATE = { MA: 'Massachusetts', OH: 'Ohio', CA: 'California' };
// Lookup results the page receives while stubLookup is set (the real Scorecard is not needed for the dialog check).
const LOOKUP_STUBS = {
  'E2E Missing University': { id: 9101, name: 'E2E Missing University', state: null, city: null, acceptanceRate: null, scorecardId: 9101 },
  'E2E Rate Missing College': { id: 9102, name: 'E2E Rate Missing College', state: 'Ohio', city: 'Dayton', acceptanceRate: null, scorecardId: 9102 },
  'E2E Complete College': { id: 9103, name: 'E2E Complete College', state: 'Ohio', city: 'Dayton', acceptanceRate: '12.50', scorecardId: 9103 },
};

async function main() {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'spooky-profile-'));
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu'],
    userDataDir: profile,
    defaultViewport: { width: 1280, height: 900 },
  });

  const consoleIssues = [];
  const pageErrors = [];
  const requestFailures = [];
  const httpErrors = [];
  const apiCalls = [];
  let abortLookup = false;
  let stubLookup = false;
  let studentId = null;
  let pool = null;

  try {
    const page = await browser.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error' || m.type() === 'warning') consoleIssues.push(`${m.type()}: ${m.text()}`);
    });
    page.on('pageerror', (e) => pageErrors.push(e.message));
    page.on('requestfailed', (r) => requestFailures.push(`${r.url()} ${r.failure()?.errorText ?? ''}`));
    page.on('response', (r) => {
      const url = r.url();
      if (url.startsWith(API)) apiCalls.push(`${r.request().method()} ${url.slice(API.length)} ${r.status()}`);
      if (r.status() >= 400) httpErrors.push(`${r.status()} ${url}`);
    });
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (abortLookup && req.url().includes('/api/lookup/college')) return req.abort('failed');
      if (stubLookup && req.url().includes('/api/lookup/college')) {
        const q = decodeURIComponent(new URL(req.url()).searchParams.get('name') || '');
        const hit = Object.values(LOOKUP_STUBS).filter((s) => s.name.toLowerCase().startsWith(q.toLowerCase()));
        return req.respond({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ success: true, data: hit, count: hit.length, query: q }) });
      }
      return req.continue();
    });

    const waitDialogOpen = (id) => page.waitForFunction((dialogId) => document.getElementById(dialogId).open, { timeout: 5000 }, id);
    const cardCount = () => page.evaluate(() => document.querySelectorAll('.college-tombstone').length);
    // The checkmark (✓) on a submitted stone is part of its text, so it is removed before matching names.
    const stoneByName = (name) => page.evaluateHandle((n) => [...document.querySelectorAll('.college-tombstone__stone')]
      .find((s) => s.textContent.replace('✓', '').trim() === n) ?? null, name);

    // Step 1: network error on the college lookup (edge case).
    await page.goto(`${APP}/index.html`, { waitUntil: 'networkidle0' });
    studentId = await page.evaluate(() => localStorage.getItem('spooky-planner.studentId'));
    await page.click('#add-college-button');
    await waitDialogOpen('add-college-dialog');
    abortLookup = true;
    await page.type('#college-search', 'Harvard University');
    await page.waitForFunction(() => /Could not search colleges/.test(
      document.getElementById('college-lookup-message').textContent,
    ), { timeout: 6000 }).catch(() => {});
    const lookupMessage = await page.$eval('#college-lookup-message', (el) => el.textContent.trim());
    check('lookup network error shows a message and keeps the dialog open',
      /Could not search colleges/.test(lookupMessage) && (await page.$eval('#add-college-dialog', (d) => d.open)),
      lookupMessage);
    check('lookup network error leaves the manual fields enabled',
      await page.$eval('#college-location', (el) => !el.disabled));
    abortLookup = false;
    await page.click('#add-college-cancel');

    // Step 2: add three colleges with different deadlines (very soon, mid, far future).
    for (const college of COLLEGES) {
      const before = await cardCount();
      await page.click('#add-college-button');
      await waitDialogOpen('add-college-dialog');
      await page.evaluate(() => {
        const search = document.getElementById('college-search');
        search.value = '';
        search.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await page.click('#college-search');
      await page.type('#college-search', college.name);
      await page.evaluate((c) => {
        const set = (id, value) => {
          const el = document.getElementById(id);
          el.value = value;
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
        };
        set('college-location', c.location);
        set('college-state', c.state);
        set('college-acceptance-rate', c.rate);
        set('college-deadline', c.date);
      }, { ...college, date: localDate(college.days) });
      await page.click('#add-college-submit');
      await page.waitForFunction((n) => document.querySelectorAll('.college-tombstone').length === n,
        { timeout: 8000 }, before + 1);
      await page.click('#add-college-cancel');
    }
    const names = await page.evaluate(() => [...document.querySelectorAll('.college-tombstone__stone')]
      .map((s) => s.textContent.replace('✓', '').trim()));
    check('all three colleges display as tombstones',
      COLLEGES.every((c) => names.includes(c.name)), names.join(' | '));

    // Step 3: view details, update a deadline, and mark one submitted.
    const soonHandle = await stoneByName(SOON.name);
    await (soonHandle.asElement() ?? (() => { throw new Error('Soon tombstone not found'); })()).click();
    await waitDialogOpen('college-detail-dialog');
    const detail = await page.evaluate(() => ({
      name: document.getElementById('detail-college-name').textContent.trim(),
      location: document.getElementById('detail-location').textContent.trim(),
      state: document.getElementById('detail-state').textContent.trim(),
      rate: document.getElementById('detail-acceptance-rate').textContent.trim(),
      days: document.getElementById('detail-days-remaining').textContent.trim(),
    }));
    check('detail view shows the saved college facts',
      detail.name === SOON.name && detail.location === SOON.location && detail.state === FULL_STATE[SOON.state]
      && detail.rate.startsWith('42.5'), JSON.stringify(detail));
    check('detail view shows 1 day remaining for the very soon deadline', /^1 day/.test(detail.days), detail.days);
    await page.click('#detail-close-button');

    const midHandle = await stoneByName(MID.name);
    await (midHandle.asElement() ?? (() => { throw new Error('Mid tombstone not found'); })()).click();
    await waitDialogOpen('college-detail-dialog');
    await page.evaluate((date) => {
      const input = document.getElementById('detail-deadline-input');
      input.value = date;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, localDate(MID_NEW_DAYS));
    await page.waitForFunction((n) => new RegExp(`^${n} days`).test(
      document.getElementById('detail-days-remaining').textContent.trim(),
    ), { timeout: 6000 }, MID_NEW_DAYS).catch(() => {});
    const updatedDays = await page.$eval('#detail-days-remaining', (el) => el.textContent.trim());
    check('updating the deadline in the modal changes days remaining', updatedDays.startsWith(`${MID_NEW_DAYS} days`), updatedDays);
    await page.click('#detail-close-button');

    const midSubmitHandle = await stoneByName(MID.name);
    await (midSubmitHandle.asElement()).click();
    await waitDialogOpen('college-detail-dialog');
    await page.click('button[data-status="submitted"]');
    await page.waitForFunction(() => !document.getElementById('college-detail-dialog').open, { timeout: 5000 });
    const defeatSeen = await page.waitForFunction(
      () => !!document.querySelector('.college-tombstone .zombie--defeated'),
      { timeout: 3000, polling: 16 },
    ).then(() => true).catch(() => false);
    check('marking submitted plays the zombie defeat on the tombstone', defeatSeen);
    await page.waitForFunction(() => !!document.querySelector('.tombstone--submitted'), { timeout: 4000 }).catch(() => {});
    const submittedNames = await page.evaluate(() => [...document.querySelectorAll('.tombstone--submitted')]
      .map((s) => s.textContent.trim()));
    check('submitted college shows the checkmark and the others do not',
      submittedNames.length === 1 && submittedNames[0].startsWith(MID.name) && submittedNames[0].includes('✓'),
      JSON.stringify(submittedNames));
    await page.screenshot({ path: path.join(SHOT_DIR, 'index-after-submit.png') });

    // Step 4: refresh and verify persistence.
    await page.reload({ waitUntil: 'networkidle0' });
    await page.waitForFunction(() => document.querySelectorAll('.college-tombstone').length === 3, { timeout: 8000 });
    const afterRefresh = await page.evaluate(() => ({
      names: [...document.querySelectorAll('.college-tombstone__stone')].map((s) => s.textContent.replace('✓', '').trim()),
      submitted: [...document.querySelectorAll('.tombstone--submitted')].map((s) => s.textContent.trim()),
      zombiesOnCards: document.querySelectorAll('.tombstone-zombie').length,
    }));
    check('after refresh all three colleges are still shown',
      COLLEGES.every((c) => afterRefresh.names.includes(c.name)), afterRefresh.names.join(' | '));
    check('after refresh the submitted college keeps its checkmark and no defeat replays',
      afterRefresh.submitted.length === 1 && afterRefresh.submitted[0].startsWith(MID.name) && afterRefresh.zombiesOnCards === 0,
      JSON.stringify(afterRefresh));
    const midAfter = await stoneByName(MID.name);
    await (midAfter.asElement()).click();
    await waitDialogOpen('college-detail-dialog');
    const midDetail = await page.evaluate(() => ({
      days: document.getElementById('detail-days-remaining').textContent.trim(),
      submittedPressed: document.querySelector('button[data-status="submitted"]').getAttribute('aria-pressed'),
    }));
    check('after refresh the changed deadline and submitted status are loaded in the modal',
      midDetail.days.startsWith(`${MID_NEW_DAYS} days`) && midDetail.submittedPressed === 'true', JSON.stringify(midDetail));
    await page.click('#detail-close-button');

    // Step 4b: the missing-attributes dialog (follow-up item 4), with stubbed lookup results.
    stubLookup = true;
    const pick = async (name) => {
      await page.evaluate(() => {
        const s = document.getElementById('college-search');
        s.value = '';
        s.dispatchEvent(new Event('input', { bubbles: true }));
        document.getElementById('add-college-form').reset();
      });
      await page.type('#college-search', name);
      await page.waitForFunction(() => document.querySelectorAll('#college-suggestions li').length > 0, { timeout: 4000 });
      await page.click('#college-suggestions li');
    };
    const missingOpen = () => page.evaluate(() => document.getElementById('missing-info-dialog').open);
    await page.click('#add-college-button');
    await waitDialogOpen('add-college-dialog');
    await pick('E2E Missing University');
    await waitDialogOpen('missing-info-dialog');
    const dlg = await page.evaluate(() => ({
      keys: [...document.querySelectorAll('#missing-info-fields input')].map((i) => i.dataset.key),
      summary: document.getElementById('missing-info-summary').textContent,
    }));
    check('the dialog lists every missing attribute with one input each',
      dlg.keys.join() === 'location,state,acceptanceRate' && /location, state and acceptance rate/.test(dlg.summary), JSON.stringify(dlg));
    await page.type('#missing-info-fields [data-key="acceptanceRate"]', '150');
    await page.click('#missing-info-save');
    const badRate = await page.$eval('#missing-info-message', (el) => el.textContent.trim());
    check('an acceptance rate above 100 is rejected and the dialog stays open', /0 to 100/.test(badRate) && (await missingOpen()), badRate);
    await page.$eval('#missing-info-fields [data-key="acceptanceRate"]', (el) => { el.value = '42.5'; });
    await page.type('#missing-info-fields [data-key="state"]', 'Narnia');
    await page.click('#missing-info-save');
    const badState = await page.$eval('#missing-info-message', (el) => el.textContent.trim());
    check('an invalid state is rejected and the dialog stays open', /state or territory/.test(badState) && (await missingOpen()), badState);
    await page.$eval('#missing-info-fields [data-key="state"]', (el) => { el.value = 'oh'; });
    await page.type('#missing-info-fields [data-key="location"]', 'Dayton');
    await page.click('#missing-info-save');
    await page.waitForFunction(() => !document.getElementById('missing-info-dialog').open, { timeout: 3000 });
    const filled = await page.evaluate(() => ({
      location: document.getElementById('college-location').value,
      state: document.getElementById('college-state').value,
      rate: document.getElementById('college-acceptance-rate').value,
      addOpen: document.getElementById('add-college-dialog').open,
    }));
    check('Continue copies the values into the add-college form (code converted to the full name)',
      filled.location === 'Dayton' && filled.state === 'Ohio' && filled.rate === '42.5' && filled.addOpen, JSON.stringify(filled));
    await pick('E2E Rate Missing');
    await waitDialogOpen('missing-info-dialog');
    const onlyRate = await page.evaluate(() => [...document.querySelectorAll('#missing-info-fields input')].map((i) => i.dataset.key).join());
    await page.click('#missing-info-skip');
    await page.waitForFunction(() => !document.getElementById('missing-info-dialog').open, { timeout: 3000 });
    const afterSkip = await page.evaluate(() => ({ location: document.getElementById('college-location').value, rate: document.getElementById('college-acceptance-rate').value }));
    check('a college missing only the rate asks only for the rate, and Skip leaves it empty for manual entry',
      onlyRate === 'acceptanceRate' && afterSkip.location === 'Dayton' && afterSkip.rate === '', JSON.stringify({ onlyRate, afterSkip }));
    await pick('E2E Complete');
    await page.waitForFunction(() => document.getElementById('college-location').value === 'Dayton', { timeout: 3000 });
    check('a complete lookup result opens no dialog', !(await missingOpen()));
    await page.click('#add-college-cancel');
    stubLookup = false;
    // Step 5: deadline lanes on deadlines.html. Zombie positions must match the deadlines.
    await page.goto(`${APP}/deadlines.html`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => document.querySelectorAll('.deadline-lane').length === 3, { timeout: 8000 });
    const lanes = await page.evaluate(() => [...document.querySelectorAll('.deadline-lane')].map((lane) => {
      const zombie = lane.querySelector('.zombie');
      return {
        name: lane.getAttribute('aria-label').replace('Deadline lane for ', ''),
        days: lane.querySelector('.deadline-lane__days')?.textContent.trim() ?? '',
        left: zombie ? parseFloat((/translateX\(([^)]+)\)/.exec(zombie.parentElement.style.transform) || [])[1]) : null,
        inlineLeft: zombie ? zombie.style.left : null,
        walking: zombie ? getComputedStyle(zombie).animationName : null,
        railMoved: zombie ? getComputedStyle(zombie.parentElement).transform : null,
        completed: !!lane.querySelector('.lane-marker--completed'),
        sunflower: !!lane.querySelector('.lane-sunflower'),
      };
    }));
    const byName = Object.fromEntries(lanes.map((l) => [l.name, l]));
    const expectations = [
      { c: SOON, days: 1 },
      { c: MID, days: MID_NEW_DAYS },
      { c: FAR, days: 400 },
    ];
    for (const { c, days } of expectations) {
      const lane = byName[c.name];
      if (!lane) { check(`lane exists for ${c.name}`, false); continue; }
      if (c === MID) {
        check('submitted lane shows a completion tombstone and no zombie',
          lane.completed && lane.left === null, JSON.stringify(lane));
        continue;
      }
      const want = expectedPercent(days);
      check(`zombie position matches ${days} days remaining for ${c.name}`,
        lane.left !== null && Math.abs(lane.left - want) < 0.05 && lane.sunflower,
        `left=${lane.left} expected=${want.toFixed(3)} label="${lane.days}"`);
    }
    const soonLane = byName[SOON.name];
    check('the zombie moves by transform on its rail: no inline left, walking animation intact, rail has a transform matrix',
      soonLane.inlineLeft === '' && soonLane.walking === 'zombieWalk' && /^matrix/.test(soonLane.railMoved), JSON.stringify(soonLane));
    check('far future lane sits at the start of the lane (0%)', byName[FAR.name]?.left === 0,
      `left=${byName[FAR.name]?.left}`);
    await page.screenshot({ path: path.join(SHOT_DIR, 'deadlines-lanes.png') });

    // Step 5b: delete persists (follow-up item 7). Delete one college in the UI, then reload.
    await page.goto(`${APP}/index.html`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => document.querySelectorAll('.college-tombstone').length === 3, { timeout: 8000 });
    page.once('dialog', (d) => d.accept());
    await page.evaluate((n) => {
      const card = [...document.querySelectorAll('.college-tombstone')].find((c) => c.querySelector('.college-tombstone__stone').textContent.trim() === n);
      card.querySelector('.tombstone-delete').click();
    }, FAR.name);
    await page.waitForFunction(() => document.querySelectorAll('.college-tombstone').length === 2, { timeout: 5000 });
    await page.reload({ waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 500));
    const afterDelete = await page.evaluate(() => [...document.querySelectorAll('.college-tombstone__stone')].map((s) => s.textContent.replace('✓', '').trim()));
    check('a deleted college stays gone after a refresh', afterDelete.length === 2 && !afterDelete.includes(FAR.name), afterDelete.join(' | '));
    check('the delete went to the server', apiCalls.some((c) => /^DELETE \/api\/colleges\/.+ 200$/.test(c)), apiCalls.filter((c) => c.startsWith('DELETE')).join(','));
    await page.goto(`${APP}/deadlines.html`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => document.querySelectorAll('.deadline-lane').length === 2, { timeout: 8000 }).catch(() => {});
    check('the deleted college has no lane on the deadline page', (await page.evaluate(() => document.querySelectorAll('.deadline-lane').length)) === 2);
    // Step 6: DevTools-style checks: navigation timing and page metrics for the graveyard page.
    await page.goto(`${APP}/index.html`, { waitUntil: 'networkidle0' });
    const timing = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      return {
        domContentLoadedMs: Math.round(nav.domContentLoadedEventEnd),
        loadMs: Math.round(nav.loadEventEnd),
        resources: performance.getEntriesByType('resource').length,
      };
    });
    const metrics = await page.metrics();
    console.log('PERF', JSON.stringify({
      ...timing,
      layoutCount: metrics.LayoutCount,
      scriptDurationS: Number(metrics.ScriptDuration.toFixed(3)),
      layoutDurationS: Number(metrics.LayoutDuration.toFixed(3)),
    }));

    // Network and console checks. Ignore the expected lookup abort (step 1) and the favicon, which the static server does not serve.
    const unexpectedHttp = httpErrors.filter((e) => !e.includes('/favicon.ico'));
    const unexpectedFailures = requestFailures.filter((f) => !f.includes('/api/lookup/college'));
    const realConsoleIssues = consoleIssues.filter((m) => !/Failed to load resource/.test(m));
    check('no unexpected HTTP errors (4xx/5xx) during the flow', unexpectedHttp.length === 0, unexpectedHttp.join('; '));
    check('no unexpected failed requests (the lookup abort in step 1 is expected)', unexpectedFailures.length === 0,
      unexpectedFailures.join('; '));
    check('no uncaught page errors', pageErrors.length === 0, pageErrors.join('; '));
    check('no console errors or warnings other than generic resource-load messages', realConsoleIssues.length === 0,
      realConsoleIssues.join('; '));
    console.log(`INFO  console resource-load messages (expected for the step-1 abort and favicon): ${consoleIssues.length - realConsoleIssues.length}`);
    console.log(`INFO  API calls: ${apiCalls.length}`);
  } finally {
    await browser.close();
    if (studentId) {
      pool = new Pool({ connectionString: process.env.DATABASE_URL });
      await pool.query('DELETE FROM students WHERE id = $1', [studentId]);
      const left = await pool.query(
        'SELECT (SELECT COUNT(*)::int FROM colleges WHERE student_id = $1) AS colleges, (SELECT COUNT(*)::int FROM students WHERE id = $1) AS students',
        [studentId],
      );
      const clean = left.rows[0].colleges === 0 && left.rows[0].students === 0;
      check('browser test rows removed from the database', clean, JSON.stringify(left.rows[0]));
      await pool.end();
    }
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* profile cleanup is best effort */ }
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\nSUMMARY ${results.length - failed.length}/${results.length} checks passed`);
  process.exitCode = failed.length === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error('FATAL', error);
  process.exitCode = 1;
});
