// Regression test: a successful Google sign-in must not show "Sign-in was cancelled".
// The app closes the Google tab itself when Google sends the phone back; that close must not count as a cancel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isReturnLink, closedTabMeansCancelled } from '../src/auth/returnState';

test('S1 a link carrying a code or an error is a return from Google; other links are not', () => {
  assert.equal(isReturnLink('com.jslproperties.eaaibuddy://auth-callback?code=abc'), true);
  assert.equal(isReturnLink('com.jslproperties.eaaibuddy://auth-callback?error=access_denied'), true);
  assert.equal(isReturnLink('https://localhost/#error=access_denied&error_description=x'), true);
  assert.equal(isReturnLink('com.jslproperties.eaaibuddy://auth-callback'), false);
  assert.equal(isReturnLink('https://localhost/?other=1'), false);
});

test('S2 closing the Google tab means "cancelled" only while the screen is still waiting', () => {
  assert.equal(closedTabMeansCancelled('waiting'), true);
  // Once the return link has arrived the screen is "exchanging": the tab closing is part of a good sign-in.
  assert.equal(closedTabMeansCancelled('exchanging'), false);
  assert.equal(closedTabMeansCancelled('idle'), false);
  assert.equal(closedTabMeansCancelled('opening'), false);
});
