// frontend/js/ui/tombstone.js
// College tombstone card component. Builds the DOM for one saved college.

// Every college uses one shape until ranking categories exist (see design.md 3.3).
export const TOMBSTONE_SHAPE_CLASS = 'tombstone--rounded';

/**
 * Returns the text shown on a tombstone. Falls back when the name is missing.
 * @param {{name?: string|null}} college
 * @returns {string}
 */
export function getTombstoneName(college) {
  const name = typeof college?.name === 'string' ? college.name.trim() : '';
  return name || 'Unnamed college';
}

/** Modifier class added to a stone whose application is submitted (Task 21). */
export const SUBMITTED_CLASS = 'tombstone--submitted';
const CHECK_CLASS = 'tombstone__check';

/**
 * Shows or hides the submitted state on a card: a checkmark on the stone and the modifier class.
 * Safe to call more than once.
 * @param {HTMLElement} card The card from createTombstoneCard.
 * @param {boolean} submitted
 * @returns {boolean} False when the card has no stone.
 */
export function setTombstoneSubmitted(card, submitted) {
  const stone = card.querySelector('.college-tombstone__stone');
  if (!stone) return false;
  let check = stone.querySelector(`.${CHECK_CLASS}`);

  if (submitted) {
    stone.classList.add(SUBMITTED_CLASS);
    if (!check) {
      check = document.createElement('span');
      check.className = CHECK_CLASS;
      check.textContent = '✓';
      check.setAttribute('role', 'img');
      check.setAttribute('aria-label', 'Submitted');
      stone.append(check);
    }
  } else {
    stone.classList.remove(SUBMITTED_CLASS);
    if (check) check.remove();
  }
  return true;
}

/**
 * Creates the drifting mist laid over the base of a stone. It is decoration only: hidden from
 * screen readers, it ignores the pointer, and it holds no text.
 * @returns {HTMLSpanElement}
 */
export function createFog() {
  const fog = document.createElement('span');
  fog.className = 'tombstone__fog';
  fog.setAttribute('aria-hidden', 'true');
  return fog;
}
/**
 * Creates a tombstone card for one college: a stone button that selects the college.
 * Deleting is done from the detail dialog, not from the card.
 *
 * Name text is set with textContent, never innerHTML, so names cannot inject markup.
 *
 * @param {object} college Saved college record. Needs `id` and `name`.
 * @param {object} [handlers]
 * @param {(college: object) => void} [handlers.onSelect] Called when the stone is clicked.
 * @returns {HTMLDivElement} The card wrapper element.
 */
export function createTombstoneCard(college, handlers = {}) {
  const name = getTombstoneName(college);

  const card = document.createElement('div');
  card.className = 'college-tombstone';
  card.dataset.collegeId = String(college.id);

  const stone = document.createElement('button');
  stone.type = 'button';
  stone.className = `tombstone ${TOMBSTONE_SHAPE_CLASS} college-tombstone__stone`;
  stone.textContent = name;
  stone.append(createFog());
  stone.addEventListener('click', () => {
    if (handlers.onSelect) handlers.onSelect(college);
  });


  card.append(stone);
  if (college.status === 'submitted') setTombstoneSubmitted(card, true);
  return card;
}
