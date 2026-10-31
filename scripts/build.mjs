// Copies web/ to dist/ and stamps the version and commit into js/build-info.js. No bundler needed.
import { cpSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
let commit = process.env.GITHUB_SHA?.slice(0, 7);
if (!commit) { try { commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { commit = 'local'; } }
const OUT = process.env.MW_OUTDIR || 'dist';
rmSync(OUT, { recursive: true, force: true });
cpSync('web', OUT, { recursive: true });
// MM2H office database (Admin MM2H). Public key only: a secret / service-role key is refused.
const office = { url: (process.env.MW_OFFICE_URL || '').trim().replace(/\/+$/, ''), key: (process.env.MW_OFFICE_KEY || '').trim() };
if (/^sb_secret_/.test(office.key)) throw new Error('MW_OFFICE_KEY is a SECRET key. Use the publishable key.');
if (/^eyJ/.test(office.key)) { let role = ''; try { role = JSON.parse(Buffer.from(office.key.split('.')[1], 'base64url').toString()).role; } catch { /* not a JWT */ } if (role === 'service_role') throw new Error('MW_OFFICE_KEY is a SERVICE-ROLE key. Use the public anon key.'); }
if (office.url && !/^https:\/\/[^/]+$/.test(office.url)) throw new Error('MW_OFFICE_URL must look like https://xxxx.supabase.co');
writeFileSync(`${OUT}/js/build-info.js`, `export const BUILD = ${JSON.stringify({ version: pkg.version, commit })};\nexport const OFFICE = ${JSON.stringify(office.url && office.key ? office : { url: '', key: '' })};\n`);
console.log(`${OUT} built: version ${pkg.version}, commit ${commit}, MM2H office: ${office.url && office.key ? office.url : 'not set'}`);
