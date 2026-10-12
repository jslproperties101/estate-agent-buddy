// Local sensitive-data check (Version 1I proposal). Runs on the device.
// Finds owners' IC numbers, passport and bank-account numbers, and title or SPA wording.
// Sensitive sources stay on the device; the matched numbers are never used as field values
// and are masked when text is shown.

export interface SensitiveResult {
  sensitive: boolean;
  reasons: string[];            // 'ic', 'passport', 'bank', 'title', 'spa'
  ranges: [number, number][];   // character ranges to block and mask
}

const IC = /(?<!\d)\d{6}-\d{2}-\d{4}(?!\d)/g;
const IC_PLAIN = /(?:\bIC|NRIC|K\/P|No\.?\s*K\.?P\.?|kad\s+pengenalan|身份证)\s*(?:no\.?)?\s*[:：]?\s*(\d{12})(?!\d)/gi;
const PASSPORT = /(?:passport|pasport)\s*(?:no\.?)?\s*[:：]?\s*([A-Z]\d{7,8})\b/gi;
const BANK = /(?:account|akaun|a\/c)\s*(?:no\.?|number|nombor)?\s*[:：]?\s*(\d[\d\s-]{8,18}\d)/gi;
// Title documents: words that appear on the title itself, not the "individual title" wording used in brochures.
const TITLE = /(geran\s+(?:mukim|no\.?|\d)|surat\s+hakmilik|no\.?\s*hakmilik\s*[:：]?\s*\S|issue\s+document\s+of\s+title|title\s+deed|\bH\.?\s?S\.?\s?\(\s*[DM]\s*\)\s*\d|\bGRN\s*\d)/i;
const SPA = /(perjanjian\s+jual\s+beli|sale\s+and\s+purchase\s+agreement|\bS\s?&\s?P\s+agreement|买卖合约)/i;

export function checkSensitive(text: string): SensitiveResult {
  const ranges: [number, number][] = [];
  const reasons = new Set<string>();
  const scan = (re: RegExp, reason: string, group = 0) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const start = group ? m.index + m[0].indexOf(m[group]) : m.index;
      const len = group ? m[group].length : m[0].length;
      ranges.push([start, start + len]);
      reasons.add(reason);
    }
  };
  scan(IC, 'ic');
  scan(IC_PLAIN, 'ic', 1);
  scan(PASSPORT, 'passport', 1);
  scan(BANK, 'bank', 1);
  if (TITLE.test(text)) reasons.add('title');
  if (SPA.test(text)) reasons.add('spa');
  return { sensitive: reasons.size > 0, reasons: [...reasons], ranges };
}

/** Replaces blocked ranges with # characters (digits only), for showing text safely. */
export function mask(text: string, ranges: [number, number][]): string {
  let out = text;
  for (const [s, e] of ranges) out = out.slice(0, s) + out.slice(s, e).replace(/\d/g, '#') + out.slice(e);
  return out;
}
