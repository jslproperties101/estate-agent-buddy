# MainForAdmin-G — the company can sign out one phone (Admin EAB "remove this phone")

Written 23 Oct 2026. Branch `feature/qa-mainforadmin-g` (from `feature/qa-mainforadmin-f` @ 5510c47). Pushing it builds
the isolated QA APK (`qa-<commit>`). Needs the AdminBatch009 database file
(`20261027000000_admin_batch_009_agents.sql`, branch `feature/admin-batch-009-db`), which adds `eab_my_device`.

## Joe's decision (23 Oct 2026)
- In Admin EAB, Owner / Admin can "remove" one of an agent's phones (Agent Profile → Phones). That phone is signed out at
  its next app opening or sync. The agent can sign in on it again (Admin EAB then shows "signed in again afterwards").
  To stop an agent completely, the account is suspended instead (MainForAdmin-B, unchanged).

## What the phone does (`src/security/account.ts`)
- With the account check (app opening and after every sync), when the account is active the app asks
  `eab_my_device(p_device_id)` with its own device id (the same id it already sends with the sign-in log).
- If the company removed this phone AFTER this phone's sign-in, the phone signs out exactly like a forced sign-out:
  the sign-in screen says it was signed out, the "forced_out" event goes to the sign-in log. Nothing on the phone is deleted.
- Signed in again after the removal → stays in. Older database without the function, offline, or any error → nothing
  happens (the app keeps working).

## Tests
- `tests/mainforadmin-b.test.ts`: verdict with a removal time (before / after the sign-in, never, blocked account).
- `tests/ui-mainforadmin-b.test.mjs` MB-G1: removed phone is signed out and logs forced_out; signed in after the removal
  stays in; an older database without the function changes nothing.
