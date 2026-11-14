// frontend/js/ui/graveyard.js
// Graveyard container: renders, adds, and removes college tombstone cards.
import { createTombstoneCard } from './tombstone.js';

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

// Asks for confirmation, runs the optional onDelete callback, then removes the card.
async function confirmAndDelete(college) {
  const name = college.name || 'this college';
  if (!globalThis.confirm(`Delete ${name} from your graveyard? This cannot be undone.`)) {
    return false;
  }
  try {
    if (handlers.onDelete) await handlers.onDelete(college);
  } catch (error) {
    if (handlers.onError) handlers.onError(error);
    return false;
  }
  removeTombstone(college.id);
  return true;
}

const cardHandlers = {
  onSelect: (college) => {
    if (handlers.onSelect) handlers.onSelect(college);
  },
  onDelete: (college) => confirmAndDelete(college),
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
