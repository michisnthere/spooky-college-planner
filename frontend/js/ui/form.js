// frontend/js/ui/form.js
// Add-college form inside #add-college-dialog. Covers college search with
// suggestions, auto-fill, validation, submit, and reset.
// The lookup and save functions are injected through initForm(). Task 17 supplies
// the real lookup (apiClient) and task 19 supplies the real save.
import { parseDeadline } from './modal.js';
import { normalizeState } from './states.js';
import { getMissingAttributes, promptForMissingInfo } from './missing-info.js';

export const MIN_QUERY_LENGTH = 2;

/** Wait after the last keystroke before the lookup runs, in milliseconds (task 18). */
export const SEARCH_DEBOUNCE_MS = 300;

export const MESSAGES = Object.freeze({
  NOT_FOUND: 'College not found. You can enter the details by hand.',
  LOOKUP_FAILED: 'Could not search colleges right now. You can enter the details by hand.',
  SAVE_NOT_CONNECTED: 'Saving is not connected yet.',
  ADDED: 'College added to your graveyard.',
  NAME_REQUIRED: 'Enter a college name.',
  RATE_RANGE: 'Acceptance rate must be a number from 0 to 100.',
  DATE_INVALID: 'Enter a valid deadline date.',
  STATE_INVALID: 'Enter a US state or territory, such as Massachusetts or MA.',
  DATE_PAST: 'The deadline must be today or later.',
});

const IDS = Object.freeze({
  dialog: 'add-college-dialog',
  openButton: 'add-college-button',
  cancelButton: 'add-college-cancel',
  form: 'add-college-form',
  search: 'college-search',
  spinner: 'college-search-spinner',
  suggestions: 'college-suggestions',
  lookupMessage: 'college-lookup-message',
  location: 'college-location',
  state: 'college-state',
  acceptanceRate: 'college-acceptance-rate',
  deadline: 'college-deadline',
  message: 'add-college-message',
  submit: 'add-college-submit',
});

// Default lookup: makes no network call yet, so every query returns no matches.
const defaultLookup = async () => [];

// Default save: rejects, so the form never reports a college as saved before task 19 wires it.
const defaultSave = async () => {
  throw new Error(MESSAGES.SAVE_NOT_CONNECTED);
};

let lookupCollege = defaultLookup;
let saveCollege = defaultSave;
let selectedCollege = null;
let currentResults = [];
let searchSeq = 0;
let submitting = false;
let domBound = false;
let searchBound = false;
let searchTimer = null;
let elements = null;

// Drops a debounced search that has not run yet.
function cancelPendingSearch() {
  if (searchTimer !== null) {
    clearTimeout(searchTimer);
    searchTimer = null;
  }
}

function getElements() {
  if (elements) return elements;
  const found = {};
  for (const [key, id] of Object.entries(IDS)) {
    const node = document.getElementById(id);
    if (!node) throw new Error(`Add-college form element #${id} was not found.`);
    found[key] = node;
  }
  elements = found;
  return elements;
}

function emptyToNull(value) {
  const trimmed = String(value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

function setIfPresent(input, value) {
  if (value === null || value === undefined || value === '') return;
  input.value = String(value);
}

function setLoading(isLoading) {
  const { spinner, search } = getElements();
  spinner.hidden = !isLoading;
  search.setAttribute('aria-busy', String(isLoading));
}

function setLookupMessage(text) {
  getElements().lookupMessage.textContent = text;
}

function setFormMessage(text) {
  getElements().message.textContent = text;
}

function clearSuggestions() {
  const { suggestions, search } = getElements();
  currentResults = [];
  suggestions.replaceChildren();
  suggestions.hidden = true;
  search.setAttribute('aria-expanded', 'false');
}

/**
 * Returns the text shown for one suggestion, such as "Harvard University, MA".
 * @param {{name?: string, state?: string}} college
 * @returns {string}
 */
export function formatSuggestionLabel(college) {
  const name = String(college?.name ?? '').trim() || 'Unnamed college';
  const state = String(college?.state ?? '').trim();
  return state ? `${name}, ${state}` : name;
}

function renderSuggestions(colleges) {
  const { suggestions, search } = getElements();
  currentResults = colleges;
  suggestions.replaceChildren(
    ...colleges.map((college) => {
      const item = document.createElement('li');
      item.tabIndex = 0;
      item.textContent = formatSuggestionLabel(college);
      item.addEventListener('click', () => selectCollege(college));
      item.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        selectCollege(college);
      });
      return item;
    })
  );
  suggestions.hidden = colleges.length === 0;
  search.setAttribute('aria-expanded', String(colleges.length > 0));
}

/**
 * Fills the form from a lookup result. Fields with no value in the result keep what
 * the user typed. The college is remembered so getFormData() can send its scorecard ID.
 * @param {object} college Lookup result with name, city, state, and acceptanceRate.
 */
export function autoFillForm(college) {
  if (!college || typeof college !== 'object') {
    throw new TypeError('autoFillForm needs a college object.');
  }
  const el = getElements();
  selectedCollege = college;
  setIfPresent(el.search, college.name);
  setIfPresent(el.location, college.city ?? college.location);
  setIfPresent(el.state, normalizeState(college.state) ?? college.state);
  setIfPresent(el.acceptanceRate, college.acceptanceRate ?? college.acceptance_rate);
}

/** Applies a suggestion the user picked: fills the form and closes the list. */
async function selectCollege(college) {
  autoFillForm(college);
  clearSuggestions();
  setLookupMessage('');
  await completeMissingInfo(college);
}

/**
 * Asks the user for the attributes a looked-up college lacks (location, state, acceptance rate).
 * Opens one dialog listing all of them. Nothing opens when nothing is missing. Values the user
 * saves are copied into the form. Skipping leaves those inputs as they were, so manual entry still works.
 * @param {object} college A lookup result.
 * @returns {Promise<Record<string, string|number>|null>} The values copied into the form, or null.
 */
export async function completeMissingInfo(college) {
  const missing = getMissingAttributes(college);
  if (missing.length === 0) return null;
  const values = await promptForMissingInfo(missing, college?.name);
  if (!values) return null;
  const el = getElements();
  // The user just typed these on purpose, so they replace whatever the form held.
  if (values.location !== undefined) el.location.value = String(values.location);
  if (values.state !== undefined) el.state.value = String(values.state);
  if (values.acceptanceRate !== undefined) el.acceptanceRate.value = String(values.acceptanceRate);
  return values;
}

/**
 * Searches for colleges and shows suggestions. Queries shorter than MIN_QUERY_LENGTH
 * are skipped. A response that arrives after a newer query has started is ignored.
 * Failed lookups show an error message and keep the form usable.
 * @param {string} rawQuery The text in the college name field.
 * @returns {Promise<object[]>} The suggestions shown, or an empty array.
 */
export async function handleSearch(rawQuery) {
  const query = String(rawQuery ?? '').trim();
  const seq = ++searchSeq;

  if (query.length < MIN_QUERY_LENGTH) {
    clearSuggestions();
    setLoading(false);
    setLookupMessage('');
    return [];
  }

  setLoading(true);
  setLookupMessage('');
  let results;
  try {
    results = await lookupCollege(query);
  } catch {
    if (seq !== searchSeq) return [];
    setLoading(false);
    clearSuggestions();
    setLookupMessage(MESSAGES.LOOKUP_FAILED);
    return [];
  }

  if (seq !== searchSeq) return [];
  setLoading(false);
  const list = Array.isArray(results) ? results : [];
  renderSuggestions(list);
  if (list.length === 0) setLookupMessage(MESSAGES.NOT_FOUND);
  return list;
}

/**
 * Connects the college name field to handleSearch(). Each keystroke restarts a
 * SEARCH_DEBOUNCE_MS timer, so the lookup runs once typing pauses. Clearing the
 * field, or a query shorter than MIN_QUERY_LENGTH, updates the list at once.
 * Enter selects the first suggestion when the list is open.
 */
export function setupSearchInput() {
  if (searchBound) return;
  searchBound = true;
  const { search, suggestions } = getElements();

  search.addEventListener('input', () => {
    selectedCollege = null;
    cancelPendingSearch();
    if (search.value.trim().length < MIN_QUERY_LENGTH) {
      handleSearch(search.value);
      return;
    }
    searchTimer = setTimeout(() => {
      searchTimer = null;
      handleSearch(search.value);
    }, SEARCH_DEBOUNCE_MS);
  });

  search.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || suggestions.hidden || currentResults.length === 0) return;
    event.preventDefault();
    selectCollege(currentResults[0]);
  });
}

/**
 * Reads the form fields. Blank optional fields become null. Values are trimmed.
 * Acceptance rate becomes a number, or NaN if the text is not numeric (validation rejects that).
 * @returns {{name: string, location: string|null, state: string|null,
 *   acceptanceRate: number|null, deadlineDate: string|null, scorecardId: (string|number|null)}}
 */
export function getFormData() {
  const el = getElements();
  const rate = el.acceptanceRate.value.trim();
  return {
    name: el.search.value.trim(),
    location: emptyToNull(el.location.value),
    state: (() => {
      const typed = emptyToNull(el.state.value);
      // A code or a differently cased name becomes the full name. Anything else stays as typed, so validation can reject it.
      return typed === null ? null : (normalizeState(typed) ?? typed);
    })(),
    acceptanceRate: rate === '' ? null : Number(rate),
    deadlineDate: emptyToNull(el.deadline.value),
    scorecardId: selectedCollege?.scorecardId ?? selectedCollege?.id ?? null,
  };
}

/**
 * Checks form data before submit. Returns the first problem as a message, or null when valid.
 * The deadline is optional. When given, it must be today or later.
 * @param {ReturnType<typeof getFormData>} data
 * @param {Date} [today] Injected for tests.
 * @returns {string|null}
 */
export function validateFormData(data, today = new Date()) {
  if (!data.name) return MESSAGES.NAME_REQUIRED;

  if (data.state !== null && data.state !== undefined && !normalizeState(data.state)) return MESSAGES.STATE_INVALID;
  if (data.acceptanceRate !== null) {
    const rate = data.acceptanceRate;
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) return MESSAGES.RATE_RANGE;
  }

  if (data.deadlineDate !== null) {
    const due = parseDeadline(data.deadlineDate);
    if (!due) return MESSAGES.DATE_INVALID;
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    if (due < startOfToday) return MESSAGES.DATE_PAST;
  }

  return null;
}

/**
 * Clears every field, the suggestions, and the messages. Also cancels any lookup
 * still in flight and forgets the selected college.
 */
export function resetForm() {
  const el = getElements();
  cancelPendingSearch();
  searchSeq += 1;
  selectedCollege = null;
  el.form.reset();
  clearSuggestions();
  setLoading(false);
  setLookupMessage('');
  setFormMessage('');
}

function setSubmitting(isSubmitting) {
  submitting = isSubmitting;
  const { submit, form } = getElements();
  submit.disabled = isSubmitting;
  form.setAttribute('aria-busy', String(isSubmitting));
}

// Builds the message shown after a failed save. A duplicate needs a different name, so
// "try again" would not help there.
function saveErrorMessage(error) {
  if (error?.code === 'DUPLICATE_COLLEGE') {
    return `Could not add college: ${error.message} Change the name to add a different college.`;
  }
  // Server and client messages may already end with a period, so drop it before adding the sentence.
  const reason = String(error?.message || 'unknown error').replace(/\.+\s*$/, '');
  return `Could not add college: ${reason}. Your details are still here, so you can try again.`;
}

// Validates, then calls the save function. Success resets the form. Failure keeps
// the data so the user can retry.
async function handleSubmit(event) {
  event.preventDefault();
  if (submitting) return;

  const data = getFormData();
  const problem = validateFormData(data);
  if (problem) {
    setFormMessage(problem);
    return;
  }

  setSubmitting(true);
  setFormMessage('');
  try {
    const note = await saveCollege(data);
    resetForm();
    setFormMessage(typeof note === 'string' && note ? note : MESSAGES.ADDED);
  } catch (error) {
    setFormMessage(saveErrorMessage(error));
  } finally {
    setSubmitting(false);
  }
}

function openDialog() {
  const { dialog } = getElements();
  dialog.classList.add('dialog--fade-in');
  if (!dialog.open) dialog.showModal();
}

/**
 * Sets up the add-college form: search, submit, and the dialog's open and cancel buttons.
 * Safe to call again. Each call replaces the lookup and save functions.
 * @param {object} [callbacks]
 * @param {(query: string) => Promise<object[]>} [callbacks.lookup] Returns colleges that match a
 *   name. Each item has name, city, state, acceptanceRate, and id. Defaults to no matches.
 * @param {(data: ReturnType<typeof getFormData>) => Promise<string|null|void>} [callbacks.onSubmit]
 *   Saves a college. The form resets only if this resolves. A string it resolves with is shown
 *   as the success message instead of the default. Defaults to a rejection.
 */
export function initForm({ lookup, onSubmit } = {}) {
  lookupCollege = typeof lookup === 'function' ? lookup : defaultLookup;
  saveCollege = typeof onSubmit === 'function' ? onSubmit : defaultSave;

  const el = getElements();
  setupSearchInput();
  if (!domBound) {
    domBound = true;
    el.openButton.addEventListener('click', openDialog);
    el.cancelButton.addEventListener('click', () => el.dialog.close());
    el.form.addEventListener('submit', handleSubmit);
  }
}
