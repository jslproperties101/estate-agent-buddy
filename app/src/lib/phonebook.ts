// The phone's own address book.
//  - Android app: Android's contact picker (plugin @capacitor-community/contacts). Contacts permission is asked for
//    only when the person taps the phonebook button.
//  - Chrome on Android (web): the Contact Picker API — the person picks contacts and only those are shared.
//  - Elsewhere: not available (returns null); the screens keep typing available.
// The picked name and number are copied into the app's own contact record, so later changes in the phone book do
// not change the app.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { plugin, pluginMissing } from '../native/native';

export interface PickedContact { name: string; tel?: string; email?: string }
export class PhonebookDenied extends Error { constructor() { super('contacts-permission-denied'); } }
/** Why the phone book could not be used (shown to the person instead of the button seeming to do nothing). */
export type PhonebookProblem = 'denied' | 'plugin-missing' | 'unsupported' | 'failed';
export class PhonebookError extends Error {
  constructor(public problem: PhonebookProblem, detail = '') { super(detail || problem); }
}

const native = (): any => plugin('Contacts');
const webPicker = () => typeof navigator !== 'undefined' && 'contacts' in navigator && typeof window !== 'undefined' && 'ContactsManager' in window;
export const phonebookSupported = () => (!!native() && !pluginMissing('Contacts')) || webPicker();

/** The plugin rejects with a message like this when the person closes the picker without choosing anyone. */
const CANCELLED = /cancel|no contact|not picked|user denied|dismiss/i;

/** First name + phone number of a contact returned by the Android plugin (field names differ between versions). */
export function fromNative(c: any): PickedContact | null {
  if (!c) return null;
  const n = c.name ?? {};
  const name = String(n.display ?? n.displayName ?? [n.given, n.middle, n.family].filter(Boolean).join(' ') ?? '').trim();
  const phones: any[] = c.phones ?? c.phoneNumbers ?? [];
  const tel = phones.map(p => p?.number ?? p?.value).find(Boolean);
  const emails: any[] = c.emails ?? [];
  const email = emails.map(e => e?.address ?? e?.value).find(Boolean);
  return name || tel ? { name, tel: tel ? String(tel) : undefined, email: email ? String(email) : undefined } : null;
}

/** Lets the person pick contacts. null = not available here (browser without the Contact Picker); [] = cancelled.
 *  Throws PhonebookError (and PhonebookDenied for a refused permission) so the screen can say exactly what happened. */
export async function pickPhoneContacts(multiple: boolean): Promise<PickedContact[] | null> {
  if (pluginMissing('Contacts')) throw new PhonebookError('plugin-missing');
  const n = native();
  if (n) {
    let perm = await n.checkPermissions().catch(() => null);
    if (perm?.contacts !== 'granted') perm = await n.requestPermissions({ permissions: ['contacts'] }).catch(() => null);
    if (perm?.contacts !== 'granted') throw new PhonebookDenied();
    let r: any;
    try { r = await n.pickContact({ projection: { name: true, phones: true, emails: true } }); }
    catch (e) {
      const msg = String((e as Error)?.message ?? e);
      if (CANCELLED.test(msg)) return [];
      if (/not implemented|unimplemented/i.test(msg)) throw new PhonebookError('plugin-missing', msg);
      throw new PhonebookError('failed', msg);
    }
    const one = fromNative(r?.contact);
    return one ? [one] : [];
  }
  if (!webPicker()) return null;
  try {
    const res: any[] = await (navigator as any).contacts.select(['name', 'tel', 'email'], { multiple });
    return res.map(r => ({ name: (r.name?.[0] ?? '').trim(), tel: r.tel?.[0], email: r.email?.[0] })).filter(r => r.name || r.tel);
  } catch (e) {
    if ((e as Error)?.name === 'InvalidStateError') throw new PhonebookError('failed', 'The phone book is already open.');
    return [];
  }
}

/** One message for every way choosing from the phone book can fail. */
export function phonebookProblem(e: unknown): PhonebookProblem {
  if (e instanceof PhonebookDenied) return 'denied';
  if (e instanceof PhonebookError) return e.problem;
  return 'failed';
}
