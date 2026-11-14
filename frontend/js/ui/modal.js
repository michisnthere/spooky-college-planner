// frontend/js/ui/modal.js
// College detail dialog: shows one college's details and its application status.
// The dialog markup lives in index.html (#college-detail-dialog).

export const APPLICATION_STATUSES = ['pending', 'submitted', 'accepted', 'rejected', 'waitlisted'];

const NOT_AVAILABLE = 'Not available';
const NO_DEADLINE = 'No deadline set';
const DEADLINE_PASSED = 'Deadline passed';

let handlers = {};
let listenersBound = false;
let currentCollege = null;

const el = (id) => document.getElementById(id);

// Parses the date part of "YYYY-MM-DD" or an ISO timestamp as a local calendar date.
// Returns null for missing or invalid input.
function parseDeadline(value) {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const date = new Date(y, m - 1, d);
  // Reject dates that roll over, such as 2025-02-31.
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

/**
 * Returns the days-remaining label for a deadline. Whole calendar days, so a
 * deadline today is "0 days" and yesterday's deadline is "Deadline passed".
 * @param {string|null|undefined} deadline "YYYY-MM-DD" or an ISO timestamp.
 * @param {Date} [today] Injected for tests.
 * @returns {string}
 */
export function formatDaysRemaining(deadline, today = new Date()) {
  const due = parseDeadline(deadline);
  if (!due) return NO_DEADLINE;
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((due - startOfToday) / 86400000);
  if (days < 0) return DEADLINE_PASSED;
  return days === 1 ? '1 day' : `${days} days`;
}

/** Formats the acceptance rate. The database stores a percent, such as 3.45. */
export function formatAcceptanceRate(rate) {
  if (rate === null || rate === undefined || rate === '') return NOT_AVAILABLE;
  const value = Number(rate);
  if (!Number.isFinite(value)) return NOT_AVAILABLE;
  return `${value}%`;
}

function showText(id, text) {
  el(id).textContent = text || NOT_AVAILABLE;
}

function setPressedStatus(status) {
  for (const button of document.querySelectorAll('#college-detail-dialog .btn--status')) {
    button.setAttribute('aria-pressed', String(button.dataset.status === status));
  }
}

function showStatusMessage(text) {
  const message = el('detail-status-message');
  if (message) message.textContent = text;
}

// Binds the close and status handlers once, on the first call to initDetailModal.
function bindListeners() {
  if (listenersBound) return;
  listenersBound = true;
  const dialog = el('college-detail-dialog');

  el('detail-close-button').addEventListener('click', () => closeDetailModal());

  // Clicks outside the dialog box land on the backdrop, where the target is the dialog itself.
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    const inside =
      event.clientX >= box.left && event.clientX <= box.right &&
      event.clientY >= box.top && event.clientY <= box.bottom;
    if (!inside) closeDetailModal();
  });

  // Escape closes a native <dialog> by default. The close event resets state for both paths.
  dialog.addEventListener('close', () => {
    currentCollege = null;
    showStatusMessage('');
  });

  for (const button of document.querySelectorAll('#college-detail-dialog .btn--status')) {
    button.addEventListener('click', () => handleStatusClick(button.dataset.status));
  }
}

// Saves through the optional onStatusChange callback. The highlight moves only after it succeeds.
async function handleStatusClick(status) {
  if (!currentCollege || !handlers.onStatusChange) return;
  const college = currentCollege;
  try {
    await handlers.onStatusChange(college, status);
    if (currentCollege === college) {
      setPressedStatus(status);
      showStatusMessage('');
    }
  } catch (error) {
    showStatusMessage(`Could not update status: ${error.message || 'unknown error'}`);
  }
}

/**
 * Sets the optional status-change callback and binds the dialog's listeners.
 * Call once on page load. Safe to call again to replace the callback.
 * @param {object} [callbacks]
 * @param {(college: object, status: string) => Promise<void>|void} [callbacks.onStatusChange]
 *   Saves the new status. The highlight moves only after this resolves.
 */
export function initDetailModal(callbacks = {}) {
  handlers = callbacks;
  bindListeners();
}

/**
 * Opens the detail dialog for one college.
 * Accepts DB rows (snake_case) or camelCase objects.
 * @param {object} college
 * @param {object} [details]
 * @param {string} [details.status] Current application status.
 * @param {string} [details.deadline] Deadline as "YYYY-MM-DD".
 */
export function openDetailModal(college, details = {}) {
  bindListeners();
  const dialog = el('college-detail-dialog');
  const status = details.status ?? college.status ?? null;
  const deadline = details.deadline ?? college.deadline_date ?? college.deadlineDate ?? null;
  currentCollege = college;

  showText('detail-college-name', college.name);
  showText('detail-location', college.location);
  showText('detail-state', college.state);
  showText('detail-acceptance-rate', formatAcceptanceRate(college.acceptance_rate ?? college.acceptanceRate));
  showText('detail-deadline', parseDeadline(deadline) ? String(deadline).slice(0, 10) : NO_DEADLINE);
  showText('detail-days-remaining', formatDaysRemaining(deadline));

  // Deadline editing is wired in task 20. Show the current date, but keep the field inactive.
  const deadlineInput = el('detail-deadline-input');
  deadlineInput.value = parseDeadline(deadline) ? String(deadline).slice(0, 10) : '';
  deadlineInput.disabled = true;

  setPressedStatus(status);
  showStatusMessage('');

  dialog.classList.add('dialog--fade-in');
  if (!dialog.open) dialog.showModal();
}

/** Closes the detail dialog. Safe to call when it is already closed. */
export function closeDetailModal() {
  const dialog = el('college-detail-dialog');
  if (dialog.open) dialog.close();
}
