# MainForAdmin-B — Accounts and security (JoyChange009-Main)

Branch `joychange006` (built on Batches 1-5 + MainForAdmin-A). Database: `supabase/migrations/20261021100000_mainforadmin_b_accounts_security.sql`,
rollback `supabase/rollback/20261021100000_mainforadmin_b_rollback.sql`, tests `supabase/tests/mainforadmin_b_test.sql`.

## Status
- Database: applied to **EAB-QA-Test** on 21 Oct 2026 by Joe in the SQL editor (the database tool's approval did not
  reach him). Test file there: **32 passed, 0 failed**. Same 32 on a local copy, plus a rollback-and-reapply rehearsal.
  **Not applied to production.** Production is also far behind the test project (5 tables vs 34): bringing it up to date
  is a separate release step that needs Joe's approval.
- Joe's decisions (21 Oct 2026): support email / address read from shared settings (placeholder until filled in Admin
  EAB); first-login Terms screen built in the test app; MainForAdmin-A joined into this branch first.

## What it does
- **Account status** (`eab_account_status`): active / suspended / banned / closed, reason, "force logout after".
  Changed only by `eab_admin_set_account_status` / `eab_admin_force_logout` (owner or admin, reason required, written to
  the tamper-proof admin log). `eab_account_ok()` now also refuses suspended / banned / closed accounts.
  The app asks `eab_my_account()` after every sync and when it opens: not active → signed out, the sign-in screen shows
  the reason and the support contact; forced → signed out if this phone signed in before that time. Phone data is kept.
- **Login log, 7 years** (`eab_login_log`, never changed or deleted): sign-in, app open, failed sign-in, lockout,
  forced sign-out, blocked; device, platform (android / ios / tablet / web / desktop), app version, and GPS only when
  the agent had already allowed location (never asks). Failed attempts are queued on the phone and sent with the next
  successful sign-in.
- **Lockout per phone**: 30 failed Google sign-ins, then the button waits one hour (the app only sees failures that come
  back to it; Google handles passwords itself).
- **Licence** (`eab_licences`): REN / REA / PEA / EA / firm licence from the Agent Profile, sent when it changes; Verified
  only through `eab_admin_verify_licence`; a changed number must be verified again. A new phone gets the saved licence.
- **First-login screen** (JoyChange005-Main Part2 B + C): one Country box (Malaysia chosen, searchable pop-up), Terms
  tickbox (required, link opens the full text with the company name), news tickbox (optional), Continue never changes
  colour. Answers kept as history in `eab_terms_acceptance`; Terms version **1.1-draft** (v1.0 + location clause; lawyer
  review pending). News on / off later in Settings.
- **Shared settings** (`eab_settings`): company name (JSL Global Trading), support email, business address; changed
  only by `eab_admin_set_settings` (audited).
- **Admin EAB read functions**: `eab_admin_login_log`, `eab_admin_terms_log`; `eab_admin_agent` now returns status,
  licence, Terms, marketing and last login. The admin access log accepts the two new view kinds.

## Not done / limits
- A suspended agent's existing token is dropped on the phone; direct record writes through the cloud are not yet
  blocked by account status (they need the "block direct writes" proposal applied first).
- The support email and address are empty until set in Admin EAB (the message says "contact details coming soon").
- Device testing not done.

## Tests
`tests/mainforadmin-b.test.ts` (5 unit), `tests/ui-mainforadmin-b.test.mjs` (6 screen, in `test:ui`), K1 / K4 / K6-4
updated for the one-box country choice. Found and fixed: a pick list opened from the first-login screen appeared behind it.
