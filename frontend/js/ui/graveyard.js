// frontend/js/ui/graveyard.js
// Graveyard container: renders, adds, and removes college tombstone cards.
import { createTombstoneCard, setTombstoneSubmitted, getTombstoneName } from './tombstone.js';
import { buildZombie, playZombieDefeat, prefersReducedMotion } from './deadline-tracker.js';

let container = null;
let handlers = {};

/**
 * Sets the container that holds the tombstone cards and the event callbacks.
 * Must run before any other function in this module.
 *
 * @param {HTMLElement} element The #college-tombstones element.
 * @param {object} [callbacks]
 * @param {(college: object) => void} [callbacks.onSelect] Called when a card is clicked.
 * @param {(college: object) => Promise<void>|void} [callbacks.onDelete] Persists the delete.
 *   The card is removed only after this resolves. If it throws, the card stays.
 * @param {(error: unknown) => void} [callbacks.onError] Called when onDelete throws.
 */
export function initGraveyard(element, callbacks = {}) {
  container = element;
  handlers = callbacks;
}

function requireContainer() {
  if (!container) {
    throw new Error('Graveyard is not initialized. Call initGraveyard() first.');
  }
}

function findCard(collegeId) {
  return Array.from(container.children).find(
    (card) => card.dataset.collegeId === String(collegeId)
  ) || null;
}

// A second request for the same college while the first is still running does nothing.
const deleting = new Set();

/**
 * Asks for confirmation, runs the onDelete callback, then removes the college's card. Called from
 * the detail dialog's Delete button. If onDelete throws, the card stays and onError receives the error.
 * @param {object} college Needs `id` and `name`.
 * @returns {Promise<boolean>} True when the college was deleted. False when the user cancelled,
 *   a delete for this college was already running, or the delete failed.
 */
export async function requestDeleteCollege(college) {
  const key = String(college.id);
  if (deleting.has(key)) return false;
  const name = college.name || 'this college';
  if (!globalThis.confirm(`Delete ${name} from your graveyard? This cannot be undone.`)) {
    return false;
  }
  deleting.add(key);
  try {
    if (handlers.onDelete) await handlers.onDelete(college);
  } catch (error) {
    if (handlers.onError) handlers.onError(error);
    return false;
  } finally {
    deleting.delete(key);
  }
  removeTombstone(college.id);
  return true;
}

const cardHandlers = {
  onSelect: (college) => {
    if (handlers.onSelect) handlers.onSelect(college);
  },
};

/**
 * Replaces all cards with one card per college. No reveal animation plays here,
 * so cards that already exist appear without the rise-up effect.
 * @param {object[]} colleges
 */
export function renderTombstones(colleges) {
  requireContainer();
  container.replaceChildren(
    ...colleges.map((college) => createTombstoneCard(college, cardHandlers))
  );
}

/**
 * Adds a card for a newly saved college and plays the rise-up reveal.
 * If a card for this college already exists, nothing is added.
 * @param {object} college
 * @returns {HTMLDivElement} The new or existing card.
 */
export function addTombstone(college) {
  requireContainer();
  const existing = findCard(college.id);
  if (existing) return existing;

  const card = createTombstoneCard(college, cardHandlers);
  card.querySelector('.college-tombstone__stone').classList.add('tombstone--reveal');
  container.appendChild(card);
  return card;
}

/**
 * Marks a college as submitted on the graveyard. A zombie falls on the card with the defeat
 * animation, then the stone shows a checkmark. With reduced motion, the defeat is skipped and the
 * checkmark appears at once.
 * @param {object} college Needs `id` and `name`.
 * @param {object} [options]
 * @param {boolean} [options.animate=true] Set to false to skip the defeat.
 * @returns {Promise<boolean>} False when no card exists for the college.
 */
export async function markTombstoneSubmitted(college, { animate = true } = {}) {
  requireContainer();
  const card = findCard(college.id);
  if (!card) return false;

  if (animate && !prefersReducedMotion()) {
    const zombie = buildZombie(getTombstoneName(college));
    zombie.classList.add('tombstone-zombie');
    card.append(zombie);
    await playZombieDefeat(zombie);
    zombie.remove();
  }
  setTombstoneSubmitted(card, true);
  return true;
}

/**
 * Removes the checkmark from a college's card. No animation plays.
 * @param {string|number} collegeId
 * @returns {boolean} False when no card exists for the college.
 */
export function clearTombstoneSubmitted(collegeId) {
  requireContainer();
  const card = findCard(collegeId);
  if (!card) return false;
  setTombstoneSubmitted(card, false);
  return true;
}

/**
 * Removes the card for a college from the DOM. Does not call the server.
 * @param {string|number} collegeId
 * @returns {boolean} True if a card was removed.
 */
export function removeTombstone(collegeId) {
  requireContainer();
  const card = findCard(collegeId);
  if (!card) return false;
  card.remove();
  return true;
}
