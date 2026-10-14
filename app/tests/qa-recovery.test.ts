// Locked out after typing a Supabase URL/key in Settings (QA, 14 Oct): the checks that stop a bad value being saved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { supabaseInputProblem, projectHost, config, builtInSupabase } from '../src/config';

test('R1 a correct project URL with its key is accepted; both empty means "use the built-in project"', () => {
  assert.equal(supabaseInputProblem('https://abcd1234.supabase.co', 'sb_publishable_x'), null);
  assert.equal(supabaseInputProblem(' https://abcd1234.supabase.co/ ', ' eyJhbGciOi.x.y '), null, 'spaces around and a final / are fine');
  assert.equal(supabaseInputProblem('', ''), null);
  assert.equal(supabaseInputProblem(undefined, undefined), null);
  assert.equal(supabaseInputProblem('http://localhost:54321', 'k'), null, 'local development project');
});

test('R2 invalid Supabase URLs are refused', () => {
  for (const bad of [
    'abcd1234.supabase.co',                                      // no https://
    'http://abcd1234.supabase.co',                               // not https
    'https://supabase.com/dashboard/project/abcd1234',           // the dashboard page, not the project address
    'https://abcd1234.supabase.co/rest/v1',                      // an API path
    'https://abcd1234.supabase.co?x=1',
    'not a url',
    'https://',
  ]) assert.equal(supabaseInputProblem(bad, 'key'), 'url', bad);
});

test('R3 URL and key go together', () => {
  assert.equal(supabaseInputProblem('https://abcd1234.supabase.co', ''), 'pair');
  assert.equal(supabaseInputProblem('', 'sb_publishable_x'), 'pair');
  assert.equal(supabaseInputProblem('https://abcd1234.supabase.co', 'two words'), 'pair', 'a key never contains spaces');
});

test('R4 only the project address is shown, never the key; removing typed values falls back to the build', () => {
  assert.equal(projectHost('https://abcd1234.supabase.co'), 'abcd1234.supabase.co');
  assert.equal(projectHost('garbage'), 'garbage');
  const typed = config({ supabaseUrl: 'https://typed.supabase.co', supabaseAnonKey: 'k' });
  assert.equal(typed.source.supabaseUrl, 'phone');
  const cleared = config({ supabaseUrl: undefined, supabaseAnonKey: undefined });
  assert.notEqual(cleared.source.supabaseUrl, 'phone');
  assert.equal(builtInSupabase(), false, 'unit tests are built without a project');
});
