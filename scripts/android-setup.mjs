// Run in CI after `npx cap add android` and `npx cap sync android`. Makes every build the same:
//  - version code from the GitHub build number, version name from package.json;
//  - navy window background (no white flash before the app draws);
//  - internet permission (News); nothing else is requested.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const must = p => { if (!existsSync(p)) throw new Error(`Missing ${p}: run "npx cap add android" first.`); return p; };
const edit = (p, fn) => writeFileSync(p, fn(readFileSync(must(p), 'utf8')));

const code = Number(process.env.GITHUB_RUN_NUMBER || 1);
edit('android/app/build.gradle', s => s
  .replace(/versionCode\s+\d+/, `versionCode ${code}`)
  .replace(/versionName\s+"[^"]*"/, `versionName "${pkg.version}"`));

edit('android/app/src/main/AndroidManifest.xml', s =>
  s.includes('android.permission.INTERNET') ? s : s.replace(/<\/manifest>\s*$/, '    <uses-permission android:name="android.permission.INTERNET" />\n</manifest>\n'));

const colors = 'android/app/src/main/res/values/colors.xml';
writeFileSync(colors, `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="colorPrimary">#0B2545</color>\n    <color name="colorPrimaryDark">#0B2545</color>\n    <color name="colorAccent">#F2B705</color>\n    <color name="mwab_bg">#0B2545</color>\n</resources>\n`);
edit('android/app/src/main/res/values/styles.xml', s => s.replace(
  /(<style name="AppTheme.NoActionBar"[^>]*>)/,
  '$1\n        <item name="android:windowBackground">@color/mwab_bg</item>'));
console.log(`Android project configured: versionCode ${code}, versionName ${pkg.version}`);
