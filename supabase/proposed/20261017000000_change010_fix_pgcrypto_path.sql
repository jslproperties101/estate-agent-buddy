-- Fix for projects that already ran the 16 Oct 2026 version of 20261016000000_change010_team_sharing_audit.sql
-- (EAB-QA-Test, 17 Oct 2026). The proposal file itself now carries this fix, so a project that runs the
-- corrected proposal does not need this file (running it anyway is harmless).
--
-- Bug: on Supabase, pgcrypto (gen_random_bytes, digest) is installed in the "extensions" schema, but these two
-- functions only searched "public". Sending a Team Workspace invitation failed with
-- "function gen_random_bytes(integer) does not exist" (the app saw HTTP 404), and accepting/declining an
-- invitation would fail the same way on digest(). Found on a real phone against EAB-QA-Test, 17 Oct 2026.
-- Regression test: supabase/tests/*.sh now install pgcrypto in "extensions", like Supabase.
--
-- Undo: alter function ... set search_path = public;  (restores the broken behaviour; not recommended)
alter function public.eab_team_invite(text) set search_path = public, extensions;
alter function public.eab_find_invite(text, uuid) set search_path = public, extensions;
