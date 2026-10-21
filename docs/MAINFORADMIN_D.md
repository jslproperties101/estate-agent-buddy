# MainForAdmin-D — Content pushed from Admin EAB (Stage D)

Branch `joychange006`. Database: `supabase/migrations/20261021200000_mainforadmin_d_feed.sql`, rollback
`supabase/rollback/20261021200000_mainforadmin_d_rollback.sql` (deletes all feed data), tests
`supabase/tests/mainforadmin_d_test.sql` (26 checks). Requirements: JoyChange009-Main A8 + A9; JoyChange005-Main Part6
Changes F, G, L, M, N; JoyChange005-Main Part1 (Admin-pushed Projects).

## Status
- Database: tested on a local PostgreSQL 16 copy: 26/26; rollback, re-apply and apply-twice rehearsed; foundation 34/34,
  B 32/32, AdminBatch002 21/21, AdminBatch003 34/34, C 5/5 still pass together. **NOT yet applied to EAB-QA-Test.**
  **Not applied to production.**
- App: built; unit tests (8 new) and screen tests (4 new) pass. **Not tested on a phone.**
- Admin EAB screens to write posts, groups, order and codes: **not built** (teammate's repo). The functions below are ready.

## What the agent sees
- **Market News and Intelligence** (renamed from Market Intelligence, EN/BM/ZH): megaphone icon, red number = unread
  posts. Each post: title, date, picture, text (3 lines, "Read more"), website link, PDF. Opening a post marks it read
  (also offline; sent later). Empty: "No news yet."
- **Projects**: "Add New Project" first, then the invitation-code box ("ask your team leader or management"), then the
  projects pushed by the company. Pushed projects are read-only and disappear when the company stops sharing (no archive).
  No made-up sample projects are shown.
- **Announcements**: a banner on the home screen (closable) or a pop-up that needs "OK, got it". One pop-up at a time.
- **Force update**: below the minimum version, "soft" shows a closable notice; "hard" blocks the app with "Update now"
  (opens the link set in Admin EAB). Works signed out.
- **Maintenance mode**: blocks the app (also the sign-in screen) with the message in the app language and the expected
  back time. Trusted for 12 hours after the phone last heard it, so a phone that missed "off" is never locked for good.

## Who sees what (decided in the database, never on the phone)
- Item kinds: news / project / announcement; status draft / published / withdrawn; optional expiry.
- Audience: `all`, `groups` (chosen audience groups) or `codes` (only through an invitation code).
- Audience groups (`eab_audience_groups`): filters — user_ids, emails, countries, licence_types, languages, platforms,
  app_versions, joined_from/to, last_login_from/to, min_logins — all must match. "Everyone" always exists and ranks last.
- Order (Change G): the agent's best-ranked group (priority 1 = highest) that has an order; then Everyone's order; then newest.
- Language: the phone asks in en / bm / zh; an empty translation falls back to English.
- Invitation codes: 10 letters/digits (no look-alikes), one project or a bundle, optional expiry and use limit; 20 wrong
  codes per hour per agent, then a wait. Admin can disable a code or remove one agent's access.

## Functions
Agent (signed in): `eab_my_feed(kind, lang)`, `eab_feed_mark(item, 'opened'|'acknowledged'|'dismissed')`, `eab_redeem_code(code)`.
Anyone (public key): `eab_public_settings()` — company name, support contact, min version, mode, update link, maintenance.
Admin EAB (reason required, written to the tamper-proof admin log; owner/admin write, compliance/viewer read):
`eab_admin_feed_save`, `eab_admin_feed_set_status`, `eab_admin_feed_list` (with opened / acknowledged / dismissed counts),
`eab_admin_group_save`, `eab_admin_group_list` (with matching agent counts), `eab_admin_feed_order_set`,
`eab_admin_code_create`, `eab_admin_code_disable`, `eab_admin_code_revoke`, `eab_admin_code_list`;
`eab_admin_set_settings` now also takes min_version, min_version_mode, update_url, maintenance_on,
maintenance_message_en/bm/zh, maintenance_back_at.

## Not done / limits
- Push alerts per post: `push_alert` is stored; nothing is sent until Firebase is set up and a sender function is written.
  "Sent" and "delivered" counts come with that sender (the app already logs push.received / push.opened).
- Pictures and PDFs are links (https only); uploading them is for the Admin EAB side.
- Audience filters "state" and "team" from the requirement are not supported yet (no stored state per agent).
- Group membership is worked out on each request; fine for hundreds of agents, to be revisited for many thousands.
- BM / ZH wording to be checked by a native speaker.

## Tests
`tests/mainforadmin-d.test.ts` (D-1 … D-8), `tests/ui-mainforadmin-d.test.mjs` (MD1 … MD4, in `test:ui`).
Updated: `ui.test.mjs` (tile name; Market News shows "No news yet" instead of the old "not built yet" text).
