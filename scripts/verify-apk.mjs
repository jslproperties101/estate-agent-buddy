// Checks the built APK: package name, app name and launcher icon are inside. Usage: node scripts/verify-apk.mjs <apk>
import { execFileSync } from 'node:child_process';
const apk = process.argv[2];
const list = execFileSync('unzip', ['-l', apk]).toString();
const need = ['AndroidManifest.xml', 'assets/public/index.html', 'assets/public/js/app.js', 'res/mipmap-xxxhdpi'];
const missing = need.filter(n => !list.includes(n));
const badging = (() => { try { return execFileSync(process.env.AAPT || 'aapt', ['dump', 'badging', apk]).toString(); } catch { return ''; } })();
if (badging) {
  if (!badging.includes("package: name='com.jslproperties.malaysiawelcome'")) missing.push('package name com.jslproperties.malaysiawelcome');
  if (!badging.includes("application-label:'Malaysia Welcome AI Buddy'")) missing.push('app name Malaysia Welcome AI Buddy');
  console.log(badging.split('\n').filter(l => /^(package|application-label|sdkVersion|targetSdkVersion|uses-permission)/.test(l)).join('\n'));
}
if (missing.length) { console.error('APK check failed, missing: ' + missing.join(', ')); process.exit(1); }
console.log('APK check passed');
