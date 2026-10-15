#!/usr/bin/env node
// Makes one key holder's key pair for the platform backup (Change 006 Layer 4).
//   node keygen.mjs <holder-label> <folder for the private key, OUTSIDE this repository>
// Writes <label>.private.json (permissions 600) into that folder and <label>.public.json next to it. Only the PUBLIC
// file goes to the backup job. The private file is kept offline by that key holder (printed and/or on an encrypted USB
// key in a safe place); it is never committed, emailed, pasted in chat, or stored on the backup server.
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { generateKeyPair } from './lib.mjs';

const [label, dir] = process.argv.slice(2);
if (!label || !dir || !/^[A-Za-z0-9_-]{1,40}$/.test(label)) { console.error('usage: node keygen.mjs <holder-label> <folder outside the repository>'); process.exit(2); }
const repo = resolve(new URL('../..', import.meta.url).pathname);
if (resolve(dir).startsWith(repo)) { console.error('Refusing: the private key folder must be outside the repository.'); process.exit(2); }
mkdirSync(dir, { recursive: true, mode: 0o700 });
const priv = join(dir, `${label}.private.json`), pub = join(dir, `${label}.public.json`);
if (existsSync(priv)) { console.error(`Refusing to overwrite ${priv}`); process.exit(2); }
const k = generateKeyPair();
writeFileSync(priv, JSON.stringify({ ...k.privateKey, holder: label, warning: 'PRIVATE KEY: keep offline. Anyone with this file can read the business backups.' }, null, 1) + '\n', { mode: 0o600 });
writeFileSync(pub, JSON.stringify({ ...k.publicKey, holder: label }, null, 1) + '\n', { mode: 0o644 });
console.log(`Key id ${k.publicKey.kid} for ${label}.\nPublic key (give this to the backup job): ${pub}\nPrivate key (keep offline, never share): ${priv}`);
