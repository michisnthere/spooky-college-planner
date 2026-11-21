// Task 14 checks: college detail modal.
// Loads the real frontend/index.html markup into jsdom. Run with: node --test tests/modal.test.js
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { JSDOM } = require('jsdom');

const FRONTEND = path.join(__dirname, '..', 'frontend');
const html = fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8');
const moduleUrl = pathToFileURL(path.join(FRONTEND, 'js', 'ui', 'modal.js')).href;

const dom = new JSDOM(html, { pretendToBeVisual: true });
globalThis.document = dom.window.document;

// jsdom does not implement <dialog> open/close. This shim covers the subset the modal uses,
// and fires "close" the way a browser does. It does not model Escape or focus handling.
(function shimDialog(win) {
  const proto = win.HTMLElement.prototype;
  const isDialog = (el) => el.tagName === 'DIALOG';
  if (!('open' in win.HTMLDialogElement?.prototype || {})) {
    Object.defineProperty(proto, 'open', {
      configurable: true,
      get() {
        return isDialog(this) && this.hasAttribute('open');
      },
      set(value) {
        if (value) this.setAttribute('open', '');
        else this.removeAttribute('open');
      },
    });
  }
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
})(dom.window);

const modal = () => import(moduleUrl);
const text = (id) => document.getElementById(id).textContent;
const dialog = () => document.getElementById('college-detail-dialog');
const statusButtons = () => Array.from(document.querySelectorAll('#college-detail-dialog .btn--status'));
const pressed = () => statusButtons().filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.dataset.status);

const HARVARD = {
  id: 'h1',
  name: 'Harvard University',
  location: 'Cambridge, MA',
  state: 'Massachusetts',
  acceptance_rate: '3.59',
};

// Fixed "today" for deterministic day counts: 2026-03-10, local time.
const TODAY = new Date(2026, 2, 10, 15, 30);

test('openDetailModal shows name, location, state, acceptance rate, and deadline', async () => {
  const { openDetailModal, closeDetailModal } = await modal();
  openDetailModal(HARVARD, { status: 'pending', deadline: '2026-03-25' });
  assert.equal(dialog().open, true, 'dialog is open');
  assert.equal(text('detail-college-name'), 'Harvard University');
  assert.equal(text('detail-location'), 'Cambridge, MA');
  assert.equal(text('detail-state'), 'Massachusetts');
  assert.equal(text('detail-acceptance-rate'), '3.59%');
  assert.equal(text('detail-deadline'), '2026-03-25');
  closeDetailModal();
});

test('missing fields show "Not available" and "No deadline set" instead of blank text', async () => {
  const { openDetailModal, closeDetailModal } = await modal();
  openDetailModal({ id: 'x', name: 'Tiny College', location: null, state: '', acceptance_rate: null });
  assert.equal(text('detail-location'), 'Not available');
  assert.equal(text('detail-state'), 'Not available');
  assert.equal(text('detail-acceptance-rate'), 'Not available');
  assert.equal(text('detail-deadline'), 'No deadline set');
  assert.equal(text('detail-days-remaining'), 'No deadline set');
  closeDetailModal();
});

test('days remaining counts whole calendar days and handles edge dates', async () => {
  const { formatDaysRemaining } = await modal();
  assert.equal(formatDaysRemaining('2026-03-25', TODAY), '15 days');
  assert.equal(formatDaysRemaining('2026-03-11', TODAY), '1 day', 'singular for one day');
  assert.equal(formatDaysRemaining('2026-03-10', TODAY), '0 days', 'due today is zero days');
  assert.equal(formatDaysRemaining('2026-03-09', TODAY), 'Deadline passed', 'yesterday has passed');
  assert.equal(formatDaysRemaining('2026-03-10T23:59:00Z', TODAY), '0 days', 'accepts an ISO timestamp');
  assert.equal(formatDaysRemaining('2025-02-31', TODAY), 'No deadline set', 'rejects impossible dates');
  assert.equal(formatDaysRemaining('not a date', TODAY), 'No deadline set', 'rejects garbage input');
  assert.equal(formatDaysRemaining(undefined, TODAY), 'No deadline set');
});

test('acceptance rate formatting handles zero and non-numeric input', async () => {
  const { formatAcceptanceRate } = await modal();
  assert.equal(formatAcceptanceRate(0), '0%', 'zero is a real value, not missing');
  assert.equal(formatAcceptanceRate('12.5'), '12.5%');
  assert.equal(formatAcceptanceRate(null), 'Not available');
  assert.equal(formatAcceptanceRate(''), 'Not available');
  assert.equal(formatAcceptanceRate('abc'), 'Not available');
});

test('exactly the saved status button is pressed', async () => {
  const { openDetailModal, closeDetailModal } = await modal();
  openDetailModal(HARVARD, { status: 'submitted', deadline: '2026-03-25' });
  assert.deepEqual(pressed(), ['submitted']);
  openDetailModal(HARVARD, { status: null });
  assert.deepEqual(pressed(), [], 'no status means no button is pressed');
  closeDetailModal();
});

test('the deadline input shows the date and stays disabled until task 20', async () => {
  const { openDetailModal, closeDetailModal } = await modal();
  openDetailModal(HARVARD, { deadline: '2026-04-01' });
  const input = document.getElementById('detail-deadline-input');
  assert.equal(input.value, '2026-04-01');
  assert.equal(input.disabled, true);
  closeDetailModal();
});

test('clicking a status calls onStatusChange and moves the highlight only after success', async () => {
  const { initDetailModal, openDetailModal, closeDetailModal } = await modal();
  const calls = [];
  initDetailModal({
    onStatusChange: async (college, status) => {
      calls.push([college.id, status]);
    },
  });
  openDetailModal(HARVARD, { status: 'pending' });
  statusButtons().find((b) => b.dataset.status === 'accepted').click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, [['h1', 'accepted']]);
  assert.deepEqual(pressed(), ['accepted']);
  closeDetailModal();
});

test('a failed status save keeps the old highlight and shows the error', async () => {
  const { initDetailModal, openDetailModal, closeDetailModal } = await modal();
  initDetailModal({
    onStatusChange: async () => {
      throw new Error('server returned 500');
    },
  });
  openDetailModal(HARVARD, { status: 'pending' });
  statusButtons().find((b) => b.dataset.status === 'rejected').click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(pressed(), ['pending'], 'highlight did not move');
  assert.match(text('detail-status-message'), /server returned 500/);
  closeDetailModal();
});

test('close button, backdrop click, and close event each close the dialog', async () => {
  const { openDetailModal, initDetailModal } = await modal();
  initDetailModal({});

  openDetailModal(HARVARD);
  document.getElementById('detail-close-button').click();
  assert.equal(dialog().open, false, 'close button closes');

  openDetailModal(HARVARD);
  const box = { left: 0, top: 0, right: 100, bottom: 100 };
  dialog().getBoundingClientRect = () => box;
  const outside = new dom.window.MouseEvent('click', { bubbles: true, clientX: 500, clientY: 500 });
  dialog().dispatchEvent(outside);
  assert.equal(dialog().open, false, 'backdrop click closes');

  openDetailModal(HARVARD);
  const inside = new dom.window.MouseEvent('click', { bubbles: true, clientX: 50, clientY: 50 });
  dialog().dispatchEvent(inside);
  assert.equal(dialog().open, true, 'click inside the dialog box does not close it');

  // Escape makes the native dialog fire close. Simulate that by calling close().
  dialog().close();
  assert.equal(dialog().open, false, 'close event path closes');
});

test('after the dialog closes, status clicks are ignored and state resets on reopen', async () => {
  const { initDetailModal, openDetailModal, closeDetailModal } = await modal();
  const calls = [];
  initDetailModal({ onStatusChange: (college, status) => calls.push([college.id, status]) });

  openDetailModal(HARVARD, { status: 'pending' });
  closeDetailModal();
  statusButtons().find((b) => b.dataset.status === 'accepted').click();
  assert.deepEqual(calls, [], 'no save while the dialog is closed');

  const other = { id: 'y9', name: 'Yale University', acceptance_rate: '4.6' };
  openDetailModal(other, { status: 'waitlisted' });
  assert.equal(text('detail-college-name'), 'Yale University');
  assert.deepEqual(pressed(), ['waitlisted']);
  closeDetailModal();
});

test('without an onStatusChange callback, a status click moves the highlight (UI-only default)', async () => {
  const { initDetailModal, openDetailModal, closeDetailModal } = await modal();
  initDetailModal(); // Same call app.js makes today.
  openDetailModal(HARVARD, { status: 'pending' });
  statusButtons().find((b) => b.dataset.status === 'waitlisted').click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(pressed(), ['waitlisted']);
  closeDetailModal();
});

test('a Date deadline (as returned by the pg driver) shows the correct date and days', async () => {
  const { openDetailModal, closeDetailModal, formatDaysRemaining } = await modal();
  const pgDate = new Date(2026, 2, 25); // local midnight, the way pg returns DATE columns
  openDetailModal(HARVARD, { deadline: pgDate });
  assert.equal(text('detail-deadline'), '2026-03-25');
  assert.equal(document.getElementById('detail-deadline-input').value, '2026-03-25');
  assert.equal(formatDaysRemaining(new Date(Number.NaN)), 'No deadline set', 'invalid Date is missing');
  closeDetailModal();
});

test('Escape path: cancel then close resets state, and later status clicks do nothing', async () => {
  const { initDetailModal, openDetailModal } = await modal();
  const calls = [];
  initDetailModal({ onStatusChange: (college, status) => calls.push(status) });
  openDetailModal(HARVARD, { status: 'pending' });
  // A browser fires "cancel" and then "close" when Escape closes a native dialog.
  // jsdom does not send Escape, so the shim sequence is dispatched by hand.
  dialog().dispatchEvent(new dom.window.Event('cancel', { cancelable: true }));
  dialog().close();
  assert.equal(dialog().open, false, 'dialog closed');
  statusButtons().find((b) => b.dataset.status === 'accepted').click();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, [], 'no save after Escape');
  assert.equal(text('detail-status-message'), '', 'message cleared');
});

test('clicking a tombstone in the real app wiring opens the modal with that college', async () => {
  const app = await import(pathToFileURL(path.join(FRONTEND, 'js', 'app.js')).href);
  app.initApp({ colleges: [HARVARD, { id: 'y9', name: 'Yale University', state: 'CT', deadline_date: '2026-04-01' }] });
  const yaleStone = document.querySelector('[data-college-id="y9"] .college-tombstone__stone');
  yaleStone.click();
  assert.equal(dialog().open, true, 'dialog opened from tombstone click');
  assert.equal(text('detail-college-name'), 'Yale University');
  assert.equal(text('detail-state'), 'Connecticut', 'an old two-letter value shows as the full name');
  assert.equal(text('detail-acceptance-rate'), 'Not available');
  assert.equal(text('detail-deadline'), '2026-04-01');
  document.getElementById('detail-close-button').click();
  assert.equal(dialog().open, false, 'closes via the close button');
});

// ---------------------------------------------------------------------------
// Delete college button (below the application status box)
// ---------------------------------------------------------------------------
const deleteBtn = () => document.getElementById('detail-delete-button');
const detailDialog = () => document.getElementById('college-detail-dialog');
const message = () => document.getElementById('detail-status-message').textContent;
const flush = () => new Promise((resolve) => setImmediate(resolve));
const DELETE_TARGET = { id: 'h1', name: 'Harvard University' };

test('delete button: sits after the status box, is red, and is disabled without an onDelete callback', async () => {
  const { initDetailModal, openDetailModal, closeDetailModal } = await modal();
  initDetailModal({});
  openDetailModal(DELETE_TARGET);
  const status = document.querySelector('#college-detail-dialog .status-actions');
  assert.ok(status.compareDocumentPosition(deleteBtn()) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
  assert.equal(deleteBtn().textContent.trim(), 'Delete college');
  assert.equal(deleteBtn().disabled, true, 'nothing to call, so it is off');
  const css = fs.readFileSync(path.join(FRONTEND, 'css', 'style.css'), 'utf8');
  assert.match(/#detail-delete-button\s*\{[^}]*background:\s*var\(--color-danger\)/.exec(css)?.[0] ?? '', /--color-danger/, 'a red background');
  assert.match(css, /--color-danger:\s*#c42424;/, 'the red');
  closeDetailModal();
});

test('delete button: gets the college name as its accessible label', async () => {
  const { initDetailModal, openDetailModal, closeDetailModal } = await modal();
  initDetailModal({ onDelete: async () => true });
  openDetailModal(DELETE_TARGET);
  assert.equal(deleteBtn().disabled, false);
  assert.equal(deleteBtn().getAttribute('aria-label'), 'Delete Harvard University');
  openDetailModal({ id: 'x', name: '' });
  assert.equal(deleteBtn().getAttribute('aria-label'), 'Delete this college', 'a blank name has a fallback');
  closeDetailModal();
});

test('delete button: passes the open college to onDelete and closes the dialog when it resolves true', async () => {
  const { initDetailModal, openDetailModal } = await modal();
  const seen = [];
  initDetailModal({ onDelete: async (college) => { seen.push(college.id); return true; } });
  openDetailModal(DELETE_TARGET);
  deleteBtn().click();
  await flush();
  assert.deepEqual(seen, ['h1']);
  assert.equal(detailDialog().open, false);
});

test('delete button: a false result (cancelled or failed) keeps the dialog open and the button usable', async () => {
  const { initDetailModal, openDetailModal, closeDetailModal } = await modal();
  initDetailModal({ onDelete: async () => false });
  openDetailModal(DELETE_TARGET);
  deleteBtn().click();
  await flush();
  assert.equal(detailDialog().open, true);
  assert.equal(deleteBtn().disabled, false);
  closeDetailModal();
});

test('delete button: a thrown error shows in the dialog, which stays open', async () => {
  const { initDetailModal, openDetailModal, closeDetailModal } = await modal();
  initDetailModal({ onDelete: async () => { throw new Error('server down'); } });
  openDetailModal(DELETE_TARGET);
  deleteBtn().click();
  await flush();
  assert.equal(message(), 'Could not delete: server down');
  assert.equal(detailDialog().open, true);
  assert.equal(deleteBtn().disabled, false, 'retry is possible');
  closeDetailModal();
});

test('delete button: it is off while the request runs, so a second click sends nothing', async () => {
  const { initDetailModal, openDetailModal } = await modal();
  let calls = 0;
  let finish;
  initDetailModal({ onDelete: () => { calls += 1; return new Promise((resolve) => { finish = resolve; }); } });
  openDetailModal(DELETE_TARGET);
  deleteBtn().click();
  assert.equal(deleteBtn().disabled, true);
  deleteBtn().click();
  assert.equal(calls, 1);
  finish(true);
  await flush();
  assert.equal(detailDialog().open, false);
});

test('delete button: a late answer does not close the dialog if another college is open by then', async () => {
  const { initDetailModal, openDetailModal, closeDetailModal } = await modal();
  let finish;
  initDetailModal({ onDelete: () => new Promise((resolve) => { finish = resolve; }) });
  openDetailModal(DELETE_TARGET);
  deleteBtn().click();
  openDetailModal({ id: 'y2', name: 'Yale University' });
  finish(true);
  await flush();
  assert.equal(detailDialog().open, true, 'the Yale dialog is untouched');
  assert.equal(document.getElementById('detail-college-name').textContent, 'Yale University');
  closeDetailModal();
});

test('delete button: an old error message is cleared when the dialog opens again', async () => {
  const { initDetailModal, openDetailModal, closeDetailModal } = await modal();
  initDetailModal({ onDelete: async () => { throw new Error('nope'); } });
  openDetailModal(DELETE_TARGET);
  deleteBtn().click();
  await flush();
  assert.match(message(), /nope/);
  closeDetailModal();
  openDetailModal(DELETE_TARGET);
  assert.equal(message(), '');
  closeDetailModal();
});