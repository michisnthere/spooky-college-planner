// frontend/js/ui/wobble.js
// Wobbly stones on touch screens. A mouse hover plays the rumble from CSS alone (animations.css).
// A touch screen has no hover, so a tap adds the .tombstone--wobble class, which plays the same
// rumble once. The class is removed when the animation ends, so the next tap plays it again.

/** Class that plays the tap rumble. */
export const WOBBLE_CLASS = 'tombstone--wobble';
/** Longest the class stays if the browser never reports the end of the animation, in ms. */
export const WOBBLE_FALLBACK_MS = 700;

const TOUCH_POINTERS = new Set(['touch', 'pen']);
// One fallback timer per stone, so an earlier tap cannot cut a later one short.
const timers = new WeakMap();

function reducedMotion(win) {
  return typeof win.matchMedia === 'function'
    && win.matchMedia('(prefers-reduced-motion: reduce)').matches === true;
}

/**
 * Plays the rumble on one stone. Safe to call again while it plays: the animation restarts.
 * @param {HTMLElement} stone An element with the .tombstone class.
 * @param {Window|typeof globalThis} [win=globalThis]
 * @returns {boolean} False when reduced motion is on and nothing played.
 */
export function wobbleStone(stone, win = globalThis) {
  if (reducedMotion(win)) return false;
  stone.classList.remove(WOBBLE_CLASS);
  // Reading a layout property makes the browser notice the removal, so the class restarts the animation.
  void stone.offsetWidth;
  stone.classList.add(WOBBLE_CLASS);
  const stop = () => {
    clearTimeout(timers.get(stone));
    stone.classList.remove(WOBBLE_CLASS);
  };
  clearTimeout(timers.get(stone));
  stone.addEventListener('animationend', stop, { once: true });
  timers.set(stone, setTimeout(stop, WOBBLE_FALLBACK_MS));
  return true;
}

/**
 * Listens for taps on any .tombstone, including stones added later. Mouse and keyboard clicks
 * are ignored, since the CSS hover and focus rules already cover them.
 * @param {Document} [doc=document]
 * @param {Window|typeof globalThis} [win=globalThis]
 * @returns {() => void} Removes the listener.
 */
export function initWobble(doc = document, win = globalThis) {
  const onClick = (event) => {
    if (!TOUCH_POINTERS.has(event.pointerType)) return;
    const stone = typeof event.target?.closest === 'function' ? event.target.closest('.tombstone') : null;
    if (stone) wobbleStone(stone, win);
  };
  doc.addEventListener('click', onClick);
  return () => doc.removeEventListener('click', onClick);
}
