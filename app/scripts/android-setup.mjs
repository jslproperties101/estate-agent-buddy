// Configures the Android project that `npx cap add android` generates (run by the GitHub Actions build).
// The generated android/ folder is not committed; this script makes every build the same:
//  - app name "Estate Agent AI Buddy", package com.jslproperties.estateagentbuddy (from capacitor.config.json);
//  - permissions: precise/approximate location (GPS Assistance), camera (property and banner photos),
//    notifications (reminders, Android 13+), internet; storage for saved PDFs on Android 9 and older;
//  - the AdMob app ID (Change 011);
//  - the sign-in return link com.jslproperties.estateagentbuddy://auth-callback opens the app (Google login);
//  - version code from the build number, version name from package.json;
//  - black window background so there is no white flash before the app draws.
// Usage: node scripts/android-setup.mjs   (after `npx cap add android` / `npx cap sync android`)
import { readFileSync, writeFileSync, existsSync, readdirSync, copyFileSync } from 'node:fs';

const cfg = JSON.parse(readFileSync('capacitor.config.json', 'utf8'));
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
// EAB_QA=1: the isolated QA app. A different package name (so it installs BESIDE the real app with its own storage and cannot
// overwrite it), its own sign-in return link and its own app name. The web side is built with the same flag (updates off).
const QA = process.env.EAB_QA === '1';
const APP_ID = QA ? `${cfg.appId}.qa` : cfg.appId;
const APP_NAME = QA ? 'EAB QA' : cfg.appName;
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
// Change 011: the AdMob app ID (public; it is inside every APK that shows AdMob ads). Read from src/adverts/admob.ts so it
// is written in one place only. Without this entry the Google Mobile Ads SDK stops the app at start, so the build fails
// here if it cannot be found.
const ADMOB_APP_ID = /ADMOB_APP_ID\s*=\s*'(ca-app-pub-[0-9]+~[0-9]+)'/.exec(readFileSync(new URL('../src/adverts/admob.ts', import.meta.url), 'utf8'))?.[1];
if (!ADMOB_APP_ID) throw new Error('AdMob app ID not found in src/adverts/admob.ts');
edit(`${A}/AndroidManifest.xml`, s => {
  for (const p of PERMS) {
    if (!s.includes(`"${p}"`)) s = s.replace(/<\/manifest>\s*$/, `    <uses-permission android:name="${p}" />\n</manifest>\n`);
  }
  if (!s.includes('android.hardware.location.gps')) {
    s = s.replace(/<\/manifest>\s*$/, '    <uses-feature android:name="android.hardware.location.gps" android:required="false" />\n    <uses-feature android:name="android.hardware.camera" android:required="false" />\n</manifest>\n');
  }
  // Change 013: Download PDF writes to the phone's Documents folder; only Android 9 and older need this permission for it.
  if (!s.includes('android.permission.WRITE_EXTERNAL_STORAGE')) {
    s = s.replace(/<\/manifest>\s*$/, '    <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="29" />\n</manifest>\n');
  }
  // Change 011: AdMob app ID inside <application>.
  if (!s.includes('com.google.android.gms.ads.APPLICATION_ID')) {
    s = s.replace(/(<application[^>]*>)/, `$1\n        <meta-data android:name="com.google.android.gms.ads.APPLICATION_ID" android:value="${ADMOB_APP_ID}" />`);
  }
  // Android 11+: apps must declare that they look for the speech service, or voice reports "not available".
  if (!s.includes('android.speech.RecognitionService')) {
    s = s.replace(/<application/, '<queries>\n        <intent>\n            <action android:name="android.speech.RecognitionService" />\n        </intent>\n    </queries>\n\n    <application');
  }
  // JoyChange002 Change 30: the page shrinks above the keyboard (rather than the keyboard covering it), so a field being
  // typed in and any pop-up can be moved into the visible part. Replaces any other soft-input mode on the main activity.
  s = s.replace(/(<activity[^>]*android:name="[^"]*MainActivity"[^>]*?)\s+android:windowSoftInputMode="[^"]*"/, '$1');
  s = s.replace(/(<activity)([^>]*android:name="[^"]*MainActivity")/, '$1 android:windowSoftInputMode="adjustResize"$2');
  // The Capacitor template normally already has this filter; add it if not.
  if (!s.includes('@string/custom_url_scheme') && !s.includes(`android:scheme="${APP_ID}"`)) {
    s = s.replace(/(<activity[^>]*android:name="[^"]*MainActivity"[\s\S]*?)(<\/activity>)/, `$1
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="${APP_ID}" />
            </intent-filter>
        $2`);
  }
  return s;
});

// 1b. JoyChange002 Change 25: Firebase Cloud Messaging. The Capacitor template applies the Google services Gradle plugin
//     when android/app/google-services.json exists; the one file holds both the real and the QA app.
{
  const src = new URL('../android-config/google-services.json', import.meta.url);
  if (existsSync(src)) {
    const j = JSON.parse(readFileSync(src, 'utf8'));
    const ids = (j.client ?? []).map(c => c.client_info?.android_client_info?.package_name);
    if (!ids.includes(APP_ID)) throw new Error(`google-services.json has no Android app ${APP_ID} (it has ${ids.join(', ')})`);
    copyFileSync(src, 'android/app/google-services.json');
  }
}

// 2. Names and the URL scheme.
edit(`${A}/res/values/strings.xml`, s => {
  const set = (name, value) => {
    const re = new RegExp(`<string name="${name}">[^<]*</string>`);
    return re.test(s) ? s.replace(re, `<string name="${name}">${value}</string>`) : s.replace('</resources>', `    <string name="${name}">${value}</string>\n</resources>`);
  };
  s = set('app_name', APP_NAME);
  s = set('title_activity_main', APP_NAME);
  s = set('package_name', APP_ID);
  s = set('custom_url_scheme', APP_ID);
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
  s = s.replace(/versionCode\s+\d+/, `versionCode ${run}`).replace(/versionName\s+"[^"]*"/, `versionName "${pkg.version}${QA ? '-qa' : ''}-n${pkg.nativeVersion ?? 1}"`);
  if (QA) s = s.replace(/applicationId\s+"[^"]*"/, `applicationId "${APP_ID}"`);
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

// 5. Change 015: the phone's own navigation area (gesture bar or back / home / recent buttons) is solid black on every
//    screen, and the app's content (the web page and the AdMob banner inside it) ends directly above it. Android 15+
//    draws apps edge to edge, under the navigation area; here the content view is padded by the system bars instead, so
//    the advert can never sit over the gesture controls and the area under it shows the black window. Nothing else in
//    the generated activity changes.
if (existsSync(styles)) edit(styles, s => (s.includes('android:navigationBarColor') ? s
  : s.replace(/(<style name="AppTheme.NoActionBar"[^>]*>)/, '$1\n        <item name="android:navigationBarColor">@android:color/black</item>')));
const javaRoot = `${A}/java`;
const findMain = dir => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) { const f = findMain(p); if (f) return f; } else if (e.name === 'MainActivity.java') return p;
  }
  return null;
};
const mainActivity = existsSync(javaRoot) ? findMain(javaRoot) : null;
if (!mainActivity) throw new Error('MainActivity.java not found: run "npx cap add android" first.');
edit(mainActivity, s => {
  if (s.includes('Change 015')) return s;
  if (!/public class MainActivity extends BridgeActivity\s*\{\s*\}/.test(s)) throw new Error(`${mainActivity} is not the plain Capacitor template; not changing it.`);
  const pkgLine = /^package [^;]+;/m.exec(s)?.[0];
  if (!pkgLine) throw new Error(`No package line in ${mainActivity}`);
  return `${pkgLine}

import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.widget.RelativeLayout;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private View content;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // JoyChange003 Change 77: the app's own file plugin (saves to Downloads and the Gallery, opens a saved file).
        registerPlugin(EabFilesPlugin.class);
        super.onCreate(savedInstanceState);
        // Change 015: solid black system navigation area; app content (web page and AdMob banner) directly above it.
        getWindow().getDecorView().setBackgroundColor(Color.BLACK);
        getWindow().setNavigationBarColor(Color.BLACK);
        if (Build.VERSION.SDK_INT >= 29) getWindow().setNavigationBarContrastEnforced(false);
        WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView()).setAppearanceLightNavigationBars(false);
        content = findViewById(android.R.id.content);
        if (content != null) {
            ViewCompat.setOnApplyWindowInsetsListener(content, (v, insets) -> {
                Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
                v.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                keepBannerOnTheEdge();
                return WindowInsetsCompat.CONSUMED;
            });
            content.getViewTreeObserver().addOnGlobalLayoutListener(this::keepBannerOnTheEdge);
            ViewCompat.requestApplyInsets(content);
        }
    }

    /** The AdMob plugin (Android 15+) gives its banner a bottom margin as tall as the navigation bar. The content above is
     *  already padded by that height, so the margin would lift the banner a second time: a black band under it, and the
     *  banner over the page's bottom buttons (owner's screenshot, 17 Oct 2026). Keep the banner flush with the content's
     *  bottom, directly above the black navigation area. Only the plugin's own banner box is touched. */
    private void keepBannerOnTheEdge() {
        if (!(content instanceof ViewGroup) || ((ViewGroup) content).getChildCount() == 0) return;
        View root = ((ViewGroup) content).getChildAt(0);
        if (!(root instanceof ViewGroup)) return;
        ViewGroup g = (ViewGroup) root;
        for (int i = 0; i < g.getChildCount(); i++) {
            View c = g.getChildAt(i);
            if (!(c instanceof RelativeLayout) || !holdsAdView((ViewGroup) c)) continue;
            ViewGroup.LayoutParams lp = c.getLayoutParams();
            if (lp instanceof ViewGroup.MarginLayoutParams) {
                ViewGroup.MarginLayoutParams m = (ViewGroup.MarginLayoutParams) lp;
                if (m.bottomMargin != 0) { m.bottomMargin = 0; c.setLayoutParams(m); }
            }
        }
    }

    private static boolean holdsAdView(ViewGroup g) {
        for (int i = 0; i < g.getChildCount(); i++) {
            if (g.getChildAt(i).getClass().getName().startsWith("com.google.android.gms.ads.")) return true;
        }
        return false;
    }
}
`;
});

// JoyChange003 Change 77: a small plugin of the app's own, next to MainActivity. Downloads go where Android lists them:
// every file in Download/Estate Agent Buddy (the Files app's Downloads), and pictures also in Pictures/Estate Agent Buddy (the
// Gallery). Android 10 and newer: through MediaStore (no permission needed). Android 9 and older: written to the public
// folder and scanned (needs the storage permission, already in the manifest up to Android 10). open() hands a saved file
// to the app that shows it (Gallery, a PDF viewer).
{
  const pkg = /^package ([^;]+);/m.exec(readFileSync(mainActivity, 'utf8'))?.[1];
  if (!pkg) throw new Error(`No package line in ${mainActivity}`);
  writeFileSync(mainActivity.replace(/MainActivity\.java$/, 'EabFilesPlugin.java'), `package ${pkg};

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;

@CapacitorPlugin(name = "EabFiles")
public class EabFilesPlugin extends Plugin {
    private static final String FOLDER = "Estate Agent Buddy";

    @PluginMethod
    public void saveToPublic(PluginCall call) {
        String name = call.getString("name");
        String mime = call.getString("mime", "application/octet-stream");
        String data = call.getString("data");
        boolean image = Boolean.TRUE.equals(call.getBoolean("image", false));
        if (name == null || data == null) { call.reject("name and data are needed"); return; }
        try {
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            JSObject ret = new JSObject();
            ret.put("download", write(bytes, name, mime, false).toString());
            if (image) ret.put("gallery", write(bytes, name, mime, true).toString());
            call.resolve(ret);
        } catch (Exception e) {
            call.reject(e.getMessage() == null ? "save failed" : e.getMessage());
        }
    }

    private Uri write(byte[] bytes, String name, String mime, boolean gallery) throws IOException {
        if (Build.VERSION.SDK_INT >= 29) {
            ContentResolver r = getContext().getContentResolver();
            ContentValues v = new ContentValues();
            v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
            v.put(MediaStore.MediaColumns.RELATIVE_PATH, (gallery ? Environment.DIRECTORY_PICTURES : Environment.DIRECTORY_DOWNLOADS) + "/" + FOLDER);
            v.put(MediaStore.MediaColumns.IS_PENDING, 1);
            Uri where = gallery ? MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY) : MediaStore.Downloads.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
            Uri uri = r.insert(where, v);
            if (uri == null) throw new IOException("could not create the file");
            try (OutputStream o = r.openOutputStream(uri)) {
                if (o == null) throw new IOException("could not open the file");
                o.write(bytes);
            } catch (IOException e) {
                r.delete(uri, null, null);
                throw e;
            }
            ContentValues done = new ContentValues();
            done.put(MediaStore.MediaColumns.IS_PENDING, 0);
            r.update(uri, done, null, null);
            return uri;
        }
        File dir = new File(Environment.getExternalStoragePublicDirectory(gallery ? Environment.DIRECTORY_PICTURES : Environment.DIRECTORY_DOWNLOADS), FOLDER);
        if (!dir.exists() && !dir.mkdirs()) throw new IOException("could not make the folder");
        File f = new File(dir, name);
        try (OutputStream o = new FileOutputStream(f)) { o.write(bytes); }
        MediaScannerConnection.scanFile(getContext(), new String[] { f.getAbsolutePath() }, new String[] { mime }, null);
        return FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
    }

    @PluginMethod
    public void open(PluginCall call) {
        String uri = call.getString("uri");
        String mime = call.getString("mime", "*/*");
        if (uri == null) { call.reject("uri is needed"); return; }
        try {
            Intent view = new Intent(Intent.ACTION_VIEW);
            view.setDataAndType(Uri.parse(uri), mime);
            view.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(view, null);
            chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(chooser);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage() == null ? "no app can open this file" : e.getMessage());
        }
    }
}
`);
}

console.log(`Android project configured: ${APP_NAME} (${APP_ID}${QA ? ', QA build: separate package, updates off' : ''}), version ${pkg.version} (${run}).`);
