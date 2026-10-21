# MainForAdmin-C — Logging (Stage C)

Branch `joychange006`. Database: `supabase/migrations/20261021140000_mainforadmin_c_logging.sql`, rollback
`supabase/rollback/20261021140000_mainforadmin_c_rollback.sql`, tests `supabase/tests/mainforadmin_c_test.sql` (5 checks).
Builds on the usage log from Changes 19/20 (`app/src/usage/logger.ts`, table `eab_usage_events`).

## Status
- Database: tested on a local PostgreSQL 16 copy (5/5, rollback and re-apply rehearsed, stage B still 32/32).
  **NOT yet applied to EAB-QA-Test** (Joe pastes the migration in the SQL editor). **Not applied to production.**
- App: written; 581 unit tests pass; screen tests see the result list in the checklist/commit notes. **Not tested on a phone.**

## Joe's decisions (21 Oct 2026)
- Crash reporting: **both, Crashlytics later**. Now: our own error log (codes only; JS errors and push registration
  problems). A crash that kills the whole app is NOT seen until Firebase Crashlytics is added (needs the Firebase setup).
- Usage detail is kept **7 years** (was 365 days). `eab_usage_cleanup()` no longer deletes anything. Expect the table to
  grow; Admin EAB should list what is older than 7 years for Joe to approve.

## What the phone now notes (codes only; never words, names, addresses or message text)
| Admin EAB need (Change K) | Event |
|---|---|
| K1 every feature event | `feature` `<collection>.create` (existing), **`.edit`, `.delete`** (new), `pdf.save/share`, `ms.save/share`, team/share actions (existing) |
| K2 AI Assisted Command (separate log) | kind **`command`**: `command.assistant`, `command.listing`, `command.list`; `ok` = understood |
| K3 Marketing Studio (separate log) | kind **`marketing`**: `poster.created`, `poster.saved`, `poster.shared`; `ok` = worked |
| K4 language | kind **`language`**: `lang.en` / `lang.bm` / `lang.zh` once per opening and after a change |
| K5 performance | `metric` `startup.ms` (once per opening); `metric` `screen.slow_ms` with the screen (only 800 ms or slower). Crash-free rate = sessions vs `error` events |
| K6 crash/error | `error` `js.error`, `js.rejection` (existing), `push.registration` (new). Crashlytics later |
| K7 sync failures | `sync` `sync.run` ok/not ok (existing) + **`sync.fail.<reason>`** (network, auth, no-access, server, ...) |
| K8 platform | usage events now carry android / ios / tablet / desktop / web (the same words as the login log) |
| K9 push | kind **`push`**: `push.received`, `push.opened` on the phone. "Sent" is counted by the sender (Edge Function / Admin EAB), not here |
| D2 Google requests | unchanged (already logged: maps, geocoding, places, routes, roads incl. cost) |

## Not done / limits
- Push "sent" count and per-broadcast reporting belong with the Stage D broadcast sender.
- Native crashes (app closes by itself) are not seen until Crashlytics is added.
- `push.received` fires only when a message arrives while the app is running; a message that arrives with the app
  closed is counted as `push.opened` only if the agent taps it.
- The Developer Dashboard (Changes 19/20) shows the old overview numbers; the new kinds can be read with
  `eab_dev_breakdown(p_kind => 'command')` etc. The dashboard screen itself is unchanged.
- Existing hand-off for Admin EAB: no function signatures changed.

## Tests
`tests/mainforadmin-c.test.ts` (6 unit). Updated: `change019-usage.test.ts` U17 (a failed sync now also notes its reason).
