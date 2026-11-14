// frontend/js/ui/deadline-tracker.js
// Plants vs. Zombies-style deadline lanes for deadlines.html (requirements 3.2, design 3.1 and 4.4).
// One lane per college. A zombie walks from the left edge of the lane toward a sunflower at the right end.
import { getTombstoneName } from './tombstone.js';
import { parseDeadline, formatIsoDate } from './modal.js';

/** Days in one application cycle. Matches the 120-day cycle in backend/controllers/deadlineController.js. */
export const TOTAL_DAYS = 120;
export const DEADLINE_PASSED_TEXT = 'deadline has passed';
export const NO_DEADLINE_TEXT = 'No deadline set';
export const NO_COLLEGES_TEXT = 'No colleges to track yet.';
export const COMPLETE_BUTTON_TEXT = 'Mark as completed';

const CONTAINER_ID = 'deadline-track';
export const RAIL_CLASS = 'deadline-lane__rail';
const DEFEAT_DURATION_MS = 800;
const MS_PER_DAY = 86400000;
const noop = () => {};

/**
 * Counts whole calendar days from today to the deadline. A deadline today is 0.
 * A deadline in the past is negative. Returns null when the deadline is missing or invalid.
 * @param {string|Date|null|undefined} deadline "YYYY-MM-DD", an ISO timestamp, or a Date.
 * @param {Date} [today] Injected for tests.
 * @returns {number|null}
 */
export function computeDaysRemaining(deadline, today = new Date()) {
  const due = parseDeadline(deadline);
  if (!due) return null;
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((due - start) / MS_PER_DAY);
}

/**
 * Converts days remaining into the zombie's percent along the lane (design 4.4):
 * zombieProgress = (daysElapsed / totalDays) * 100. Days past the window clamp to 0 or 100.
 * @param {number|null} daysRemaining
 * @param {number} [totalDays=TOTAL_DAYS]
 * @returns {number|null} A value from 0 to 100, or null when there is no usable number.
 */
export function calculateZombiePercent(daysRemaining, totalDays = TOTAL_DAYS) {
  if (typeof daysRemaining !== 'number' || !Number.isFinite(daysRemaining)) return null;
  if (!(totalDays > 0)) throw new RangeError('totalDays must be a positive number');
  const elapsed = Math.min(totalDays, Math.max(0, totalDays - daysRemaining));
  return (elapsed / totalDays) * 100;
}

/**
 * Moves a zombie (or a completion tombstone) along its lane for the given days remaining.
 * A missing deadline leaves the walker at the start of the lane.
 * @param {HTMLElement} walkerEl Element to position. Inside a lane, the walker's rail
 *   (`.deadline-lane__rail`) gets `transform: translateX(<percent>%)`, so the zombie's own
 *   walking animation keeps its transform. A walker outside a rail gets the transform itself.
 * @param {number|null} daysRemaining
 * @param {number} [totalDays=TOTAL_DAYS]
 * @returns {number|null} The percent applied, or null when there was no deadline.
 */
export function updateZombiePosition(walkerEl, daysRemaining, totalDays = TOTAL_DAYS) {
  const percent = calculateZombiePercent(daysRemaining, totalDays);
  const position = percent ?? 0;
  // translateX(%) is relative to the moved element. The rail is as wide as the path, so
  // N% moves the walker N% of the path, the same place `left: N%` put it.
  const mover = walkerEl.closest?.(`.${RAIL_CLASS}`) ?? walkerEl;
  mover.style.transform = `translateX(${position}%)`;
  walkerEl.dataset.progress = String(position);
  return percent;
}

/**
 * Label for the space between the zombie and the sunflower.
 * @param {number|null} days
 * @returns {string}
 */
export function formatLaneLabel(days) {
  if (days === null) return NO_DEADLINE_TEXT;
  if (days < 0) return 'Deadline passed';
  if (days === 0) return '0 days remaining';
  return days === 1 ? '1 day remaining' : `${days} days remaining`;
}

function readDeadline(college) {
  return college.deadline_date ?? college.deadlineDate ?? college.deadline ?? null;
}

function make(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/**
 * True when the operating system asks for reduced motion. Reads the global matchMedia,
 * so tests can replace it.
 * @returns {boolean}
 */
export function prefersReducedMotion() {
  return typeof globalThis.matchMedia === 'function'
    && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches === true;
}

/**
 * Builds the zombie element from plain spans. Its look is set in style.css.
 * @param {string} name College name, used in the zombie's accessible label.
 * @returns {HTMLDivElement} The zombie, with class zombie--walking and role="img".
 */
export function buildZombie(name) {
  const zombie = make('div', 'zombie zombie--walking lane-marker');
  zombie.setAttribute('role', 'img');
  zombie.setAttribute('aria-label', `Zombie heading toward ${name}`);

  const head = make('span', 'zombie__head');
  head.append(
    make('span', 'zombie__hair'),
    make('span', 'zombie__eye zombie__eye--left'),
    make('span', 'zombie__eye zombie__eye--right'),
    make('span', 'zombie__mouth'),
  );

  zombie.append(
    make('span', 'zombie__arm zombie__arm--back'),
    make('span', 'zombie__leg zombie__leg--back'),
    make('span', 'zombie__torso'),
    make('span', 'zombie__arm zombie__arm--front'),
    make('span', 'zombie__leg zombie__leg--front'),
    head,
  );
  return zombie;
}

function buildSunflower(name) {
  const flower = make('div', 'lane-sunflower');
  flower.setAttribute('role', 'img');
  flower.setAttribute('aria-label', `Finish line: ${name}`);
  flower.append(make('span', 'lane-sunflower__name', name));
  return flower;
}

function buildCompletionTombstone(dateText) {
  const label = dateText ? `Completed ${dateText}` : 'Completed';
  return make('div', 'lane-marker lane-marker--completed tombstone tombstone--rounded', label);
}

// The end of the lane: the sunflower, or a tombstone once the deadline is today or past.
function buildEnd(name, days) {
  if (days !== null && days <= 0) {
    return make('div', 'lane-marker lane-marker--end tombstone tombstone--slab', DEADLINE_PASSED_TEXT);
  }
  return buildSunflower(name);
}

// Resolves when the element's own animation ends, or after fallbackMs. The fallback covers
// reduced-motion (no animation runs) and browsers that skip the event.
function waitForAnimation(element, fallbackMs) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      element.removeEventListener('animationend', onEnd);
      resolve();
    };
    const onEnd = (event) => {
      if (event.target === element) finish();
    };
    element.addEventListener('animationend', onEnd);
    setTimeout(finish, fallbackMs);
  });
}

/**
 * Plays the zombie defeat: the zombie tips backward and a dirt burst appears (requirements 3.2).
 * The returned promise resolves when the zombie's own animation ends, or after durationMs.
 * With reduced motion, nothing plays and the promise resolves at once. The caller removes the zombie.
 * @param {HTMLElement} zombie A zombie built by buildZombie.
 * @param {number} [durationMs=800] Fallback wait, in milliseconds.
 * @returns {Promise<void>}
 */
export function playZombieDefeat(zombie, durationMs = DEFEAT_DURATION_MS) {
  if (prefersReducedMotion()) return Promise.resolve();
  zombie.classList.remove('zombie--walking');
  zombie.classList.add('zombie--defeated');
  zombie.append(make('span', 'dirt-burst'));
  return waitForAnimation(zombie, durationMs);
}

function refreshLane(view, settings) {
  const days = computeDaysRemaining(readDeadline(view.college), settings.today());
  const percent = updateZombiePosition(view.walker, days, settings.totalDays);
  // The label sits halfway between the walker and the lane end (100%).
  view.days.textContent = formatLaneLabel(days);
  view.days.style.left = `${((percent ?? 0) + 100) / 2}%`;
  view.end.replaceChildren(buildEnd(view.name, days));
}

async function completeLane(view, settings) {
  if (view.busy || view.completed) return;
  view.busy = true;
  view.button.disabled = true;
  view.message.textContent = '';

  try {
    await settings.updateApplicationStatus(view.college.id, 'submitted');
  } catch (error) {
    view.busy = false;
    view.button.disabled = false;
    view.message.textContent = `Could not save completion: ${error?.message || 'unknown error'}`;
    return;
  }

  view.completed = true;
  view.college = { ...view.college, status: 'submitted' };
  const zombie = view.walker;
  await playZombieDefeat(zombie, settings.defeatDurationMs);

  const tombstone = buildCompletionTombstone(formatIsoDate(settings.today()));
  // The tombstone takes the zombie's place on the same rail, so it keeps the zombie's position.
  tombstone.dataset.progress = zombie.dataset.progress ?? '0';
  zombie.replaceWith(tombstone);
  view.walker = tombstone;
  view.button.textContent = 'Completed';
  view.busy = false;
}

function renderLane(college, settings) {
  const name = getTombstoneName(college);
  const alreadySubmitted = college.status === 'submitted';

  const lane = make('section', 'deadline-lane');
  lane.dataset.collegeId = String(college.id);
  lane.setAttribute('aria-label', `Deadline lane for ${name}`);

  const header = make('div', 'deadline-lane__header');
  const button = make('button', 'btn deadline-lane__complete', COMPLETE_BUTTON_TEXT);
  button.type = 'button';
  button.setAttribute('aria-label', `Mark ${name} as completed`);
  header.append(button);

  const strip = make('div', 'deadline-lane__strip');
  const path = make('div', 'deadline-lane__path');
  const days = make('span', 'deadline-lane__days');
  const end = make('div', 'deadline-lane__end');

  let walker;
  if (alreadySubmitted) {
    const submittedAt = parseDeadline(college.submitted_at);
    walker = buildCompletionTombstone(submittedAt ? formatIsoDate(submittedAt) : null);
  } else {
    walker = buildZombie(name);
  }
  // The rail is as wide as the path and carries the walker. Moving the rail with transform
  // leaves the zombie's own walking animation free to use its transform.
  const rail = make('div', RAIL_CLASS);
  rail.append(walker);
  path.append(rail, days);
  strip.append(path, end);

  const message = make('p', 'deadline-lane__message');
  message.setAttribute('role', 'status');
  lane.append(header, strip, message);

  const view = {
    college,
    name,
    completed: alreadySubmitted,
    busy: false,
    walker,
    days,
    end,
    button,
    message,
  };

  if (alreadySubmitted) {
    button.textContent = 'Completed';
    button.disabled = true;
  } else {
    button.addEventListener('click', () => completeLane(view, settings));
  }

  refreshLane(view, settings);
  return { lane, view };
}

/**
 * Renders one deadline lane per college into #deadline-track and starts the tracker.
 * Calling it again replaces the lanes.
 *
 * @param {object} [options]
 * @param {HTMLElement} [options.container] Lane container. Defaults to #deadline-track.
 * @param {object[]} [options.colleges=[]] Colleges with `id`, `name`, a deadline (`deadline_date`),
 *   and optional `status` and `submitted_at`. Data loading arrives with tasks 17 and 20.
 * @param {(collegeId: string|number, status: string) => Promise<unknown>|unknown} [options.updateApplicationStatus]
 *   Saves the status. Called with 'submitted' by Mark as completed. The lane completes only after it resolves.
 *   Defaults to a no-op until apiClient exists (task 17).
 * @param {() => Date} [options.today] Clock, injected for tests.
 * @param {number} [options.defeatDurationMs=800] Fallback wait for the defeat animation.
 * @param {number} [options.totalDays=120] Days in the lane window.
 * @returns {{laneCount: number, refresh: () => void, setDeadline: (collegeId: string|number, deadline: string|null) => boolean}}
 */
export function initDeadlineTracker(options = {}) {
  const {
    container = document.getElementById(CONTAINER_ID),
    colleges = [],
    updateApplicationStatus = noop,
    today = () => new Date(),
    defeatDurationMs = DEFEAT_DURATION_MS,
    totalDays = TOTAL_DAYS,
  } = options;

  if (!container) {
    throw new Error(`Deadline track container #${CONTAINER_ID} was not found.`);
  }

  const settings = { updateApplicationStatus, today, defeatDurationMs, totalDays };
  const list = Array.isArray(colleges) ? colleges.filter((c) => c && typeof c === 'object') : [];

  if (list.length === 0) {
    container.replaceChildren(make('p', 'deadline-empty', NO_COLLEGES_TEXT));
    return { laneCount: 0, refresh: noop, removeCollege: () => false, setDeadline: () => false };
  }

  let views = list.map((college) => {
    const { lane, view } = renderLane(college, settings);
    return { lane, view };
  });
  container.replaceChildren(...views.map((entry) => entry.lane));

  return {
    get laneCount() { return views.length; },
    refresh() {
      for (const { view } of views) refreshLane(view, settings);
    },
    /**
     * Removes the lane for a deleted college. Shows the empty message when no lanes are left.
     * @param {string|number} collegeId
     * @returns {boolean} True if a lane was removed.
     */
    removeCollege(collegeId) {
      const match = views.find(({ view }) => String(view.college.id) === String(collegeId));
      if (!match) return false;
      match.lane.remove();
      views = views.filter((entry) => entry !== match);
      if (views.length === 0) container.replaceChildren(make('p', 'deadline-empty', NO_COLLEGES_TEXT));
      return true;
    },
    /**
     * Sets a new deadline for one lane and moves its zombie to the new position.
     * The rail's CSS transform transition animates the move.
     * @param {string|number} collegeId
     * @param {string|null} deadline "YYYY-MM-DD" or null.
     * @returns {boolean} True if a lane for this college exists.
     */
    setDeadline(collegeId, deadline) {
      const match = views.find(({ view }) => String(view.college.id) === String(collegeId));
      if (!match) return false;
      match.view.college = { ...match.view.college, deadline_date: deadline };
      refreshLane(match.view, settings);
      return true;
    },
  };
}
