// The phone's own address book. Chrome on Android offers the Contact Picker: the person picks contacts and only
// those are shared with the app (no blanket permission). In the Android app the same call is available through
// the WebView; elsewhere it returns null and the screens offer typing instead.
/* eslint-disable @typescript-eslint/no-explicit-any */

export interface PickedContact { name: string; tel?: string; email?: string }

export const phonebookSupported = () => typeof navigator !== 'undefined' && 'contacts' in navigator && 'ContactsManager' in window;

export async function pickPhoneContacts(multiple: boolean): Promise<PickedContact[] | null> {
  if (!phonebookSupported()) return null;
  try {
    const res: any[] = await (navigator as any).contacts.select(['name', 'tel', 'email'], { multiple });
    return res.map(r => ({ name: (r.name?.[0] ?? '').trim(), tel: r.tel?.[0], email: r.email?.[0] })).filter(r => r.name || r.tel);
  } catch {
    return [];
  }
}
