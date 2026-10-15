#!/usr/bin/env node
// Checks every stored backup in a target folder WITHOUT any key (present, size, SHA-256). Exit 1 if any fails.
//   node verify.mjs <backup folder>
import { FolderTarget, verifyStored } from './lib.mjs';
const dir = process.argv[2];
if (!dir) { console.error('usage: node verify.mjs <backup folder>'); process.exit(2); }
const t = new FolderTarget(dir); let bad = 0;
for (const name of t.list()) { const v = verifyStored(t, name); console.log(`${v.ok ? 'OK  ' : 'FAIL'} ${name}${v.ok ? '' : ` (${v.problem})`}`); if (!v.ok) bad++; }
process.exit(bad ? 1 : 0);
