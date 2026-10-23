// MainForAdmin-B (accounts and security): the rules that run on the phone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addFailure, lockStatus, MAX_FAILS, LOCK_MS } from '../src/security/lockout';
import { verdict, licenceKey } from '../src/security/account';
import { deviceOf, platformOf } from '../src/security/loginLog';
import { termsText, TERMS_VERSION, companyOr } from '../src/legal/terms';
import { c00bStrings } from '../src/security/strings';

test('B-1 sign-in lockout: 30 failures on this phone, then one hour; afterwards a fresh count', () => {
  assert.equal(MAX_FAILS, 30); assert.equal(LOCK_MS, 3_600_000);
  let s = { fails: 0 } as { fails: number; lockedUntil?: number };
  let locked = false;
  for (let i = 0; i < 29; i++) ({ state: s, justLocked: locked } = addFailure(s, 1000));
  assert.equal(locked, false); assert.equal(lockStatus(s, 1000).locked, false);
  ({ state: s, justLocked: locked } = addFailure(s, 1000));
  assert.equal(locked, true, 'the 30th failure locks');
  assert.deepEqual(lockStatus(s, 1000 + 30 * 60_000), { locked: true, minutesLeft: 30 });
  assert.equal(addFailure(s, 2000).justLocked, false, 'failures while locked do not extend the wait');
  assert.equal(lockStatus(s, 1000 + LOCK_MS + 1).locked, false, 'free again after one hour');
  assert.deepEqual(addFailure(s, 1000 + LOCK_MS + 1).state, { fails: 1 }, 'a fresh count after the wait');
});
test('B-2 the account decision: suspended / banned / closed sign out; a forced sign-out only hits earlier sign-ins', () => {
  assert.equal(verdict({ status: 'active' }, 5), 'ok');
  for (const st of ['suspended', 'banned', 'closed'] as const) assert.equal(verdict({ status: st }, 5), 'blocked');
  const at = '2026-10-21T01:00:00Z';
  assert.equal(verdict({ status: 'active', force_logout_after: at }, Date.parse(at) - 1000), 'forced');
  assert.equal(verdict({ status: 'active', force_logout_after: at }, Date.parse(at) + 1000), 'ok', 'signed in again after it');
  assert.equal(verdict({ status: 'active', force_logout_after: at }, undefined), 'forced', 'a sign-in from before this version counts as earlier');
  // MainForAdmin-G: this phone was removed by the company
  assert.equal(verdict({ status: 'active' }, Date.parse(at) - 1000, at), 'forced', 'removed after this sign-in');
  assert.equal(verdict({ status: 'active' }, Date.parse(at) + 1000, at), 'ok', 'signed in again after the removal');
  assert.equal(verdict({ status: 'active' }, 5, null), 'ok', 'never removed');
  assert.equal(verdict({ status: 'suspended' }, Date.parse(at) - 1000, at), 'blocked', 'a blocked account says blocked');
});
test('B-3 licence: only the accepted types are sent; the number is trimmed', () => {
  assert.equal(licenceKey('ren', ' REN 123 ', 'u1'), 'REN|REN 123|u1');
  assert.equal(licenceKey('Other agent body', '9', 'u1'), '|9|u1');
  assert.equal(licenceKey(undefined, undefined, 'u1'), '||u1');
});
test('B-4 device and platform: short descriptions, no personal data', () => {
  const phone = 'Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A) AppleWebKit/537.36 Chrome/129 Mobile Safari/537.36';
  const tablet = 'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 Chrome/129 Safari/537.36';
  assert.equal(deviceOf(phone), 'Android 14; SM-S918B Build/UP1A');
  assert.equal(platformOf(phone, true, 'android', false), 'android');
  assert.equal(platformOf(tablet, true, 'android', false), 'tablet');
  assert.equal(platformOf('Mozilla/5.0 (Windows NT 10.0)', false, 'web', true), 'desktop');
  assert.equal(platformOf('Mozilla/5.0 (Windows NT 10.0)', false, 'web', false), 'web');
});
test('B-5 Terms: draft version, location clause, company / email / address from settings, all 3 languages', () => {
  assert.equal(TERMS_VERSION, '1.1-draft');
  for (const l of ['en', 'bm', 'zh'] as const) {
    const t = termsText(l, { company: 'JSL Global Trading', email: 'help@example.com', address: 'Nilai' });
    assert.equal(t.sections.length, 17);
    const all = t.sections.map(s => s.join(' ')).join(' ');
    assert.ok(all.includes('JSL Global Trading') && all.includes('help@example.com') && all.includes('Nilai'), l);
    assert.ok(!all.includes('{COMPANY_NAME}') && !all.includes('{EMAIL}'), `${l}: no placeholder left`);
    assert.ok(c00bStrings[l].marketing(companyOr(l, null)).length > 20);
  }
  assert.match(termsText('en', {}).sections[5][0], /^6\. Location/);
  assert.match(termsText('en', {}).sections[16][1], /\[email address\]/, 'missing contact shown as a placeholder, not invented');
});
