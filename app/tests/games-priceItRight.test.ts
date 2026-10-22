// v1buddychange013: Price It Right - the rules (question picking, answer options, scoring, My listings mode, the bank, the words).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BANK, NOTES, bankProblems, type BankItem } from '../src/games/priceItRight/bank';
import {
  ROUND_SIZE, MIN_MINE, MAX_PER_ART, WRONG_BANDS, mulberry32, shuffle, stepFor, makeOptions, buildBankRound, buildMineRound,
  priceableListings, mineAvailable, scoreRound, artOfBankType, artOfListingType, type Question,
} from '../src/games/priceItRight/logic';
import { pirStrings } from '../src/games/priceItRight/strings';
import { game } from '../src/games/priceItRight';
import { gameByKey } from '../src/games/registry';
import { TYPES, type Listing } from '../src/listing/model';

const LANGS = ['en', 'bm', 'zh'] as const;
const listing = (id: string, x: Partial<Listing> = {}): Listing => ({ id, created: 1, updated: 1, photos: [], ...x });
const priced = (n: number): Listing[] => Array.from({ length: n }, (_, k) => listing(`p${k}`, { purpose: 'sale', type: 'Terrace house', township: `Taman ${k}`, askingPrice: 500000 + k * 10000 }));

// ---------- the answer options ----------
test('PIR1 options are 4 distinct whole prices including the right one, all clearly different from it (at least 25% away)', () => {
  const prices = [800, 1500, 3800, 8000, 99999, 280000, 330000, 538888, 1280000, 3400000, 9800000, 12345678];
  for (const price of prices) for (let seed = 1; seed <= 60; seed++) {
    const o = makeOptions(price, mulberry32(seed * 7919 + price));
    assert.equal(o.options.length, 4);
    assert.equal(new Set(o.options).size, 4, `distinct for ${price}/${seed}: ${o.options}`);
    assert.equal(o.options[o.correctIndex], price);
    for (const [k, v] of o.options.entries()) {
      assert.ok(Number.isInteger(v) && v > 0, `positive whole number: ${v}`);
      if (k !== o.correctIndex) assert.ok(Math.abs(v - price) / price >= 0.249 && Math.abs(v - price) / price <= 0.61, `${v} vs ${price} is 25-60% away`);
    }
  }
});
test('PIR2 every option for 3000 random prices is distinct and includes the right answer (rent and sale sizes)', () => {
  const r = mulberry32(2026);
  for (let n = 0; n < 3000; n++) {
    const price = n % 2 ? Math.round(100 + r() * 20000) : Math.round(10000 + r() * 20_000_000);
    const o = makeOptions(price, r);
    assert.equal(new Set(o.options).size, 4, `${price}: ${o.options}`);
    assert.equal(o.options[o.correctIndex], price);
  }
});
test('PIR3 the right answer is not given away: wrong options are rounded the same way as the right price', () => {
  assert.equal(stepFor(1280000), 10000);
  assert.equal(stepFor(1500), 25);
  assert.equal(stepFor(538888), 1, 'an odd price gets no rounding, so it cannot stand out');
  const o = makeOptions(538888, mulberry32(5));
  assert.ok(o.options.every(v => Number.isInteger(v)));
  const o2 = makeOptions(520000, mulberry32(6));
  assert.ok(o2.options.every(v => v % 5000 === 0), `tidy numbers: ${o2.options}`);
});
test('PIR4 a price with sen is rounded to whole ringgit; the wrong-answer bands are 5% or more apart', () => {
  const o = makeOptions(1234.56, mulberry32(3));
  assert.equal(o.options[o.correctIndex], 1235);
  const sorted = [...WRONG_BANDS].sort((a, b) => a[0] - b[0]);
  for (let k = 1; k < sorted.length; k++) assert.ok(sorted[k][0] - sorted[k - 1][1] >= 0.0499, `bands ${sorted[k - 1]} and ${sorted[k]} are far enough apart`);
});
test('PIR5 the right answer lands in every position across seeds', () => {
  const seen = new Set<number>();
  for (let s = 1; s <= 80; s++) seen.add(makeOptions(650000, mulberry32(s)).correctIndex);
  assert.deepEqual([...seen].sort(), [0, 1, 2, 3]);
});

// ---------- seeds ----------
test('PIR6 the same seed gives the same round, a different seed gives a different one', () => {
  const a = buildBankRound(mulberry32(42), BANK), b = buildBankRound(mulberry32(42), BANK), c = buildBankRound(mulberry32(43), BANK);
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.map(q => q.id), c.map(q => q.id));
  const m1 = buildMineRound(mulberry32(9), priced(10)), m2 = buildMineRound(mulberry32(9), priced(10));
  assert.deepEqual(m1, m2);
  const r1 = mulberry32(1), r2 = mulberry32(1);
  assert.deepEqual([r1(), r1(), r1()], [r2(), r2(), r2()]);
  for (let k = 0; k < 1000; k++) { const v = r1(); assert.ok(v >= 0 && v < 1); }
  assert.deepEqual(shuffle(mulberry32(4), [1, 2, 3, 4, 5, 6]), shuffle(mulberry32(4), [1, 2, 3, 4, 5, 6]));
  assert.deepEqual([...shuffle(mulberry32(4), [1, 2, 3, 4, 5, 6])].sort(), [1, 2, 3, 4, 5, 6]);
});
test('PIR7 a built-in round: 8 different questions, 6 for sale and 2 for rent, at most 2 of any picture type, right price among the options', () => {
  for (let s = 1; s <= 200; s++) {
    const qs = buildBankRound(mulberry32(s), BANK);
    assert.equal(qs.length, ROUND_SIZE);
    assert.equal(new Set(qs.map(q => q.id)).size, ROUND_SIZE, 'no property twice');
    assert.equal(qs.filter(q => q.kind === 'rent').length, 2);
    assert.equal(qs.filter(q => q.kind === 'sale').length, 6);
    const perArt: Record<string, number> = {};
    for (const q of qs) { perArt[q.card.art] = (perArt[q.card.art] ?? 0) + 1; assert.equal(q.options[q.correctIndex], q.price); assert.equal(new Set(q.options).size, 4); }
    for (const [art, n] of Object.entries(perArt)) assert.ok(n <= MAX_PER_ART, `${art} x${n} in seed ${s}`);
  }
});
test('PIR8 a built-in round has enough variety: many different places and every property type appear across rounds', () => {
  const ids = new Set<string>(), arts = new Set<string>();
  for (let s = 1; s <= 60; s++) for (const q of buildBankRound(mulberry32(s), BANK)) { ids.add(q.id); arts.add(q.card.art); }
  assert.ok(ids.size >= BANK.length * 0.8, `${ids.size} of ${BANK.length} scenarios seen`);
  assert.deepEqual([...arts].sort(), ['bungalow', 'condo', 'land', 'semid', 'shoplot', 'terrace']);
});

// ---------- scoring ----------
test('PIR9 scoring: one point per right answer, maxScore is the number of questions, score never above maxScore', () => {
  const qs = buildBankRound(mulberry32(11), BANK);
  const allRight = qs.map(q => q.correctIndex);
  assert.deepEqual(scoreRound(qs, allRight), { score: 8, maxScore: 8 });
  const allWrong = qs.map(q => (q.correctIndex + 1) % 4);
  assert.deepEqual(scoreRound(qs, allWrong), { score: 0, maxScore: 8 });
  const half = qs.map((q, i) => (i % 2 ? (q.correctIndex + 2) % 4 : q.correctIndex));
  assert.deepEqual(scoreRound(qs, half), { score: 4, maxScore: 8 });
  assert.deepEqual(scoreRound(qs, [qs[0].correctIndex]), { score: 1, maxScore: 8 }, 'unanswered questions score nothing');
  assert.deepEqual(scoreRound(qs, []), { score: 0, maxScore: 8 });
  const r = scoreRound(qs, allRight);
  assert.ok(r.score <= r.maxScore);
});

// ---------- My listings ----------
test('PIR10 My listings is available only with 4 or more listings that have an asking price or rent', () => {
  assert.equal(MIN_MINE, 4);
  assert.equal(mineAvailable(priced(3)), false);
  assert.equal(mineAvailable(priced(4)), true);
  assert.equal(mineAvailable([]), false);
  assert.equal(mineAvailable([...priced(3), listing('x1', { purpose: 'sale' })]), false, 'a listing without a price does not count');
  assert.equal(mineAvailable([...priced(3), listing('x2', { purpose: 'rent', monthlyRent: 1800 })]), true, 'a rent listing with a rent counts');
});
test('PIR11 archived/deleted listings and listings with a missing, tiny or wrong-kind price are left out', () => {
  const list = [
    ...priced(3),
    listing('arch', { purpose: 'sale', askingPrice: 600000, archived: { at: 5 } }),
    listing('noprice', { purpose: 'sale' }),
    listing('typo', { purpose: 'sale', askingPrice: 500 }),
    listing('rentNoRent', { purpose: 'rent', askingPrice: 900000 }),
    listing('saleNoAsking', { purpose: 'sale', monthlyRent: 2000 }),
    listing('nan', { purpose: 'sale', askingPrice: Number.NaN }),
  ];
  assert.deepEqual(priceableListings(list).map(l => l.id), ['p0', 'p1', 'p2']);
  assert.equal(mineAvailable(list), false);
  assert.equal(mineAvailable([...list, listing('ok', { purpose: 'rent', monthlyRent: 1500 })]), true);
});
test('PIR12 a My listings round uses each listing once, the right price comes from the listing, and rent questions use the monthly rent', () => {
  const list = [
    ...priced(6),
    listing('r1', { purpose: 'rent', type: 'Condo / apartment', monthlyRent: 2400, askingPrice: 800000, state: 'Selangor', city: 'Cyberjaya' }),
    listing('r2', { purpose: 'rent', type: 'Shoplot', monthlyRent: 5000 }),
    listing('dual', { purpose: 'sale_or_rent', type: 'Bungalow', askingPrice: 2000000, monthlyRent: 6000 }),
  ];
  const kinds = new Set<string>();
  for (let s = 1; s <= 80; s++) {
    const qs = buildMineRound(mulberry32(s), list);
    assert.equal(qs.length, ROUND_SIZE);
    assert.equal(new Set(qs.map(q => q.id.split(':')[0])).size, ROUND_SIZE, 'one question per listing');
    for (const q of qs) {
      const l = list.find(x => x.id === q.id.split(':')[0])!;
      kinds.add(`${l.id}:${q.kind}`);
      assert.equal(q.price, q.kind === 'sale' ? l.askingPrice : l.monthlyRent);
      assert.equal(q.options[q.correctIndex], q.price);
      assert.equal(new Set(q.options).size, 4);
      if (l.id === 'r1' || l.id === 'r2') assert.equal(q.kind, 'rent', 'a rent listing is asked as rent');
      if (l.id.startsWith('p')) assert.equal(q.kind, 'sale');
    }
  }
  assert.ok(kinds.has('dual:sale') && kinds.has('dual:rent'), 'a sale-or-rent listing is asked either way');
});
test('PIR13 fewer than 8 priced listings make a shorter round, and maxScore matches the number of questions', () => {
  const qs = buildMineRound(mulberry32(3), priced(5));
  assert.equal(qs.length, 5);
  assert.deepEqual(scoreRound(qs, qs.map(q => q.correctIndex)), { score: 5, maxScore: 5 });
  assert.equal(buildMineRound(mulberry32(3), priced(30)).length, ROUND_SIZE);
});
test('PIR14 the property card never carries the price, the owner or the street, only the area, state, sizes and type', () => {
  const l = listing('z', { purpose: 'sale', type: 'Semi-D house', askingPrice: 1850000, township: 'Setia Alam', city: 'Shah Alam', state: 'Selangor', street: 'Jalan Rahsia 7', unitNo: 'No 12', ownerName: 'Encik Rahsia', ownerPhone: '012-3456789', headline: 'RM 1.85m bargain', bedrooms: 5, bathrooms: 4, landSqft: 3000, builtUpSqft: 3200, floors: 2, tenure: 'freehold' });
  const [q] = buildMineRound(mulberry32(1), [l, ...priced(4)].slice(0, 1));
  const text = JSON.stringify(q.card);
  assert.match(text, /Setia Alam/);
  for (const secret of ['Rahsia', '012-3456789', 'No 12', '1850000', '1.85m']) assert.ok(!text.includes(secret), `card must not contain ${secret}`);
  assert.equal(q.card.beds, 5); assert.equal(q.card.builtUp, 3200); assert.equal(q.card.art, 'semid');
});
test('PIR15 every listing type has a picture', () => {
  for (const t of TYPES) assert.ok(['terrace', 'semid', 'bungalow', 'condo', 'shoplot', 'land', 'factory'].includes(artOfListingType(t)), t);
  assert.equal(artOfListingType('Terrace factory'), 'factory');
  assert.equal(artOfListingType(undefined), 'bungalow');
});

// ---------- the scenario bank ----------
test('PIR16 the bank has 40+ complete scenarios: all fields, three-language notes, sensible prices, no duplicates', () => {
  assert.ok(BANK.length >= 40, `${BANK.length} scenarios`);
  assert.deepEqual(bankProblems(BANK), []);
  for (const b of BANK) for (const l of LANGS) assert.ok(b.note[l].trim().length >= 2, `${b.id} note ${l}`);
  for (const [k, n] of Object.entries(NOTES)) for (const l of LANGS) assert.ok(n[l], `NOTES.${k}.${l}`);
});
test('PIR17 the bank covers the required places, property types and both sale and rent', () => {
  const has = (re: RegExp) => BANK.some(b => re.test(b.area));
  for (const place of [/Nilai/, /Seremban/, /Sepang/, /Johor Bahru|Iskandar|Skudai|Kulai/, /Penang|George Town|Bayan|Tanjung|Perai|Gelugor|Balik Pulau/, /Subang|Petaling|Cheras|Shah Alam|Puchong|Mont Kiara|Bangsar/]) assert.ok(has(place), String(place));
  for (const st of ['kl', 'selangor', 'ns', 'johor', 'penang'] as const) assert.ok(BANK.some(b => b.state === st), st);
  for (const ty of ['terrace', 'semid', 'bungalow', 'condo', 'shoplot', 'landAgri', 'landInd', 'landRes'] as const) assert.ok(BANK.some(b => b.type === ty), ty);
  assert.ok(BANK.filter(b => b.kind === 'rent').length >= 10 && BANK.filter(b => b.kind === 'sale').length >= 30);
  assert.ok(BANK.filter(b => /Nilai|Seremban|Sepang|Salak Tinggi|Cyberjaya/.test(b.area)).length >= 12, 'Nilai / Seremban / Sepang are well covered');
  assert.deepEqual([...new Set(BANK.map(b => artOfBankType(b.type)))].sort(), ['bungalow', 'condo', 'land', 'semid', 'shoplot', 'terrace']);
});
test('PIR18 plausible price levels: rent in the hundreds to thousands, houses cheaper than bungalows in the same place type ranges', () => {
  const rents = BANK.filter(b => b.kind === 'rent'), sales = BANK.filter(b => b.kind === 'sale');
  assert.ok(rents.every(b => b.price >= 500 && b.price <= 12000));
  assert.ok(sales.every(b => b.price >= 150000 && b.price <= 15_000_000));
  const avg = (t: BankItem['type']) => { const l = sales.filter(b => b.type === t); return l.reduce((s, b) => s + b.price, 0) / l.length; };
  assert.ok(avg('terrace') < avg('semid') && avg('semid') < avg('bungalow'), 'terrace < semi-D < bungalow on average');
  assert.ok(avg('landAgri') < avg('landInd'));
});
test('PIR19 bankProblems catches a broken scenario', () => {
  const bad = { ...BANK[0], id: 'bad', note: { en: 'x', bm: '', zh: 'z' } } as BankItem;
  assert.ok(bankProblems([bad]).some(p => /note missing in bm/.test(p)));
  assert.ok(bankProblems([BANK[0], BANK[0]]).some(p => /duplicate/.test(p)));
});

// ---------- words and registration ----------
test('PIR20 every word exists in English, Bahasa Melayu and Chinese, including the practice-figures label', () => {
  const keys = Object.keys(pirStrings.en).sort();
  for (const l of LANGS) {
    assert.deepEqual(Object.keys(pirStrings[l]).sort(), keys, `${l} has the same keys`);
    const t = pirStrings[l];
    for (const k of keys) {
      const v = (t as Record<string, unknown>)[k];
      if (typeof v === 'string') assert.ok(v.trim(), `${l}.${k}`);
    }
    assert.ok(t.disclaimer.trim() && t.mineNote.trim());
    assert.equal(typeof t.intro(8), 'string'); assert.ok(t.intro(8).includes('8'));
    assert.ok(t.mineLocked(2, 4).includes('2') && t.mineLocked(2, 4).includes('4'));
    assert.ok(t.questionOf(3, 8).includes('3') && t.questionOf(3, 8).includes('8'));
    assert.ok(t.theAnswer('RM 1').includes('RM 1'));
    for (const ty of ['terrace', 'semid', 'bungalow', 'condo', 'shoplot', 'landAgri', 'landInd', 'landRes'] as const) assert.ok(t.types[ty], `${l} type ${ty}`);
    for (const st of ['kl', 'selangor', 'ns', 'johor', 'penang'] as const) assert.ok(t.states[st], `${l} state ${st}`);
    for (const n of [1, 2, 3]) { assert.ok(t.storeys(n)); assert.ok(t.beds(n)); assert.ok(t.baths(n)); }
    assert.ok(t.builtUp('1,000') && t.land('1,000'));
  }
  assert.match(pirStrings.en.disclaimer, /^Practice figures - illustrative, not valuations$/);
  assert.notEqual(pirStrings.bm.disclaimer, pirStrings.en.disclaimer);
  assert.notEqual(pirStrings.zh.disclaimer, pirStrings.en.disclaimer);
});
test('PIR21 the game is registered in the Games list with its three-language title, blurb and component', () => {
  assert.equal(game.key, 'priceItRight');
  assert.equal(gameByKey('priceItRight'), game);
  for (const l of LANGS) { assert.ok(game.title[l]); assert.ok(game.blurb[l]); }
  assert.equal(typeof game.Component, 'function');
  assert.ok(game.icon());
});

// guard so the unused-type import is meaningful and a Question always has exactly four options
test('PIR22 every question from every mode has exactly four options and a valid right index', () => {
  const all: Question[] = [...buildBankRound(mulberry32(77), BANK), ...buildMineRound(mulberry32(77), priced(8))];
  for (const q of all) { assert.equal(q.options.length, 4); assert.ok(q.correctIndex >= 0 && q.correctIndex < 4); }
});
