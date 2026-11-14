// Task 12 checks: CSS animations and reduced-motion handling.
// Uses Node's built-in test runner. Run with: node --test tests/
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const FRONTEND = path.join(__dirname, '..', 'frontend');
const read = (rel) => fs.readFileSync(path.join(FRONTEND, rel), 'utf8');
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

// Splits CSS into top-level blocks, keeping the prelude (selector or at-rule)
// and the body text between the braces. Brace matching handles nested blocks.
function parseBlocks(css) {
  const blocks = [];
  let depth = 0;
  let start = 0;
  let open = -1;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '{') {
      if (depth === 0) open = i;
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0) {
        blocks.push({
          prelude: css.slice(start, open).trim(),
          body: css.slice(open + 1, i),
        });
        start = i + 1;
      }
    }
  }
  return blocks;
}

// Returns a map of property -> value for the declarations in a block body.
function declarations(body) {
  const map = {};
  for (const decl of body.split(';')) {
    const idx = decl.indexOf(':');
    if (idx === -1) continue;
    map[decl.slice(0, idx).trim()] = decl.slice(idx + 1).trim();
  }
  return map;
}

const selectorsOf = (prelude) => prelude.split(',').map((s) => s.trim());

const animationsCss = stripComments(read('css/animations.css'));
const styleCss = stripComments(read('css/style.css'));
const topBlocks = parseBlocks(animationsCss);

const keyframeBlocks = topBlocks.filter((b) => b.prelude.startsWith('@keyframes'));
const reducedMotionBlock = topBlocks.find((b) => b.prelude.startsWith('@media (prefers-reduced-motion'));
const styleRuleBlocks = parseBlocks(styleCss).filter((b) => !b.prelude.startsWith('@'));

// The reduced-motion rules are nested inside the @media block.
const reducedRules = parseBlocks(reducedMotionBlock.body);
const reducedSelectors = new Set(reducedRules.flatMap((r) => selectorsOf(r.prelude)));
const reducedDecls = Object.assign({}, ...reducedRules.map((r) => declarations(r.body)));

// Every top-level rule whose selector list includes the given selector.
const rulesFor = (selector) => topBlocks.filter((b) => selectorsOf(b.prelude).includes(selector));

test('animations.css loads after style.css on both pages', () => {
  for (const page of ['index.html', 'deadlines.html']) {
    const html = read(page);
    const styleIdx = html.indexOf('css/style.css');
    const animIdx = html.indexOf('css/animations.css');
    assert.ok(styleIdx !== -1, `${page} links style.css`);
    assert.ok(animIdx !== -1, `${page} links animations.css`);
    assert.ok(animIdx > styleIdx, `${page} loads animations.css after style.css`);
  }
});

test('all required keyframes are defined', () => {
  const names = keyframeBlocks.map((b) => b.prelude.replace('@keyframes', '').trim());
  for (const required of ['zombieWalk', 'cardReveal', 'zombieDefeat', 'dirtBurst', 'modalFadeIn']) {
    assert.ok(names.includes(required), `@keyframes ${required} is defined`);
  }
});

test('durations match the task spec (zombie 0.5s, card 0.3s)', () => {
  const durationOf = (selector) => {
    const block = topBlocks.find((b) => selectorsOf(b.prelude).includes(selector));
    assert.ok(block, `${selector} rule exists`);
    return declarations(block.body).animation;
  };
  assert.match(durationOf('.zombie--walking'), /\b0\.5s\b/, 'zombie walk runs 0.5s');
  assert.match(durationOf('.tombstone--reveal'), /\b0\.3s\b/, 'tombstone reveal runs 0.3s');
  assert.match(durationOf('.zombie--defeated'), /\b0\.8s\b/, 'zombie defeat runs 0.8s');
  assert.match(durationOf('.dialog--fade-in'), /\b0\.25s\b/, 'dialog fade-in runs 0.25s');
});

test('keyframes animate only transform and opacity', () => {
  const allowed = new Set(['transform', 'opacity']);
  for (const kf of keyframeBlocks) {
    for (const step of parseBlocks(kf.body)) {
      for (const prop of Object.keys(declarations(step.body))) {
        assert.ok(allowed.has(prop), `${kf.prelude} animates only transform/opacity, found "${prop}"`);
      }
    }
  }
});

test('zombie defeat ends transparent and holds its end state', () => {
  const block = topBlocks.find((b) => selectorsOf(b.prelude).includes('.zombie--defeated'));
  const decl = declarations(block.body);
  assert.match(decl.animation, /\bforwards\b/, 'uses forwards fill mode');
  const defeat = keyframeBlocks.find((b) => b.prelude.includes('zombieDefeat'));
  const steps = parseBlocks(defeat.body);
  const last = steps.find((s) => selectorsOf(s.prelude).includes('100%'));
  assert.equal(declarations(last.body).opacity, '0', 'final keyframe sets opacity 0');
});

test('dirt particles get their direction from custom properties on both clusters', () => {
  for (const sel of ['.dirt-burst::before', '.dirt-burst::after']) {
    const props = Object.assign({}, ...rulesFor(sel).map((b) => declarations(b.body)));
    assert.ok(props['--dirt-dx'], `${sel} sets --dirt-dx`);
    assert.ok(props['--dirt-dy'], `${sel} sets --dirt-dy`);
  }
});

test('reduced-motion block is the last rule in animations.css', () => {
  assert.ok(reducedMotionBlock, 'prefers-reduced-motion media query exists');
  assert.equal(topBlocks[topBlocks.length - 1], reducedMotionBlock, 'media query is the final block');
});

test('reduced-motion rules set animation and transition to none', () => {
  assert.equal(reducedDecls.animation, 'none');
  assert.equal(reducedDecls.transition, 'none');
});

test('every animated selector in animations.css is covered by reduced motion', () => {
  const missing = [];
  for (const block of topBlocks) {
    if (block.prelude.startsWith('@')) continue;
    if (!declarations(block.body).animation) continue;
    for (const sel of selectorsOf(block.prelude)) {
      if (!reducedSelectors.has(sel)) missing.push(sel);
    }
  }
  assert.deepEqual(missing, [], 'animated selectors missing from the reduced-motion list');
});

test('every transition in style.css is covered by reduced motion', () => {
  const missing = [];
  for (const block of styleRuleBlocks) {
    if (!declarations(block.body).transition) continue;
    for (const sel of selectorsOf(block.prelude)) {
      if (!reducedSelectors.has(sel)) missing.push(sel);
    }
  }
  assert.deepEqual(missing, [], 'style.css transitions missing from the reduced-motion list');
});
