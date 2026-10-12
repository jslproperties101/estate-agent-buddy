// Measures the local pipeline on a folder of sample brochures (non-confidential only).
// Usage: npm run measure -- <folder> [expected.json]
// expected.json (optional): { "file.pdf": { "lang": "en", "price": "RM 3,400,000", "land": "8,000 sq ft", ... } }
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { pdfPagesWith } from '../src/local/pdf-core';
import { readSource, SourceResult } from '../src/local/pipeline';
import { extract, Segment } from '../src/local/rules';
import { merge } from '../src/local/merge';
import { kindOf } from '../src/local/files';

const dir = process.argv[2];
const expectedPath = process.argv[3];
if (!dir || !existsSync(dir)) { console.error('Usage: npm run measure -- <folder> [expected.json]'); process.exit(2); }
const expected: Record<string, Record<string, string>> = expectedPath ? JSON.parse(readFileSync(expectedPath, 'utf8')) : {};
const norm = (s: string) => s.toLowerCase().replace(/[\s,]/g, '');
const hasTesseract = spawnSync('tesseract', ['--version']).status === 0;

function guessLang(text: string): string {
  if (/[஀-௿]/.test(text)) return 'ta';
  if (/[一-鿿]/.test(text)) return 'zh';
  if (/\b(harga|keluasan|pegangan|dijual|kilang|tanah)\b/i.test(text)) return 'bm';
  return 'en';
}

interface Row { file: string; lang: string; status: string; ms: number; found: number; conflicts: number; missing: string[]; wouldAskAi: boolean; aiNote: string; sensitive: boolean; correct?: number; wrong?: string[]; notFound?: string[]; expectedCount?: number; ocr?: string }
const rows: Row[] = [];

for (const f of readdirSync(dir).sort()) {
  const path = join(dir, f);
  const kind = kindOf(f, '');
  if (kind === 'other') continue;
  const bytes = new Uint8Array(readFileSync(path));
  const r: SourceResult = await readSource({ id: f, name: f, mime: '', bytes }, b => pdfPagesWith(pdfjs, b));
  let segments: Segment[] = r.segments;
  let ocr: string | undefined;
  // Photos: English-only OCR with the Tesseract program, if installed, as a rough guide only.
  // The phone app would use on-device OCR (ML Kit or Tesseract.js) with Malay, Chinese and Tamil.
  if (kind === 'image') {
    if (hasTesseract) {
      const t0 = Date.now();
      const out = spawnSync('tesseract', [path, '-', '-l', 'eng'], { encoding: 'utf8' });
      segments = [{ sourceId: f, sourceName: f, page: null, text: out.stdout || '' }];
      ocr = `tesseract eng ${Date.now() - t0} ms`;
      r.info.ms += Date.now() - t0;
      r.info.status = 'read';
    } else ocr = 'no OCR available here';
  }
  const ps = extract(segments, s => r.blocked.get(s) ?? []);
  const m = merge(ps);
  const text = segments.map(s => s.text).join('\n');
  const exp = expected[f];
  const row: Row = {
    file: f, lang: exp?.lang ?? guessLang(text), status: r.info.status, ms: r.info.ms,
    found: m.fields.filter(x => x.suggested || x.candidates).length, conflicts: m.conflicts.length,
    missing: m.missing, wouldAskAi: m.wouldAskAi && !r.info.sensitive && r.info.status === 'read', sensitive: r.info.sensitive, ocr,
    aiNote: r.info.sensitive ? 'no (sensitive: stays local)' : r.info.status === 'needs-ocr' ? 'needs OCR first' : r.info.status !== 'read' ? '—' : m.wouldAskAi ? 'yes' : 'no',
  };
  if (exp) {
    const keys = Object.keys(exp).filter(k => k !== 'lang');
    row.expectedCount = keys.length; row.correct = 0; row.wrong = []; row.notFound = [];
    for (const k of keys) {
      const fld = m.fields.find(x => x.id === k);
      const vals = fld ? (fld.candidates ? fld.candidates.map(c => c.value) : [fld.suggested]).filter(Boolean) : [];
      if (!vals.length) row.notFound.push(k);
      else if (vals.some(v => norm(v) === norm(exp[k]))) row.correct++;
      else row.wrong.push(`${k}: got ${vals.join(' / ')}, expected ${exp[k]}`);
    }
  }
  rows.push(row);
}

const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) + '%' : '—');
const langs = [...new Set(rows.map(r => r.lang))];
let md = `# Local pipeline measurement\n\nFolder: ${basename(dir)} · ${rows.length} files · ${new Date().toISOString().slice(0, 10)}\n\n`;
md += '| File | Language | Status | Time | Found | Conflicts | Missing important | Would ask AI | Sensitive | Accuracy |\n|---|---|---|---|---|---|---|---|---|---|\n';
for (const r of rows) md += `| ${r.file} | ${r.lang} | ${r.status}${r.ocr ? ' (' + r.ocr + ')' : ''} | ${r.ms} ms | ${r.found} | ${r.conflicts} | ${r.missing.join(', ') || '—'} | ${r.aiNote} | ${r.sensitive ? 'yes' : 'no'} | ${r.expectedCount ? `${r.correct}/${r.expectedCount}` : '—'} |\n`;
md += '\n## By language\n\n("Would ask AI" counts readable, non-sensitive files only.)\n\n| Language | Files | Would ask AI | Accuracy | Average time |\n|---|---|---|---|---|\n';
for (const l of langs) {
  const rs = rows.filter(r => r.lang === l);
  const c = rs.reduce((n, r) => n + (r.correct ?? 0), 0), e = rs.reduce((n, r) => n + (r.expectedCount ?? 0), 0);
  md += `| ${l} | ${rs.length} | ${pct(rs.filter(r => r.wouldAskAi).length, rs.filter(r => r.status === 'read' && !r.sensitive).length)} | ${pct(c, e)} | ${Math.round(rs.reduce((n, r) => n + r.ms, 0) / rs.length)} ms |\n`;
}
const problems = rows.flatMap(r => [...(r.wrong ?? []).map(w => `${r.file}: wrong ${w}`), ...(r.notFound ?? []).map(k => `${r.file}: not found ${k}`)]);
if (problems.length) md += '\n## Wrong or not found\n\n' + problems.map(p => '- ' + p).join('\n') + '\n';
writeFileSync(join(dir, 'measurement.md'), md);
writeFileSync(join(dir, 'measurement.json'), JSON.stringify(rows, null, 2));
console.log(md);
