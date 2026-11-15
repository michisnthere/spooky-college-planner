// frontend/js/ui/parallax.js
// Multi-layer parallax for the night scenery. Each .scenery__layer moves by a share of the scroll
// distance (data-parallax-speed), so distant layers move slower than near ones. Layers move with
// transform only. Both the page scroll and the graveyard's sideways scroll count.

/** The most a layer moves up with the page scroll, in px. The layers reach this far below the screen. */
export const MAX_SHIFT_Y = 120;
/** The most a layer without a tile (the moon) moves sideways, in px. */
export const MAX_SHIFT_X = 80;

/**
 * Works out how far one layer moves for a given scroll position.
 * A layer with a tile width wraps sideways, so the repeating artwork never runs out.
 * A layer without a tile stops at MAX_SHIFT_X.
 * @param {number} scrollX Total sideways scroll (page plus graveyard), in px.
 * @param {number} scrollY Page scroll down, in px.
 * @param {number} speed Share of the scroll the layer follows. 0 keeps it still.
 * @param {number} [tile=0] Width of the repeating artwork in px. 0 means no wrapping.
 * @returns {{x: number, y: number}} Translation in px. Zero or negative.
 */
export function layerOffset(scrollX, scrollY, speed, tile = 0) {
  const safeSpeed = Number.isFinite(speed) && speed > 0 ? speed : 0;
  const sideways = Math.max(0, Number(scrollX) || 0) * safeSpeed;
  const down = Math.max(0, Number(scrollY) || 0) * safeSpeed;
  const x = tile > 0 ? sideways % tile : Math.min(sideways, MAX_SHIFT_X);
  return { x: -x || 0, y: -Math.min(down, MAX_SHIFT_Y) || 0 };
}

function reducedMotion(win) {
  return typeof win.matchMedia === 'function'
    && win.matchMedia('(prefers-reduced-motion: reduce)').matches === true;
}

/**
 * Starts the parallax. Returns null, and does nothing, when the page has no scenery layers.
 * With reduced motion on, the layers stay where they are.
 *
 * @param {Document} [doc=document]
 * @param {Window|typeof globalThis} [win=globalThis] The browser window. globalThis is the window in a browser.
 * @returns {{update: () => void, destroy: () => void}|null}
 *   `update` applies the current scroll position at once. `destroy` removes the listener.
 */
export function initParallax(doc = document, win = globalThis) {
  const layers = Array.from(doc.querySelectorAll('.scenery__layer')).map((element) => ({
    element,
    speed: Number.parseFloat(element.dataset.parallaxSpeed),
    tile: Number.parseFloat(element.dataset.parallaxTile) || 0,
  }));
  if (layers.length === 0) return null;

  const raf = typeof win.requestAnimationFrame === 'function'
    ? win.requestAnimationFrame.bind(win)
    : (callback) => setTimeout(callback, 16);
  let scheduled = false;

  const reset = () => {
    for (const { element } of layers) element.style.transform = '';
  };

  const update = () => {
    scheduled = false;
    if (reducedMotion(win)) {
      reset();
      return;
    }
    const graveyard = doc.getElementById('graveyard');
    const scrollX = (win.scrollX || 0) + (graveyard ? graveyard.scrollLeft : 0);
    const scrollY = win.scrollY || 0;
    for (const { element, speed, tile } of layers) {
      const { x, y } = layerOffset(scrollX, scrollY, speed, tile);
      element.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }
  };

  const onScroll = () => {
    if (scheduled) return;
    scheduled = true;
    raf(update);
  };

  // Scroll events do not bubble, so one capturing listener on the document hears the page and the graveyard.
  doc.addEventListener('scroll', onScroll, { capture: true, passive: true });
  if (typeof win.addEventListener === 'function') win.addEventListener('scroll', onScroll, { passive: true });
  update();

  return {
    update,
    destroy() {
      doc.removeEventListener('scroll', onScroll, { capture: true });
      if (typeof win.removeEventListener === 'function') win.removeEventListener('scroll', onScroll);
      reset();
    },
  };
}
