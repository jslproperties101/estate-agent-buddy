// Digital name card: what goes into the message, chosen with check boxes. The app prepares the message and opens
// WhatsApp (or the phone's share sheet); the agent reviews it there and presses Send. Nothing is sent automatically.
import type { Profile, ShareChoice } from '../data/types';
import { phoneDigits } from '../listing/model';

export const DEFAULT_SHARE: ShareChoice = { regNo: true, front: true, back: false, agency: true, phone: true, email: true };

export interface CardLabels { greeting: string; regLabel: (type: string) => string; agency: string; phone: string; email: string; closing: string }

export function shareText(p: Profile, c: ShareChoice, L: CardLabels): string {
  const lines = [L.greeting];
  if (p.fullName) lines.push(`*${p.fullName}*`);
  if (c.regNo && p.regNo) lines.push(`${L.regLabel(p.regType || 'REN')}: ${p.regNo}`);
  if (c.agency && p.agency) lines.push(`${L.agency}: ${p.agency}`);
  if (c.phone && p.phone) lines.push(`${L.phone}: ${p.phone}`);
  if (c.email && p.email) lines.push(`${L.email}: ${p.email}`);
  lines.push(L.closing);
  return lines.join('\n');
}

/** Which image files go with the message, in order. */
export function shareFiles(p: Profile, c: ShareChoice): string[] {
  return [c.front && p.cardFrontFileId, c.back && p.cardBackFileId].filter(Boolean) as string[];
}

/** WhatsApp click-to-chat link: opens the chat with the message typed in, for the agent to send. */
export function whatsappLink(phone: string | undefined, text: string): string {
  const d = phoneDigits(phone);
  return `https://wa.me/${d}?text=${encodeURIComponent(text)}`;
}

export const anyChosen = (c: ShareChoice) => Object.values(c).some(Boolean);
