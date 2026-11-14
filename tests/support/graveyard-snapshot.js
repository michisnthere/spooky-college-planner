// Task 21 helper: opens the graveyard the way a page refresh does and prints what it shows.
// Runs in its own Node process, so no module state from the test run carries over.
// Used by tests/submission.test.js. Environment: STUDENT_ID, BASE_URL, OPEN_ID (college to open).
// Prints one JSON line on stdout: { cards: [{id, submitted, checkmark}], openedId, submittedPressed }.
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { JSDOM } = require('jsdom');

const FRONTEND = path.join(__dirname, '..', '..', 'frontend');
const STORAGE_KEY = 'spooky-planner.studentId';

async function main() {
  const { STUDENT_ID, BASE_URL, OPEN_ID } = process.env;
  const dom = new JSDOM(fs.readFileSync(path.join(FRONTEND, 'index.html'), 'utf8'), {
    url: 'http://localhost/',
    pretendToBeVisual: true,
  });
  const win = dom.window;

  // jsdom has no <dialog> open/close, so provide the minimum the modal uses.
  const proto = win.HTMLElement.prototype;
  if (typeof proto.showModal !== 'function') {
    proto.showModal = function showModal() { this.setAttribute('open', ''); };
  }
  if (typeof proto.close !== 'function') {
    proto.close = function close() {
      if (!this.hasAttribute('open')) return;
      this.removeAttribute('open');
      this.dispatchEvent(new win.Event('close'));
    };
  }

  globalThis.SPOOKY_API_BASE_URL = BASE_URL;
  win.localStorage.setItem(STORAGE_KEY, STUDENT_ID);
  globalThis.localStorage = win.localStorage;
  globalThis.document = win.document;

  const app = await import(pathToFileURL(path.join(FRONTEND, 'js', 'app.js')).href);
  app.initApp();
  await app.loadSavedColleges();

  const doc = win.document;
  const cards = Array.from(doc.querySelectorAll('#college-tombstones .college-tombstone')).map((card) => {
    const stone = card.querySelector('.college-tombstone__stone');
    return {
      id: card.dataset.collegeId,
      submitted: stone.classList.contains('tombstone--submitted'),
      checkmark: stone.querySelector('.tombstone__check') !== null,
    };
  });

  doc.querySelector(`[data-college-id="${OPEN_ID}"] .college-tombstone__stone`).click();
  const submitted = doc.querySelector('#college-detail-dialog [data-status="submitted"]');
  const result = {
    cards,
    openedId: OPEN_ID,
    submittedPressed: submitted.getAttribute('aria-pressed') === 'true',
  };
  process.stdout.write(`${JSON.stringify(result)}\n`, () => process.exit(0));
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exit(1);
});
