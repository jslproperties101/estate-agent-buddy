// ClaudeChanges001 change 9: a person typed or picked on the property form or a deal page (tenant, co-broke agent, buyer,
// lawyer) is kept as a contact for next time, once per person: an existing contact with the same phone number (or, without
// a number, the same name) is reused and given the role if it lacks it. Sample contacts are never touched.
import type { Store } from '../data/store';
import { newId } from '../data/store';
import type { Contact, ContactRole } from '../data/types';
import { normalisePhone } from '../listing/model';

const digits = (x?: string) => (x ?? '').replace(/\D/g, '');

export function findSaved(list: Contact[], p: { name?: string; phone?: string }): Contact | undefined {
  const d = digits(p.phone);
  const real = list.filter(c => !c.sample);
  if (d.length >= 7) return real.find(c => digits(c.phone) === d);
  const n = (p.name ?? '').trim().toLowerCase();
  return n ? real.find(c => (c.name ?? '').trim().toLowerCase() === n && !c.phone) : undefined;
}

/** Saves the person as a contact (or updates the matching one) and returns its id; undefined when there is no name. */
export function saveTypedContact(store: Store, p: { name?: string; phone?: string; whatsapp?: string }, role: ContactRole, company?: string): string | undefined {
  const name = p.name?.trim();
  if (!name) return undefined;
  const st = store.getState();
  const found = findSaved(st.contacts, p);
  const now = Date.now();
  if (found) {
    const roles = found.roles.includes(role) ? found.roles : [...found.roles, role];
    const patch: Partial<Contact> = {};
    if (roles !== found.roles) patch.roles = roles;
    if (!found.whatsapp && p.whatsapp) patch.whatsapp = p.whatsapp;
    if (!found.company && company) patch.company = company;
    if (Object.keys(patch).length) store.upsert('contacts', { ...found, ...patch, updated: now });
    return found.id;
  }
  const c = store.upsert('contacts', { id: newId(), created: now, updated: now, name, phone: normalisePhone(p.phone), whatsapp: p.whatsapp, company, roles: [role] });
  return c.id;
}
