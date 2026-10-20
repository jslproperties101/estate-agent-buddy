// MainForAdmin-B (JoyChange005-Main Part6 Change H1-H3): failed Google sign-ins are counted on THIS PHONE. After 30, the
// sign-in button waits one hour. The count is per phone, not per account, so nobody can lock a real agent out of their
// account from another device. The app can only count what it sees: Google decides about passwords itself.
// A successful sign-in clears the count. The rules are plain functions so they can be tested without a phone.

export const MAX_FAILS = 30;
export const LOCK_MS = 60 * 60_000;
const KEY = 'eab-signin-fails';

export interface LockState { fails: number; lockedUntil?: number }

export function lockStatus(s: LockState, now: number): { locked: boolean; minutesLeft: number } {
  const locked = !!s.lockedUntil && s.lockedUntil > now;
  return { locked, minutesLeft: locked ? Math.ceil((s.lockedUntil! - now) / 60_000) : 0 };
}

/** One more failed sign-in. Returns the new state and whether this failure started a lockout. */
export function addFailure(s: LockState, now: number): { state: LockState; justLocked: boolean } {
  // A lockout that has ended starts a fresh count.
  const base: LockState = s.lockedUntil && s.lockedUntil <= now ? { fails: 0 } : s;
  if (base.lockedUntil && base.lockedUntil > now) return { state: base, justLocked: false };
  const fails = base.fails + 1;
  if (fails >= MAX_FAILS) return { state: { fails, lockedUntil: now + LOCK_MS }, justLocked: true };
  return { state: { fails }, justLocked: false };
}

const read = (): LockState => {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? 'null'); return v && typeof v.fails === 'number' ? v : { fails: 0 }; } catch { return { fails: 0 }; }
};
const write = (s: LockState) => { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* private mode: no lockout memory */ } };

export const currentLock = (now = Date.now()) => lockStatus(read(), now);
export function failedSignIn(now = Date.now()): boolean { const r = addFailure(read(), now); write(r.state); return r.justLocked; }
export function signedInOk() { write({ fails: 0 }); }
