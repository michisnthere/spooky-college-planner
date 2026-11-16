// frontend/js/ui/modal.js
// College detail dialog: shows one college's details and its application status.
// The dialog markup lives in index.html (#college-detail-dialog).
import { normalizeState } from './states.js';

export const APPLICATION_STATUSES = ['pending', 'submitted', 'accepted', 'rejected', 'waitlisted'];

const NOT_AVAILABLE = 'Not available';
const NO_DEADLINE = 'No deadline set';
const DEADLINE_PASSED = 'Deadline passed';

let handlers = {};
let listenersBound = false;
let currentCollege = null;

const el = (id) => document.getElementById(id);

/**
 * Parses a deadline as a local calendar date, so timezones cannot shift the day.
 * @param {string|Date|null|undefined} value "YYYY-MM-DD", an ISO timestamp, or a Date
 *   (the pg driver returns DATE columns as Date objects).
 * @returns {Date|null} Local midnight of that day, or null for missing or invalid input.
 */
export function parseDeadline(value) {
  if (!value) return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const date = new Date(y, m - 1, d);
  // Reject dates that roll over, such as 2025-02-31.
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

/**
 * Formats a calendar date as "YYYY-MM-DD" for display and the date input.
 * @param {Date} date A local date, such as the result of parseDeadline.
 * @returns {string}
 */
export function formatIsoDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
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

  el('detail-deadline-input').addEventListener('change', () => handleDeadlineChange());

  for (const button of document.querySelectorAll('#college-detail-dialog .btn--status')) {
    button.addEventListener('click', () => handleStatusClick(button.dataset.status));
  }
  el('detail-delete-button').addEventListener('click', () => handleDeleteClick());
}

// Shows the deadline date, days remaining, and the date input. Also records the saved date,
// so a failed change can restore it.
function showDeadlineFields(deadline) {
  const dueDate = parseDeadline(deadline);
  const dateText = dueDate ? formatIsoDate(dueDate) : '';
  el('detail-deadline').textContent = dateText || NO_DEADLINE;
  el('detail-days-remaining').textContent = formatDaysRemaining(deadline);
  const input = el('detail-deadline-input');
  input.value = dateText;
  input.dataset.savedDate = dateText;
}

// Saves a changed deadline through the onDeadlineChange callback. The displayed date changes
// only after the callback resolves. On failure, the input returns to the saved date.
async function handleDeadlineChange() {
  if (!currentCollege || !handlers.onDeadlineChange) return;
  const college = currentCollege;
  const input = el('detail-deadline-input');
  const previous = input.dataset.savedDate ?? '';
  input.disabled = true;
  try {
    const saved = await handlers.onDeadlineChange(college, input.value);
    if (currentCollege === college) {
      showDeadlineFields(saved ?? input.value);
      showStatusMessage('Deadline saved.');
    }
  } catch (error) {
    if (currentCollege === college) {
      input.value = previous;
      showStatusMessage(`Could not update deadline: ${error.message || 'unknown error'}`);
    }
  } finally {
    input.disabled = !handlers.onDeadlineChange;
  }
}

// Runs the optional onStatusChange callback, then moves the highlight. Without a callback
// the highlight moves right away (UI-only until the API is wired in later tasks).
async function handleStatusClick(status) {
  if (!currentCollege) return;
  const college = currentCollege;
  try {
    if (handlers.onStatusChange) await handlers.onStatusChange(college, status);
    if (currentCollege === college) {
      setPressedStatus(status);
      showStatusMessage('');
    }
  } catch (error) {
    showStatusMessage(`Could not update status: ${error.message || 'unknown error'}`);
  }
}

// Runs the onDelete callback. The dialog closes only when it resolves with true (deleted).
// A cancelled confirmation or a failed delete leaves the dialog open. The button stays
// disabled while the request runs, so a double click cannot send two.
async function handleDeleteClick() {
  if (!currentCollege || !handlers.onDelete) return;
  const college = currentCollege;
  const button = el('detail-delete-button');
  button.disabled = true;
  showStatusMessage('');
  try {
    const deleted = await handlers.onDelete(college);
    if (deleted === true && currentCollege === college) closeDetailModal();
  } catch (error) {
    if (currentCollege === college) showStatusMessage(`Could not delete: ${error.message || 'unknown error'}`);
  } finally {
    button.disabled = !handlers.onDelete;
  }
}

/**
 * Sets the optional status-change callback and binds the dialog's listeners.
 * Call once on page load. Safe to call again to replace the callback.
 * @param {object} [callbacks]
 * @param {(college: object, status: string) => Promise<void>|void} [callbacks.onStatusChange]
 *   Saves the new status. The highlight moves only after this resolves.
 * @param {(college: object, deadline: string) => Promise<string|void>|string|void} [callbacks.onDeadlineChange]
 *   Saves a new deadline ("YYYY-MM-DD", or "" when cleared). May resolve with the saved "YYYY-MM-DD".
 *   Enables the deadline input. On rejection, the input returns to the saved date.
 * @param {(college: object) => Promise<boolean>|boolean} [callbacks.onDelete]
 *   Deletes the college, after its own confirmation. Resolve true when the college was deleted: the
 *   dialog then closes. Resolve false (cancelled or failed) to keep it open. A rejection shows the
 *   error in the dialog. Enables the Delete button.
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
  showText('detail-state', normalizeState(college.state) ?? college.state);
  showText('detail-acceptance-rate', formatAcceptanceRate(college.acceptance_rate ?? college.acceptanceRate));
  showDeadlineFields(deadline);

  // The date input is editable only when app.js supplies onDeadlineChange.
  el('detail-deadline-input').disabled = !handlers.onDeadlineChange;
  const deleteButton = el('detail-delete-button');
  deleteButton.disabled = !handlers.onDelete;
  deleteButton.setAttribute('aria-label', `Delete ${college.name || 'this college'}`);

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
