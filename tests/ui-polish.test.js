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

test('fonts: both font files exist and are real woff2 files', () => {
  for (const file of ['fraunces-latin-wght-normal.woff2', 'plus-jakarta-sans-latin-wght-normal.woff2']) {
    const bytes = fs.readFileSync(path.join(FRONTEND, 'fonts', file));
    assert.equal(bytes.subarray(0, 4).toString('ascii'), 'wOF2', `${file} starts with the woff2 signature`);
    assert.ok(bytes.length > 10000, `${file} is not an empty stub`);
  }
});

test('fonts: @font-face rules point at those files and use font-display: swap', () => {
  for (const [family, file] of [['Fraunces', 'fraunces-latin-wght-normal.woff2'], ['Plus Jakarta Sans', 'plus-jakarta-sans-latin-wght-normal.woff2']]) {
    const block = new RegExp(`@font-face\\s*\\{[^}]*font-family:\\s*"${family}"[^}]*\\}`).exec(style)?.[0];
    assert.ok(block, `${family} has an @font-face rule`);
    assert.ok(block.includes(`../fonts/${file}`), `${family} loads ${file}`);
    assert.match(block, /font-display:\s*swap/, `${family} shows fallback text while loading`);
    assert.match(block, /format\("woff2"\)/);
  }
});

test('fonts: Fraunces for display with a serif fallback, Plus Jakarta Sans for body with a sans-serif fallback', () => {
  const root = ruleBody(style, ':root');
  const display = /--font-display:\s*([^;]+);/.exec(root)[1];
  const body = /--font-body:\s*([^;]+);/.exec(root)[1];
  assert.match(display, /^"Fraunces",/);
  assert.match(display, /serif$/);
  assert.match(body, /^"Plus Jakarta Sans",/);
  assert.match(body, /sans-serif$/);
});

test('fonts: body text uses the body font, headings and tombstone names use the display font', () => {
  assert.match(ruleBody(style, 'body'), /font-family:\s*var\(--font-body\)/);
  const headings = ruleBody(style, 'h1');
  assert.ok(headings, 'h1 shares a rule with the other headings');
  assert.match(headings, /font-family:\s*var\(--font-display\)/);
  for (const tag of ['h2', 'h3', 'h4']) assert.ok(style.includes(`${tag},`) || style.includes(`${tag} {`), `${tag} is covered`);
  assert.match(ruleBody(style, '.tombstone'), /font-family:\s*var\(--font-display\)/);
  assert.doesNotMatch(style, /font-family:\s*Georgia/, 'the old Georgia stack is gone');
});

test('fonts: nothing is loaded from another host, so the content security policy stays on self', () => {
  assert.doesNotMatch(style, /@import/);
  assert.doesNotMatch(style, /url\(\s*["']?https?:/);
  for (const page of PAGES) {
    assert.doesNotMatch(read(page), /(href|src)="https?:/, `${page} has no external resources`);
  }
});

test('emboss: the white outline stays and a dark offset shadow is added', () => {
  const root = ruleBody(style, ':root');
  const emboss = /--text-emboss:\s*([^;]+);/.exec(root)[1];
  assert.match(emboss, /var\(--text-outline\)/, 'requirements 3.4 outline is kept');
  assert.match(emboss, /\d+px \d+px \d+px rgba\(0, 0, 0, 0\.\d+\)/, 'a dark shadow offset down and right');
});

test('emboss: title, tombstones and the deadline heading use it, and dialog titles use the parchment version', () => {
  assert.match(ruleBody(style, '.site-title'), /text-shadow:\s*var\(--text-emboss\)/);
  assert.match(ruleBody(style, '.tombstone'), /text-shadow:\s*var\(--text-emboss\)/);
  assert.match(ruleBody(style, '#deadline-page-heading'), /text-shadow:\s*var\(--text-emboss\)/);
  assert.match(ruleBody(style, '#add-college-title'), /text-shadow:\s*var\(--text-emboss-parchment\)/);
  const parchment = /--text-emboss-parchment:\s*([^;]+);/.exec(ruleBody(style, ':root'))[1];
  assert.match(parchment, /rgba\(255, 255, 255/, 'a light edge');
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

test('parallax: the moon moved out of the graveyard into the scenery', () => {
  assert.doesNotMatch(style, /#graveyard::before/);
  assert.doesNotMatch(style, /\.graveyard::after/);
  assert.ok(ruleBody(style, '.scenery__moon::before'), 'the lit disc and glow');
  assert.match(ruleBody(style, '.scenery__moon::before'), /box-shadow:[\s\S]*0 0 90px/, 'the glow is kept');
  assert.ok(ruleBody(style, '.scenery__moon::after'), 'the craters');
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

test('wobble: hover and keyboard focus play it, pivoting on the base and keeping the hover lift', () => {
  const rule = ruleBody(anim, '.tombstone:hover');
  assert.ok(rule && ruleBody(anim, '.tombstone:focus-visible'), 'hover and focus share a rule');
  assert.match(rule, /animation:\s*stoneRumble\s+0\.\d+s/, 'short, under a second');
  assert.match(rule, /transform-origin:\s*50% 100%/);
  assert.match(rule, /--stone-lift:\s*-6px/);
  assert.match(ruleBody(style, '.tombstone:hover'), /translateY\(-6px\)/, 'the hover lift matches the rumble baseline');
  assert.ok(keyframeBody(anim, 'stoneRumble').includes('var(--stone-lift, 0px)'));
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

test('dividers: the gate SVG is a small, self-contained file with a viewBox', () => {
  assert.match(gate, /^<svg [^>]*xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(gate, /viewBox="0 0 160 48"/);
  assert.ok(gate.length < 4000, 'small enough to cost nothing');
  assert.doesNotMatch(gate, /<script|onload|<image|href="(?!#)/i, 'no scripts or outside references');
});

test('dividers: the only colour is dark charcoal #2E323E', () => {
  const colours = [...gate.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0].toLowerCase()).filter((c) => !gate.includes(`id="${c.slice(1)}"`));
  const real = colours.filter((c) => /^#[0-9a-f]{6}$/.test(c));
  assert.ok(real.length > 0);
  for (const colour of real) assert.equal(colour, '#2e323e');
  assert.doesNotMatch(gate, /rgb\(|rgba\(|hsl\(|fill="(?!none|#2E323E)[a-z]+"|stroke="(?!none|#2E323E)[a-z]+"/i);
});

test('dividers: it draws thin bars, spearhead tips and scrollwork', () => {
  assert.ok((gate.match(/<use /g) || []).length >= 5, 'the bar is repeated across the gate');
  assert.match(gate, /<rect[^>]*width="1\.6"/, 'thin vertical bars');
  assert.match(gate, /<path d="M12,0 L16,10 L12,8 L8,10 Z"\/>/, 'a spearhead tip');
  assert.match(gate, /<path d="M73,28 C/, 'curved scrollwork');
});

test('dividers: bars stay evenly spaced across the tile edge, so the repeat has no seam', () => {
  const xs = [12, ...[...gate.matchAll(/<use href="#bar" x="(\d+)"/g)].map((m) => 12 + Number(m[1]))].sort((a, b) => a - b);
  assert.deepEqual(xs, [12, 36, 60, 100, 124, 148]);
  const gaps = xs.slice(1).map((x, i) => x - xs[i]);
  assert.ok(gaps.every((g) => g === 24 || g === 40), 'gaps are 24, or 40 around the centre post');
  assert.equal(160 - 148 + 12, 24, 'last bar to the first bar of the next tile is also 24');
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
  assert.equal(card.children.length, 2, 'still just the stone and the delete button');
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

test('fog: it is a blurred, semi-transparent layer that lets clicks through', () => {
  for (const selector of ['.tombstone__fog', '.scenery__fog']) {
    const rule = ruleBody(style, selector);
    assert.match(rule, /position:\s*absolute/, selector);
    assert.match(rule, /filter:\s*blur\(\d+px\)/, `${selector} is blurred`);
    assert.match(rule, /radial-gradient\([^)]*rgba\([^)]*0\.\d+\)/, `${selector} is semi-transparent`);
    assert.match(rule, /(linear-gradient\(to top|radial-gradient\(ellipse 50% 100% at 50% 100%)/, `${selector} is thickest at the bottom`);
  }
  assert.match(ruleBody(style, '.tombstone__fog'), /pointer-events:\s*none/);
  assert.match(ruleBody(style, '.tombstone__fog'), /bottom:\s*-/, 'it spills below the stone base');
  assert.match(ruleBody(style, '.tombstone__fog'), /left:\s*-\d+%/, 'it is wider than the stone');
});

test('fog: it drifts slowly sideways and back, and only moves with transform and opacity', () => {
  const body = keyframeBody(anim, 'fogDrift');
  assert.match(body, /translateX\(-\d+%\)/);
  assert.match(body, /translateX\(\d+%\)/);
  for (const selector of ['.tombstone__fog', '.scenery__fog']) {
    const rule = ruleBody(anim, selector);
    const seconds = Number(/fogDrift\s+(\d+)s/.exec(rule)?.[1]);
    assert.ok(seconds >= 20, `${selector} takes ${seconds}s per pass`);
    assert.match(rule, /infinite alternate/);
  }
  assert.ok(Number(/fogDrift\s+(\d+)s/.exec(ruleBody(anim, '.scenery__fog'))[1]) > Number(/fogDrift\s+(\d+)s/.exec(ruleBody(anim, '.tombstone__fog'))[1]), 'the background strip drifts slowest');
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
