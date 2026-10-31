// Run in CI after `npx cap add android` and `npx cap sync android`. Makes every build the same:
//  - version code from the GitHub build number, version name from package.json;
//  - navy window background (no white flash before the app draws);
//  - internet permission (News); nothing else is requested.
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const must = p => { if (!existsSync(p)) throw new Error(`Missing ${p}: run "npx cap add android" first.`); return p; };
const edit = (p, fn) => writeFileSync(p, fn(readFileSync(must(p), 'utf8')));

const code = Number(process.env.GITHUB_RUN_NUMBER || 1);
// Same signing key every build (android-config/debug.keystore), so a new APK installs over the previous one.
copyFileSync('android-config/debug.keystore', 'android/app/mwab-debug.keystore');
edit('android/app/build.gradle', s => (s.includes('mwab-debug.keystore') ? s : s.replace(/^android\s*\{/m,
  "android {\n    signingConfigs {\n        debug {\n            storeFile file('mwab-debug.keystore')\n            storePassword 'android'\n            keyAlias 'androiddebugkey'\n            keyPassword 'android'\n        }\n    }"))

  .replace(/versionCode\s+\d+/, `versionCode ${code}`)
  .replace(/versionName\s+"[^"]*"/, `versionName "${pkg.version}"`));

edit('android/app/src/main/AndroidManifest.xml', s => {
  if (!s.includes('android.permission.INTERNET')) s = s.replace(/<\/manifest>\s*$/, '    <uses-permission android:name="android.permission.INTERNET" />\n</manifest>\n');
  // "Share with MM2H office": Google sign-in returns to com.jslproperties.malaysiawelcome://auth-callback
  const scheme = JSON.parse(readFileSync('capacitor.config.json', 'utf8')).appId;
  if (!s.includes(`android:scheme="${scheme}"`)) {
    s = s.replace(/(<activity[^>]*android:name="[^"]*MainActivity"[\s\S]*?)(<\/activity>)/, `$1
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="${scheme}" />
            </intent-filter>
        $2`);
  }
  return s;
});

const colors = 'android/app/src/main/res/values/colors.xml';
writeFileSync(colors, `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="colorPrimary">#0B2545</color>\n    <color name="colorPrimaryDark">#0B2545</color>\n    <color name="colorAccent">#F2B705</color>\n    <color name="mwab_bg">#0B2545</color>\n</resources>\n`);
edit('android/app/src/main/res/values/styles.xml', s => s.replace(
  /(<style name="AppTheme.NoActionBar"[^>]*>)/,
  '$1\n        <item name="android:windowBackground">@color/mwab_bg</item>'));
console.log(`Android project configured: versionCode ${code}, versionName ${pkg.version}`);
