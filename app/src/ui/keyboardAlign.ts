// JoyChange002 Change 30: the keyboard never covers the field being typed in. When the keyboard is open, the field moves
// to near the top of the part of the screen still visible, fully shown, with a small slice (10% of the visible height)
// above it so the field before it can still be seen. Moving to the next field lines it up the same way. Inside a pop-up
// the pop-up's own content scrolls (the pop-up itself already sits in the area above the keyboard: on Android the page
// shrinks above the keyboard, see scripts/android-setup.mjs).
// Nothing happens without a keyboard on screen (a laptop browser, or a phone with a hardware keyboard).
// JoyChange003 Changes 66 / 71: while the keyboard is open the page gets spare room under its last field (html.kb-open and
// --kb-room, used by .content in styles.css), so even the last field can be scrolled up clear of the keyboard and nothing is
// hidden. Long lists keep scrolling with the keyboard open (touch-action in styles.css).
// JoyChange006 Change D: the field being typed in now sits about 30% from the TOP of the visible screen (the part above the
// keyboard), never under the title bar or above the top edge of its pop-up. Pop-ups move to the top of the visible screen while
// the keyboard is open and get the same spare room, so their lower fields can come up too. The bottom advert is hidden while
// the keyboard is open (AdBar.tsx), so it never takes space above the keyboard. When the keyboard closes, everything returns.

const FIELD = 'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]):not([type="button"]):not([type="submit"]), textarea, [contenteditable="true"]';
/** The keyboard takes at least this many pixels when it is open. */
const KEYBOARD_MIN = 150;
/** JoyChange006 Change D: the top of the field lands this far down the visible screen. */
export const FIELD_AT = 0.3;
/** A little air between the field and the edge of its area. */
const EDGE = 8;

let fullHeight = 0;
const viewHeight = () => (typeof window === 'undefined' ? 0 : window.visualViewport?.height ?? window.innerHeight);
const viewTop = () => (typeof window === 'undefined' ? 0 : window.visualViewport?.offsetTop ?? 0);
/** Is a keyboard on screen? The visible height has dropped well below the tallest height seen in this orientation. */
export const keyboardOpen = () => fullHeight - viewHeight() >= KEYBOARD_MIN;

function scrollParent(el: Element): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const cs = getComputedStyle(p);
    const o = cs.overflowY;
    if ((o === 'auto' || o === 'scroll') && p.scrollHeight > p.clientHeight + 1) return p;
    // A field in a pop-up that does not scroll: never scroll the page behind the pop-up.
    if (cs.position === 'fixed') return null;
  }
  return document.scrollingElement as HTMLElement | null;
}

// ---------- keyboard open / closed, for parts of the app that change while typing (the bottom advert) ----------
let kbShown = false;
const kbListeners = new Set<() => void>();
/** True while the on-screen keyboard is open. */
export const isKeyboardShown = () => kbShown;
export function subscribeKeyboard(fn: () => void) { kbListeners.add(fn); return () => { kbListeners.delete(fn); }; }

/** Spare scroll room under the last field while the keyboard is open: enough that the last field can be lined up near the top. */
export const KEYBOARD_ROOM = 0.85;
export function roomFor(visibleHeight: number): number { return Math.round(visibleHeight * KEYBOARD_ROOM); }

function syncRoom() {
  if (typeof document === 'undefined') return;
  const open = keyboardOpen();
  const root = document.documentElement;
  root.classList.toggle('kb-open', open);
  if (open) root.style.setProperty('--kb-room', `${roomFor(viewHeight())}px`); else root.style.removeProperty('--kb-room');
  if (open !== kbShown) { kbShown = open; kbListeners.forEach(fn => fn()); }
}

/**
 * Where the top of the field should land (screen pixels). About 30% down the visible screen (`FIELD_AT`), but never above the
 * top of its area (under the title bar, or above a pop-up's top edge). A field too tall to fit below that point is moved up
 * just enough to show its bottom too, and a field taller than the whole area lines up with the area's top.
 */
export function targetTop(areaTop: number, areaBottom: number, fieldHeight: number, screenTop: number, screenHeight: number): number {
  let want = Math.max(screenTop + Math.round(screenHeight * FIELD_AT), areaTop + EDGE);
  if (want + fieldHeight > areaBottom - EDGE) want = Math.max(areaTop, areaBottom - EDGE - fieldHeight);
  return want;
}

/** How far to scroll so the field's top lands at `targetTop`. Without a screen given, the area is the visible screen. */
export function alignDelta(fieldTop: number, areaTop: number, areaHeight: number, fieldHeight: number,
  screenTop = areaTop, screenHeight = areaHeight): number {
  return Math.round(fieldTop - targetTop(areaTop, areaTop + areaHeight, fieldHeight, screenTop, screenHeight));
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
  let d = alignDelta(r.top, top, Math.max(0, bottom - top), r.height, viewTop(), viewHeight());
  // Never ask for more than the box can scroll (its spare room under the last field is what makes this reach).
  d = Math.max(-box.scrollTop, Math.min(d, box.scrollHeight - box.clientHeight - box.scrollTop));
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
