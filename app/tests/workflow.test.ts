// The build workflow's distribution rules (integrated release 2.0.010): a QA branch builds only the isolated QA APK; a
// normal-package APK is attached to a release only from main or feature/v2-full-update; the web/update channel is
// deployed only from those two branches. Reads .github/workflows/android.yml as text (no YAML package in this repo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const wf = readFileSync(new URL('../../.github/workflows/android.yml', import.meta.url), 'utf8');

test('W1 QA branches build only the QA APK; feature branches publish no normal-package APK; web deploy stays limited', () => {
  // Owner, 17 Oct 2026: a dated change branch (2.0.26.10.17.1) is a QA build too, and is pushed-to builds.
  assert.match(wf, /variant: \$\{\{ fromJSON\(\(contains\(github\.ref_name, 'qa'\) \|\| startsWith\(github\.ref_name, '2\.'\)\) && '\["qa","pos"\]' \|\| '\["prod"\]'\) \}\}/);
  assert.match(wf, /branches: \[main, 'feature\/\*\*', '2\.\*'\]/);
  assert.match(wf, /PUBLISH_APK: \$\{\{ \(matrix\.variant == 'qa' \|\| matrix\.variant == 'pos' \|\| github\.ref == 'refs\/heads\/main' \|\| github\.ref == 'refs\/heads\/feature\/v2-full-update'\) && '1' \|\| '' \}\}/);
  const release = wf.slice(wf.indexOf('- name: Release with the APK'));
  assert.match(release.split('\n').slice(0, 3).join('\n'), /if: env\.PUBLISH_APK == '1'/, 'the release step is gated');
  assert.match(wf, /if: github\.ref == 'refs\/heads\/main' \|\| github\.ref == 'refs\/heads\/feature\/v2-full-update'\n\s+environment: \{ name: github-pages/, 'web deploy only from main / v2-full-update');
  assert.match(wf, /node scripts\/verify-apk\.mjs "\$APK" com\.jslproperties\.estateagentbuddy\.qa "EAB QA" qa/, 'the QA APK is checked for its own package and name');
  assert.match(wf, /node scripts\/verify-apk\.mjs "\$APK" com\.jslproperties\.aibuddypos "AI Buddy POS" pos/, 'the AI Buddy POS APK is checked for its own package and name');
});

test('W2 the QA APK never has the production Supabase project built in (test-project secrets only, or none)', () => {
  const url = /EAB_SUPABASE_URL: (.+)/.exec(wf.slice(wf.indexOf('  android:')))![1];
  const key = /EAB_SUPABASE_ANON_KEY: (.+)/.exec(wf.slice(wf.indexOf('  android:')))![1];
  for (const v of [url, key]) {
    // QA and the standalone POS app (every non-production variant) get the test project only.
    assert.match(v, /matrix\.variant != 'prod' && secrets\.EAB_QA_SUPABASE_/);
    assert.match(v, /matrix\.variant == 'prod' && secrets\.EAB_SUPABASE_/);
  }
});
