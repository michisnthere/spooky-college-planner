// frontend/js/app.js
// Main controller. Connects the graveyard, the detail modal, and the add-college form to the API.
// Deadline loading and zombie updates arrive in task 20.
import {
  initGraveyard,
  renderTombstones,
  addTombstone,
  markTombstoneSubmitted,
  clearTombstoneSubmitted,
  requestDeleteCollege,
} from './ui/graveyard.js';
import { initDetailModal, openDetailModal, closeDetailModal, parseDeadline, formatIsoDate } from './ui/modal.js';
import { initForm } from './ui/form.js';
import { initDeadlineTracker, computeDaysRemaining } from './ui/deadline-tracker.js';
import {
  ApiError,
  addCollege,
  createApplication,
  deleteCollege,
  getColleges,
  getDeadline,
  lookupCollege,
  updateApplicationStatus,
  updateDeadline,
} from './api/client.js';
import { getStudentId } from './api/student.js';
import { initParallax } from './ui/parallax.js';
import { initWobble } from './ui/wobble.js';

/** Shown when the college saved but its deadline did not. */
export const DEADLINE_NOT_SAVED_MESSAGE = 'College added, but its deadline could not be saved.';

/** Shown when the date field is cleared. The backend cannot remove a deadline yet. */
export const DEADLINE_CLEARED_MESSAGE = 'Pick a date. A deadline cannot be cleared yet.';
/** Shown for a date before today (design 8.1). Today is allowed, as on the add-college form. */
export const DEADLINE_PAST_MESSAGE = 'The deadline must be today or later.';
/** Shown when the date field holds a value that is not a real date. */
export const DEADLINE_INVALID_MESSAGE = 'Enter a valid deadline date.';

// Deadline state by college ID, loaded on page start and refreshed after each change.
// hasApplication: true when the backend has an application row for the college, false when it
// has none (the backend answers 404), so the deadline is absent.
const deadlineByCollege = new Map();

// Set by startDeadlinePage() on deadlines.html. Null on the graveyard page.
let deadlineTracker = null;

/**
 * Saves a college from the add-college form. On success, the college's tombstone rises
 * with the reveal animation. A deadline is saved as an application record. If that
 * second step fails, the college is still kept, so retrying would only create a duplicate.
 * Rejects when the college itself cannot be saved, and the form keeps the user's entries.
 * @param {ReturnType<import('./ui/form.js').getFormData>} data
 * @returns {Promise<string|null>} A note for the user, or null when everything saved.
 */
export async function saveNewCollege(data) {
  const studentId = await getStudentId();
  let college;
  try {
    college = await addCollege({
      studentId,
      name: data.name,
      state: data.state,
      location: data.location,
      acceptanceRate: data.acceptanceRate,
      scorecardId: data.scorecardId,
    });
  } catch (error) {
    // The college is already saved, possibly by an earlier request that timed out.
    // Reload the graveyard so its card shows up.
    if (error instanceof ApiError && error.code === 'DUPLICATE_COLLEGE') {
      await loadSavedColleges().catch((loadError) => {
        console.error('Could not refresh the graveyard after a duplicate:', loadError);
      });
    }
    throw error;
  }
  if (!college || college.id === undefined || college.id === null) {
    throw new Error('The server did not return the saved college.');
  }

  addTombstone(college);

  if (!data.deadlineDate) return null;
  try {
    try {
      await createApplication({ studentId, collegeId: college.id, deadlineDate: data.deadlineDate });
    } catch (error) {
      if (!(error instanceof ApiError && error.code === 'DUPLICATE_APPLICATION')) throw error;
      await updateDeadline(college.id, data.deadlineDate);
    }
    // Fill the deadline cache, so the detail view shows the new deadline without a page reload.
    deadlineByCollege.set(String(college.id), {
      hasApplication: true,
      deadlineDate: data.deadlineDate,
      status: 'pending',
    });
    return null;
  } catch {
    return DEADLINE_NOT_SAVED_MESSAGE;
  }
}

// Converts any stored or returned deadline value to "YYYY-MM-DD", or null when it has no valid date.
function dateOnly(value) {
  const date = parseDeadline(value);
  return date ? formatIsoDate(date) : null;
}

// Reads the deadline for a college. A 404 means the college has no application, so no deadline.
// Other errors are rethrown.
async function fetchDeadlineInfo(collegeId) {
  try {
    const info = await getDeadline(collegeId);
    return {
      hasApplication: true,
      deadlineDate: dateOnly(info?.deadlineDate),
      status: info?.status ?? null,
    };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return { hasApplication: false, deadlineDate: null, status: null };
    }
    throw error;
  }
}

/**
 * Loads the deadline for each college into the cache. A college whose lookup fails is left
 * uncached, so a later change asks the server again.
 * @param {object[]} colleges
 */
export async function loadDeadlines(colleges) {
  await Promise.all(colleges.map(async (college) => {
    const key = String(college.id);
    try {
      deadlineByCollege.set(key, await fetchDeadlineInfo(college.id));
    } catch (error) {
      deadlineByCollege.delete(key);
      console.error(`Could not load the deadline for college ${key}:`, error);
    }
  }));
}

async function currentDeadlineInfo(collegeId) {
  const key = String(collegeId);
  const cached = deadlineByCollege.get(key);
  if (cached) return cached;
  const info = await fetchDeadlineInfo(collegeId);
  deadlineByCollege.set(key, info);
  return info;
}

/**
 * Checks a deadline entered in the modal and returns it as "YYYY-MM-DD".
 * Throws a user-facing message for a cleared, invalid, or past date. No request is sent for these.
 * @param {string} value
 * @param {Date} [today] Injected for tests.
 * @returns {string}
 */
export function validateDeadlineInput(value, today = new Date()) {
  if (!value) throw new Error(DEADLINE_CLEARED_MESSAGE);
  const due = parseDeadline(value);
  if (!due) throw new Error(DEADLINE_INVALID_MESSAGE);
  const date = formatIsoDate(due);
  if (computeDaysRemaining(date, today) < 0) throw new Error(DEADLINE_PAST_MESSAGE);
  return date;
}

/**
 * Saves a new deadline for a college, reads it back from the server, and moves the zombie on the
 * deadlines page if that page is open. A college without an application gets one created with the
 * new date. If the save fails, the error is thrown and nothing on the page changes.
 * @param {object} college
 * @param {string} newDeadline "YYYY-MM-DD" from the date input.
 * @returns {Promise<string>} The saved deadline, "YYYY-MM-DD".
 */
export async function changeDeadline(college, newDeadline) {
  const value = validateDeadlineInput(newDeadline);
  const before = await currentDeadlineInfo(college.id);

  if (before.hasApplication) {
    await updateDeadline(college.id, value);
  } else {
    const studentId = await getStudentId();
    try {
      await createApplication({ studentId, collegeId: college.id, deadlineDate: value });
    } catch (error) {
      // 409: the application already exists (a stale cache, or a request that timed out but saved).
      // Update the existing one instead of failing.
      if (error instanceof ApiError && error.code === 'DUPLICATE_APPLICATION') {
        await updateDeadline(college.id, value);
      } else {
        throw error;
      }
    }
  }

  let fresh;
  try {
    fresh = await fetchDeadlineInfo(college.id);
  } catch (error) {
    // The save already succeeded, so use the date the server accepted.
    console.error('Deadline saved, but the refreshed deadline could not be loaded:', error);
    fresh = { hasApplication: true, deadlineDate: value, status: before.status };
  }
  deadlineByCollege.set(String(college.id), fresh);
  deadlineTracker?.setDeadline(college.id, fresh.deadlineDate);
  return fresh.deadlineDate ?? value;
}

/**
 * Loads the current student's saved colleges and their deadlines. Does not render anything.
 * @returns {Promise<object[]>}
 */
export async function fetchSavedColleges() {
  const colleges = await getColleges(await getStudentId());
  const list = Array.isArray(colleges) ? colleges : [];
  await loadDeadlines(list);
  return list;
}

/**
 * Loads the current student's saved colleges and renders them without the reveal
 * animation. Used on page start, so colleges persist across refreshes.
 * Each college carries its saved status, so a submitted college shows its checkmark on load.
 * @returns {Promise<object[]>} The colleges that were rendered.
 */
export async function loadSavedColleges() {
  const list = (await fetchSavedColleges()).map((college) => {
    const cached = deadlineByCollege.get(String(college.id));
    return { ...college, status: cached?.status ?? college.status ?? null };
  });
  renderTombstones(list);
  return list;
}

/**
 * Saves a status chosen in the detail modal (Task 21). The status is saved first. If the save fails,
 * the error is thrown and nothing changes on the page.
 * Choosing "submitted" for a college that is not yet submitted closes the modal, plays the zombie
 * defeat on the college's tombstone, then shows a checkmark. The modal shows "Submitted" when it reopens.
 * Choosing the status the college already has sends no request and plays nothing.
 * @param {object} college
 * @param {string} status One of pending, submitted, accepted, rejected, waitlisted.
 * @returns {Promise<void>}
 */
export async function changeApplicationStatus(college, status) {
  const key = String(college.id);
  const cached = deadlineByCollege.get(key);
  const current = cached?.status ?? college.status ?? null;
  if (status === current) return;

  await updateApplicationStatus(college.id, status);
  deadlineByCollege.set(key, {
    hasApplication: true,
    deadlineDate: null,
    ...(cached ?? {}),
    status,
  });

  if (status !== 'submitted') {
    clearTombstoneSubmitted(college.id);
    return;
  }

  // The modal sits above the graveyard, so close it to let the defeat show on the tombstone.
  closeDetailModal();
  markTombstoneSubmitted(college).catch((error) => {
    console.error('Could not show the submitted state on the tombstone:', error);
  });
}

/** Shown above the graveyard when a delete fails. The card stays. */
export const DELETE_FAILED_MESSAGE = 'Could not delete the college. It is still in your graveyard.';

function graveyardMessage() {
  let node = document.getElementById('graveyard-message');
  if (!node) {
    node = document.createElement('p');
    node.id = 'graveyard-message';
    node.className = 'form-message graveyard-message';
    node.setAttribute('role', 'alert');
    document.getElementById('college-tombstones')?.before(node);
  }
  return node;
}

/**
 * Deletes a college on the server. The graveyard removes the card only after this resolves.
 * A 404 means the server no longer has the college, so the card goes too. Any other failure
 * throws, and the card stays. On success the deadline cache and the tracker lane are cleared.
 * @param {object} college
 * @returns {Promise<void>}
 */
export async function deleteCollegeOnServer(college) {
  try {
    await deleteCollege(college.id);
  } catch (error) {
    if (!(error instanceof ApiError && error.status === 404)) throw error;
  }
  deadlineByCollege.delete(String(college.id));
  deadlineTracker?.removeCollege(college.id);
  graveyardMessage().textContent = '';
}

// Delete starts in the detail dialog, so a failure is shown inside it, where the user is looking.
// With the dialog closed, the message goes above the graveyard.
function showDeleteError(error) {
  const reason = String(error?.message || '').replace(/\.+\s*$/, '');
  const text = reason ? `${DELETE_FAILED_MESSAGE} (${reason})` : DELETE_FAILED_MESSAGE;
  const dialog = document.getElementById('college-detail-dialog');
  const dialogMessage = document.getElementById('detail-status-message');
  if (dialog?.open && dialogMessage) {
    dialogMessage.textContent = text;
    return;
  }
  graveyardMessage().textContent = text;
}

// Opens the detail dialog with the cached status and deadline, if they are loaded.
function openCollegeDetail(college) {
  const info = deadlineByCollege.get(String(college.id));
  openDetailModal(college, info ? { status: info.status, deadline: info.deadlineDate } : {});
}

/**
 * Sets up the graveyard, the detail modal, and the add-college form, then renders the given colleges.
 * Safe to call again. Each call replaces the previous cards and callbacks.
 * @param {object} [options]
 * @param {object[]} [options.colleges=[]] Saved college records to render as tombstones.
 */
export function initApp({ colleges = [] } = {}) {
  const container = document.getElementById('college-tombstones');
  if (!container) {
    throw new Error('Graveyard container #college-tombstones was not found.');
  }

  initDetailModal({
    onStatusChange: (college, status) => changeApplicationStatus(college, status),
    onDeadlineChange: (college, deadline) => changeDeadline(college, deadline),
    onDelete: (college) => requestDeleteCollege(college),
  });
  initForm({ lookup: lookupCollege, onSubmit: saveNewCollege });
  initGraveyard(container, {
    onSelect: (college) => openCollegeDetail(college),
    onDelete: (college) => deleteCollegeOnServer(college),
    onError: showDeleteError,
  });
  renderTombstones(colleges);
}

/**
 * Loads the saved colleges and their deadlines, then draws one lane per college on the deadlines page.
 * Each zombie is placed from its stored deadline, so the position survives a refresh.
 * Falls back to an empty track if loading fails.
 * @returns {Promise<object|null>} The tracker's handle.
 */
export async function startDeadlinePage() {
  let colleges = [];
  try {
    colleges = await fetchSavedColleges();
  } catch (error) {
    console.error('Could not load your saved colleges:', error);
  }

  const trackerColleges = colleges.map((college) => {
    const info = deadlineByCollege.get(String(college.id));
    return {
      ...college,
      deadline_date: info?.deadlineDate ?? null,
      status: info?.status ?? college.status ?? null,
    };
  });

  deadlineTracker = initDeadlineTracker({
    colleges: trackerColleges,
    updateApplicationStatus: async (collegeId, status) => {
      await updateApplicationStatus(collegeId, status);
      const cached = deadlineByCollege.get(String(collegeId));
      if (cached) cached.status = status;
    },
  });
  return deadlineTracker;
}

function start() {
  initParallax();
  initWobble();
  if (document.getElementById('college-tombstones')) {
    initApp();
    loadSavedColleges().catch((error) => {
      console.error('Could not load your saved colleges:', error);
    });
  }
  if (document.getElementById('deadline-track')) {
    startDeadlinePage();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}
