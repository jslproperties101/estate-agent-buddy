# JoyChange010-03 — Push alerts for Admin EAB posts, with sent / delivered / opened counts

Branch `joychange006`. Requirement: JoyChange005-Main Part6 Change K9 ("Admin EAB push broadcast reporting shows sent,
delivered and opened"). Stage D stored `push_alert` on posts but nothing sent it; Stage C left "sent" to the sender.

Files:
- Database: `supabase/migrations/20261021210000_push_broadcast_counts.sql`, rollback
  `supabase/rollback/20261021210000_push_broadcast_counts_rollback.sql` (deletes all push counts; posts untouched),
  tests `supabase/tests/push_broadcast_test.sql` (33 checks).
- Sender: `supabase/functions/send-push/index.ts` (new `kind: "feed"`; the invitation pushes are unchanged),
  tests `supabase/tests/send-push-feed-test.mjs` (13 checks, fake database + fake Firebase, run with Node).
- Phone: `app/src/native/push.ts` (new "Market News and announcements" notification channel; reports received / opened),
  tests in `app/tests/joychange010.test.ts` (J10-03a-c).

## Status
- Database: local PostgreSQL 16 copy of all migrations: 33/33; rollback, re-apply and apply-twice rehearsed; foundation 34/34,
  B 32/32, AdminBatch002 21/21, AdminBatch003 34/34, C 5/5, D 26/26 still pass. **NOT applied to EAB-QA-Test yet**
  (Joe pastes the migration in the SQL editor). **Not applied to production.**
- Sender: tested under Node with fakes only. **Not deployed** to EAB-QA-Test (needs `supabase functions deploy send-push`,
  and the secret `FCM_SERVICE_ACCOUNT` must be set — the same one invitation pushes use).
- Phone: 596 unit tests, lint, Stage D screen tests pass. **Not tested on a phone. No APK built.**

## How it works
1. A post that is **published with "send alert" on** is queued once (database trigger). Switching the alert on after
   publishing also queues it. A post is never pushed twice. Posts already published with an alert are queued by the migration.
2. **Admin EAB sends it** by calling the Edge Function with the admin's own sign-in:
   `POST /functions/v1/send-push {"kind":"feed","item_id":"<post id>"}` — or `{"kind":"feed"}` for every queued post.
   The database checks the role (Owner or Admin) and writes `push_broadcast_started` to the admin audit log.
3. The function finds every agent who may see the post now (same rule as the agent's own feed; suspended / banned / closed
   accounts are left out), sends to each of their phones in the phone's language (English when that translation is empty;
   text shortened to 150 letters), and records one result per agent: **sent** (at least one phone accepted), **failed**
   (every phone refused; the reason is kept as a code), **no phone** (no phone registered for push).
4. The phone reports **received** (arrived while the app was open) and **opened** (tapped). A report that fails offline is
   tried again with the next one while the app stays open.
5. Counts per post: targeted, sent, failed, no phone, **delivered** (received or opened), **opened**.

## Hand-off for Admin EAB (teammate's repo `jslproperties101/admin-eab`) — nothing there is changed by this batch
- After publishing a post that has "send alert" on, call `send-push` as above (or add a "Send waiting alerts" button that
  calls it with `{"kind":"feed"}`). Answer: `{ "items": [ { "item_id", "targeted", "sent", "failed", "no_phone" } ] }`,
  or `{ "item_id", "skipped": ... }` when it was already sent, withdrawn, the alert is off or the post is not yet due.
  403 = the signed-in person is not Owner or Admin. 503 = Firebase is not set up on the project.
- Counts: `eab_admin_push_report(p_item uuid)` (one post) and `eab_admin_push_list()` (every post that had an alert):
  `{ item_id, status (queued / sending / done), queued_at, started_at, finished_at, targeted, sent, failed, no_phone,
  delivered, opened }` (+ `kind`, `title_en` in the list). Readable by Owner, Admin, Compliance and Viewer.
- `eab_admin_feed_list` is NOT changed (same result shape as before).

## Limits (do not claim more)
- **Delivered is a lower bound.** Android shows a push by itself when the app is closed or in the background and does not
  tell the app. Such a push counts as delivered only if the agent taps it. Exact delivery needs Firebase's delivery data
  (BigQuery export) — not built.
- Tapping an alert opens the app; it does not yet jump straight to that post (the megaphone shows it as unread).
- iPhone: the app registers push on Android only today.
- A send that stops half-way (Edge Function time limit) can be started again after 15 minutes; agents already sent to are
  not sent again only if the first run recorded them — a half-run that recorded nothing sends again to everyone.
- Records are kept 7 years: an agent or post with push records cannot be deleted from the database (accounts are closed instead).
