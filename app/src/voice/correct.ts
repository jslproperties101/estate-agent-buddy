// JoyChange002 Change 49: after the phone turns speech into text, near-misses of property words are fixed before the text
// reaches the typing box ("bumi putra" → "Bumiputera", "s p a" → "SPA", "kota seri emas" → "Kota Seriemas").
// The words come from a built-in list plus the agent's own saved addresses (states, townships, neighbourhoods and streets
// from the Change 5 chain), so local names are recognised. The speech service itself is unchanged.
// Limit: only near-misses of KNOWN words are fixed; a word that is not close to any known one is left as it was said.

/** Names written with their own capitals (always corrected to this spelling, including capitals). */
export const BUILT_IN_NAMES = [
  'SPA', 'Jalan', 'Taman', 'Lorong', 'Persiaran', 'Bandar', 'Kampung', 'Bumiputera', 'Non Bumiputera', 'Malay Reserve', 'Semi-D',
  'Nilai', 'Seremban', 'Negeri Sembilan', 'Selangor', 'Kuala Lumpur', 'Putrajaya', 'Cyberjaya', 'Sale and Purchase Agreement',
];
/** Ordinary property words: a near-miss is fixed, but the agent's own capitals are kept (written in lower case when fixed). */
export const BUILT_IN_WORDS = [
  'freehold', 'leasehold', 'individual title', 'strata title', 'master title', 'bungalow', 'terrace house', 'townhouse',
  'condominium', 'apartment', 'serviced residence', 'shop office', 'factory', 'warehouse', 'cluster', 'corner lot',
  'intermediate', 'end lot', 'built-up', 'land size', 'loan', 'consent', 'booking fee', 'earnest deposit', 'ringgit',
];
export const BUILT_IN_TERMS = [...BUILT_IN_NAMES, ...BUILT_IN_WORDS];

/** Common ways the speech service writes these words, mapped to the right word. */
const ALIASES: Record<string, string> = {
  's p a': 'SPA', 'spa': 'SPA', 'esp a': 'SPA', 'spay': 'SPA', 'bumi putra': 'Bumiputera', 'bumiputra': 'Bumiputera', 'bumi putera': 'Bumiputera',
  'boomy putra': 'Bumiputera', 'non bumi': 'Non Bumiputera', 'non bumi putra': 'Non Bumiputera', 'non bumi putera': 'Non Bumiputera', 'free hold': 'freehold', 'lease hold': 'leasehold', 'least hold': 'leasehold',
  'semi d': 'Semi-D', 'semi dee': 'Semi-D', 'semi-dee': 'Semi-D', 'jalan': 'Jalan', 'jallan': 'Jalan', 'gelan': 'Jalan', 'jalen': 'Jalan',
  'taman': 'Taman', 'tamon': 'Taman', 'tamen': 'Taman', 'built up': 'built-up', 'bill tup': 'built-up', 'build up': 'built-up',
};

/** Words that usually start a longer name (Jalan Seriemas 1, Taman Desa): matched on their own only if nothing longer fits. */
const WEAK = new Set(['jalan', 'jallan', 'gelan', 'jalen', 'taman', 'tamon', 'tamen']);

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Edit distance (Levenshtein), stopping early once it is above `max`. */
export function distance(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** How many letters may differ for a word of this length (short words must match exactly). */
const allowed = (n: number) => (n < 6 ? 0 : n < 10 ? 1 : 2);

interface Term { words: string[]; joined: string; text: string; word: boolean }
const WORDS = new Set(BUILT_IN_WORDS);
function terms(vocab: string[]): Term[] {
  const seen = new Set<string>();
  const out: Term[] = [];
  for (const v of vocab) {
    const n = norm(v);
    if (n.length < 3 || seen.has(n)) continue;
    seen.add(n);
    out.push({ words: n.split(' '), joined: n.replace(/ /g, ''), text: v.trim(), word: WORDS.has(v) });
  }
  // Longer phrases first, so "Non Bumiputera" wins over "Bumiputera".
  return out.sort((a, b) => b.words.length - a.words.length || b.joined.length - a.joined.length);
}

/** Fixes near-misses of known property words and places. Words that are not close to a known one are left alone. */
export function correctTerms(text: string, vocab: string[] = []): string {
  if (!text.trim()) return text;
  const list = terms([...vocab, ...BUILT_IN_NAMES, ...BUILT_IN_WORDS]);
  // Split keeping the gaps, so punctuation and numbers stay exactly as they were.
  const parts = text.split(/(\s+)/);
  const words = parts.map((p, i) => (i % 2 === 0 ? p : null));
  const idx = words.map((w, i) => (w !== null && w !== '' ? i : -1)).filter(i => i >= 0);
  const out = [...parts];
  const used = new Set<number>();
  for (let a = 0; a < idx.length; a++) {
    if (used.has(idx[a])) continue;
    // Try 1 to 4 spoken words against the known terms (a term may be heard as more or fewer words). The closest match
    // wins; between equally close ones, the longer stretch of words (so "non bumi putra" is one term, not two).
    let best: { span: number[]; fix: string; d: number; lead: string; trail: string; raw: string } | undefined;
    for (let len = 1; len <= Math.min(4, idx.length - a); len++) {
      const span = idx.slice(a, a + len);
      if (span.some(i => used.has(i))) break;
      const raw = span.map(i => parts[i]).join(' ');
      const lead = /^[^\p{L}\p{N}]*/u.exec(raw)?.[0] ?? '';
      const trail = /[^\p{L}\p{N}]*$/u.exec(raw)?.[0] ?? '';
      // Punctuation inside the stretch (a comma, a full stop) ends it: a term never runs across it.
      if (len > 1 && /[^\p{L}\p{N}\s-]/u.test(raw.slice(lead.length, raw.length - trail.length))) break;
      const heard = norm(raw);
      if (!heard) continue;
      const said = raw.slice(lead.length, raw.length - trail.length);
      let fix: string | undefined; let d = 0;
      // A road or estate word on its own ("jalan", "taman") counts as a weak match, so the full name it starts wins.
      if (ALIASES[heard]) { fix = ALIASES[heard]; d = WEAK.has(heard) ? 1 : 0; }
      else {
        const joined = heard.replace(/ /g, '');
        for (const t of list) {
          if (t.joined === joined) { fix = t.word && heard === t.words.join(' ') ? said : t.text; d = 0; break; }
          const max = allowed(t.joined.length);
          if (!max || joined[0] !== t.joined[0]) continue;
          const dd = distance(joined, t.joined, max);
          if (dd <= max && (fix === undefined || dd < d)) { fix = t.text; d = dd; }
        }
      }
      if (fix === undefined) continue;
      if (!best || d < best.d || (d === best.d && span.length > best.span.length)) best = { span, fix, d, lead, trail, raw };
    }
    if (!best) continue;
    const { span, fix, lead, trail, raw } = best;
    span.forEach(i => used.add(i));
    if (raw.slice(lead.length, raw.length - trail.length) === fix) continue;   // already written that way
    out[span[0]] = lead + fix + trail;
    for (let k = 1; k < span.length; k++) { out[span[k]] = ''; out[span[k] - 1] = ''; }
  }
  return out.join('');
}

/** The agent's own words for the corrector: every saved address entry and the address parts of their properties. */
export function vocabularyFrom(options: Record<string, { value: string }[]>, properties: { street?: string; township?: string; neighborhood?: string; city?: string; state?: string }[]): string[] {
  const out: string[] = [];
  for (const [k, items] of Object.entries(options)) {
    if (k === 'country' || /^(state|city|township|neighborhood|street)@/.test(k)) for (const o of items) out.push(o.value);
  }
  for (const p of properties) for (const v of [p.state, p.city, p.township, p.neighborhood, p.street]) if (v) out.push(v);
  return out;
}
