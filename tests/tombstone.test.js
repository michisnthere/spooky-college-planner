// Task 13 checks: tombstone cards and the graveyard container.
// Runs the browser modules under jsdom. Run with: node --test tests/tombstone.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { JSDOM } = require('jsdom');

const UI_DIR = path.join(__dirname, '..', 'frontend', 'js', 'ui');
const moduleUrl = (file) => pathToFileURL(path.join(UI_DIR, file)).href;

const dom = new JSDOM('<!doctype html><main><div id="college-tombstones"></div></main>');
globalThis.document = dom.window.document;

const SAMPLE = [
  { id: 'a1', name: 'Harvard University' },
  { id: 'b2', name: 'Yale University' },
  { id: 'c3', name: 'MIT' },
];

// Each test gets a clean container, a confirm that says yes, and fresh callbacks.
async function setup(callbacks = {}) {
  const graveyard = await import(moduleUrl('graveyard.js'));
  const container = document.getElementById('college-tombstones');
  container.replaceChildren();
  globalThis.confirm = () => true;
  graveyard.initGraveyard(container, callbacks);
  return { graveyard, container };
}

const stonesIn = (container) => Array.from(container.querySelectorAll('.college-tombstone__stone'));
const cardFor = (container, id) => container.querySelector(`[data-college-id="${id}"]`);

test('renderTombstones creates one card per college, in the given order', async () => {
  const { graveyard, container } = await setup();
  graveyard.renderTombstones(SAMPLE);
  assert.equal(container.children.length, 3);
  assert.deepEqual(stonesIn(container).map((s) => s.textContent), [
    'Harvard University',
    'Yale University',
    'MIT',
  ]);
});

test('college names are written as text, so markup in a name is not executed', async () => {
  const { graveyard, container } = await setup();
  graveyard.renderTombstones([{ id: 'x', name: '<img src=x onerror="alert(1)"> U' }]);
  assert.equal(container.querySelector('img'), null, 'no img element is created');
  assert.equal(stonesIn(container)[0].textContent, '<img src=x onerror="alert(1)"> U');
});

test('renderTombstones replaces the previous cards, and an empty list clears them', async () => {
  const { graveyard, container } = await setup();
  graveyard.renderTombstones(SAMPLE);
  graveyard.renderTombstones([SAMPLE[1]]);
  assert.equal(container.children.length, 1, 'no duplicates after a second render');
  graveyard.renderTombstones([]);
  assert.equal(container.children.length, 0, 'empty list leaves no cards');
});

test('a missing college name falls back to a placeholder on the stone and the delete label', async () => {
  const { graveyard, container } = await setup();
  graveyard.renderTombstones([{ id: 'n1', name: null }]);
  const stone = stonesIn(container)[0];
  const del = cardFor(container, 'n1').querySelector('.tombstone-delete');
  assert.equal(stone.textContent, 'Unnamed college');
  assert.equal(del.getAttribute('aria-label'), 'Delete Unnamed college');
});

test('every card uses the single fixed rounded shape', async () => {
  const { graveyard, container } = await setup();
  graveyard.renderTombstones(SAMPLE);
  graveyard.addTombstone({ id: 'd4', name: 'Stanford' });
  for (const stone of stonesIn(container)) {
    assert.ok(stone.classList.contains('tombstone--rounded'), 'has the rounded shape');
    for (const other of ['pointed', 'cross', 'slab', 'arched']) {
      assert.ok(!stone.classList.contains(`tombstone--${other}`), `no ${other} shape`);
    }
  }
});

test('only a newly added card plays the rise-up reveal, not cards rendered on load', async () => {
  const { graveyard, container } = await setup();
  graveyard.renderTombstones(SAMPLE);
  for (const stone of stonesIn(container)) {
    assert.ok(!stone.classList.contains('tombstone--reveal'), 'rendered cards do not animate');
  }
  graveyard.addTombstone({ id: 'd4', name: 'Stanford' });
  const added = cardFor(container, 'd4').querySelector('.college-tombstone__stone');
  assert.ok(added.classList.contains('tombstone--reveal'), 'added card rises up');
});

test('adding a college that already has a card does not create a duplicate', async () => {
  const { graveyard, container } = await setup();
  graveyard.renderTombstones(SAMPLE);
  const existing = graveyard.addTombstone(SAMPLE[0]);
  assert.equal(container.children.length, 3);
  assert.equal(existing, cardFor(container, 'a1'), 'returns the existing card');
});

test('clicking a stone calls onSelect with that college, and the delete button does not', async () => {
  const selected = [];
  const { graveyard, container } = await setup({ onSelect: (c) => selected.push(c.id) });
  graveyard.renderTombstones(SAMPLE);
  cardFor(container, 'b2').querySelector('.college-tombstone__stone').click();
  assert.deepEqual(selected, ['b2']);
  cardFor(container, 'b2').querySelector('.tombstone-delete').click();
  assert.deepEqual(selected, ['b2'], 'delete click does not select the college');
});

test('delete does nothing when the user cancels the confirmation', async () => {
  const deleted = [];
  const { graveyard, container } = await setup({ onDelete: (c) => deleted.push(c.id) });
  graveyard.renderTombstones(SAMPLE);
  globalThis.confirm = () => false;
  cardFor(container, 'a1').querySelector('.tombstone-delete').click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(deleted, [], 'onDelete is not called');
  assert.equal(container.children.length, 3, 'card stays');
});

test('delete asks for confirmation, calls onDelete, and removes the card', async () => {
  const deleted = [];
  const prompts = [];
  const { graveyard, container } = await setup({ onDelete: (c) => deleted.push(c.id) });
  graveyard.renderTombstones(SAMPLE);
  globalThis.confirm = (message) => {
    prompts.push(message);
    return true;
  };
  cardFor(container, 'b2').querySelector('.tombstone-delete').click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(prompts.length, 1, 'one confirmation prompt');
  assert.match(prompts[0], /Yale University/, 'prompt names the college');
  assert.deepEqual(deleted, ['b2']);
  assert.equal(cardFor(container, 'b2'), null, 'card is removed');
  assert.equal(container.children.length, 2);
});

test('when onDelete fails, the card stays and onError receives the error', async () => {
  const failure = new Error('network down');
  const errors = [];
  const { graveyard, container } = await setup({
    onDelete: async () => {
      throw failure;
    },
    onError: (err) => errors.push(err),
  });
  graveyard.renderTombstones(SAMPLE);
  cardFor(container, 'c3').querySelector('.tombstone-delete').click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(errors, [failure]);
  assert.ok(cardFor(container, 'c3'), 'card is kept so the user can retry');
});

test('removeTombstone returns false and changes nothing for an unknown id', async () => {
  const { graveyard, container } = await setup();
  graveyard.renderTombstones(SAMPLE);
  assert.equal(graveyard.removeTombstone('not-a-real-id'), false);
  assert.equal(container.children.length, 3);
  assert.equal(graveyard.removeTombstone('a1'), true);
  assert.equal(container.children.length, 2);
});

test('graveyard functions throw a clear error before initGraveyard is called', async () => {
  // A query string gives a separate module instance with no container set.
  const fresh = await import(`${moduleUrl('graveyard.js')}?uninitialized=1`);
  assert.throws(() => fresh.renderTombstones(SAMPLE), /Call initGraveyard\(\) first/);
});
