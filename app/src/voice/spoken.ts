// Turns spoken numbers into digits, in English and Bahasa Malaysia (also mixed),
// so the same extraction rules work on speech: "five hundred and eighty thousand ringgit"
// becomes "RM 580000"; "lima ratus lapan puluh ribu" becomes "580000".
// Runs on the device. Nothing is guessed: words that are not numbers are left as they are.

const EN_UNITS: Record<string, number> = {
  zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const EN_TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const BM_UNITS: Record<string, number> = {
  kosong: 0, sifar: 0, satu: 1, dua: 2, tiga: 3, empat: 4, lima: 5, enam: 6, tujuh: 7, lapan: 8, sembilan: 9,
  sepuluh: 10, sebelas: 11, seratus: 100, seribu: 1000, sejuta: 1_000_000,
};
const SCALE_BIG: Record<string, number> = { thousand: 1000, ribu: 1000, million: 1_000_000, juta: 1_000_000, mil: 1_000_000 };
const POINT = new Set(['point', 'perpuluhan', 'titik']);
const HALF = new Set(['setengah']); // 'dua juta setengah' = 2.5 million
const JOIN = new Set(['and', 'dan']);
const LAST_MULT: Record<string, number> = { puluh: 10, belas: 10, ratus: 100, hundred: 100 }; // apply to the last small number

function isNumberWord(w: string): boolean {
  return w in EN_UNITS || w in EN_TENS || w in BM_UNITS || w in SCALE_BIG || w in LAST_MULT || HALF.has(w);
}
const digitOf = (w: string): number | undefined => {
  const v = EN_UNITS[w] ?? BM_UNITS[w];
  return v !== undefined && v <= 9 ? v : undefined;
};

/** Value of a run of number words, or null if it is not a sensible number. */
export function wordsToNumber(words: string[]): number | string | null {
  const ws = words.map(w => w.toLowerCase()).filter(w => !JOIN.has(w));
  if (!ws.length) return null;
  // A string of single digits ("zero one two three ...") is read digit by digit, e.g. a phone number.
  if (ws.length >= 3 && ws.every(w => digitOf(w) !== undefined)) return ws.map(w => digitOf(w)).join('');
  let total = 0, current = 0, last = 0, decimals = '', inDecimal = false, lastScale = 0;
  for (const w of ws) {
    if (POINT.has(w)) { inDecimal = true; continue; }
    if (inDecimal) {
      const d = digitOf(w);
      if (d !== undefined) { decimals += d; continue; }
      inDecimal = false;
      current += decimals ? Number('0.' + decimals) : 0;
      decimals = '';
    }
    if (HALF.has(w)) { if (!lastScale) return null; total += lastScale / 2; continue; }
    if (w in EN_UNITS) { current += EN_UNITS[w]; last = EN_UNITS[w]; }
    else if (w in EN_TENS) { current += EN_TENS[w]; last = EN_TENS[w]; }
    else if (w in BM_UNITS) {
      const v = BM_UNITS[w];
      if (v >= 1000) { total += (current || 1) * v; current = 0; last = 0; lastScale = v; }
      else { current += v; last = v; }
    }
    else if (w === 'hundred') { current = (current || 1) * 100; last = 0; }
    else if (w in LAST_MULT) {
      const m = w === 'belas' ? null : LAST_MULT[w];
      if (w === 'belas') { current = current - last + last + 10; }          // dua belas = 12
      else { current = current - last + (last || 1) * (m as number); }       // lapan puluh = 80, lima ratus = 500
      last = 0;
    }
    else if (w in SCALE_BIG) { total += (current || 1) * SCALE_BIG[w]; current = 0; last = 0; lastScale = SCALE_BIG[w]; }
    else return null;
  }
  if (inDecimal && decimals) current += Number('0.' + decimals);
  const n = total + current;
  return Number.isFinite(n) ? n : null;
}

/** Replaces spoken numbers with digits and "... ringgit" with "RM ...". Other words are kept. */
export function normaliseSpoken(text: string): string {
  const tokens = text.match(/[A-Za-zÀ-ɏ']+|\d+(?:[.,]\d+)*|[^A-Za-zÀ-ɏ\d]+/g) ?? [];
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const w = tokens[i].toLowerCase();
    // Do not start a number on "and"/"dan" or on a big scale word alone (e.g. "mil" after digits).
    if (isNumberWord(w) && !HALF.has(w)) {
      // collect a run: number words, joined by spaces/hyphens and "and"/"dan"/"point"
      const run: string[] = [];
      let j = i, lastWord = i;
      while (j < tokens.length) {
        const t = tokens[j].toLowerCase();
        if (/^[\s-]+$/.test(tokens[j])) { j++; continue; }
        if (isNumberWord(t) || JOIN.has(t) || POINT.has(t)) { run.push(t); lastWord = j; j++; continue; }
        break;
      }
      while (run.length && (JOIN.has(run[run.length - 1]) || POINT.has(run[run.length - 1]))) { run.pop(); }
      // trim the token span to the last real number word
      let end = i, count = 0;
      for (let k = i; k <= lastWord && count < run.length; k++) {
        if (!/^[\s-]+$/.test(tokens[k])) { count++; end = k; }
      }
      const v = run.length ? wordsToNumber(run) : null;
      // A lone "mil" is left as a word (it follows digits, as in "3.2 mil").
      if (v !== null && !(run.length === 1 && w === 'mil')) {
        out.push(String(v));
        i = end + 1;
        continue;
      }
    }
    out.push(tokens[i]);
    i++;
  }
  let s = out.join('');
  // "580000 ringgit" or "580k ringgit" -> "RM 580000"; "3.2 million ringgit" is already 3200000 by now.
  s = s.replace(/(\d[\d,.]*(?:\s*(?:k|mil|juta))?)\s*ringgit\b/gi, 'RM $1');
  s = s.replace(/\bringgit\s+(\d)/gi, 'RM $1');
  // "single storey"/"double storey"
  s = s.replace(/\bsingle[-\s]?(stor(?:e)?y)/gi, '1-$1').replace(/\bdouble[-\s]?(stor(?:e)?y)/gi, '2-$1');
  return s;
}
