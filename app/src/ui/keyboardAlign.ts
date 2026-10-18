// JoyChange002 Change 30: the keyboard never covers the field being typed in. When the keyboard is open, the field moves
// to near the top of the part of the screen still visible, fully shown, with a small slice (10% of the visible height)
// above it so the field before it can still be seen. Moving to the next field lines it up the same way. Inside a pop-up
// the pop-up's own content scrolls (the pop-up itself already sits in the area above the keyboard: on Android the page
// shrinks above the keyboard, see scripts/android-setup.mjs).
// Nothing happens without a keyboard on screen (a laptop browser, or a phone with a hardware keyboard).
// JoyChange003 Changes 66 / 71: while the keyboard is open the page gets spare room under its last field (html.kb-open and
// --kb-room, used by .content in styles.css), so even the last field can be scrolled up clear of the keyboard and nothing is
// hidden. Long lists keep scrolling with the keyboard open (touch-action in styles.css).

const FIELD = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):not([type="button"]):not([type="submit"]), textarea, [contenteditable="true"]';
/** The keyboard takes at least this many pixels when it is open. */
const KEYBOARD_MIN = 150;
export const BUFFER = 0.1;

let fullHeight = 0;
const viewHeight = () => (typeof window === 'undefined' ? 0 : window.visualViewport?.height ?? window.innerHeight);
const viewTop = () => (typeof window === 'undefined' ? 0 : window.visualViewport?.offsetTop ?? 0);
/** Is a keyboard on screen? The visible height has dropped well below the tallest height seen in this orientation. */
export const keyboardOpen = () => fullHeight - viewHeight() >= KEYBOARD_MIN;

function scrollParent(el: Element): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight + 1) return p;
  }
  return document.scrollingElement as HTMLElement | null;
}

/** Spare scroll room under the last field while the keyboard is open: enough that the last field can be lined up near the top. */
export const KEYBOARD_ROOM = 0.85;
export function roomFor(visibleHeight: number): number { return Math.round(visibleHeight * KEYBOARD_ROOM); }

function syncRoom() {
  if (typeof document === 'undefined') return;
  const open = keyboardOpen();
  const root = document.documentElement;
  root.classList.toggle('kb-open', open);
  if (open) root.style.setProperty('--kb-room', `${roomFor(viewHeight())}px`); else root.style.removeProperty('--kb-room');
}

/** How far to scroll so the field's top lands `BUFFER` of the visible height below the top of the visible area. */
export function alignDelta(fieldTop: number, areaTop: number, areaHeight: number, fieldHeight: number): number {
  const want = areaTop + Math.round(areaHeight * BUFFER);
  // A field taller than the space left below the buffer is lined up at the very top instead, so as much of it shows.
  const target = fieldHeight > areaHeight - (want - areaTop) ? areaTop : want;
  return Math.round(fieldTop - target);
}

export function alignField(el: Element) {
  const box = scrollParent(el);
  if (!box) return;
  const r = el.getBoundingClientRect();
  const isPage = box === document.scrollingElement;
  const b = isPage ? { top: 0, height: window.innerHeight } : box.getBoundingClientRect();
  // The visible area: the scroll box, cut by what the keyboard leaves of the screen.
  const top = Math.max(b.top, viewTop());
  const bottom = Math.min(b.top + b.height, viewTop() + viewHeight());
  const d = alignDelta(r.top, top, Math.max(0, bottom - top), r.height);
  if (Math.abs(d) > 2) box.scrollBy({ top: d, behavior: 'auto' });
}

let installed = false;
/** Called once when the app starts. */
export function installKeyboardAlign() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  fullHeight = viewHeight();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const later = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const el = document.activeElement;
      if (el && el.matches?.(FIELD) && keyboardOpen()) alignField(el);
    }, 60);
  };
  const measure = () => { if (!keyboardOpen() || viewHeight() > fullHeight) fullHeight = Math.max(fullHeight, viewHeight()); };
  window.addEventListener('orientationchange', () => { fullHeight = 0; setTimeout(() => { fullHeight = viewHeight(); }, 500); });
  (window.visualViewport ?? window).addEventListener('resize', () => { measure(); syncRoom(); later(); });
  document.addEventListener('focusin', e => { if ((e.target as Element)?.matches?.(FIELD)) { syncRoom(); later(); } });
  document.addEventListener('focusout', () => { setTimeout(syncRoom, 150); });
}
