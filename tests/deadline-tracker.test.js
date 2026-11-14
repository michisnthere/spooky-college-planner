// Task 15 checks: deadline lane tracker.
// Loads the real frontend/deadlines.html markup into jsdom. Run with: node --test tests/deadline-tracker.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { JSDOM } = require('jsdom');

const FRONTEND = path.join(__dirname, '..', 'frontend');
const html = fs.readFileSync(path.join(FRONTEND, 'deadlines.html'), 'utf8');
const moduleUrl = pathToFileURL(path.join(FRONTEND, 'js', 'ui', 'deadline-tracker.js')).href;

const dom = new JSDOM(html, { pretendToBeVisual: true });
globalThis.document = dom.window.document;

const tracker = () => import(moduleUrl);
const track = () => document.getElementById('deadline-track');
// The walker's position lives on its rail, so the zombie's own walking animation can use transform.
const railTransform = (lane) => lane.querySelector('.deadline-lane__rail').style.transform;
const lanes = () => Array.from(track().querySelectorAll('.deadline-lane'));
const laneFor = (id) => track().querySelector(`.deadline-lane[data-college-id="${id}"]`);
const wait = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

// Fixed "today": 2026-03-10, local time, so day counts do not depend on the machine's clock.
const TODAY = () => new Date(2026, 2, 10, 15, 30);

const HARVARD = { id: 'h1', name: 'Harvard University', deadline_date: '2026-03-25' }; // 15 days
const YALE = { id: 'y1', name: 'Yale University', deadline_date: '2026-03-10' }; // 0 days
const STANFORD = { id: 's1', name: 'Stanford University', deadline_date: '2026-03-07' }; // -3 days

test('calculateZombiePercent maps days to lane percent, including 0 days and negative days', async () => {
  const { calculateZombiePercent, TOTAL_DAYS } = await tracker();
  assert.equal(TOTAL_DAYS, 120);
  assert.equal(calculateZombiePercent(120), 0, 'full window left: zombie at start');
  assert.equal(calculateZombiePercent(60), 50, 'halfway');
  assert.equal(calculateZombiePercent(0), 100, '0 days: zombie at the sunflower');
  assert.equal(calculateZombiePercent(-5), 100, 'negative days clamp to 100');
  assert.equal(calculateZombiePercent(500), 0, 'more days than the window clamps to 0');
  assert.equal(calculateZombiePercent(null), null, 'no deadline gives null');
  assert.equal(calculateZombiePercent(Number.NaN), null, 'NaN gives null');
  assert.throws(() => calculateZombiePercent(10, 0), RangeError, 'zero-length window is rejected');
});

test('computeDaysRemaining counts whole calendar days and rejects missing or invalid dates', async () => {
  const { computeDaysRemaining } = await tracker();
  const today = TODAY();
  assert.equal(computeDaysRemaining('2026-03-10', today), 0, 'deadline today is 0');
  assert.equal(computeDaysRemaining('2026-03-09', today), -1, 'yesterday is -1');
  assert.equal(computeDaysRemaining('2026-03-25', today), 15);
  assert.equal(computeDaysRemaining(new Date(2026, 2, 12), today), 2, 'pg Date objects are accepted');
  assert.equal(computeDaysRemaining(null, today), null, 'no deadline');
  assert.equal(computeDaysRemaining('not-a-date', today), null, 'garbage string');
  assert.equal(computeDaysRemaining('2026-02-31', today), null, 'rolled-over date is rejected');
});

test('updateZombiePosition moves the walker with transform translateX from days remaining', async () => {
  const { updateZombiePosition } = await tracker();
  const el = document.createElement('div');
  assert.equal(updateZombiePosition(el, 60), 50);
  assert.equal(el.style.transform, 'translateX(50%)');
  assert.equal(el.style.left, '', 'left is no longer used');
  assert.equal(updateZombiePosition(el, null), null, 'no deadline returns null');
  assert.equal(el.style.transform, 'translateX(0%)', 'no deadline leaves the walker at the start');
});

test('zero colleges shows the empty message and no lanes', async () => {
  const { initDeadlineTracker, NO_COLLEGES_TEXT } = await tracker();
  const result = initDeadlineTracker({ container: track(), colleges: [], today: TODAY });
  assert.equal(result.laneCount, 0);
  assert.equal(lanes().length, 0);
  assert.equal(track().querySelector('.deadline-empty').textContent, NO_COLLEGES_TEXT);
});

test('one lane per college: zombie matches days remaining, sunflower names the college, 0 and negative days show the tombstone', async () => {
  const { initDeadlineTracker, DEADLINE_PASSED_TEXT } = await tracker();
  const result = initDeadlineTracker({ container: track(), colleges: [HARVARD, YALE, STANFORD], today: TODAY });
  assert.equal(result.laneCount, 3);
  assert.equal(lanes().length, 3, 'each college has its own lane');

  const harvard = laneFor('h1');
  assert.equal(railTransform(harvard), 'translateX(87.5%)', '15 days left: 105 of 120 days elapsed');
  assert.equal(harvard.querySelector('.deadline-lane__days').textContent, '15 days remaining');
  assert.equal(harvard.querySelector('.lane-sunflower__name').textContent, 'Harvard University');
  assert.equal(harvard.querySelector('.lane-marker--end'), null, 'no tombstone before the deadline');

  const yale = laneFor('y1');
  assert.equal(railTransform(yale), 'translateX(100%)', '0 days: zombie at the sunflower');
  assert.equal(yale.querySelector('.deadline-lane__days').textContent, '0 days remaining');
  assert.equal(yale.querySelector('.lane-sunflower'), null, 'sunflower is replaced at 0 days');
  assert.equal(yale.querySelector('.lane-marker--end').textContent, DEADLINE_PASSED_TEXT);

  const stanford = laneFor('s1');
  assert.equal(railTransform(stanford), 'translateX(100%)', 'negative days clamp to the end');
  assert.equal(stanford.querySelector('.deadline-lane__days').textContent, 'Deadline passed');
  assert.equal(stanford.querySelector('.lane-marker--end').textContent, DEADLINE_PASSED_TEXT);
});

test('a missing college name shows "Unnamed college" on the sunflower and in the zombie label', async () => {
  const { initDeadlineTracker } = await tracker();
  initDeadlineTracker({ container: track(), colleges: [{ id: 'n1', name: '   ', deadline_date: '2026-03-25' }], today: TODAY });
  const lane = laneFor('n1');
  assert.equal(lane.querySelector('.lane-sunflower__name').textContent, 'Unnamed college');
  assert.equal(lane.querySelector('.zombie').getAttribute('aria-label'), 'Zombie heading toward Unnamed college');
});

test('a college with no deadline keeps its zombie at the start and says "No deadline set"', async () => {
  const { initDeadlineTracker, NO_DEADLINE_TEXT } = await tracker();
  initDeadlineTracker({ container: track(), colleges: [{ id: 'd1', name: 'Open Deadline U', deadline_date: null }], today: TODAY });
  const lane = laneFor('d1');
  assert.equal(railTransform(lane), 'translateX(0%)');
  assert.equal(lane.querySelector('.deadline-lane__days').textContent, NO_DEADLINE_TEXT);
  assert.ok(lane.querySelector('.lane-sunflower'), 'sunflower still marks the lane end');
});

test('Mark as completed sends submitted, plays the defeat, and leaves a tombstone dated with the completion date', async () => {
  const { initDeadlineTracker, COMPLETE_BUTTON_TEXT } = await tracker();
  const calls = [];
  initDeadlineTracker({
    container: track(),
    colleges: [HARVARD],
    today: TODAY,
    defeatDurationMs: 0,
    updateApplicationStatus: async (id, status) => { calls.push([id, status]); },
  });
  const lane = laneFor('h1');
  const button = lane.querySelector('.deadline-lane__complete');
  assert.equal(button.textContent, COMPLETE_BUTTON_TEXT);

  button.click();
  button.click(); // a second click while busy must not send a second request
  await wait();

  assert.deepEqual(calls, [['h1', 'submitted']], 'one status update with submitted');
  assert.equal(lane.querySelector('.zombie'), null, 'zombie is gone after the defeat');
  const tombstone = lane.querySelector('.lane-marker--completed');
  assert.equal(tombstone.textContent, 'Completed 2026-03-10');
  assert.equal(button.textContent, 'Completed');
  assert.equal(button.disabled, true);
});

test('a failed status update keeps the zombie and shows the error', async () => {
  const { initDeadlineTracker } = await tracker();
  initDeadlineTracker({
    container: track(),
    colleges: [HARVARD],
    today: TODAY,
    defeatDurationMs: 0,
    updateApplicationStatus: async () => { throw new Error('server unavailable'); },
  });
  const lane = laneFor('h1');
  const button = lane.querySelector('.deadline-lane__complete');
  button.click();
  await wait();

  assert.ok(lane.querySelector('.zombie'), 'zombie stays because the status was not saved');
  assert.equal(lane.querySelector('.lane-marker--completed'), null);
  assert.match(lane.querySelector('.deadline-lane__message').textContent, /server unavailable/);
  assert.equal(button.disabled, false, 'button can be retried');
});

test('with no status callback the default no-op lets Mark as completed finish', async () => {
  const { initDeadlineTracker } = await tracker();
  initDeadlineTracker({ container: track(), colleges: [YALE], today: TODAY, defeatDurationMs: 0 });
  const lane = laneFor('y1');
  lane.querySelector('.deadline-lane__complete').click();
  await wait();
  assert.equal(lane.querySelector('.lane-marker--completed').textContent, 'Completed 2026-03-10');
});

test('a college already marked submitted loads as a completed tombstone with a disabled button', async () => {
  const { initDeadlineTracker } = await tracker();
  initDeadlineTracker({
    container: track(),
    colleges: [{ ...HARVARD, status: 'submitted', submitted_at: '2026-03-02T10:00:00Z' }],
    today: TODAY,
  });
  const lane = laneFor('h1');
  assert.equal(lane.querySelector('.zombie'), null);
  assert.equal(lane.querySelector('.lane-marker--completed').textContent, 'Completed 2026-03-02');
  assert.equal(lane.querySelector('.deadline-lane__complete').disabled, true);
});

test('initDeadlineTracker throws a clear error when the container is missing', async () => {
  const { initDeadlineTracker } = await tracker();
  assert.throws(
    () => initDeadlineTracker({ container: null, colleges: [HARVARD] }),
    /Deadline track container #deadline-track was not found/,
  );
});

test('the zombie sits on a rail; the rail carries translateX and the zombie keeps no inline left or transform', async () => {
  const { initDeadlineTracker } = await tracker();
  initDeadlineTracker({ container: track(), colleges: [HARVARD], today: TODAY });
  const lane = laneFor('h1');
  const zombie = lane.querySelector('.zombie');
  assert.ok(zombie.parentElement.classList.contains('deadline-lane__rail'), 'zombie is inside the rail');
  assert.equal(zombie.style.left, '', 'no left on the zombie');
  assert.equal(zombie.style.transform, '', 'the zombie keeps its transform for the walking animation');
  assert.equal(zombie.parentElement.style.left, '', 'no left on the rail');
  assert.equal(zombie.dataset.progress, '87.5');
});
test('setDeadline moves the rail with a new translateX and leaves left unused', async () => {
  const { initDeadlineTracker } = await tracker();
  const result = initDeadlineTracker({ container: track(), colleges: [HARVARD], today: TODAY });
  assert.equal(result.setDeadline('h1', '2026-04-09'), true); // 30 days after 2026-03-10
  assert.equal(railTransform(laneFor('h1')), 'translateX(75%)');
  assert.equal(laneFor('h1').querySelector('.zombie').parentElement.style.left, '');
  result.setDeadline('h1', null);
  assert.equal(railTransform(laneFor('h1')), 'translateX(0%)');
});
test('after Mark as completed, the completion tombstone replaces the zombie on the same rail and keeps its position', async () => {
  const { initDeadlineTracker } = await tracker();
  initDeadlineTracker({ container: track(), colleges: [HARVARD], today: TODAY, updateApplicationStatus: async () => {}, defeatDurationMs: 0 });
  const lane = laneFor('h1');
  const before = railTransform(lane);
  lane.querySelector('.deadline-lane__complete').click();
  for (let i = 0; i < 50 && !lane.querySelector('.lane-marker--completed'); i += 1) await new Promise((r) => setTimeout(r, 10));
  assert.ok(lane.querySelector('.deadline-lane__rail .lane-marker--completed'), 'tombstone is on the rail');
  assert.equal(railTransform(lane), before);
  assert.equal(lane.querySelector('.zombie'), null);
});
test('CSS: the rail transitions transform, not left, and reduced motion switches the transition off', () => {
  const css = fs.readFileSync(path.join(FRONTEND, 'css', 'style.css'), 'utf8');
  const rail = /\.deadline-lane__rail\s*\{[^}]*\}/.exec(css)[0];
  assert.match(rail, /transition:\s*transform 0\.8s ease-in-out/);
  assert.doesNotMatch(rail, /transition:[^;]*left/);
  assert.doesNotMatch(css, /\.deadline-lane__path \.lane-marker\s*\{[^}]*transition:\s*left/, 'the old left transition is gone');
  const anim = fs.readFileSync(path.join(FRONTEND, 'css', 'animations.css'), 'utf8');
  const reduced = anim.slice(anim.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(reduced, /\.deadline-lane__rail,/);
  assert.match(reduced, /transition:\s*none/);
});
test('with reduced motion, the position is still set (only the transition is off)', async () => {
  const { initDeadlineTracker } = await tracker();
  const saved = globalThis.matchMedia;
  globalThis.matchMedia = () => ({ matches: true });
  try {
    initDeadlineTracker({ container: track(), colleges: [HARVARD], today: TODAY });
    assert.equal(railTransform(laneFor('h1')), 'translateX(87.5%)');
  } finally {
    if (saved === undefined) delete globalThis.matchMedia; else globalThis.matchMedia = saved;
  }
});
