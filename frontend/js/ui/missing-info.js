// frontend/js/ui/missing-info.js
// Dialog shown when a looked-up college lacks location, state, or acceptance rate.
// It lists every missing attribute, gives one input for each, validates the entries, and
// resolves with the values the user typed. A native <dialog>, like the other dialogs.
import { normalizeState } from './states.js';

export const MISSING_MESSAGES = Object.freeze({
  RATE: 'Acceptance rate must be a number from 0 to 100.',
  STATE: 'Enter a US state or territory, such as Massachusetts or MA.',
  LOCATION: 'Location must be 255 characters or fewer.',
});

/** The attributes a lookup can leave empty. `field` is the key in the lookup result. */
export const ATTRIBUTES = Object.freeze([
  { key: 'location', label: 'Location', from: ['city', 'location'], type: 'text', hint: 'City' },
  { key: 'state', label: 'State', from: ['state'], type: 'text', hint: 'For example Massachusetts' },
  { key: 'acceptanceRate', label: 'Acceptance rate (%)', from: ['acceptanceRate', 'acceptance_rate'], type: 'text', inputMode: 'decimal', hint: '0 to 100' },
]);

const isBlank = (value) =>
  value === null || value === undefined || (typeof value === 'number' && Number.isNaN(value)) ||
  ['', 'nan', 'null', 'undefined'].includes(String(value).trim().toLowerCase());

/**
 * Lists the attributes a looked-up college has no usable value for.
 * Blank, null, undefined, NaN, and the strings "NaN", "null" and "undefined" all count as missing.
 * @param {object} college A lookup result.
 * @returns {typeof ATTRIBUTES[number][]}
 */
export function getMissingAttributes(college) {
  const source = college && typeof college === 'object' ? college : {};
  return ATTRIBUTES.filter((attr) => attr.from.every((name) => isBlank(source[name])));
}

/**
 * Checks one value typed into the dialog. Blank is allowed and means "leave it empty".
 * @param {string} key One of the ATTRIBUTES keys.
 * @param {string} raw The text in the input.
 * @returns {{value: string|number|null, error: string|null}}
 */
export function validateMissingValue(key, raw) {
  const text = String(raw ?? '').trim();
  if (text === '') return { value: null, error: null };
  if (key === 'acceptanceRate') {
    const rate = Number(text);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) return { value: null, error: MISSING_MESSAGES.RATE };
    return { value: rate, error: null };
  }
  if (key === 'state') {
    const state = normalizeState(text);
    return state ? { value: state, error: null } : { value: null, error: MISSING_MESSAGES.STATE };
  }
  if (key === 'location') {
    return text.length > 255 ? { value: null, error: MISSING_MESSAGES.LOCATION } : { value: text, error: null };
  }
  return { value: text, error: null };
}

function getParts() {
  const dialog = document.getElementById('missing-info-dialog');
  if (!dialog) return null;
  return {
    dialog,
    form: document.getElementById('missing-info-form'),
    summary: document.getElementById('missing-info-summary'),
    fields: document.getElementById('missing-info-fields'),
    message: document.getElementById('missing-info-message'),
    skip: document.getElementById('missing-info-skip'),
  };
}

function sentence(labels) {
  const names = labels.map((label) => label.replace(/\s*\(.*\)$/, '').toLowerCase());
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Opens the dialog for the given missing attributes and waits for the user.
 * Resolves with an object of the validated values (only the attributes that were filled in),
 * or null if the user skipped or pressed Escape. Resolves null at once when nothing is missing
 * or the dialog markup is not on the page.
 * @param {typeof ATTRIBUTES[number][]} missing
 * @param {string} [collegeName]
 * @returns {Promise<Record<string, string|number>|null>}
 */
export function promptForMissingInfo(missing, collegeName = '') {
  const parts = getParts();
  if (!parts || !Array.isArray(missing) || missing.length === 0) return Promise.resolve(null);
  const { dialog, form, summary, fields, message, skip } = parts;

  const name = String(collegeName || '').trim();
  summary.textContent =
    `${name ? `${name}: ` : ''}the lookup could not find the ${sentence(missing.map((a) => a.label))}. ` +
    'Fill in what you know, or skip to leave it empty.';
  message.textContent = '';
  fields.replaceChildren(
    ...missing.map((attr) => {
      const wrap = document.createElement('div');
      wrap.className = 'form-field';
      const label = document.createElement('label');
      label.htmlFor = `missing-${attr.key}`;
      label.textContent = attr.label;
      const input = document.createElement('input');
      input.id = `missing-${attr.key}`;
      input.name = attr.key;
      input.dataset.key = attr.key;
      input.type = attr.type;
      input.placeholder = attr.hint;
      // A text input, so "abc" reaches validation. A number input would hide it as an empty value.
      if (attr.inputMode) input.inputMode = attr.inputMode;
      wrap.append(label, input);
      return wrap;
    })
  );

  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      form.removeEventListener('submit', onSubmit);
      skip.removeEventListener('click', onSkip);
      dialog.removeEventListener('cancel', onSkip);
      dialog.removeEventListener('close', onSkip);
      if (dialog.hasAttribute('open')) {
        if (typeof dialog.close === 'function') dialog.close();
        else dialog.removeAttribute('open');
      }
      resolve(result);
    };
    const onSkip = () => finish(null);
    const onSubmit = (event) => {
      event.preventDefault();
      const values = {};
      let firstBad = null;
      for (const input of fields.querySelectorAll('input')) {
        const { value, error } = validateMissingValue(input.dataset.key, input.value);
        input.removeAttribute('aria-invalid');
        if (error) {
          input.setAttribute('aria-invalid', 'true');
          message.textContent = firstBad ? message.textContent : error;
          firstBad = firstBad || input;
        } else if (value !== null) {
          values[input.dataset.key] = value;
        }
      }
      if (firstBad) {
        firstBad.focus?.();
        return;
      }
      finish(values);
    };
    form.addEventListener('submit', onSubmit);
    skip.addEventListener('click', onSkip);
    dialog.addEventListener('cancel', onSkip);
    dialog.addEventListener('close', onSkip);
    dialog.classList.add('dialog--fade-in');
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    fields.querySelector('input')?.focus?.();
  });
}
