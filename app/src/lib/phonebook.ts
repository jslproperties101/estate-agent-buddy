// The phone's own address book.
//  - Android app: Android's contact picker (plugin @capacitor-community/contacts). Contacts permission is asked for
//    only when the person taps the phonebook button.
//  - Chrome on Android (web): the Contact Picker API — the person picks contacts and only those are shared.
//  - Elsewhere: not available (returns null); the screens keep typing available.
// The picked name and number are copied into the app's own contact record, so later changes in the phone book do
// not change the app.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { plugin } from '../native/native';

export interface PickedContact { name: string; tel?: string; email?: string }
export class PhonebookDenied extends Error { constructor() { super('contacts-permission-denied'); } }

const native = (): any => plugin('Contacts');
const webPicker = () => typeof navigator !== 'undefined' && 'contacts' in navigator && typeof window !== 'undefined' && 'ContactsManager' in window;
export const phonebookSupported = () => !!native() || webPicker();

/** Lets the person pick contacts. null = not available here; [] = cancelled; throws PhonebookDenied when refused. */
export async function pickPhoneContacts(multiple: boolean): Promise<PickedContact[] | null> {
  const n = native();
  if (n) {
    let perm = await n.checkPermissions().catch(() => null);
    if (perm?.contacts !== 'granted') perm = await n.requestPermissions().catch(() => null);
    if (perm?.contacts !== 'granted') throw new PhonebookDenied();
    try {
      const r = await n.pickContact({ projection: { name: true, phones: true, emails: true } });
      const c = r?.contact;
      if (!c) return [];
      const name = (c.name?.display ?? [c.name?.given, c.name?.family].filter(Boolean).join(' ') ?? '').trim();
      const one = { name, tel: c.phones?.[0]?.number, email: c.emails?.[0]?.address };
      return one.name || one.tel ? [one] : [];
    } catch { return []; }
  }
  if (!webPicker()) return null;
  try {
    const res: any[] = await (navigator as any).contacts.select(['name', 'tel', 'email'], { multiple });
    return res.map(r => ({ name: (r.name?.[0] ?? '').trim(), tel: r.tel?.[0], email: r.email?.[0] })).filter(r => r.name || r.tel);
  } catch {
    return [];
  }
}
