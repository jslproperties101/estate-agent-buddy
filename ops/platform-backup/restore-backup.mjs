#!/usr/bin/env node
// Opens one platform backup with ONE key holder's private key and writes its contents into a NEW empty folder:
// database.sql (load it into a NEW database, never on top of production), objects/… and manifest.json (row counts).
//   node restore-backup.mjs --file <backup .eab> --identity <holder.private.json> --out <new folder>
// Every entry is checked against the backup's own manifest; any change, truncation or wrong key stops with nothing written.
import { restoreBackup, readKey, BackupError } from './lib.mjs';

const args = process.argv.slice(2); const get = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const [file, id, out] = [get('--file'), get('--identity'), get('--out')];
if (!file || !id || !out) { console.error('usage: node restore-backup.mjs --file <.eab> --identity <private.json> --out <new empty folder>'); process.exit(2); }
try {
  const m = restoreBackup(file, readKey(id), out);
  console.log(`Restored ${m.entries.length} entries made ${m.createdAt} into ${out}. Row counts at backup time: ${JSON.stringify(m.counts)}`);
} catch (e) {
  console.error(`Restore stopped, nothing usable written: ${e instanceof BackupError ? e.code : 'error'} ${e.message}`);
  process.exit(1);
}
