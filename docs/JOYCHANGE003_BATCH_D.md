# JoyChange003 - Batch D (19 Oct 2026)

Logo/name strip and notification boxes. Model chosen by Joe: Sonnet 5.5 + High. Read after `HANDOVER_JOYCHANGE003.md`.

## Change 65 - logo and app name at the top (scrolls away)
- `src/App.tsx`, `src/styles.css`. On the main page the logo and "Estate Agent AI Buddy" wording are no longer in the fixed top bar. They are a strip (`.brand-strip`, `data-testid=brand-strip`) at the top of the page, minimum height 10% of the screen, inside the scrolling `main.content`, so they scroll away with the page. The top bar keeps only the bell, language and profile buttons. This replaces the Change 44 layout.
- Other screens are unchanged (title in the bar).

## Change 72 - Notifications
- `src/App.tsx` (`NotifBox`, `Notifications`), `src/lib/notifState.ts` (new), `src/data/types.ts` (`Meta.notifs`), `src/i18n.ts`, `src/styles.css`.
- Each notification is its own box with a gap between boxes (reminders coming up, reminders due in the last 24 hours, follow-up contacts, buyer review, sync review, drafts, advert attention, team invitations, Drive backup warning).
- Every box has **Dismiss** and **Remind me later**. Remind me later offers: in 1 hour, in 4 hours, tomorrow 9:00, in 3 days 9:00. The box comes back by itself when the time passes.
- **History** (inside the System Notifications card, closed by default): dismissed notifications, newest first, last 50, each with **Put back**. Snoozed ones do not go to History.
- A dismissal is tied to what the notification said (for example the number of conflicts, the invitation id, the reminder key): if the situation changes (a new conflict count, a new invitation) it shows again.
- The bell badge no longer counts dismissed or snoozed invitations. The badge for to-dos due today is unchanged.
- Sync messages: "Synced / last sync / waiting to sync" are gone from Notifications (they are already in Settings -> Account). Only a FAILED sync (`failed-sync` when signed in, or `failed-phone`) shows, as a box without Dismiss, and goes away once fixed. A good sync never shows.
- The marks live in `meta.notifs` on this phone only (not synced, not in backups of records).
- "Got it" notes about invitation answers keep their own button (no Dismiss / Remind me later).

## Assumption to confirm
- "Keep History" was read as a History list of dismissed notifications. If Joe meant the record-history screens (Sync -> History), tell me.

## Tests
- `tests/joychange003-batchD.test.ts` (unit D72-1..5), `tests/ui-batchD.test.mjs` (BD1 logo strip, BD2 boxes/Dismiss/History/Put back, BD3 Remind me later).

## Corrected in Batch E
Some details above did not match what Joe agreed (the handover had lost them). They were corrected in Batch E: see "Corrections to Batches D and F" in `JOYCHANGE003_BATCH_E.md`. Where this file and that section differ, that section is right.
