// Shared contact records (Version 1L, first part). Properties link to vendors by id, so the coming Vendor List
// and Buyer List use the same records instead of copies. Identification and bank details are NOT stored here:
// they will live in a separate restricted store (Vendor List milestone) and are never copied into property records.

export type ContactMethod = 'call' | 'whatsapp' | 'sms' | 'email';

export interface Vendor {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  preferred?: ContactMethod;
  created: number;
  sample?: boolean;
}

const now = Date.now();
const v = (id: string, name: string, phone?: string, preferred: ContactMethod = 'whatsapp'): Vendor => ({ id, name, phone, preferred, created: now, sample: true });

export const SAMPLE_VENDORS: Vendor[] = [
  v('v1', 'Owner A (sample)', '+60 12-345 6789'),
  v('v2', 'Owner B (sample)', '+60 13-210 4455', 'call'),
  v('v3', 'Owner E (sample)', '+60 17-888 1200'),
  v('v4', 'Encik Ahmad (sample)', '+60 19-222 3344'),
  v('v5', 'Puan Siti (sample)', '+60 16-555 0101', 'call'),
  v('v6', 'Mr Lim (sample)', '+60 12-700 8811'),
  v('v7', 'Owner F (sample)', undefined, 'call'),
  v('v8', 'Ms Tan (sample)', '+60 11-2233 4455'),
  v('v9', 'Syarikat G Sdn Bhd (sample)', '+60 3-8888 1234', 'email'),
  v('v10', 'Owner H (sample)', '+60 14-909 3030'),
];

/** Name to show for a property's owner: the linked vendor, else the quick owner name typed on the property. */
export function ownerLabel(l: { vendorId?: string; ownerName?: string }, vendors: Vendor[]): string | undefined {
  return (l.vendorId && vendors.find(x => x.id === l.vendorId)?.name) || l.ownerName;
}
