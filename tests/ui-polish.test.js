// Tasks 36 to 40 checks: fonts and embossed text, parallax scenery, wobbly stones, gate dividers,
// and ground fog. Runs the browser modules under jsdom and reads the CSS and SVG as text.
// Run with: node --test tests/ui-polish.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { JSDOM } = require('jsdom');

const FRONTEND = path.join(__dirname, '..', 'frontend');
const read = (...parts) => fs.readFileSync(path.join(FRONTEND, ...parts), 'utf8');
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const style = stripComments(read('css', 'style.css'));
const anim = stripComments(read('css', 'animations.css'));
const importUi = (file) => import(pathToFileURL(path.join(FRONTEND, 'js', 'ui', file)).href);
const PAGES = ['index.html', 'deadlines.html'];

// Bodies of every rule whose selector list contains `selector` exactly, joined in file order,
// or null when no rule matches. A selector can appear in several rules (a shared rule and its own).
function ruleBody(css, selector) {
  const bodies = [];
  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = match[1].split(',').map((s) => s.trim());
    if (selectors.includes(selector)) bodies.push(match[2]);
  }
  return bodies.length ? bodies.join('\n') : null;
}
const keyframeBody = (css, name) => new RegExp(`@keyframes ${name}\\s*\\{([\\s\\S]*?\\n\\})\\s*\\n`).exec(css)?.[1] ?? '';

// ---------------------------------------------------------------------------
// Task 36: fonts and embossed typography
// ---------------------------------------------------------------------------

test('fonts: nothing is loaded from another host, so the content security policy stays on self', () => {
  assert.doesNotMatch(style, /@import/);
  assert.doesNotMatch(style, /url\(\s*["']?https?:/);
  for (const page of PAGES) {
    assert.doesNotMatch(read(page), /(href|src)="https?:/, `${page} has no external resources`);
  }
});

test('text: bright text uses the soft shadow and the page body adds no shadow of its own', () => {
  assert.match(ruleBody(style, '.site-header'), /text-shadow:\s*var\(--text-shadow-bright\)/);
  assert.match(ruleBody(style, '.back-link'), /text-shadow:\s*var\(--text-shadow-bright\)/);
  assert.match(ruleBody(style, '.deadline-empty'), /text-shadow:\s*var\(--text-shadow-bright\)/);
  assert.doesNotMatch(ruleBody(style, 'body'), /text-shadow/, 'body adds none, so nothing inherits a border');
});

// ---------------------------------------------------------------------------
// Task 37: parallax scenery
// ---------------------------------------------------------------------------

const pageDom = (page) => new JSDOM(read(page)).window.document;

test('parallax: both pages have a hidden scenery with moon, clouds, hills, trees and a fog strip', () => {
  for (const page of PAGES) {
    const doc = pageDom(page);
    const scenery = doc.querySelector('.scenery');
    assert.ok(scenery, `${page} has the scenery`);
    assert.equal(scenery.getAttribute('aria-hidden'), 'true');
    assert.equal(doc.body.firstElementChild, scenery, 'it is the first thing in the body, so it paints behind');
    for (const name of ['moon', 'clouds', 'hills', 'trees']) {
      assert.ok(scenery.querySelector(`.scenery__layer--${name}`), `${page} has the ${name} layer`);
    }
    assert.ok(scenery.querySelector('.scenery__layer--moon .scenery__moon'));
    assert.ok(scenery.querySelector(':scope > .scenery__fog'), `${page} has the shared fog strip`);
  }
});

test('parallax: nearer layers are faster than farther ones', () => {
  const doc = pageDom('index.html');
  const speed = (name) => Number(doc.querySelector(`.scenery__layer--${name}`).dataset.parallaxSpeed);
  assert.ok(speed('moon') < speed('clouds'));
  assert.ok(speed('clouds') < speed('hills'));
  assert.ok(speed('hills') < speed('trees'));
  assert.ok(speed('trees') < 1, 'every layer moves less than the page');
});

test('parallax: layerOffset scales with speed and wraps tiled layers inside one tile', async () => {
  const { layerOffset } = await importUi('parallax.js');
  const slow = layerOffset(1000, 0, 0.1, 1200);
  const fast = layerOffset(1000, 0, 0.3, 1200);
  assert.equal(slow.x, -100);
  assert.equal(fast.x, -300);
  assert.equal(layerOffset(4000, 0, 0.3, 1200).x, 0, 'a whole number of tiles lands back at the start');
  for (const scroll of [0, 1, 999, 12345, 987654]) {
    const { x } = layerOffset(scroll, 0, 0.3, 1400);
    assert.ok(x <= 0 && x > -1400, `x ${x} stays inside one tile at scroll ${scroll}`);
  }
});

test('parallax: edge cases for layerOffset (clamps, bad numbers, no speed)', async () => {
  const { layerOffset, MAX_SHIFT_X, MAX_SHIFT_Y } = await importUi('parallax.js');
  assert.equal(layerOffset(0, 100000, 0.9, 1400).y, -MAX_SHIFT_Y, 'vertical movement stops at the overscan');
  assert.equal(layerOffset(100000, 0, 0.5).x, -MAX_SHIFT_X, 'a layer without a tile stops at the limit');
  assert.deepEqual(layerOffset(-500, -500, 0.5, 1000), { x: 0, y: 0 }, 'negative scroll (overscroll) does not move it');
  assert.deepEqual(layerOffset(Number.NaN, undefined, 0.5, 1000), { x: 0, y: 0 });
  assert.deepEqual(layerOffset(800, 800, 0, 1000), { x: 0, y: 0 }, 'speed 0 keeps a layer still');
  assert.deepEqual(layerOffset(800, 800, Number.NaN, 1000), { x: 0, y: 0 }, 'a missing speed attribute is safe');
  assert.deepEqual(layerOffset(800, 800, -1, 1000), { x: 0, y: 0 }, 'a negative speed is ignored');
});

test('parallax: the scenery ignores clicks, sits behind the content, and tiled layers are one tile wider than the screen', () => {
  const scenery = ruleBody(style, '.scenery');
  assert.match(scenery, /position:\s*fixed/);
  assert.match(scenery, /pointer-events:\s*none/);
  assert.match(scenery, /z-index:\s*0/);
  assert.match(ruleBody(style, '.main-content'), /z-index:\s*1/);
  const doc = pageDom('index.html');
  for (const name of ['clouds', 'hills', 'trees']) {
    const tile = doc.querySelector(`.scenery__layer--${name}`).dataset.parallaxTile;
    const rule = ruleBody(style, `.scenery__layer--${name}`);
    assert.ok(rule.includes(`calc(100% + ${tile}px)`), `${name} is ${tile}px wider than the screen`);
    assert.ok(rule.includes(`/ ${tile}px`), `${name} artwork is drawn at ${tile}px wide`);
    const svg = read('assets', `${name}.svg`);
    assert.ok(svg.includes(`width="${tile}"`), `${name}.svg is ${tile}px wide, matching the tile`);
  }
});

// A document with scenery and a scrollable graveyard, and a fake window we can drive.
function parallaxFixture({ reduced = false } = {}) {
  const dom = new JSDOM(read('index.html'));
  const doc = dom.window.document;
  const graveyard = doc.getElementById('graveyard');
  let scrollLeft = 0;
  Object.defineProperty(graveyard, 'scrollLeft', { get: () => scrollLeft, set: (v) => { scrollLeft = v; } });
  const win = {
    scrollX: 0,
    scrollY: 0,
    requestAnimationFrame: (callback) => callback(),
    matchMedia: () => ({ matches: reduced }),
    addEventListener: (...args) => dom.window.addEventListener(...args),
    removeEventListener: (...args) => dom.window.removeEventListener(...args),
  };
  const layer = (name) => doc.querySelector(`.scenery__layer--${name}`);
  const shift = (name) => /translate3d\((-?[\d.]+)px, (-?[\d.]+)px/.exec(layer(name).style.transform)?.slice(1).map(Number);
  return { dom, doc, graveyard, win, layer, shift, setScroll: (v) => { scrollLeft = v; } };
}
test('parallax: scrolling the graveyard sideways moves near layers further than far layers', async () => {
  const { initParallax } = await importUi('parallax.js');
  const f = parallaxFixture();
  initParallax(f.doc, f.win);
  assert.deepEqual(f.shift('trees'), [0, 0], 'starts at rest');
  f.setScroll(1000);
  f.graveyard.dispatchEvent(new f.dom.window.Event('scroll'));
  const [clouds, hills, trees] = ['clouds', 'hills', 'trees'].map((n) => Math.abs(f.shift(n)[0]));
  assert.ok(clouds < hills && hills < trees, `${clouds} < ${hills} < ${trees}`);
  assert.equal(trees, 300);
});

test('parallax: scrolling the page down moves the layers up, and scrolling back returns them', async () => {
  const { initParallax } = await importUi('parallax.js');
  const f = parallaxFixture();
  initParallax(f.doc, f.win);
  f.win.scrollY = 200;
  f.win.scrollX = 50;
  f.dom.window.dispatchEvent(new f.dom.window.Event('scroll'));
  const [x, y] = f.shift('trees');
  assert.ok(y < 0 && x < 0, `moved up and left: ${x}, ${y}`);
  f.win.scrollY = 0;
  f.win.scrollX = 0;
  f.dom.window.dispatchEvent(new f.dom.window.Event('scroll'));
  assert.deepEqual(f.shift('trees'), [0, 0]);
});

test('parallax: with reduced motion the layers never move', async () => {
  const { initParallax } = await importUi('parallax.js');
  const f = parallaxFixture({ reduced: true });
  initParallax(f.doc, f.win);
  f.setScroll(2000);
  f.win.scrollY = 300;
  f.graveyard.dispatchEvent(new f.dom.window.Event('scroll'));
  for (const name of ['moon', 'clouds', 'hills', 'trees']) {
    assert.equal(f.layer(name).style.transform, '', `${name} stays put`);
  }
});

test('parallax: a page without scenery is left alone, and destroy stops the movement', async () => {
  const { initParallax } = await importUi('parallax.js');
  const bare = new JSDOM('<!doctype html><main></main>').window.document;
  assert.equal(initParallax(bare, { matchMedia: () => ({ matches: false }) }), null);
  const f = parallaxFixture();
  const handle = initParallax(f.doc, f.win);
  f.setScroll(1000);
  handle.update();
  assert.notEqual(f.layer('trees').style.transform, '');
  handle.destroy();
  assert.equal(f.layer('trees').style.transform, '', 'layers return to rest');
  f.setScroll(3000);
  f.graveyard.dispatchEvent(new f.dom.window.Event('scroll'));
  assert.equal(f.layer('trees').style.transform, '', 'the listener is gone');
});

test('parallax: scroll events are batched into one frame', async () => {
  const { initParallax } = await importUi('parallax.js');
  const f = parallaxFixture();
  const queued = [];
  f.win.requestAnimationFrame = (callback) => queued.push(callback);
  initParallax(f.doc, f.win);
  for (let i = 0; i < 20; i++) f.graveyard.dispatchEvent(new f.dom.window.Event('scroll'));
  assert.equal(queued.length, 1, 'twenty scroll events ask for one frame');
  queued[0]();
  f.graveyard.dispatchEvent(new f.dom.window.Event('scroll'));
  assert.equal(queued.length, 2, 'the next scroll after the frame asks again');
});

// ---------------------------------------------------------------------------
// Task 38: wobbly stones
// ---------------------------------------------------------------------------

test('wobble: the tilt never goes past 2 degrees and does tilt both ways', () => {
  for (const name of ['stoneRumble', 'stoneRumbleTap']) {
    const body = keyframeBody(anim, name);
    const angles = [...body.matchAll(/rotate\((-?[\d.]+)deg\)/g)].map((m) => Number(m[1]));
    assert.ok(angles.length >= 5, `${name} has several jolts`);
    assert.ok(Math.max(...angles.map(Math.abs)) <= 2, `${name} stays within 2 degrees`);
    assert.ok(Math.max(...angles.map(Math.abs)) >= 1, `${name} tilts at least 1 degree`);
    assert.ok(angles.some((a) => a < 0) && angles.some((a) => a > 0), `${name} knocks left and right`);
  }
  assert.equal(
    keyframeBody(anim, 'stoneRumble').replace(/\s+/g, ' '),
    keyframeBody(anim, 'stoneRumbleTap').replace(/\s+/g, ' '),
    'the tap rumble is the same motion as the hover rumble'
  );
});

test('wobble: it only changes transform, so neighbours and the click target do not move', () => {
  for (const name of ['stoneRumble', 'stoneRumbleTap', 'fogDrift']) {
    const props = [...keyframeBody(anim, name).matchAll(/([a-z-]+)\s*:/g)].map((m) => m[1]);
    for (const prop of props) assert.ok(['transform', 'opacity'].includes(prop), `${name} animates ${prop}`);
  }
});

function wobbleFixture() {
  const dom = new JSDOM('<!doctype html><main id="root"><div id="row"><button class="tombstone" id="s1">One<span class="tombstone__fog" id="fog"></span></button></div><p id="plain">text</p></main>');
  const win = { matchMedia: () => ({ matches: false }) };
  return { dom, doc: dom.window.document, win };
}
const click = (dom, element, pointerType) => {
  const event = new dom.window.MouseEvent('click', { bubbles: true });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  element.dispatchEvent(event);
};

test('wobble: a touch tap adds the class, and the end of the animation removes it', async () => {
  const { initWobble, WOBBLE_CLASS } = await importUi('wobble.js');
  const { dom, doc, win } = wobbleFixture();
  initWobble(doc, win);
  const stone = doc.getElementById('s1');
  click(dom, stone, 'touch');
  assert.ok(stone.classList.contains(WOBBLE_CLASS));
  stone.dispatchEvent(new dom.window.Event('animationend'));
  assert.ok(!stone.classList.contains(WOBBLE_CLASS));
});

test('wobble: mouse clicks and keyboard activation do not add the class (CSS hover and focus cover them)', async () => {
  const { initWobble, WOBBLE_CLASS } = await importUi('wobble.js');
  const { dom, doc, win } = wobbleFixture();
  initWobble(doc, win);
  const stone = doc.getElementById('s1');
  click(dom, stone, 'mouse');
  click(dom, stone, '');
  click(dom, stone, undefined);
  assert.ok(!stone.classList.contains(WOBBLE_CLASS));
});

test('wobble: a pen tap counts as touch', async () => {
  const { initWobble, WOBBLE_CLASS } = await importUi('wobble.js');
  const { dom, doc, win } = wobbleFixture();
  initWobble(doc, win);
  click(dom, doc.getElementById('s1'), 'pen');
  assert.ok(doc.getElementById('s1').classList.contains(WOBBLE_CLASS));
});

test('wobble: tapping the fog on a stone wobbles the stone, and tapping elsewhere does nothing', async () => {
  const { initWobble, WOBBLE_CLASS } = await importUi('wobble.js');
  const { dom, doc, win } = wobbleFixture();
  initWobble(doc, win);
  click(dom, doc.getElementById('fog'), 'touch');
  assert.ok(doc.getElementById('s1').classList.contains(WOBBLE_CLASS));
  click(dom, doc.getElementById('plain'), 'touch');
  assert.equal(doc.querySelectorAll(`.${WOBBLE_CLASS}`).length, 1, 'only the stone');
});

test('wobble: stones added after start-up wobble too, and the listener can be removed', async () => {
  const { initWobble, WOBBLE_CLASS } = await importUi('wobble.js');
  const { dom, doc, win } = wobbleFixture();
  const stop = initWobble(doc, win);
  const late = doc.createElement('button');
  late.className = 'tombstone';
  doc.getElementById('row').append(late);
  click(dom, late, 'touch');
  assert.ok(late.classList.contains(WOBBLE_CLASS));
  late.classList.remove(WOBBLE_CLASS);
  stop();
  click(dom, late, 'touch');
  assert.ok(!late.classList.contains(WOBBLE_CLASS));
});

test('wobble: every tap replays it, because the class is removed and added again', async () => {
  const { wobbleStone, WOBBLE_CLASS } = await importUi('wobble.js');
  const { doc, win } = wobbleFixture();
  const stone = doc.getElementById('s1');
  const log = [];
  const { add, remove } = stone.classList;
  stone.classList.add = (name) => { log.push(`add ${name}`); add.call(stone.classList, name); };
  stone.classList.remove = (name) => { log.push(`remove ${name}`); remove.call(stone.classList, name); };
  assert.equal(wobbleStone(stone, win), true);
  assert.equal(wobbleStone(stone, win), true);
  assert.deepEqual(log, [
    `remove ${WOBBLE_CLASS}`, `add ${WOBBLE_CLASS}`,
    `remove ${WOBBLE_CLASS}`, `add ${WOBBLE_CLASS}`,
  ]);
  assert.ok(stone.classList.contains(WOBBLE_CLASS));
});

test('wobble: with reduced motion a tap does nothing', async () => {
  const { wobbleStone, initWobble, WOBBLE_CLASS } = await importUi('wobble.js');
  const { dom, doc } = wobbleFixture();
  const win = { matchMedia: () => ({ matches: true }) };
  initWobble(doc, win);
  click(dom, doc.getElementById('s1'), 'touch');
  assert.ok(!doc.getElementById('s1').classList.contains(WOBBLE_CLASS));
  assert.equal(wobbleStone(doc.getElementById('s1'), win), false);
});

test('wobble: the class goes away by itself if the browser never reports the end of the animation', async (t) => {
  const { wobbleStone, WOBBLE_CLASS, WOBBLE_FALLBACK_MS } = await importUi('wobble.js');
  const { doc, win } = wobbleFixture();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stone = doc.getElementById('s1');
  wobbleStone(stone, win);
  t.mock.timers.tick(WOBBLE_FALLBACK_MS - 1);
  assert.ok(stone.classList.contains(WOBBLE_CLASS), 'still playing just before the limit');
  t.mock.timers.tick(1);
  assert.ok(!stone.classList.contains(WOBBLE_CLASS));
});

test('wobble: a second tap is not cut short by the first tap\'s timer', async (t) => {
  const { wobbleStone, WOBBLE_CLASS, WOBBLE_FALLBACK_MS } = await importUi('wobble.js');
  const { doc, win } = wobbleFixture();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stone = doc.getElementById('s1');
  wobbleStone(stone, win);
  t.mock.timers.tick(500);
  wobbleStone(stone, win);
  t.mock.timers.tick(WOBBLE_FALLBACK_MS - 500 + 1);
  assert.ok(stone.classList.contains(WOBBLE_CLASS), 'the first timer was cancelled');
  t.mock.timers.tick(500);
  assert.ok(!stone.classList.contains(WOBBLE_CLASS));
});

test('wobble: reduced motion switches the hover, focus and tap rules off', () => {
  const reduced = anim.slice(anim.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
  for (const selector of ['.tombstone:hover', '.tombstone:focus-visible', '.tombstone.tombstone--wobble']) {
    assert.ok(reduced.includes(selector), `${selector} is in the reduced-motion list`);
  }
  assert.match(reduced, /animation:\s*none/);
});

// ---------------------------------------------------------------------------
// Task 39: gate dividers
// ---------------------------------------------------------------------------

const gate = read('assets', 'gate-divider.svg');

test('dividers: the only colour is dark charcoal #2E323E', () => {
  const colours = [...gate.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0].toLowerCase()).filter((c) => !gate.includes(`id="${c.slice(1)}"`));
  const real = colours.filter((c) => /^#[0-9a-f]{6}$/.test(c));
  assert.ok(real.length > 0);
  for (const colour of real) assert.equal(colour, '#2e323e');
  assert.doesNotMatch(gate, /rgb\(|rgba\(|hsl\(|fill="(?!none|#2E323E)[a-z]+"|stroke="(?!none|#2E323E)[a-z]+"/i);
});

test('dividers: any <hr> picks up the gate and repeats it sideways with no default border', () => {
  const rule = ruleBody(style, 'hr');
  assert.ok(rule, 'a global hr rule exists');
  assert.match(rule, /url\("\.\.\/assets\/gate-divider\.svg"\)/);
  assert.match(rule, /repeat-x/);
  assert.match(rule, /border:\s*0/);
  assert.ok(fs.existsSync(path.join(FRONTEND, 'assets', 'gate-divider.svg')));
});

test('dividers: the pages currently have no plain <hr>, and the rule needs no extra markup', () => {
  for (const page of PAGES) assert.doesNotMatch(read(page), /<hr[\s>]/i);
  const doc = new JSDOM('<!doctype html><section></section><hr><section></section>').window.document;
  assert.equal(doc.querySelectorAll('hr').length, 1, 'a bare <hr> is all that is needed');
});

// ---------------------------------------------------------------------------
// Task 40: drifting ground fog
// ---------------------------------------------------------------------------

test('fog: every college stone gets one hidden fog layer, and the name is unchanged', async () => {
  const dom = new JSDOM('<!doctype html><body></body>');
  globalThis.document = dom.window.document;
  const { createTombstoneCard } = await importUi('tombstone.js');
  const card = createTombstoneCard({ id: 'a1', name: 'Harvard University' });
  const stone = card.querySelector('.college-tombstone__stone');
  const fog = stone.querySelectorAll('.tombstone__fog');
  assert.equal(fog.length, 1);
  assert.equal(fog[0].getAttribute('aria-hidden'), 'true');
  assert.equal(fog[0].textContent, '');
  assert.equal(stone.textContent, 'Harvard University');
  assert.equal(card.children.length, 1, 'just the stone: delete lives in the detail dialog');
});

test('fog: a long, empty or odd name still gets exactly one fog layer', async () => {
  const dom = new JSDOM('<!doctype html><body></body>');
  globalThis.document = dom.window.document;
  const { createTombstoneCard } = await importUi('tombstone.js');
  for (const name of ['', '   ', 'A'.repeat(300), '<b>x</b>']) {
    const stone = createTombstoneCard({ id: 'x', name }).querySelector('.college-tombstone__stone');
    assert.equal(stone.querySelectorAll('.tombstone__fog').length, 1);
    assert.equal(stone.querySelector('b'), null, 'names are still text, not markup');
  }
});

test('fog: clicking the fog still selects the college', async () => {
  const dom = new JSDOM('<!doctype html><body></body>');
  globalThis.document = dom.window.document;
  const { createTombstoneCard } = await importUi('tombstone.js');
  const picked = [];
  const card = createTombstoneCard({ id: 'a1', name: 'MIT' }, { onSelect: (c) => picked.push(c.id) });
  card.querySelector('.tombstone__fog').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
  assert.deepEqual(picked, ['a1']);
});

test('fog: the Add College and Deadline Tracker stones have fog, and their labels are unchanged', () => {
  const doc = pageDom('index.html');
  for (const [id, label] of [['add-college-button', 'Add College'], ['deadline-tracker-link', 'Deadline Tracker']]) {
    const element = doc.getElementById(id);
    assert.equal(element.querySelectorAll('.tombstone__fog[aria-hidden="true"]').length, 1, id);
    assert.equal(element.textContent.trim(), label);
  }
});

test('fog: neighbouring cards drift out of step', () => {
  const second = ruleBody(anim, '.college-tombstone:nth-child(2n) .tombstone__fog');
  const third = ruleBody(anim, '.college-tombstone:nth-child(3n) .tombstone__fog');
  assert.match(second, /animation-delay:\s*-\d+s/);
  assert.match(third, /animation-delay:\s*-\d+s/);
  assert.notEqual(second.trim(), third.trim());
});

test('fog: reduced motion keeps the mist but stops it drifting', () => {
  const reduced = anim.slice(anim.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
  assert.ok(reduced.includes('.tombstone__fog'));
  assert.ok(reduced.includes('.scenery__fog'));
  assert.doesNotMatch(reduced, /display:\s*none|opacity:\s*0/, 'the mist stays visible');
});

test('fog: the shared strip sits above the grass line and behind the stones', () => {
  const rule = ruleBody(style, '.scenery__fog');
  assert.match(rule, /bottom:\s*calc\(var\(--ground-height\)/);
  assert.match(ruleBody(style, '.scenery'), /z-index:\s*0/);
  assert.match(ruleBody(style, '#graveyard'), /position:\s*relative/);
  assert.match(ruleBody(style, '.college-tombstones'), /z-index:\s*1/);
});

// ===========================================================================
// Pixel-art redesign (tasks 43 to 48)
// ===========================================================================
const { spawnSync } = require('node:child_process');
const os = require('node:os');

const ASSETS = path.join(FRONTEND, 'assets');
const svgFiles = () => fs.readdirSync(ASSETS).filter((f) => f.endsWith('.svg')).sort();
const rawStyle = read('css', 'style.css');
const rawAnim = read('css', 'animations.css');

// ---- Task 43: fonts, grid, palette, hard text shadows ----------------------

test('pixel fonts: the four woff2 files exist, and Fraunces is gone', () => {
  for (const file of ['silkscreen-latin-400-normal.woff2', 'silkscreen-latin-700-normal.woff2', 'pixelify-sans-latin-wght-normal.woff2', 'plus-jakarta-sans-latin-wght-normal.woff2']) {
    const bytes = fs.readFileSync(path.join(FRONTEND, 'fonts', file));
    assert.equal(bytes.subarray(0, 4).toString('ascii'), 'wOF2', `${file} is a woff2 file`);
    assert.ok(bytes.length > 5000, `${file} is not an empty stub`);
  }
  assert.ok(!fs.existsSync(path.join(FRONTEND, 'fonts', 'fraunces-latin-wght-normal.woff2')), 'the Fraunces file is removed');
  assert.doesNotMatch(rawStyle, /Fraunces/);
});

test('pixel fonts: every @font-face points at a real file and uses font-display: swap', () => {
  const faces = [...style.matchAll(/@font-face\s*\{([^}]*)\}/g)].map((m) => m[1]);
  const families = faces.map((f) => /font-family:\s*"([^"]+)"/.exec(f)[1]);
  assert.deepEqual(families.sort(), ['Pixelify Sans', 'Plus Jakarta Sans', 'Silkscreen', 'Silkscreen']);
  for (const face of faces) {
    const file = /url\("\.\.\/fonts\/([^"]+)"\)\s*format\("woff2"\)/.exec(face)?.[1];
    assert.ok(file && fs.existsSync(path.join(FRONTEND, 'fonts', file)), `a real font file: ${file}`);
    assert.match(face, /font-display:\s*swap/);
  }
});

test('pixel fonts: Silkscreen for title, buttons and labels; Pixelify Sans for headings, stones and dialog titles; Plus Jakarta Sans for the body', () => {
  const root = ruleBody(style, ':root');
  assert.match(/--font-pixel-small:\s*([^;]+);/.exec(root)[1], /^"Silkscreen", .*monospace$/);
  assert.match(/--font-pixel-heading:\s*([^;]+);/.exec(root)[1], /^"Pixelify Sans", .*monospace$/);
  assert.match(/--font-body:\s*([^;]+);/.exec(root)[1], /^"Plus Jakarta Sans", .*sans-serif$/);
  assert.match(ruleBody(style, 'body'), /font-family:\s*var\(--font-body\)/);
  assert.match(ruleBody(style, 'h1'), /font-family:\s*var\(--font-pixel-heading\)/);
  assert.match(ruleBody(style, '.site-title'), /font-family:\s*var\(--font-pixel-small\)/);
  assert.match(ruleBody(style, '.btn'), /font-family:\s*var\(--font-pixel-small\)/);
  assert.match(ruleBody(style, '.back-link'), /font-family:\s*var\(--font-pixel-small\)/);
  assert.match(ruleBody(style, '.tombstone'), /font-family:\s*var\(--font-pixel-heading\)/);
  assert.match(ruleBody(style, '.dialog-title'), /font-family:\s*var\(--font-pixel-heading\)/);
});

test('pixel grid: --px is 4px, and the palette variables are defined', () => {
  const root = ruleBody(style, ':root');
  assert.match(root, /--px:\s*4px;/);
  for (const name of ['--color-navy-900', '--color-indigo-700', '--color-charcoal', '--color-purple-600', '--color-royal', '--color-electric', '--color-cyan', '--color-teal', '--color-lavender', '--color-yellow', '--color-magenta']) {
    assert.match(root, new RegExp(`${name}:\\s*#[0-9a-f]{6};`), `${name} is a hex colour`);
  }
  assert.match(root, /--color-accent:\s*#ff8c1a;/, 'orange stays for now');
  assert.match(root, /--color-danger:\s*#c42424;/, 'red stays for now');
});

// Splits a shadow list at the commas that sit outside brackets.
function splitShadows(value) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const ch of value) {
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) { parts.push(current.trim()); current = ''; } else current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}
// The blur radius of one shadow ("x y blur [spread] colour"), or 0 when it has none.
function blurOf(shadow) {
  const lengths = shadow.replace(/calc\([^()]*(?:\([^()]*\))?[^()]*\)/g, '4px').replace(/var\([^)]*\)/g, '4px').replace(/rgba?\([^)]*\)/g, '').replace(/#[0-9a-f]{3,8}/gi, '').replace(/\binset\b/g, '').trim().split(/\s+/).filter(Boolean);
  if (lengths.length < 3) return 0;
  return parseFloat(lengths[2]);
}

test('hard edges: every text-shadow, box-shadow and drop-shadow has a blur of zero', () => {
  const found = [];
  for (const [file, css] of [['style.css', style], ['animations.css', anim]]) {
    for (const m of css.matchAll(/(--text-[a-z-]+|--shadow-[a-z-]+|text-shadow|box-shadow)\s*:\s*([^;]+);/g)) {
      if (/^var\(/.test(m[2].trim()) || m[2].trim() === 'none') continue;
      for (const shadow of splitShadows(m[2])) found.push([file, m[1], shadow]);
    }
    for (const m of css.matchAll(/drop-shadow\(([^)]*(?:\([^)]*\)[^)]*)*)\)/g)) found.push([file, 'drop-shadow', m[1]]);
  }
  assert.ok(found.length > 15, `checked ${found.length} shadows`);
  for (const [file, prop, shadow] of found) {
    if (/^var\(/.test(shadow)) continue;
    assert.equal(blurOf(shadow), 0, `${file} ${prop}: "${shadow}" must not blur`);
  }
});

test('hard edges: no blur filter, no radial or conic gradient, no rounded corner, no smoothing', () => {
  for (const [file, css] of [['style.css', style], ['animations.css', anim]]) {
    assert.doesNotMatch(css, /blur\(/, `${file} has no blur()`);
    assert.doesNotMatch(css, /radial-gradient|conic-gradient/, `${file} has no radial or conic gradient`);
    assert.doesNotMatch(css, /backdrop-filter/, `${file} has no backdrop filter`);
    assert.doesNotMatch(css, /image-rendering:\s*(auto|smooth)/, `${file} never smooths art`);
  }
  for (const m of style.matchAll(/border-radius:\s*([^;]+);/g)) assert.match(m[1].trim(), /^0(px)?$/, `border-radius ${m[1]}`);
  const sprites = style.match(/image-rendering:\s*pixelated/g) || [];
  assert.ok(sprites.length >= 12, `${sprites.length} rules keep sprites pixelated`);
});

test('hard edges: every linear-gradient is made of hard-stop bands', () => {
  const gradients = [...style.matchAll(/linear-gradient\(([^;]*?)\)\s*[;,]/g)].map((m) => m[1]);
  assert.ok(gradients.length >= 2, 'the sky and the header are bands');
  for (const gradient of gradients) {
    const stops = gradient.split(',').slice(1).map((s) => s.trim());
    for (const stop of stops) assert.match(stop, /\s(0|[\d.]+%)\s+[\d.]+%$/, `"${stop}" has two positions, so the band has a hard edge`);
  }
});

test('hard edges: motion in transitions and animations moves in steps', () => {
  for (const m of style.matchAll(/transition:\s*([^;]+);/g)) assert.match(m[1], /steps\(/, `style.css transition "${m[1]}"`);
  for (const m of anim.matchAll(/(?<![\w-])animation:\s*([^;]+);/g)) {
    if (m[1].trim() === 'none') continue;
    assert.match(m[1], /steps\(/, `animation "${m[1]}"`);
  }
});

// ---- Task 43: the asset tool -----------------------------------------------

test('assets: re-running the generator writes byte-identical files, and nothing else is in the folder', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pixel-assets-'));
  try {
    const run = spawnSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'make-pixel-assets.js')], { env: { ...process.env, ASSET_OUT_DIR: out }, encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);
    const generated = fs.readdirSync(out).sort();
    assert.deepEqual(generated, fs.readdirSync(ASSETS).sort(), 'same set of files');
    for (const file of generated) {
      assert.equal(fs.readFileSync(path.join(out, file), 'utf8'), fs.readFileSync(path.join(ASSETS, file), 'utf8'), `${file} is up to date. Run: npm run assets`);
    }
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});

test('assets: every SVG is crisp, sized in whole 4 px art pixels, and uses only flat fills', () => {
  const files = svgFiles();
  assert.ok(files.length >= 20, `${files.length} files`);
  for (const file of files) {
    const svg = fs.readFileSync(path.join(ASSETS, file), 'utf8');
    assert.match(svg, /shape-rendering="crispEdges"/, `${file} is crisp`);
    const [, w, h] = /viewBox="0 0 (\d+) (\d+)"/.exec(svg) || [];
    assert.ok(w && h, `${file} has an integer viewBox`);
    assert.match(svg, new RegExp(`width="${w * 4}" height="${h * 4}"`), `${file} is ${w} x ${h} art pixels at 4 px each`);
    assert.doesNotMatch(svg, /<(filter|linearGradient|radialGradient|image|script|style|text|circle|ellipse)\b|onload|href=/i, `${file} has no filters, gradients, images or scripts`);
    assert.doesNotMatch(svg, /[0-9]\.[0-9]+[hv ]|d="[^"]*\d\.\d/, `${file} paths use whole art pixels only`);
    for (const m of svg.matchAll(/fill="(#[0-9a-f]{6})"/g)) assert.ok(m[1], 'hex colours only');
  }
});

test('assets: every file the CSS refers to exists', () => {
  const urls = [...rawStyle.matchAll(/url\("\.\.\/([^"]+)"\)/g)].map((m) => m[1]);
  assert.ok(urls.length >= 25, `${urls.length} references`);
  for (const url of urls) assert.ok(fs.existsSync(path.join(FRONTEND, url)), `${url} exists`);
  const used = new Set(urls.map((u) => path.basename(u)));
  for (const file of svgFiles()) assert.ok(used.has(file), `${file} is used by the stylesheet`);
});

test('assets: the moon has craters and hard glow rings, and the environment layers are all there', () => {
  const moonSvg = fs.readFileSync(path.join(ASSETS, 'moon.svg'), 'utf8');
  assert.match(moonSvg, /fill="#b79f66"/, 'crater colour');
  assert.equal((moonSvg.match(/fill-opacity=/g) || []).length, 3, 'three glow rings');
  const doc = pageDom('index.html');
  for (const name of ['moon', 'clouds', 'hills', 'trees']) assert.ok(doc.querySelector(`.scenery__layer--${name}`), name);
  assert.match(ruleBody(style, '.scenery__moon'), /url\("\.\.\/assets\/moon\.svg"\)/);
  assert.match(ruleBody(style, '.scenery__layer--clouds'), /clouds\.svg/);
  assert.match(ruleBody(style, '.scenery__layer--hills'), /hills\.svg/);
  assert.match(ruleBody(style, '.scenery__layer--trees'), /trees\.svg/);
  assert.match(ruleBody(style, '#graveyard'), /ground\.svg/);
  const trees = fs.readFileSync(path.join(ASSETS, 'trees.svg'), 'utf8');
  assert.ok(trees.length > 8000, 'trees, fence, gate, bushes and markers are drawn into one tile');
});

function cellsOf(svg) {
  const cells = new Set();
  for (const d of svg.matchAll(/d="([^"]+)"/g)) {
    for (const r of d[1].matchAll(/M(\d+) (\d+)h(\d+)v(\d+)h-\d+z/g)) {
      const [x, y, w, h] = r.slice(1).map(Number);
      for (let i = 0; i < w; i += 1) for (let j = 0; j < h; j += 1) cells.add(`${x + i},${y + j}`);
    }
  }
  return cells;
}

test('assets: the gate divider is 160 x 48, charcoal only, and its bars repeat with no seam', () => {
  const svg = fs.readFileSync(path.join(ASSETS, 'gate-divider.svg'), 'utf8');
  assert.match(svg, /viewBox="0 0 40 12" width="160" height="48"/);
  assert.deepEqual([...svg.matchAll(/fill="(#[0-9a-f]{6})"/g)].map((m) => m[1]), ['#2e323e'], 'one colour: #2E323E');
  const cells = cellsOf(svg);
  const bottom = [...Array(40).keys()].filter((x) => cells.has(`${x},11`));
  assert.deepEqual(bottom, [2, 7, 12, 19, 20, 27, 32, 37], 'six bars and the centre post');
  const wrap = bottom[0] + 40 - bottom[bottom.length - 1];
  assert.equal(wrap, 5, 'the gap across the tile edge equals the usual bar gap, so the repeat has no seam');
  assert.ok([2, 7, 12, 27, 32, 37].every((x) => cells.has(`${x},0`)), 'every bar ends in a spearhead tip');
  assert.ok([1, 2, 3].every((n) => cells.has(`${2 - 1 + n - 1},1`)), 'the tip widens below the point');
  assert.ok([...cells].some((c) => { const [x, y] = c.split(',').map(Number); return x > 13 && x < 18 && y >= 5 && y <= 8; }), 'scrollwork beside the post');
  assert.ok(cells.has('0,4') && cells.has('39,9'), 'rails run edge to edge');
});

test('assets: the stones have an outline, a bevel, three flat shading bands and the right sizes', () => {
  const sizes = { 'stone-rounded.svg': [38, 52], 'stone-slab.svg': [42, 38], 'stone-cross.svg': [44, 56], 'stone-pointed.svg': [38, 54], 'stone-arched.svg': [38, 46], 'stone-mini.svg': [22, 26] };
  for (const [file, [w, h]] of Object.entries(sizes)) {
    const svg = fs.readFileSync(path.join(ASSETS, file), 'utf8');
    assert.match(svg, new RegExp(`viewBox="0 0 ${w} ${h}"`), file);
    for (const colour of ['#2b352c', '#c4d2c6', '#586859', '#9eada0', '#8e9d90', '#808f83']) assert.ok(svg.includes(colour), `${file} uses ${colour}`);
  }
  assert.ok(fs.readFileSync(path.join(ASSETS, 'stone-rounded-add.svg'), 'utf8').includes('#d4600a'), 'orange edge');
  assert.ok(fs.readFileSync(path.join(ASSETS, 'stone-rounded-deadline.svg'), 'utf8').includes('#7a4aa8'), 'purple edge');
  assert.ok(fs.readFileSync(path.join(ASSETS, 'stone-rounded-submitted.svg'), 'utf8').includes('#7fbf5a'), 'green edge');
  const rounded = cellsOf(fs.readFileSync(path.join(ASSETS, 'stone-rounded.svg'), 'utf8'));
  assert.ok(!rounded.has('0,0') && !rounded.has('37,0'), 'the top corners are cut away');
  assert.ok(rounded.has('0,51') && rounded.has('37,51'), 'the base is square');
  const row = (y) => [...Array(38).keys()].filter((x) => rounded.has(`${x},${y}`)).length;
  assert.ok(row(0) < row(6) && row(6) < row(14) && row(14) <= 38, 'the arch widens in steps');
});

// ---- Task 44 to 46: tombstones, interface, contrast ------------------------

test('stones: every shape has its own sprite, and the special stones keep distinct edges', () => {
  assert.match(ruleBody(style, '.tombstone::before'), /stone-rounded\.svg/);
  assert.match(ruleBody(style, '.tombstone--slab::before'), /stone-slab\.svg/);
  assert.match(ruleBody(style, '.tombstone--pointed::before'), /stone-pointed\.svg/);
  assert.match(ruleBody(style, '.tombstone--cross::before'), /stone-cross\.svg/);
  assert.match(ruleBody(style, '.tombstone--arched::before'), /stone-arched\.svg/);
  assert.match(ruleBody(style, '.tombstone--add::before'), /stone-rounded-add\.svg/);
  assert.match(ruleBody(style, '.tombstone--deadline::before'), /stone-rounded-deadline\.svg/);
  assert.match(ruleBody(style, '.tombstone--submitted::before'), /stone-rounded-submitted\.svg/);
  assert.match(ruleBody(style, '.tombstone::after'), /stone-wear\.svg/, 'cracks, chips and moss');
  assert.match(ruleBody(style, '.tombstone--hover') ?? ruleBody(style, '.tombstone:hover'), /translateY\(-8px\)/, 'the hover lift is two art pixels');
});

test('stones: a tombstone name never has a shadow with blur, and dark text is used on the light stone', () => {
  const stone = ruleBody(style, '.tombstone');
  assert.match(stone, /color:\s*var\(--color-text-dark\)/);
  assert.match(stone, /text-shadow:\s*var\(--text-emboss-stone\)/);
  assert.equal(blurOf('0 1px 0 rgba(255, 255, 255, 0.55)'), 0);
});

test('interface: buttons have five different states, and delete and submit stay red and orange', () => {
  assert.ok(ruleBody(style, '.btn'), 'default');
  assert.ok(ruleBody(style, '.btn:hover:not(:disabled)'), 'hover');
  assert.ok(ruleBody(style, '.btn:focus-visible'), 'focus');
  assert.ok(ruleBody(style, '.btn:active:not(:disabled)'), 'active');
  assert.ok(ruleBody(style, '.btn:disabled'), 'disabled');
  const bg = (selector) => /background:\s*([^;]+);/.exec(ruleBody(style, selector))[1].trim();
  const states = [bg('.btn'), bg('.btn:hover:not(:disabled)'), bg('.btn:disabled')];
  assert.equal(new Set(states).size, 3, `different fills: ${states.join(' | ')}`);
  assert.match(ruleBody(style, '.btn:focus-visible'), /outline:\s*var\(--px\) solid var\(--color-yellow\)/, 'a visible yellow focus frame');
  assert.match(ruleBody(style, '.btn:active:not(:disabled)'), /translateY\(var\(--px\)\)/, 'pressed down one art pixel');
  assert.match(ruleBody(style, '.btn--delete'), /background:\s*var\(--color-danger\)/);
  assert.match(ruleBody(style, '.btn--submit'), /background:\s*var\(--color-accent\)/);
});

test('interface: dialogs are retro dialogue boxes with a pixel border, an inner frame and a hard shadow', () => {
  const dialog = ruleBody(style, '#college-detail-dialog');
  assert.match(dialog, /border:\s*var\(--px\) solid/);
  assert.match(dialog, /box-shadow:[\s\S]*inset 0 0 0 var\(--px\) var\(--color-royal\)[\s\S]*var\(--shadow-drop\)/);
  assert.match(dialog, /border-radius:\s*0/);
  assert.match(ruleBody(style, ':root'), /--shadow-drop:\s*8px 8px 0 /);
});

// WCAG contrast ratio between two hex colours.
function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const root = ruleBody(style, ':root');
const colour = (name) => /#[0-9a-f]{6}/i.exec(new RegExp(`${name}:\\s*([^;]+);`).exec(root)[1])[0];

test('contrast: text and controls reach 4.5:1 against their backgrounds', () => {
  const stone = fs.readFileSync(path.join(ASSETS, 'stone-rounded.svg'), 'utf8');
  const stoneFills = ['#9eada0', '#8e9d90', '#808f83'].filter((c) => stone.includes(c));
  const pairs = [
    ['dialog text', colour('--color-ink'), colour('--color-indigo-700')],
    ['dialog labels (soft)', colour('--color-ink-soft'), colour('--color-indigo-700')],
    ['dialog highlight text', colour('--color-link'), colour('--color-indigo-700')],
    ['field text', colour('--color-ink'), colour('--color-parchment-field')],
    ['button text', colour('--color-ink'), colour('--color-parchment-field')],
    ['button hover', '#ffffff', colour('--color-electric')],
    ['submit button', colour('--color-text-dark'), colour('--color-accent')],
    ['submit hover', colour('--color-text-dark'), '#ffa94d'],
    ['delete button', '#ffffff', colour('--color-danger')],
    ['delete hover', '#ffffff', '#9c1818'],
    ['pressed status', colour('--color-text-dark'), colour('--color-yellow')],
    ['suggestion hover', '#ffffff', colour('--color-electric')],
    ['title on header', colour('--color-accent'), '#3e1a5c'],
    ['tagline on header', colour('--color-header-text'), '#2a1040'],
    ['back link on header', '#ffb35c', '#2a1040'],
    ['sunflower name on the centre', '#ffffff', '#6b3f00'],
    ['deadline heading on the sky', colour('--color-header-text'), '#0a1228'],
    ['lane message on the sky', '#ffffff', '#0a1228'],
    ['days label on its dark chip', '#ffffff', '#05080f'],
    ...stoneFills.map((fill) => [`stone name on ${fill}`, colour('--color-text-dark'), fill]),
    ['submitted check on the stone', '#123a08', '#9eada0'],
  ];
  const failures = pairs.map(([label, fg, bg]) => [label, contrast(fg, bg)]).filter(([, ratio]) => ratio < 4.5);
  assert.deepEqual(failures.map(([l, r]) => `${l}: ${r.toFixed(2)}`), [], 'every pair is at least 4.5:1');
  assert.equal(stoneFills.length, 3, 'all three stone bands were checked');
  assert.ok(contrast('#ffffff', '#6fb04a') < 4.5, 'sanity check: white on bare lawn would fail, which is why the days label has a dark chip');
});

test('contrast: the days label sits on a dark chip, and the check mark colour matches the tested one', () => {
  const days = ruleBody(style, '.deadline-lane__days');
  assert.match(days, /background:\s*#05080f/);
  assert.match(days, /z-index:\s*2/, 'above the sunflower and the tombstone');
  assert.match(ruleBody(style, '.tombstone__check'), /color:\s*#123a08/);
});

// ---- Task 47: the pixel lawn ------------------------------------------------

test('lawn: the zombie is one sprite element, the sunflower and lawn are sprites, and the lanes keep their structure', async () => {
  const dom = new JSDOM('<!doctype html><body></body>');
  globalThis.document = dom.window.document;
  const { buildZombie } = await importUi('deadline-tracker.js');
  const zombie = buildZombie('Yale');
  assert.equal(zombie.children.length, 0, 'no body-part spans');
  assert.equal(zombie.getAttribute('role'), 'img');
  assert.equal(zombie.getAttribute('aria-label'), 'Zombie heading toward Yale');
  assert.ok(zombie.classList.contains('zombie--walking') && zombie.classList.contains('lane-marker'));
  assert.match(ruleBody(style, '.zombie'), /url\("\.\.\/assets\/zombie\.svg"\)/);
  assert.match(ruleBody(style, '.lane-sunflower'), /url\("\.\.\/assets\/sunflower\.svg"\)/);
  assert.match(ruleBody(style, '.deadline-lane__strip'), /url\("\.\.\/assets\/lawn\.svg"\)/);
  assert.doesNotMatch(style, /zombie__/, 'the old body-part rules are gone');
  assert.match(ruleBody(style, '.deadline-lane__rail'), /transition:\s*transform 0\.8s steps\(16, end\)/, 'the zombie still moves by transform, now in steps');
});

test('lawn: the zombie, sunflower and lawn are drawn on the grid at the sizes the CSS gives them', () => {
  const size = (file) => /width="(\d+)" height="(\d+)"/.exec(fs.readFileSync(path.join(ASSETS, file), 'utf8')).slice(1).map(Number);
  assert.deepEqual(size('zombie.svg'), [64, 100], '4rem x 6.25rem');
  assert.deepEqual(size('sunflower.svg'), [120, 120], '7.5rem square');
  assert.deepEqual(size('lawn.svg'), [64, 64], 'matches the 64 px lawn tile in the CSS');
  assert.match(ruleBody(style, '.zombie'), /width:\s*4rem;[\s\S]*height:\s*6\.25rem/);
});

// ---- Task 45: animation -----------------------------------------------------

test('motion: the parallax moves layers in whole art pixels', async () => {
  const { layerOffset, PIXEL } = await importUi('parallax.js');
  assert.equal(PIXEL, 4);
  for (const scroll of [0, 1, 3, 7, 99, 1234, 56789]) {
    for (const speed of [0.03, 0.08, 0.15, 0.3]) {
      const { x, y } = layerOffset(scroll, scroll, speed, 1400);
      assert.equal(Math.abs(x) % 4, 0, `x ${x} at scroll ${scroll} speed ${speed}`);
      assert.equal(Math.abs(y) % 4, 0, `y ${y}`);
    }
  }
  assert.equal(layerOffset(1, 1, 0.3, 1400).x, 0, 'a tiny scroll does not move the layer a fraction of a pixel');
});

test('motion: the fog and the stones jump in 4 px steps, and every keyframe move is a multiple of 4', () => {
  for (const name of ['fogDrift', 'fogDriftWide', 'zombieWalk', 'cardReveal', 'dirtBurst']) {
    const body = keyframeBody(anim, name);
    for (const m of body.matchAll(/translate[XY]?\(\s*(-?\d+)px/g)) assert.equal(Math.abs(Number(m[1])) % 4, 0, `${name}: ${m[0]}`);
  }
  for (const name of ['stoneRumble', 'stoneRumbleTap']) {
    for (const m of keyframeBody(anim, name).matchAll(/([+-]) (\d+)px\)/g)) assert.equal(Number(m[2]) % 4, 0, `${name}: ${m[0]}`);
  }
  assert.match(ruleBody(anim, '.tombstone__fog'), /fogDrift 24s steps\(8, end\) infinite alternate/);
  assert.match(ruleBody(anim, '.scenery__fog'), /fogDriftWide 45s steps\(60, end\) infinite alternate/);
  const travel = (name) => { const nums = [...keyframeBody(anim, name).matchAll(/translateX\((-?\d+)px\)/g)].map((m) => Number(m[1])); return nums[1] - nums[0]; };
  assert.equal(travel('fogDrift') / 8, 4, 'the card mist moves 4 px per step');
  assert.equal(travel('fogDriftWide') / 60, 4, 'the wide strip moves 4 px per step');
  assert.match(ruleBody(anim, '.tombstone:hover'), /stoneRumble 0\.45s steps\(1, end\)/, 'each pose is held, like frames');
  assert.match(ruleBody(anim, '.tombstone--reveal'), /0\.3s steps\(5, end\)/);
});

test('motion: every new animated selector is in the reduced-motion list', () => {
  const reduced = anim.slice(anim.lastIndexOf('@media (prefers-reduced-motion: reduce)'));
  for (const selector of ['.zombie--walking', '.tombstone--reveal', '.zombie--defeated', '.dirt-burst::before', '.dirt-burst::after', '.dialog--fade-in', '.search-spinner', '.tombstone', '.tombstone__fog', '.scenery__fog', '.deadline-lane__rail', '.deadline-lane__days']) {
    assert.ok(reduced.includes(selector), `${selector} is listed`);
  }
});

test('mist: the sprites are semi-transparent hard pixels, and the dither is uneven', () => {
  for (const file of ['mist.svg', 'mist-strip.svg']) {
    const svg = fs.readFileSync(path.join(ASSETS, file), 'utf8');
    const opacities = [...svg.matchAll(/fill-opacity="([\d.]+)"/g)].map((m) => Number(m[1]));
    assert.equal(opacities.length, 2, `${file} has a dense and a thin layer`);
    assert.ok(opacities.every((o) => o > 0 && o < 1), `${file} is see-through`);
    const cells = cellsOf(svg);
    const [, w, h] = /viewBox="0 0 (\d+) (\d+)"/.exec(svg).map(Number);
    const top = [...cells].filter((c) => Number(c.split(',')[1]) < h / 4).length;
    const bottom = [...cells].filter((c) => Number(c.split(',')[1]) >= (h * 3) / 4).length;
    assert.ok(bottom > top * 2, `${file} is denser at the bottom (${bottom} vs ${top})`);
    assert.ok(cells.size < w * h * 0.7, `${file} is not solid`);
  }
});
