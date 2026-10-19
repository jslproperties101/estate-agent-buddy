// JoyChange003 Changes 58, 61, 63, 64: what one sentence on the AI Assisted Command screen asks for, as a list of steps.
// The screen shows each step as a card to check (Change 60); nothing here saves anything. Shared with the tests, so every
// example on the "How to use" screen is checked to be a command the app really understands.
import type { Contact, Inquiry, Appointment } from '../data/types';
import { BUYER_ROLES, VENDOR_ROLES } from '../data/types';
import type { Listing } from '../listing/model';
import { parseCommand, currentValue, type Change, type Command } from '../listing/commands';
import { parseTargetedUpdate, type Targeted } from '../listing/targeted';
import { parseAgenda, type AgendaCommand } from './agenda';
import { parseBuyerQuery, findBuyers, type BuyerMatch, type BuyerQuery } from './buyerSearch';
import { rankContacts, rankProperties, preselect, SURE, type Ranked } from './match';
import { splitCommands, resolvePronouns, mixToEnglish, hasMalay, parseOpenList, parseContactAction, refersBack, type ListKind, type WaCommand } from './assistant';

/** The record a follow-up is about (Change 61 / 64): the one chosen from a list or found / changed last. */
export interface Ctx { propertyId?: string; contactId?: string }

export type Step =
  | { kind: 'openList'; list: ListKind; text: string }
  | { kind: 'contactAction'; action: WaCommand; contactId?: string; propertyId?: string; text: string }
  | { kind: 'buyers'; query: BuyerQuery; matches: BuyerMatch[]; text: string }
  | { kind: 'buyersAll'; text: string }
  | { kind: 'target'; result: Targeted; changes: Change[]; ranked: Ranked<Listing>[]; first?: string; text: string }
  | { kind: 'show'; cmd: Extract<AgendaCommand, { kind: 'show' }>; text: string }
  | { kind: 'task'; cmd: Extract<AgendaCommand, { kind: 'task' }>; contactId?: string; text: string }
  | { kind: 'appointment'; cmd: Extract<AgendaCommand, { kind: 'appointment' }>; propertyId?: string; contactId?: string; text: string }
  | { kind: 'contact'; cmd: Extract<AgendaCommand, { kind: 'contact' }>; existing?: string; text: string }
  | { kind: 'create'; cmd: Extract<Command, { kind: 'create' }>; props: Ranked<Listing>[]; contacts: Ranked<Contact>[] | null; text: string }
  | { kind: 'find'; cmd: Extract<Command, { kind: 'find' }>; text: string }
  | { kind: 'unknown'; text: string };

export interface Data {
  properties: Listing[]; contacts: Contact[]; inquiries: Inquiry[]; appointments: Appointment[];
  /** Properties the agent may change (Change 010 access). */
  editable: Listing[];
  /** The agent's saved places and the places of saved properties (Change 58 cross-referencing). */
  places: string[];
}

const people = (d: Data) => d.contacts.filter(c => c.roles.some(r => VENDOR_ROLES.includes(r) || BUYER_ROLES.includes(r)));

/** One command (one part of a sentence). */
export function interpret(text: string, ctx: Ctx, d: Data, retried = false): Step {
  const raw = text.trim();
  if (!raw) return { kind: 'unknown', text };

  const list = parseOpenList(raw);
  if (list) return { kind: 'openList', list, text: raw };

  const act = parseContactAction(raw);
  if (act) {
    let contactId: string | undefined;
    if (act.who) contactId = preselect(rankContacts(act.who, people(d)))?.id ?? rankContacts(act.who, people(d))[0]?.item.id;
    else if (ctx.contactId) contactId = ctx.contactId;
    else if (ctx.propertyId) contactId = d.properties.find(p => p.id === ctx.propertyId)?.vendorId;
    return { kind: 'contactAction', action: act, contactId, propertyId: ctx.propertyId, text: raw };
  }

  const bq = parseBuyerQuery(raw, d.places);
  if (bq) return bq.any ? { kind: 'buyers', query: bq.query, matches: findBuyers(bq.query, d.contacts, d.inquiries, d.appointments, d.properties), text: raw } : { kind: 'buyersAll', text: raw };

  let tu = parseTargetedUpdate(raw, d.editable, d.places);
  // Change 61 / 64: "now set the price of this to 1.2 million" → the record chosen or changed last.
  const ctxProp = ctx.propertyId ? d.editable.find(p => p.id === ctx.propertyId) : undefined;
  // Only when the sentence points back ("this", "it", "now", "ini"…): a plain "set the price to …" still asks which property.
  if (tu?.kind === 'none' && tu.reason === 'noTarget' && ctxProp && refersBack(raw)) {
    const real = tu.changes.filter(c => currentValue(ctxProp, c.key) !== c.value);
    tu = real.length ? { kind: 'update', property: ctxProp, changes: real } : { kind: 'same', property: ctxProp, changes: tu.changes };
  }
  if (tu) {
    const hints = tu.kind === 'update' || tu.kind === 'same' ? [tu.property.id] : tu.kind === 'choose' ? tu.options.map(o => o.id) : [];
    const ranked = rankProperties(raw, d.editable, d.contacts, { inquiries: d.inquiries, appointments: d.appointments }, hints);
    const changes = tu.kind === 'same' ? tu.changes ?? [] : tu.changes;
    const first = tu.kind === 'update' || tu.kind === 'same' ? tu.property.id : tu.kind === 'choose' ? ranked.find(r => hints.includes(r.item.id))?.item.id : preselect(ranked)?.id;
    return { kind: 'target', result: tu, changes, ranked, first, text: raw };
  }

  const a = parseAgenda(raw);
  if (a?.kind === 'show') return { kind: 'show', cmd: a, text: raw };
  if (a?.kind === 'task') {
    const who = rankContacts(a.title, people(d)).find(r => r.score >= SURE)?.item.id ?? (refersBack(raw) ? ctx.contactId : undefined);
    return { kind: 'task', cmd: a, contactId: who, text: raw };
  }
  if (a?.kind === 'appointment') {
    const prop = a.ref ? d.properties.find(p => (p.ref ?? '').toUpperCase() === a.ref) : ctx.propertyId && refersBack(raw) ? d.properties.find(p => p.id === ctx.propertyId) : undefined;
    const w = a.who?.replace(/^the\s+/i, '').toLowerCase();
    const contact = w ? d.contacts.find(c => c.name.toLowerCase().includes(w) || w.includes(c.name.toLowerCase().replace(/\s*\(sample\)/, ''))) : undefined;
    return { kind: 'appointment', cmd: a, propertyId: prop?.id, contactId: contact?.id ?? (refersBack(raw) ? ctx.contactId : undefined), text: raw };
  }
  if (a?.kind === 'contact') {
    // Change 58: the same name or phone number already saved is shown, so a second copy is not made by mistake.
    const existing = a.name || a.phone ? preselect(rankContacts(`${a.name ?? ''} ${a.phone ?? ''}`, people(d)))?.id : undefined;
    return { kind: 'contact', cmd: a, existing, text: raw };
  }

  const c = parseCommand(raw, undefined, d.places);
  if (c.kind === 'find') return { kind: 'find', cmd: c, text: raw };
  if (c.kind === 'create' && c.changes.length) {
    const props = rankProperties(raw, d.editable, d.contacts, { inquiries: d.inquiries, appointments: d.appointments });
    const named = c.changes.some(x => x.key === 'ownerName' || x.key === 'ownerPhone');
    const cs = rankContacts(raw, people(d));
    return { kind: 'create', cmd: c, props, contacts: named || cs.length ? cs : null, text: raw };
  }
  if (c.kind === 'create') return { kind: 'create', cmd: c, props: [], contacts: null, text: raw };

  // Change 63: mixed English and Malay: read again with the Malay words in English.
  if (!retried && hasMalay(raw)) {
    const again = interpret(mixToEnglish(raw), ctx, d, true);
    if (again.kind !== 'unknown') return { ...again, text: raw };
  }
  return { kind: 'unknown', text: raw };
}

/** The record a step is about, for the follow-ups after it. */
export function ctxAfter(step: Step, ctx: Ctx): Ctx {
  switch (step.kind) {
    case 'target': return step.first ? { ...ctx, propertyId: step.first } : ctx;
    case 'contactAction': return { ...ctx, contactId: step.contactId ?? ctx.contactId };
    case 'appointment': return { propertyId: step.propertyId ?? ctx.propertyId, contactId: step.contactId ?? ctx.contactId };
    case 'contact': return step.existing ? { ...ctx, contactId: step.existing } : ctx;
    default: return ctx;
  }
}

/** A whole sentence: its commands (Change 61), each read with the record the earlier ones were about. */
export function interpretAll(text: string, ctx: Ctx, d: Data): { steps: Step[]; ctx: Ctx } {
  const parts = resolvePronouns(splitCommands(text));
  let cur = ctx;
  const steps: Step[] = [];
  for (const p of parts.length ? parts : [text]) {
    const s = interpret(p, cur, d);
    steps.push(s);
    cur = ctxAfter(s, cur);
  }
  return { steps, ctx: cur };
}

/** Steps that only open another screen; when a sentence has just one of them, the screen opens straight away. */
export const NAVIGATES = new Set<Step['kind']>(['show', 'find', 'buyersAll']);
