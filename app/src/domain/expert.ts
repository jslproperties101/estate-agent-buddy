// Ask Expert helpers. The AI answer comes from the owner's own server function (supabase/functions/ask-expert),
// so no AI key is ever in the app. Only property facts are sent as context — never owner names, phone numbers,
// IC or account numbers.
import type { ExpertKey } from '../data/types';
import { Listing, addressLine, rm } from '../listing/model';

export function propertyContext(p?: Listing): string | undefined {
  if (!p) return undefined;
  const parts = [
    p.type, p.purpose && `for ${p.purpose.replace('_', ' ')}`,
    [p.township, p.city, p.state].filter(Boolean).join(', '),
    p.askingPrice !== undefined && `asking ${rm(p.askingPrice)}`, p.monthlyRent !== undefined && `rent ${rm(p.monthlyRent)}/month`,
    p.tenure, p.leaseExpiryYear && `lease to ${p.leaseExpiryYear}`, p.titleType, p.restriction,
    p.landSqft !== undefined && `land ${p.landSqft} sq ft`, p.builtUpSqft !== undefined && `built-up ${p.builtUpSqft} sq ft`,
  ].filter(Boolean);
  return parts.join('; ');
}

/** A short property label for messages (address and reference only). */
export const propertyLabel = (p?: Listing) => (p ? [p.ref, p.headline || addressLine(p)].filter(Boolean).join(' · ') : undefined);

export interface AiRequest { expert: ExpertKey; question: string; context?: string; lang: 'en' | 'bm' | 'zh'; history?: { from: 'me' | 'expert' | 'ai'; text: string }[] }

export class ExpertAiError extends Error {}

export async function askAi(url: string, req: AiRequest, headers: Record<string, string> = {}, fetchFn: typeof fetch = fetch): Promise<string> {
  let r: Response;
  try {
    r = await fetchFn(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(req) });
  } catch (e) { throw new ExpertAiError(String(e)); }
  if (!r.ok) throw new ExpertAiError(`${r.status}`);
  const j = await r.json().catch(() => null) as { answer?: unknown } | null;
  if (!j || typeof j.answer !== 'string' || !j.answer.trim()) throw new ExpertAiError('empty');
  return j.answer.trim();
}
