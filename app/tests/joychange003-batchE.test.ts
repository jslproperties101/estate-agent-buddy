// JoyChange003 Batch E (Changes 55-64) rules that need no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { c056Strings } from '../src/voice/c056Strings';
import { interpret, interpretAll, type Data, type Step } from '../src/voice/dispatch';
import type { Listing } from '../src/listing/model';
import type { Contact } from '../src/data/types';

const L = (o: Partial<Listing>): Listing => ({ photos: [], created: 1, updated: 1, ...o } as unknown as Listing);
const C = (o: Partial<Contact>): Contact => ({ created: 1, updated: 1, roles: ['buyer'], ...o } as unknown as Contact);
export const props = [
  L({ id: 'p1', ref: 'P1001', type: 'Terrace house', township: 'Putra Nilai', city: 'Nilai', askingPrice: 500000, status: 'available', vendorId: 'v1' }),
  L({ id: 'p2', ref: 'P1002', type: 'Condo / apartment', city: 'Cyberjaya', askingPrice: 900000, status: 'available' }),
  L({ id: 'p3', ref: 'P1003', type: 'Semi-D factory', city: 'Salak Tinggi', monthlyRent: 1800, purpose: 'rent', status: 'available' }),
  L({ id: 'p4', ref: 'P1004', type: 'Semi-D house', street: 'Jalan Seriemas 1', township: 'Kota Seriemas', city: 'Nilai', status: 'available' }),
];
export const contacts = [
  C({ id: 'b1', name: 'Buyer K', phone: '012-111 2222' }), C({ id: 'b2', name: 'Lim', phone: '012-888 7777' }),
  C({ id: 'v1', name: 'Encik Ahmad', phone: '012-345 6789', roles: ['vendor'] }),
];
export const data: Data = { properties: props, contacts, inquiries: [], appointments: [], editable: props, places: [] };

test('E57-1 every "How to use" example, in English and Bahasa Malaysia, is a command the app understands (8 or more per section)', () => {
  const bad: string[] = [];
  for (const lang of ['en', 'bm'] as const) {
    for (const g of c056Strings[lang].groups) {
      assert.ok(g.examples.length >= 8, `${lang} "${g.title}" has ${g.examples.length}`);
      for (const ex of g.examples) {
        const { steps } = interpretAll(ex, { propertyId: 'p1', contactId: 'b2' }, data);
        const u = steps.filter((s: Step) => s.kind === 'unknown' || (s.kind === 'create' && !s.cmd.changes.length && !/listing|senarai/i.test(ex)));
        if (u.length) bad.push(`${lang}: ${ex} → ${steps.map(s => s.kind).join(', ')}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

// ---------- Change 61: several commands, "him", follow-ups ----------
import { splitCommands, resolvePronouns, parseOpenList, parseContactAction, waDataFor, WA_TEMPLATES, fillCustom, orderTemplates, pushRecent, RECENT_MAX, smartChips, mixToEnglish, waDigits, waLink } from '../src/voice/assistant';
import { parseCommand } from '../src/listing/commands';
import { androidErrorCode, listenEab, resetEabForTests, type EabSpeech, type EabSpeechEvent } from '../src/voice/recognizer';

test('E61-1 one sentence becomes its commands; "and" inside a command does not split it', () => {
  assert.deepEqual(splitCommands('Add a new buyer Lim 012 888 7777 and remind me to call him tomorrow at 3pm'), ['Add a new buyer Lim 012 888 7777', 'remind me to call him tomorrow at 3pm']);
  assert.deepEqual(splitCommands('Find properties between RM400k and RM800k'), ['Find properties between RM400k and RM800k']);
  assert.deepEqual(splitCommands('Show my appointments tomorrow and show my tasks today'), ['Show my appointments tomorrow', 'show my tasks today']);
  // "WhatsApp … and remind our appointment" is one message, not a to-do.
  assert.deepEqual(splitCommands('WhatsApp this buyer and remind our appointment'), ['WhatsApp this buyer and remind our appointment']);
  assert.equal(splitCommands('Tambah pembeli baharu Lim 012 888 7777 dan ingatkan saya telefon dia esok').length, 2);
});

test('E61-2 "him" / "dia" in a later command becomes the name said earlier', () => {
  const parts = resolvePronouns(splitCommands('Add a new buyer Lim 012 888 7777 and remind me to call him tomorrow at 3pm'));
  assert.match(parts[1], /call Lim tomorrow/);
});

test('E61-3 a follow-up uses the record chosen last only when the sentence points back to it', () => {
  const follow = interpret('Now change the price of this to RM1.2 million', { propertyId: 'p2' }, data);
  assert.equal(follow.kind, 'target');
  if (follow.kind === 'target') { assert.equal(follow.first, 'p2'); assert.equal(follow.changes[0].value, 1200000); }
  const plain = interpret('Set the price to RM3 million', { propertyId: 'p2' }, data);
  assert.ok(plain.kind === 'target' && plain.result.kind === 'none', 'a plain command still asks which property');
  // several commands: the second is about the property the first changed
  const all = interpretAll('Set the asking price of P1001 to RM3 million and remind me to update the advert tomorrow', {}, data);
  assert.deepEqual(all.steps.map(s => s.kind), ['target', 'task']);
  assert.equal(all.ctx.propertyId, 'p1');
});

// ---------- Change 64: open a list, WhatsApp this buyer ----------
test('E64-1 "open property / vendor / owner / buyer list" in English and Malay', () => {
  assert.equal(parseOpenList('Open property list'), 'property');
  assert.equal(parseOpenList('open owner list'), 'vendor');
  assert.equal(parseOpenList('Open vendor list.'), 'vendor');
  assert.equal(parseOpenList('show my buyer list'), 'buyer');
  assert.equal(parseOpenList('Buka senarai pembeli'), 'buyer');
  assert.equal(parseOpenList('Buka senarai hartanah'), 'property');
  assert.equal(parseOpenList('Open the property P1001'), null);
});

test('E64-2 "WhatsApp this buyer and remind our appointment" is about the selected person; "call him tomorrow" stays a to-do', () => {
  const a = parseContactAction('WhatsApp this buyer and remind our appointment');
  assert.deepEqual(a, { kind: 'whatsapp', who: undefined, topic: 'appointment', thisOne: true });
  assert.deepEqual(parseContactAction('WhatsApp Lim about the price'), { kind: 'whatsapp', who: 'Lim', topic: 'price', thisOne: false });
  assert.equal(parseContactAction('Call this buyer')?.kind, 'call');
  assert.equal(parseContactAction('call him tomorrow at 3pm'), null);
  const st = interpret('WhatsApp this owner about the price', { propertyId: 'p1' }, data);
  assert.ok(st.kind === 'contactAction' && st.contactId === 'v1', 'the owner of the selected property');
});

test('E64-3 suggested WhatsApp texts use only saved details (nothing made up) and the agent\'s own texts fill {name} etc.', () => {
  const buyer = contacts[0];
  const appts = [{ id: 'a1', created: 1, updated: 1, kind: 'viewing', status: 'scheduled', start: '2099-01-02T15:30', contactId: 'b1', propertyId: 'p1', reminders: [] }] as never[];
  const d = waDataFor(buyer, undefined, { properties: props, appointments: appts, inquiries: [] }, new Date(2026, 9, 19));
  assert.equal(d.name, 'Buyer K'); assert.match(d.property ?? '', /^P1001/); assert.equal(d.date, '2099-01-02'); assert.equal(d.time, '15:30');
  const appt = WA_TEMPLATES.find(x => x.id === 'appt')!;
  assert.match(appt.text(d, 'en'), /^Hi Buyer K, just a reminder of our appointment for P1001.* on .*3:30pm/);
  const bare = appt.text({}, 'en');
  assert.equal(bare, 'Hi, just a reminder of our appointment. See you then!', 'no name, place or time invented');
  assert.match(appt.text(d, 'bm'), /^Hai Buyer K, sekadar peringatan/);
  assert.equal(fillCustom('Hello {name}, about {property} on {date}.', { name: 'Lim' }, 'en'), 'Hello Lim, about on.');
  assert.equal(orderTemplates('price', false)[0].topic, 'price');
  assert.equal(orderTemplates(undefined, true)[0].topic, 'update', 'vendors get the property update first');
  assert.equal(waDigits('012-888 7777'), '60128887777');
  assert.match(waLink('012-888 7777', 'Hi Lim'), /^https:\/\/wa\.me\/60128887777\?text=Hi%20Lim$/);
});

// ---------- Change 62: recent commands and suggestions ----------
test('E62-1 the last 10 commands, newest first, without repeats', () => {
  let r: string[] = [];
  for (let i = 0; i < 12; i++) r = pushRecent(r, `command ${i}`);
  assert.equal(r.length, RECENT_MAX); assert.equal(r[0], 'command 11');
  r = pushRecent(r, '  COMMAND 5 ');
  assert.equal(r[0], 'COMMAND 5'); assert.equal(r.filter(x => /command 5/i.test(x)).length, 1);
});

test('E62-2 suggestions from the saved data: viewings tomorrow, quiet buyers, to-dos due', () => {
  const now = new Date(2026, 9, 19, 10, 0);
  const s = {
    contacts: [C({ id: 'q1', name: 'Quiet Q', lastInteraction: now.getTime() - 9 * 86_400_000 })],
    appointments: [{ id: 'a1', created: 1, updated: 1, kind: 'viewing', status: 'scheduled', start: '2026-10-20T11:00', contactId: 'b1', propertyId: 'p1', reminders: [] }] as never[],
    tasks: [{ id: 't1', created: 1, updated: 1, title: 'x', priority: 'medium', done: false, kind: 'task', reminders: [], due: '2026-10-19' }] as never[],
    properties: props,
  };
  const chips = smartChips(s, now, 7);
  assert.deepEqual(chips.map(c => c.kind), ['viewing', 'follow', 'tasks']);
  assert.ok(chips.some(c => c.kind === 'follow' && c.name === 'Quiet Q' && c.days >= 7));
  assert.ok(smartChips({ ...s, contacts: [...s.contacts, ...contacts] }, now, 7).length <= 4, 'never more than four');
});

// ---------- Change 63 / 58: mixed language, places ----------
test('E63-1 mixed English and Malay is understood', () => {
  assert.equal(mixToEnglish('Tukar price P1001 to RM3 juta'), 'change price P1001 to RM3 million');
  const st = interpret('Tukar price P1001 to RM3 juta', {}, data);
  assert.equal(st.kind, 'target');
  assert.equal(interpret('Buka buyer list', {}, data).kind, 'openList');
});

test('E58-1 "add new listing in sungai besi" (as speech gives it, in lower case) fills the place and its address chain', () => {
  const c = parseCommand('add new listing in sungai besi for sale asking price 500k', undefined, []);
  assert.equal(c.kind, 'create');
  if (c.kind !== 'create') return;
  const v = Object.fromEntries(c.changes.map(x => [x.key, x.value]));
  assert.equal(v.township, 'Sungai Besi'); assert.equal(v.city, 'Kuala Lumpur'); assert.equal(v.askingPrice, 500000, 'a price said without "RM"');
  const r = parseCommand('new condo for rent in cyberjaya rental 1800 per month three bedrooms', undefined, []);
  assert.ok(r.kind === 'create' && r.changes.some(x => x.key === 'monthlyRent' && x.value === 1800) && r.changes.some(x => x.key === 'bedrooms' && x.value === 3));
  const beds = parseCommand('new house in nilai price 3 bedrooms', undefined, []);
  assert.ok(beds.kind === 'create' && !beds.changes.some(x => x.key === 'askingPrice'), 'a small number is never a price');
  const o = parseCommand('create a new terrace house in nilai owner ahmad bin ali 012 345 6789', undefined, []);
  assert.ok(o.kind === 'create' && o.changes.some(x => x.key === 'ownerName' && x.value === 'Ahmad bin Ali'), 'a lower-case owner name is written properly');
});

// ---------- Change 55: the app's own speech plugin ----------
function fakeSpeech() {
  let fn: ((e: EabSpeechEvent) => void) | undefined;
  const calls: string[] = [];
  let lastSession = 0;
  const n: EabSpeech = {
    prepare: async () => { calls.push('prepare'); },
    start: async o => { calls.push(`start:${o.language}`); lastSession = o.session; },
    stop: async () => { calls.push('stop'); },
    cancel: async () => { calls.push('cancel'); },
    reset: async () => { calls.push('reset'); },
    addListener: async (_e, f) => { calls.push('listen'); fn = f; return { remove: async () => {} }; },
  };
  return { n, calls, emit: (e: Omit<EabSpeechEvent, 'session'>) => fn?.({ ...e, session: lastSession }), session: () => lastSession };
}
const tick = () => new Promise(r => setTimeout(r, 0));

test('E55-1 "Listening" only once the phone is ready; live words, then the final words; one listener for all sessions', async () => {
  resetEabForTests();
  const f = fakeSpeech();
  const got: string[] = [];
  listenEab(f.n, undefined, 'en-MY', { ready: () => got.push('ready'), interim: x => got.push(`~${x}`), final: x => got.push(`=${x}`), error: c => got.push(`!${c}`), end: () => got.push('end') }, 60000, 500, 5000);
  await tick(); await tick();
  assert.deepEqual(f.calls, ['listen', 'start:en-MY']);
  assert.ok(!got.includes('ready'), 'not ready before the phone says so');
  f.emit({ type: 'ready' }); f.emit({ type: 'partial', text: 'call buyer' }); f.emit({ type: 'final', text: 'call buyer k' });
  assert.deepEqual(got.filter(x => x !== '~'), ['ready', '~call buyer', '=call buyer k', 'end']);
  // a second session does not add a second listener
  listenEab(f.n, undefined, 'en-MY', { interim: () => {}, final: () => {}, error: () => {}, end: () => {} }, 60000, 500, 5000);
  await tick(); await tick();
  assert.equal(f.calls.filter(x => x === 'listen').length, 1);
});

test('E55-2 Android says "busy" before listening began: one clean retry, then listening works', async () => {
  resetEabForTests();
  const f = fakeSpeech();
  const got: string[] = [];
  listenEab(f.n, undefined, 'ms-MY', { ready: () => got.push('ready'), interim: () => {}, final: x => got.push(`=${x}`), error: c => got.push(`!${c}`), end: () => got.push('end') }, 60000, 500, 5000);
  await tick(); await tick();
  f.emit({ type: 'error', code: 8 });
  await tick(); await new Promise(r => setTimeout(r, 300));
  assert.deepEqual(f.calls, ['listen', 'start:ms-MY', 'reset', 'start:ms-MY'], 'reset, then started again');
  assert.ok(!got.some(x => x.startsWith('!')), 'no error shown for the first busy');
  f.emit({ type: 'ready' }); f.emit({ type: 'final', text: 'tukar harga' });
  assert.deepEqual(got, ['ready', '=tukar harga', 'end']);
});

test('E55-3 stopping before the microphone opened closes quietly; "no speech" after listening says so', async () => {
  resetEabForTests();
  const f = fakeSpeech();
  const got: string[] = [];
  const h = { interim: () => {}, final: (x: string) => got.push(`=${x}`), error: (c: string) => got.push(`!${c}`), end: () => got.push('end') };
  const l = listenEab(f.n, undefined, 'en-MY', h, 60000, 500, 5000);
  await tick(); await tick();
  l.stop();
  assert.deepEqual(got, ['end']); assert.ok(f.calls.includes('cancel'));
  got.length = 0;
  listenEab(f.n, undefined, 'en-MY', h, 60000, 500, 5000);
  await tick(); await tick();
  f.emit({ type: 'ready' }); f.emit({ type: 'error', code: 7 });
  assert.deepEqual(got, ['!no-speech', 'end']);
  assert.equal(androidErrorCode(9), 'not-allowed'); assert.equal(androidErrorCode(2), 'network'); assert.equal(androidErrorCode(5), 'busy');
});
