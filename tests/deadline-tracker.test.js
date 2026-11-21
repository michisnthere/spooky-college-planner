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
  assert.equal(harvard.querySelector('.lane-sign__name').textContent, 'Harvard University');
  assert.equal(harvard.querySelector('.lane-sunflower').textContent, '', 'the sunflower shows no name');
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
  assert.equal(lane.querySelector('.lane-sign__name').textContent, 'Unnamed college');
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
  assert.match(rail, /transition:\s*transform 0\.8s steps\(16, end\)/);
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

// ---------------------------------------------------------------------------
// Lane name sign: the college name is on a wooden sign at the bottom-left of the lane, not on the
// sunflower, and its size follows the length of the name.
// ---------------------------------------------------------------------------
const LONG_NAME = 'Massachusetts Institute of Technology';

test('sign: every lane has one sign with the college name, and the sunflower has no text but keeps its label', async () => {
  const { initDeadlineTracker } = await tracker();
  initDeadlineTracker({ container: track(), colleges: [HARVARD, { id: 'm1', name: LONG_NAME, deadline_date: '2026-04-01' }], today: TODAY });
  for (const [id, name] of [['h1', 'Harvard University'], ['m1', LONG_NAME]]) {
    const lane = laneFor(id);
    const signs = lane.querySelectorAll('.lane-sign');
    assert.equal(signs.length, 1, `${id} has one sign`);
    assert.equal(signs[0].querySelector('.lane-sign__name').textContent, name);
    const flower = lane.querySelector('.lane-sunflower');
    assert.equal(flower.textContent, '');
    assert.equal(flower.children.length, 0);
    assert.equal(flower.getAttribute('aria-label'), `Finish line: ${name}`, 'screen readers still hear the name');
  }
});

test('sign: it sits in the lane strip before the path, so it is at the left end and the zombie starts after it', async () => {
  const { initDeadlineTracker } = await tracker();
  initDeadlineTracker({ container: track(), colleges: [HARVARD], today: TODAY });
  const strip = laneFor('h1').querySelector('.deadline-lane__strip');
  assert.deepEqual([...strip.children].map((c) => c.className.split(' ')[0]), ['lane-sign', 'deadline-lane__path', 'deadline-lane__end']);
  const css = fs.readFileSync(path.join(FRONTEND, 'css', 'style.css'), 'utf8');
  const sign = /\.lane-sign\s*\{([^}]*)\}/.exec(css)[1];
  assert.match(sign, /position:\s*absolute/);
  assert.match(sign, /left:\s*0\.5rem/);
  assert.match(sign, /bottom:\s*0\.25rem/);
  assert.match(sign, /width:\s*8\.5rem/);
  assert.match(sign, /pointer-events:\s*none/);
  assert.match(/\.deadline-lane__path\s*\{([^}]*)\}/.exec(css)[1], /margin:\s*0 9\.5rem 0 9\.5rem/, 'the path starts after the sign');
  assert.doesNotMatch(css, /lane-sunflower__name/, 'the old name-on-sunflower rule is gone');
});

test('sign: the sign stays when the deadline passes or the lane is completed', async () => {
  const { initDeadlineTracker } = await tracker();
  const passed = { id: 'p1', name: 'Past U', deadline_date: '2026-03-01' };
  const done = { id: 'd1', name: 'Done U', deadline_date: '2026-04-01', status: 'submitted', submitted_at: '2026-03-05' };
  initDeadlineTracker({ container: track(), colleges: [passed, done], today: TODAY });
  assert.equal(laneFor('p1').querySelector('.lane-sign__name').textContent, 'Past U');
  assert.equal(laneFor('d1').querySelector('.lane-sign__name').textContent, 'Done U');
});

test('sign: names are text, never markup', async () => {
  const { buildLaneSign } = await tracker();
  const sign = buildLaneSign('<img src=x onerror=alert(1)> U');
  assert.equal(sign.querySelector('img'), null);
  assert.equal(sign.querySelector('.lane-sign__name').textContent, '<img src=x onerror=alert(1)> U');
});

test('sign size: short names stay on one line at the full size', async () => {
  const { laneSignLayout, SIGN_FONT_MAX_REM } = await tracker();
  for (const name of ['MIT', 'Yale', 'Duke', 'Rice University'.slice(0, 4)]) {
    assert.deepEqual(laneSignLayout(name), { fontSizeRem: SIGN_FONT_MAX_REM, lines: 1 }, name);
  }
});

test('sign size: longer names get smaller and wrap, and size never grows as the name grows', async () => {
  const { laneSignLayout } = await tracker();
  const names = ['Yale', 'Princeton', 'Harvard University', 'Rensselaer Polytechnic Institute', LONG_NAME, 'Pennsylvania State University-Main Campus'];
  const sizes = names.map((n) => laneSignLayout(n).fontSizeRem);
  for (let i = 1; i < sizes.length; i += 1) assert.ok(sizes[i] <= sizes[i - 1], `${names[i]} (${sizes[i]}) is not bigger than ${names[i - 1]} (${sizes[i - 1]})`);
  assert.equal(laneSignLayout('Harvard University').lines, 2, 'two words go on two lines rather than shrinking');
  assert.equal(laneSignLayout(LONG_NAME).lines, 3);
  assert.ok(laneSignLayout(LONG_NAME).fontSizeRem >= 0.7, 'a typical long name stays readable');
});

test('sign size: the estimate always fits the sign width, and sizes are on a 0.05rem step', async () => {
  const { laneSignLayout, SIGN_TEXT_WIDTH_REM, SIGN_FONT_MIN_REM, SIGN_MAX_LINES } = await tracker();
  const names = ['A', 'MIT', 'Harvard University', LONG_NAME, 'University of California-Los Angeles', 'Texas A & M University-College Station', 'Saint Mary-of-the-Woods College', 'The University of Texas Rio Grande Valley'];
  for (const name of names) {
    const { fontSizeRem, lines } = laneSignLayout(name);
    assert.ok(lines >= 1 && lines <= SIGN_MAX_LINES, `${name}: ${lines} lines`);
    assert.ok(fontSizeRem >= SIGN_FONT_MIN_REM, `${name}: at least the minimum`);
    assert.equal(Math.round(fontSizeRem * 20), fontSizeRem * 20, `${name}: ${fontSizeRem} is on a 0.05 step`);
    // The longest line at this size, estimated the same generous way, fits the text width.
    const words = name.split(/\s+/);
    const longestWord = Math.max(...words.map((w) => w.length));
    if (fontSizeRem > SIGN_FONT_MIN_REM) assert.ok(longestWord * 0.62 * fontSizeRem <= SIGN_TEXT_WIDTH_REM + 1e-9, `${name}: its longest word fits`);
  }
});

test('sign size: edge cases (blank, spaces, one very long word, an extremely long name)', async () => {
  const { laneSignLayout, buildLaneSign, SIGN_FONT_MAX_REM, SIGN_FONT_MIN_REM } = await tracker();
  assert.deepEqual(laneSignLayout(''), { fontSizeRem: SIGN_FONT_MAX_REM, lines: 1 });
  assert.deepEqual(laneSignLayout('   '), { fontSizeRem: SIGN_FONT_MAX_REM, lines: 1 });
  assert.deepEqual(laneSignLayout(null), { fontSizeRem: SIGN_FONT_MAX_REM, lines: 1 });
  assert.deepEqual(laneSignLayout('  Yale   University  '), laneSignLayout('Yale University'), 'extra spaces are ignored');
  const oneWord = laneSignLayout('Supercalifragilisticexpialidocious');
  assert.equal(oneWord.lines, 1, 'a single word cannot be split between words');
  assert.equal(oneWord.fontSizeRem, SIGN_FONT_MIN_REM, 'it shrinks to the minimum (CSS then breaks it inside the word)');
  const huge = laneSignLayout('The University of Texas Rio Grande Valley School of Medicine and Health Sciences');
  assert.equal(huge.fontSizeRem, SIGN_FONT_MIN_REM, 'never smaller than the minimum');
  assert.equal(buildLaneSign('Yale').querySelector('.lane-sign__name').style.fontSize, '1.1rem', 'the size is applied');
  assert.equal(buildLaneSign(LONG_NAME).dataset.lines, '3');
});

test('sign: a very long name is capped at four visible lines, with the full name kept in the title', async () => {
  const { buildLaneSign, SIGN_VISIBLE_LINES } = await tracker();
  const name = 'The University of Texas Rio Grande Valley School of Medicine and Health Sciences';
  const sign = buildLaneSign(name);
  assert.equal(sign.title, name);
  assert.equal(sign.querySelector('.lane-sign__board .lane-sign__name').textContent, name, 'the text is complete in the DOM');
  const css = fs.readFileSync(path.join(FRONTEND, 'css', 'style.css'), 'utf8');
  const rule = /\.lane-sign__name\s*\{([^}]*)\}/.exec(css)[1];
  assert.match(rule, new RegExp(`-webkit-line-clamp:\\s*${SIGN_VISIBLE_LINES};`));
  assert.match(rule, /overflow:\s*hidden/);
  assert.match(/\.lane-sign__board\s*\{([^}]*)\}/.exec(css)[1], /lane-sign\.svg/, 'the board carries the sprite');
});
