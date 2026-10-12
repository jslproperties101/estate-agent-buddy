// Configures the Android project that `npx cap add android` generates (run by the GitHub Actions build).
// The generated android/ folder is not committed; this script makes every build the same:
//  - app name "Estate Agent AI Buddy", package com.jslproperties.estateagentbuddy (from capacitor.config.json);
//  - permissions: precise/approximate location (GPS Assistance), camera (property and banner photos),
//    notifications (reminders, Android 13+), internet;
//  - the sign-in return link com.jslproperties.estateagentbuddy://auth-callback opens the app (Google login);
//  - version code from the build number, version name from package.json;
//  - black window background so there is no white flash before the app draws.
// Usage: node scripts/android-setup.mjs   (after `npx cap add android` / `npx cap sync android`)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const cfg = JSON.parse(readFileSync('capacitor.config.json', 'utf8'));
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const A = 'android/app/src/main';
const must = p => { if (!existsSync(p)) throw new Error(`Missing ${p}: run "npx cap add android" first.`); return p; };
const edit = (p, fn) => { const s = readFileSync(must(p), 'utf8'); const t = fn(s); if (t !== s) writeFileSync(p, t); };

// 1. Manifest: permissions and the sign-in return link.
const PERMS = [
  'android.permission.INTERNET',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.CAMERA',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.RECORD_AUDIO',     // voice commands (Android speech recogniser)
  'android.permission.READ_CONTACTS',    // phonebook button (asked only when tapped)
];
edit(`${A}/AndroidManifest.xml`, s => {
  for (const p of PERMS) {
    if (!s.includes(`"${p}"`)) s = s.replace(/<\/manifest>\s*$/, `    <uses-permission android:name="${p}" />\n</manifest>\n`);
  }
  if (!s.includes('android.hardware.location.gps')) {
    s = s.replace(/<\/manifest>\s*$/, '    <uses-feature android:name="android.hardware.location.gps" android:required="false" />\n    <uses-feature android:name="android.hardware.camera" android:required="false" />\n</manifest>\n');
  }
  // Android 11+: apps must declare that they look for the speech service, or voice reports "not available".
  if (!s.includes('android.speech.RecognitionService')) {
    s = s.replace(/<application/, '<queries>\n        <intent>\n            <action android:name="android.speech.RecognitionService" />\n        </intent>\n    </queries>\n\n    <application');
  }
  // The Capacitor template normally already has this filter; add it if not.
  if (!s.includes('@string/custom_url_scheme') && !s.includes(`android:scheme="${cfg.appId}"`)) {
    s = s.replace(/(<activity[^>]*android:name="[^"]*MainActivity"[\s\S]*?)(<\/activity>)/, `$1
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="${cfg.appId}" />
            </intent-filter>
        $2`);
  }
  return s;
});

// 2. Names and the URL scheme.
edit(`${A}/res/values/strings.xml`, s => {
  const set = (name, value) => {
    const re = new RegExp(`<string name="${name}">[^<]*</string>`);
    return re.test(s) ? s.replace(re, `<string name="${name}">${value}</string>`) : s.replace('</resources>', `    <string name="${name}">${value}</string>\n</resources>`);
  };
  s = set('app_name', cfg.appName);
  s = set('title_activity_main', cfg.appName);
  s = set('package_name', cfg.appId);
  s = set('custom_url_scheme', cfg.appId);
  return s;
});

// 3. Black window background (no white flash) in the app theme.
const styles = `${A}/res/values/styles.xml`;
if (existsSync(styles)) edit(styles, s => (s.includes('android:windowBackground') ? s
  : s.replace(/(<style name="AppTheme.NoActionBar"[^>]*>)/, '$1\n        <item name="android:windowBackground">@android:color/black</item>')));

// 4. Version: build number from GitHub Actions, name from package.json.
//    Debug signing: always the committed android-config/debug.keystore, so each new APK installs over the last one.
const run = Number(process.env.GITHUB_RUN_NUMBER || 1);
edit('android/app/build.gradle', s => {
  // The version name carries the native version ("2.0.0-n2"): automatic updates check it before installing a bundle.
  s = s.replace(/versionCode\s+\d+/, `versionCode ${run}`).replace(/versionName\s+"[^"]*"/, `versionName "${pkg.version}-n${pkg.nativeVersion ?? 1}"`);
  if (!s.includes('android-config/debug.keystore')) {
    s = s.replace(/android\s*\{/, `android {
    signingConfigs {
        debug {
            storeFile file('../../android-config/debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }`);
  }
  return s;
});

console.log(`Android project configured: ${cfg.appName} (${cfg.appId}), version ${pkg.version} (${run}).`);
