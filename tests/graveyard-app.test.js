// Task 13 wiring checks: app.js connects tombstone clicks to the detail modal and the dialog's
// Delete button to card removal, using the real index.html markup.
// Run with: node --test tests/graveyard-app.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { JSDOM } = require('jsdom');

const FRONTEND = path.join(__dirname, '..', 'frontend');
const html = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
const appUrl = pathToFileURL(path.join(FRONTEND, 'js', 'app.js')).href;

const dom = new JSDOM(html, { pretendToBeVisual: true });
globalThis.document = dom.window.document;

// jsdom has no <dialog> open/close. This shim covers the subset the modal uses.
(function shimDialog(win) {
  const proto = win.HTMLElement.prototype;
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function showModal() {
      this.setAttribute('open', '');
    };
  }
  if (typeof proto.close !== 'function') {
    proto.close = function close() {
      if (!this.hasAttribute('open')) return;
      this.removeAttribute('open');
      this.dispatchEvent(new win.Event('close'));
    };
  }
  Object.defineProperty(proto, 'open', {
    configurable: true,
    get() {
      return this.tagName === 'DIALOG' && this.hasAttribute('open');
    },
    set(value) {
      if (value) this.setAttribute('open', '');
      else this.removeAttribute('open');
    },
  });
})(dom.window);

const COLLEGES = [
  { id: 'h1', name: 'Harvard University', location: 'Cambridge, MA', state: 'Massachusetts', acceptance_rate: '3.59' },
  { id: 'y2', name: 'Yale University', location: 'New Haven, CT', state: 'Connecticut', acceptance_rate: '4.6' },
];

const container = () => document.getElementById('college-tombstones');
const cardFor = (id) => container().querySelector(`[data-college-id="${id}"]`);
const dialog = () => document.getElementById('college-detail-dialog');
const text = (id) => document.getElementById(id).textContent;

async function loadApp() {
  return import(appUrl);
}

function reset() {
  container().replaceChildren();
  dialog().removeAttribute('open');
  globalThis.confirm = () => true;
  // Delete now calls the server. A stand-in that confirms the delete keeps this file offline.
  globalThis.fetch = async () => new Response(JSON.stringify({ success: true, data: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

test('initApp renders one card per college into the real graveyard container', async () => {
  const { initApp } = await loadApp();
  reset();
  initApp({ colleges: COLLEGES });
  assert.equal(container().children.length, 2);
  assert.ok(cardFor('h1'));
  assert.ok(cardFor('y2'));
});

test('initApp with no colleges renders no cards and does not throw', async () => {
  const { initApp } = await loadApp();
  reset();
  assert.doesNotThrow(() => initApp());
  assert.equal(container().children.length, 0);
  assert.equal(dialog().open, false, 'modal stays closed');
});

test('initApp throws a clear error when the graveyard container is missing', async () => {
  const { initApp } = await loadApp();
  const saved = container();
  saved.remove();
  try {
    assert.throws(() => initApp({ colleges: COLLEGES }), /#college-tombstones was not found/);
  } finally {
    document.querySelector('main').appendChild(saved);
  }
});

test('clicking a tombstone opens the detail modal with that college', async () => {
  const { initApp } = await loadApp();
  reset();
  initApp({ colleges: COLLEGES });
  cardFor('y2').querySelector('.college-tombstone__stone').click();
  assert.equal(dialog().open, true, 'dialog opens');
  assert.equal(text('detail-college-name'), 'Yale University');
  assert.equal(text('detail-location'), 'New Haven, CT');
  assert.equal(text('detail-acceptance-rate'), '4.6%');
});

const deleteButton = () => document.getElementById('detail-delete-button');
const openDetail = (id) => cardFor(id).querySelector('.college-tombstone__stone').click();
const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

test('cards have no delete button, and the detail dialog has one below the status box', async () => {
  const { initApp } = await loadApp();
  reset();
  initApp({ colleges: COLLEGES });
  for (const card of container().children) assert.equal(card.querySelector('button.tombstone-delete, .tombstone-delete'), null);
  const status = document.querySelector('#college-detail-dialog .status-actions');
  assert.ok(status, 'status box exists');
  assert.ok(status.compareDocumentPosition(deleteButton()) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING, 'delete comes after the status box');
  assert.equal(deleteButton().textContent.trim(), 'Delete college');
  assert.ok(dialog().contains(deleteButton()));
});

test('confirming delete in the detail dialog removes the card and closes the dialog', async () => {
  const { initApp } = await loadApp();
  reset();
  initApp({ colleges: COLLEGES });
  openDetail('h1');
  assert.equal(dialog().open, true);
  assert.equal(deleteButton().disabled, false);
  assert.equal(deleteButton().getAttribute('aria-label'), 'Delete Harvard University');
  deleteButton().click();
  await settle();
  assert.equal(cardFor('h1'), null);
  assert.equal(container().children.length, 1);
  assert.equal(dialog().open, false, 'dialog closes after a successful delete');
});

test('cancelling the confirmation keeps the card and leaves the dialog open', async () => {
  const { initApp } = await loadApp();
  reset();
  initApp({ colleges: COLLEGES });
  openDetail('y2');
  globalThis.confirm = () => false;
  deleteButton().click();
  await settle();
  assert.ok(cardFor('y2'), 'card is still there');
  assert.equal(dialog().open, true, 'dialog stays open');
  assert.equal(deleteButton().disabled, false, 'the button works again');
});

test('a failed delete keeps the card, keeps the dialog open and shows the error in the dialog', async () => {
  const { initApp } = await loadApp();
  reset();
  initApp({ colleges: COLLEGES });
  globalThis.fetch = async () => { throw new TypeError('network down'); };
  openDetail('y2');
  deleteButton().click();
  await settle();
  assert.ok(cardFor('y2'), 'card is kept');
  assert.equal(dialog().open, true, 'dialog stays open');
  assert.match(text('detail-status-message'), /Could not delete the college/);
  assert.equal(document.getElementById('graveyard-message')?.textContent ?? '', '', 'the message is not hidden behind the dialog');
  assert.equal(deleteButton().disabled, false, 'the user can retry');
});

test('deleting one college from its dialog leaves the other, and the next dialog works', async () => {
  const { initApp } = await loadApp();
  reset();
  initApp({ colleges: COLLEGES });
  openDetail('h1');
  deleteButton().click();
  await settle();
  openDetail('y2');
  assert.equal(text('detail-college-name'), 'Yale University');
  assert.equal(text('detail-status-message'), '', 'no old message carried over');
  assert.equal(dialog().open, true);
});

test('a double click on the dialog Delete button sends one request', async () => {
  const { initApp } = await loadApp();
  reset();
  initApp({ colleges: COLLEGES });
  let deletes = 0;
  globalThis.fetch = async (url, options = {}) => {
    if ((options.method || 'GET').toUpperCase() === 'DELETE') deletes += 1;
    return new Response(JSON.stringify({ success: true, data: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  openDetail('h1');
  deleteButton().click();
  deleteButton().click();
  await settle();
  assert.equal(deletes, 1);
});
test('re-running initApp replaces cards instead of duplicating them', async () => {
  const { initApp } = await loadApp();
  reset();
  initApp({ colleges: COLLEGES });
  initApp({ colleges: [COLLEGES[0]] });
  assert.equal(container().children.length, 1);
  cardFor('h1').querySelector('.college-tombstone__stone').click();
  assert.equal(text('detail-college-name'), 'Harvard University', 'click still opens the modal once');
});
