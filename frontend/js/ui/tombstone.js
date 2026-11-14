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

/**
 * Creates a tombstone card for one college. The card has a stone button that
 * selects the college, and a sibling delete button. The delete button is not
 * nested inside the stone because interactive elements cannot be nested.
 *
 * Name text is set with textContent, never innerHTML, so names cannot inject markup.
 *
 * @param {object} college Saved college record. Needs `id` and `name`.
 * @param {object} [handlers]
 * @param {(college: object) => void} [handlers.onSelect] Called when the stone is clicked.
 * @param {(college: object) => void} [handlers.onDelete] Called when the delete button is clicked.
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
  stone.addEventListener('click', () => {
    if (handlers.onSelect) handlers.onSelect(college);
  });

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'btn tombstone-delete';
  deleteButton.textContent = 'Delete';
  deleteButton.setAttribute('aria-label', `Delete ${name}`);
  deleteButton.addEventListener('click', () => {
    if (handlers.onDelete) handlers.onDelete(college);
  });

  card.append(stone, deleteButton);
  return card;
}
