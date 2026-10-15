#!/usr/bin/env node
// Makes one encrypted platform backup into a target folder.
//   node make-backup.mjs --dump database.sql --objects <folder of storage objects> --counts counts.json \
//        --key holder1.public.json --key holder2.public.json --target <backup folder> [--source label]
// Prints the public manifest (no secrets). The job needs only PUBLIC keys: it can make backups but cannot read them.
import { readFileSync } from 'node:fs';
import { makeBackup, verifyStored, readKey, FolderTarget } from './lib.mjs';

const args = process.argv.slice(2); const get = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const keys = args.flatMap((a, i) => (a === '--key' ? [args[i + 1]] : []));
const target = get('--target');
if (!target || !keys.length || (!get('--dump') && !get('--objects'))) { console.error('usage: node make-backup.mjs --dump <file> [--objects <dir>] [--counts <json>] --key <public.json> [--key …] --target <dir>'); process.exit(2); }
const recipients = keys.map(readKey);
if (recipients.some(k => k.d)) { console.error('Refusing: a PRIVATE key was given. The backup job must only ever hold public keys.'); process.exit(2); }
const t = new FolderTarget(target);
const r = makeBackup({ dump: get('--dump'), objectsDir: get('--objects'), counts: get('--counts') ? JSON.parse(readFileSync(get('--counts'), 'utf8')) : {}, recipients, target: t, source: get('--source') ?? '' });
const v = verifyStored(t, r.name);
if (!v.ok) { console.error(`Stored backup did not verify: ${v.problem}`); process.exit(1); }
console.log(JSON.stringify(r.manifest, null, 1));
