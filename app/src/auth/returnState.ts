// Small rules for the Google sign-in return on the sign-in screen, kept apart so they can be tested without a phone.
//
// Bug (found on a real phone, 17 Oct 2026): sign-in worked, but "Sign-in was cancelled" appeared. Cause: when Google
// sends the phone back, the app closes the Google tab itself, and Android reports that like the person closing the tab.
// The screen was still in the "waiting" phase while the code was being exchanged, so it took the close for a cancel.

/** True when this address is Google/Supabase coming back to the app (it carries a code or an error). */
export function isReturnLink(url: string): boolean {
  return /[?&#](code|error)=/.test(url);
}

/** The Google tab closed. It only means "cancelled" while the screen is still waiting and no return has arrived. */
export function closedTabMeansCancelled(phase: string): boolean {
  return phase === 'waiting';
}
