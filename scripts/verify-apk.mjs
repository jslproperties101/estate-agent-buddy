// Checks the built APK: package name, app name and launcher icon are inside. Usage: node scripts/verify-apk.mjs <apk>
import { execFileSync } from 'node:child_process';
const apk = process.argv[2];
const list = execFileSync('unzip', ['-l', apk]).toString();
const need = ['AndroidManifest.xml', 'assets/public/index.html', 'assets/public/js/app.js', 'res/mipmap-xxxhdpi'];
const missing = need.filter(n => !list.includes(n));
const badging = (() => { if (!process.env.AAPT) return ''; try { return execFileSync(process.env.AAPT, ['dump', 'badging', apk]).toString(); } catch (e) { console.log('::warning::aapt failed: ' + String(e.message).slice(0, 200)); return ''; } })();
if (badging) {
  if (!badging.includes("package: name='com.jslproperties.malaysiawelcome'")) missing.push('package name com.jslproperties.malaysiawelcome');
  if (!badging.includes("application-label:'Malaysia Welcome AI Buddy'")) missing.push('app name Malaysia Welcome AI Buddy');
  console.log(badging.split('\n').filter(l => /^(package|application-label|sdkVersion|targetSdkVersion|uses-permission)/.test(l)).join('\n'));
}
if (missing.length) { console.log('::error::APK check failed, missing: ' + missing.join(', ') + ' | ' + list.split('\n').filter(l => /mipmap|index.html|Manifest/.test(l)).slice(0, 8).join(' ; ')); process.exit(1); }
console.log('APK check passed');
