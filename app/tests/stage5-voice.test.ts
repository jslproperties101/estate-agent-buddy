// Stage 5 C: Voice Command — the new commands (set price / rent, change status, find buyers by requirements), the
// diagnostics rules and their messages in three languages. These use typed text and stand-ins. They do NOT prove that the
// microphone or Android's speech service works on the Samsung S23 Ultra.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand, readSetMoney, readStatus, applyChanges } from '../src/listing/commands';
import { parseTargetedUpdate, findByRef } from '../src/listing/targeted';
import { parseBuyerQuery, findBuyers } from '../src/voice/buyerSearch';
import { browserOf, diagnose, reportText, VoiceProbe } from '../src/voice/diagnostics';
import { diagMessage, diagMessages, diagStrings } from '../src/voice/diagStrings';
import { lastVoice, listen, resetLastVoice, VoiceError } from '../src/voice/recognizer';
import { voiceCommandStrings } from '../src/voice/VoiceCommandUI';
import { c056Strings } from '../src/voice/c056Strings';
import { MemoryBackend } from '../src/data/backend';
import { Store } from '../src/data/store';
import type { Contact, Inquiry, Appointment } from '../src/data/types';
import type { Listing } from '../src/listing/model';

const L = (o: Partial<Listing>): Listing => ({ photos: [], documents: [], created: 1, updated: 1, ...o } as Listing);
const props = [
  L({ id: 'a', ref: 'P1001', type: 'Semi-D factory', township: 'Salak Tinggi', askingPrice: 3_200_000, purpose: 'sale' }),
  L({ id: 'b', ref: 'P1002', type: 'Terrace house', township: 'Putra Nilai', monthlyRent: 1800, purpose: 'rent', bedrooms: 3 }),
  L({ id: 'c', ref: 'P1003', type: 'Detached factory', township: 'Salak Tinggi', askingPrice: 5_000_000 }),
];

// ---------- C1 commands ----------
test('VC1 "set the asking price" works with or without RM, with spoken numbers, in English and Bahasa Malaysia', () => {
  const cur = props[0];
  const price = (t: string) => { const c = parseCommand(t, cur, []); return c.kind === 'update' ? c.changes.find(x => x.key === 'askingPrice')?.value : undefined; };
  assert.equal(price('Change the asking price to RM3 million'), 3_000_000);
  assert.equal(price('set asking price to 3.2 million'), 3_200_000);
  assert.equal(price('Set the asking price to 2,950,000'), 2_950_000);
  assert.equal(price('set the asking price to three million two hundred thousand'), 3_200_000);
  assert.equal(price('tukar harga kepada RM2 juta'), 2_000_000);
  assert.equal(price('tetapkan harga diminta kepada lima ratus lapan puluh ribu ringgit'), 580_000);
  assert.equal(price('Change the asking price to RM3 million and add three parking bays'), 3_000_000);
  const rent = parseCommand('change the rent to 1800', cur, []);
  assert.deepEqual(rent.kind === 'update' && rent.changes, [{ key: 'monthlyRent', value: 1800 }]);
});

test('VC2 "change the status to Sold" and the other statuses, in English and Bahasa Malaysia', () => {
  for (const [t, want] of [
    ['Change the status to Sold', 'sold'], ['mark it as sold', 'sold'], ['set status to rented', 'rented'], ['it has been rented', 'rented'], ['the property is now sold', 'sold'],
    ['status to off market', 'off_market'], ['mark as available', 'available'], ['tandakan sebagai terjual', 'sold'], ['tukar status kepada disewa', 'rented'], ['ubah status kepada tersedia', 'available'],
  ] as const) {
    assert.equal(readStatus(t), want, t);
    const c = parseCommand(t, props[0], []);
    assert.deepEqual(c.kind === 'update' && c.changes.find(x => x.key === 'status')?.value, want, `parseCommand ${t}`);
  }
  assert.equal(readStatus('Create a new factory in Salak Tinggi for sale'), undefined, '"for sale" is not a status change');
  assert.equal(readStatus('add a note about the sold unit next door'), undefined);
  assert.equal(readSetMoney('Create a new semi-detached factory, asking price RM3.2 million, land area is 20000 square feet'), undefined, 'a new-property sentence is not a price change');
});

test('VC3 a command only PROPOSES: parsing never changes the property, and applying needs the explicit step', () => {
  const cur = props[0];
  const before = JSON.stringify(cur);
  const c = parseCommand('Change the status to Sold and set the asking price to RM3 million', cur, []);
  assert.equal(c.kind, 'update');
  assert.equal(JSON.stringify(cur), before);
  const next = applyChanges(cur, c.kind === 'update' ? c.changes : []);
  assert.equal(next.status, 'sold'); assert.equal(next.askingPrice, 3_000_000); assert.equal(cur.status, undefined);
});

// ---------- C1b: named property from the central screen ----------
test('VT1 a price / rent / status change by name finds the property by reference or by type and place', () => {
  const t = (s: string) => parseTargetedUpdate(s, props, []);
  const a = t('Set the asking price of P1001 to RM3 million');
  assert.ok(a?.kind === 'update' && a.property.id === 'a' && a.changes[0].key === 'askingPrice' && a.changes[0].value === 3_000_000);
  const b = t('change the status of the terrace house in Putra Nilai to sold');
  assert.ok(b?.kind === 'update' && b.property.id === 'b' && b.changes[0].value === 'sold');
  const bm = t('tukar harga P1001 kepada RM2 juta');
  assert.ok(bm?.kind === 'update' && bm.property.id === 'a' && bm.changes[0].value === 2_000_000);
  assert.ok(t('Set the rent of P-1002 to RM2000')?.kind === 'update');
  assert.ok(t('P1003 is sold')?.kind === 'update');
  assert.equal(findByRef('see p 1001 please', props)?.id, 'a');
  assert.equal(findByRef('RM3000000', props), undefined, 'an amount is not a reference');
});

test('VT2 unclear or missing targets give a choice or a plain message, never a guess', () => {
  const two = parseTargetedUpdate('change the status of the factory in Salak Tinggi to sold', props, []);
  assert.ok(two?.kind === 'choose' && two.options.map(o => o.id).sort().join() === 'a,c');
  assert.deepEqual(parseTargetedUpdate('set the price to 3 million', props, []), { kind: 'none', reason: 'noTarget', changes: [{ key: 'askingPrice', value: 3_000_000 }] });
  const nf = parseTargetedUpdate('change the status of P9999 to sold', props, []);
  assert.ok(nf?.kind === 'none' && nf.reason === 'notFound');
  const nf2 = parseTargetedUpdate('change the status of the bungalow in Kajang to sold', props, []);
  assert.ok(nf2?.kind === 'none' && nf2.reason === 'notFound');
  const same = parseTargetedUpdate('Set the asking price of P1001 to RM3200000', props, []);
  assert.equal(same?.kind, 'same');
});

test('VT3 other sentences are not mistaken for a change: new-property, find, agenda and plain questions', () => {
  for (const t of [
    'Create a new semi-detached factory in Salak Tinggi, asking price RM3.2 million, land area is 20000 square feet',
    'Find the factory in Salak Tinggi', 'Remind me to call Buyer K tomorrow at 3pm', 'Show my appointments tomorrow', 'Add a new buyer Lim 012 888 7777', 'what is the price of P1001',
  ]) assert.equal(parseTargetedUpdate(t, props, []), null, t);
});

test('VT4 a change is only applied by saving the record: the store is untouched until then', async () => {
  const s = await Store.open(new MemoryBackend());
  s.upsert('properties', props[0]);
  const r = parseTargetedUpdate('mark P1001 as sold', s.getState().properties, []);
  assert.ok(r?.kind === 'update');
  assert.equal(s.getState().properties[0].status, undefined, 'parsing alone does not save');
  s.upsert('properties', applyChanges(r.property, r.changes));
  assert.equal(s.getState().properties[0].status, 'sold');
});

// ---------- C1c: find buyers by requirements ----------
const C = (o: Partial<Contact>): Contact => ({ created: 1, updated: 1, roles: ['buyer'], ...o } as Contact);
const contacts = [
  C({ id: 'k1', name: 'Lim', notes: 'Wants a factory in Salak Tinggi, budget 3m', leadStatus: 'hot' }),
  C({ id: 'k2', name: 'Tan', notes: 'Looking for 3 bedroom terrace house near Nilai', leadStatus: 'warm' }),
  C({ id: 'k3', name: 'Mei', notes: '', leadStatus: 'cold' }),
  C({ id: 'k4', name: 'Owner Ali', roles: ['vendor'], notes: 'factory Salak Tinggi' }),
  C({ id: 'k5', name: 'Dropped Dan', notes: 'factory', leadStatus: 'dropped' }),
  C({ id: 'k6', name: 'Rina', roles: ['tenant'], notes: 'wants to rent a 3 bedroom', leadStatus: 'warm' }),
];
const inquiries = [{ id: 'i1', created: 1, updated: 1, contactId: 'k3', propertyId: 'a', at: '2026-10-01T10:00', channel: 'call' }] as Inquiry[];
const appts = [{ id: 'ap1', created: 1, updated: 1, contactId: 'k2', propertyId: 'b', kind: 'viewing', status: 'completed', reminders: [] }] as Appointment[];

test('VB1 "find buyers looking for …" reads only what was said: type, place, budget, bedrooms, purpose', () => {
  const q = (s: string) => parseBuyerQuery(s, [])?.query;
  assert.deepEqual(q('Find buyers looking for a factory in Salak Tinggi'), { type: 'factory', area: 'Salak Tinggi' });
  assert.deepEqual(q('find buyers looking for a 3 bedroom terrace house under RM800,000'), { type: 'terrace', maxPrice: 800000, bedrooms: 3 });
  assert.equal(q('Show tenants looking for a condo to rent in Putra Nilai')?.purpose, 'rent');
  assert.equal(q('cari pembeli yang mencari kilang di Salak Tinggi')?.type, 'factory');
  assert.equal(parseBuyerQuery('show buyers', [])?.any, false, 'no requirement said');
  for (const t of ['Show my appointments tomorrow', 'Find the factory in Salak Tinggi', 'Add a new buyer Lim', 'Remind me to call the buyers']) assert.equal(parseBuyerQuery(t, []), null, t);
});

test('VB2 buyers are matched from their notes and from the properties they asked about or viewed; vendors are never listed', () => {
  const m = (s: string) => findBuyers(parseBuyerQuery(s, [])!.query, contacts, inquiries, appts, props);
  const f = m('Find buyers looking for a factory in Salak Tinggi');
  assert.deepEqual(f.map(x => x.contact.id), ['k1', 'k3', 'k5'], 'Lim by notes, Mei by her enquiry on P1001, Dan by notes; best match first, dropped last');
  assert.ok(f[0].reasons.some(r => r.includes('factory')) && f[0].reasons.some(r => r.includes('Salak Tinggi')));
  assert.ok(f[1].reasons[0].includes('P1001'));
  assert.ok(!f.some(x => x.contact.id === 'k4'), 'a vendor is not a buyer');
  const t = m('find buyers looking for a 3 bedroom terrace house');
  assert.equal(t[0].contact.id, 'k2');
  assert.ok(t[0].reasons.length >= 2, 'notes and the viewed property both count');
  const rent = m('show tenants looking for a 3 bedroom to rent');
  assert.ok(rent.some(x => x.contact.id === 'k6'));
  assert.deepEqual(m('find buyers looking for a bungalow in Kajang'), [], 'nothing matches → empty, never invented');
  const budget = findBuyers({ maxPrice: 3_300_000, area: 'Salak Tinggi' }, contacts, inquiries, appts, props);
  assert.ok(budget.find(x => x.contact.id === 'k3')!.reasons.some(r => r.includes('within budget')));
});

// ---------- C2 diagnostics ----------
const probe = (o: Partial<VoiceProbe> = {}): VoiceProbe => ({
  native: false, platform: 'web', pluginPresent: false, pluginMissing: false, webSpeech: true, secure: true, online: true, micPermission: 'granted', mediaDevices: true, browser: 'chrome', ...o,
});
const codes = (p: VoiceProbe) => diagnose(p).checks.map(c => c.code);

test('VD1 each cause gets its own finding: missing plugin, unsupported browser, insecure page, blocked microphone, no service, offline', () => {
  assert.ok(codes(probe({ native: true, platform: 'android', webSpeech: false, pluginMissing: true, micPermission: 'unknown' })).includes('pluginMissing'));
  assert.equal(diagnose(probe({ native: true, platform: 'android', webSpeech: false, pluginMissing: true })).verdict, 'blocked');
  assert.ok(codes(probe({ webSpeech: false, browser: 'firefox' })).includes('firefox'));
  assert.ok(codes(probe({ webSpeech: false, browser: 'webview' })).includes('webview'));
  assert.ok(codes(probe({ webSpeech: false, browser: 'safari' })).includes('unsupported'));
  assert.ok(codes(probe({ secure: false })).includes('insecure'));
  assert.ok(codes(probe({ micPermission: 'denied' })).includes('perm_denied_web'));
  assert.ok(codes(probe({ native: true, platform: 'android', pluginPresent: true, webSpeech: false, micPermission: 'denied' })).includes('perm_denied_app'));
  assert.ok(codes(probe({ native: true, platform: 'android', pluginPresent: true, webSpeech: false, nativeAvailable: false })).includes('serviceOff'));
  assert.ok(codes(probe({ online: false })).includes('offline'));
  assert.ok(codes(probe({ browser: 'samsung' })).includes('samsungBrowser'));
  assert.ok(codes(probe({ micPermission: 'prompt' })).includes('perm_prompt_web'));
});

test('VD2 the verdict never claims the microphone works: "ready" only means nothing was found wrong', () => {
  const ok = diagnose(probe({ native: true, platform: 'android', pluginPresent: true, webSpeech: false, nativeAvailable: true, lastOkAt: 5 }));
  assert.equal(ok.verdict, 'ready');
  assert.ok(diagStrings.en.verdictNote.ready.includes('not proof'));
  assert.ok(diagStrings.en.intro.includes('do not prove'));
  assert.equal(diagnose(probe({ lastError: { code: 'network', at: 1 } })).verdict, 'unsure');
  assert.equal(diagnose(probe({ micPermission: 'unknown' })).verdict, 'unsure');
  assert.equal(diagnose(probe({ micPermission: 'denied' })).verdict, 'blocked');
  assert.equal(diagnose(probe({ webSpeech: false })).verdict, 'blocked');
});

test('VD3 every recognition error has a clear message with something to do, in all three languages', () => {
  const errs: VoiceError[] = ['unsupported', 'not-allowed', 'service-not-allowed', 'network', 'no-speech', 'audio-capture', 'language-not-supported', 'aborted', 'busy', 'no-result', 'plugin-missing', 'other'];
  for (const lang of ['en', 'bm', 'zh'] as const) {
    for (const e of errs) {
      const m = diagMessage(lang, { id: 'last', status: 'bad', code: `err_${e}` });
      assert.ok(m.t.length > 8 && m.t !== `err_${e}`, `${lang} ${e}`);
      if (!['aborted'].includes(e)) assert.ok(m.fix, `${lang} ${e} has advice`);
    }
  }
  // every code that diagnose can produce has a message in each language
  const grid: VoiceProbe[] = [];
  for (const native of [true, false]) for (const perm of ['granted', 'denied', 'prompt', 'unknown'] as const) for (const browser of ['chrome', 'samsung', 'firefox', 'webview', 'safari', 'other'] as const)
    for (const webSpeech of [true, false]) for (const secure of [true, false]) for (const online of [true, false, undefined]) for (const avail of [true, false, undefined]) for (const pm of [true, false])
      for (const last of [undefined, { code: 'network' as VoiceError, at: 1 }]) grid.push(probe({ native, platform: native ? 'android' : 'web', pluginPresent: native && !pm, pluginMissing: native && pm, micPermission: perm, browser, webSpeech, secure, online, nativeAvailable: avail, lastError: last, lastOkAt: last ? undefined : 1 }));
  const seen = new Set<string>();
  for (const p of grid) for (const c of diagnose(p).checks) seen.add(c.code);
  seen.add('lastNone');
  for (const code of seen) for (const lang of ['en', 'bm', 'zh'] as const) assert.ok(diagMessages[lang][code]?.t, `${lang} message for ${code}`);
  assert.ok(seen.size >= 25);
});

test('VD4 browser names are read from the user-agent text', () => {
  assert.equal(browserOf('Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36'), 'samsung');
  assert.equal(browserOf('Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'), 'chrome');
  assert.equal(browserOf('Mozilla/5.0 (Linux; Android 14; SM-S918B; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36'), 'webview');
  assert.equal(browserOf('Mozilla/5.0 (Android 14; Mobile; rv:130.0) Gecko/130.0 Firefox/130.0'), 'firefox');
  assert.equal(browserOf('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'), 'safari');
});

test('VD5 the copyable report has the findings and no personal data, and says it is not proof', () => {
  const p = probe({ native: true, platform: 'android', pluginPresent: true, webSpeech: false, nativeAvailable: true, lastError: { code: 'no-speech', at: 1 } });
  const text = reportText(p, diagnose(p), new Date(Date.UTC(2026, 9, 14, 8, 30)));
  assert.ok(text.includes('NOT proof') && text.includes('2026-10-14 08:30'));
  assert.ok(text.includes('last error: no-speech') && text.includes('speech plugin in this app: present'));
  assert.ok(!/@|\+60|phone number/.test(text));
});

test('VD6 the recogniser remembers the last error and the last success for the diagnostics screen', async () => {
  resetLastVoice();
  // no recogniser in this environment: unsupported is recorded
  const errs: VoiceError[] = [];
  const l = listen('en-MY', { interim: () => {}, final: () => {}, error: e => errs.push(e), end: () => {} });
  assert.equal(l, null); assert.deepEqual(errs, ['unsupported']);
  assert.equal(lastVoice.error, 'unsupported'); assert.ok(lastVoice.errorAt);
  // a stand-in browser recogniser that hears something
  class Fake {
    lang = ''; continuous = false; interimResults = false; maxAlternatives = 1;
    onresult: ((e: unknown) => void) | null = null; onerror: ((e: unknown) => void) | null = null; onend: (() => void) | null = null;
    start() { setTimeout(() => { this.onresult?.({ resultIndex: 0, results: [Object.assign([{ transcript: 'test one two three' }], { isFinal: true })] }); this.onend?.(); }, 5); }
    stop() { this.onend?.(); } abort() { this.onend?.(); }
  }
  (globalThis as Record<string, unknown>).webkitSpeechRecognition = Fake;
  const heard: string[] = [];
  await new Promise<void>(res => { listen('en-MY', { interim: () => {}, final: x => heard.push(x), error: () => {}, end: res }); });
  delete (globalThis as Record<string, unknown>).webkitSpeechRecognition;
  assert.deepEqual(heard, ['test one two three']);
  assert.ok(lastVoice.okAt); assert.equal(lastVoice.error, undefined, 'a success clears the last error'); assert.equal(lastVoice.engine, 'web');
});

// ---------- C3 words in three languages ----------
test('VS1 Voice Command and diagnostics text exists in English, Bahasa Malaysia and Chinese, with the new example commands', () => {
  const keys = (o: unknown, p = ''): string[] => Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? keys(v, `${p}${k}.`) : [`${p}${k}`]));
  const en = keys(voiceCommandStrings.en).sort();
  assert.deepEqual(keys(voiceCommandStrings.bm).sort(), en); assert.deepEqual(keys(voiceCommandStrings.zh).sort(), en);
  assert.deepEqual(keys(diagStrings.bm).sort(), keys(diagStrings.en).sort()); assert.deepEqual(keys(diagStrings.zh).sort(), keys(diagStrings.en).sort());
  // JoyChange003 Change 57: the examples live in c056Strings (grouped by task); every one of them is checked in
  // tests/joychange003-batchE.test.ts. Here: price, status and buyers are still covered.
  for (const lang of ['en', 'bm', 'zh'] as const) {
    const ex = c056Strings[lang].groups.flatMap(g => g.examples).join('\n');
    assert.ok(/asking price|harga/i.test(ex) && /Sold|terjual/i.test(ex) && /buyers|pembeli/i.test(ex), `${lang} examples cover price, status and buyers`);
  }
  assert.ok(/[一-鿿]/.test(c056Strings.zh.diag) && /[一-鿿]/.test(diagStrings.zh.title));
  assert.notEqual(voiceCommandStrings.bm.more.apply, voiceCommandStrings.en.more.apply);
  // the example commands really are understood
  for (const lang of ['en', 'bm'] as const) {
    const change = c056Strings[lang].groups[1].examples;
    const price = change.find(x => /harga|price/i.test(x) && /P100\d/.test(x))!, status = change.find(x => /status/i.test(x) && /P100\d/.test(x))!;
    const buyers = c056Strings[lang].groups[3].examples.find(x => /find|cari/i.test(x))!;
    assert.equal(parseTargetedUpdate(price, props, [])?.kind, 'update', price);
    assert.equal(parseTargetedUpdate(status, props, [])?.kind, 'update', status);
    assert.ok(parseBuyerQuery(buyers, [])?.any, buyers);
  }
});
