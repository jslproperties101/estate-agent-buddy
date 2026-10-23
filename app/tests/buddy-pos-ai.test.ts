// Buddy POS AI Phase 1: the ledger rules, invoices, POS, reports, e-Invoice documents and checks, payroll estimates,
// the locks on final records, and the phone's side of the MyInvois function. Nothing here calls LHDN or a real project.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryBackend } from '../src/data/backend';
import { Store, AccessError, emptyState } from '../src/data/store';
import { COLLECTIONS } from '../src/data/types';
import {
  balanced, nextNo, newJournal, postJournal, reverseJournal, postInvoice, payInvoice, makeSale, totals, profitAndLoss, trialBalance,
  balanceSheet, payslip, runPayroll, BuddyError, insights, nextStage, hoursWorked,
} from '../src/buddy/engine';
import { check, consolidate, einvFromInvoice, einvFromSale, buildUBL, canCancel, GENERAL_PUBLIC_TIN, TIN_RE, shareUrl } from '../src/buddy/einvoice';
import { lockedChange } from '../src/buddy/locks';
import { applyAnswer, submitEinvoice, MyinvoisError } from '../src/buddy/myinvoisClient';
import { buddyEnabled } from '../src/buddy/access';
import { sampleBooks } from '../src/buddy/sample';
import type { AcctInvoice, AcctJournal, AcctProfile, AcctSale, AcctStaff, Party } from '../src/buddy/model';

let n = 0;
const ids = { id: () => `id-${++n}`, now: () => 1_790_000_000_000 };
const buyer: Party = { name: 'Tan Holdings Sdn Bhd', tin: 'C10987654320', brn: '201901023456', addr: '12 Jalan Desa', city: 'Kuala Lumpur', state: '14', postcode: '58100' };
const co: AcctProfile = { id: 'company', created: 0, updated: 0, msic: '68201', msicDesc: 'Real estate agents', party: { name: 'Example Realty Sdn Bhd', tin: 'C21234567890', brn: '202301012345', sst: 'W10-2310-32000123', addr: 'Jalan Ampang', city: 'Kuala Lumpur', state: '14', postcode: '50450' } };
const draftInv = (over: Partial<AcctInvoice> = {}): AcctInvoice => ({ id: ids.id(), created: 0, updated: 0, date: '2026-10-10', due: '2026-11-09', buyer, status: 'draft', lines: [{ desc: 'Agency commission', qty: 1, price: 24000, taxPct: 8, acc: '4000' }], ...over });

test('collections: every Buddy POS AI kind is synced like the rest and starts empty', () => {
  for (const c of ['acctJournals', 'acctInvoices', 'acctSales', 'acctEinvoices', 'acctLeads', 'acctStaff', 'acctAttendance', 'acctPayruns', 'acctProducts', 'acctProfile'] as const) {
    assert.ok(COLLECTIONS.includes(c), c);
    assert.deepEqual(emptyState()[c], []);
  }
});

test('journal: only balanced entries post, numbers run on, a reversal cancels the entry and keeps both', () => {
  assert.equal(balanced([{ acc: '6100', dr: 100, cr: 0 }, { acc: '1010', dr: 0, cr: 99.99 }]), false);
  assert.equal(balanced([{ acc: '9999', dr: 100, cr: 0 }, { acc: '1010', dr: 0, cr: 100 }]), false, 'unknown account');
  assert.equal(balanced([{ acc: '6100', dr: 100, cr: 100 }, { acc: '1010', dr: 0, cr: 0 }]), false, 'both sides on one line');
  const bad = newJournal(ids, { date: '2026-10-01', memo: 'Rent', lines: [{ acc: '6100', dr: 100, cr: 0 }, { acc: '1010', dr: 0, cr: 90 }] });
  assert.throws(() => postJournal(bad, [], 1), (e: unknown) => e instanceof BuddyError && e.code === 'unbalanced');
  const j = postJournal(newJournal(ids, { date: '2026-10-01', memo: 'Rent', lines: [{ acc: '6100', dr: 3000, cr: 0 }, { acc: '1010', dr: 0, cr: 3000 }] }), [], 1);
  assert.equal(j.no, 'JV-0001'); assert.equal(j.status, 'posted');
  assert.throws(() => postJournal(j, [j], 1), (e: unknown) => e instanceof BuddyError && e.code === 'not-draft');
  const { original, reversal } = reverseJournal(ids, j, [j], '2026-10-02');
  assert.equal(original.status, 'reversed'); assert.equal(original.reversedBy, 'JV-0002'); assert.equal(reversal.ref, 'JV-0001');
  assert.equal(profitAndLoss([original, reversal]).net, 0);
  assert.equal(nextNo('JV', ['JV-0009', 'INV-0100', undefined, 'JV-abc']), 'JV-0010');
});

test('invoice: posting books receivable, income and service tax; payment clears the receivable', () => {
  const journals: AcctJournal[] = [];
  const { invoice, journal } = postInvoice(ids, draftInv(), [], journals);
  journals.push(journal);
  assert.equal(invoice.no, 'INV-0001'); assert.equal(invoice.journalNo, journal.no);
  assert.deepEqual(journal.lines, [{ acc: '1100', dr: 25920, cr: 0 }, { acc: '4000', dr: 0, cr: 24000 }, { acc: '2200', dr: 0, cr: 1920 }]);
  const paid = payInvoice(ids, invoice, journals, '2026-10-20');
  journals.push(paid.journal);
  assert.equal(paid.invoice.status, 'paid');
  const tb = trialBalance(journals);
  assert.equal(tb.dr, tb.cr);
  assert.equal(balanceSheet(journals).balanced, true);
  assert.throws(() => postInvoice(ids, draftInv({ lines: [] }), [], []), (e: unknown) => e instanceof BuddyError && e.code === 'empty');
});

test('POS: cash goes to Cash in hand, card and QR to Bank; above RM10,000 needs the buyer', () => {
  const lines = [{ desc: 'Tenancy agreement', qty: 1, price: 350, taxPct: 8, acc: '4100' }, { desc: 'Key duplication', qty: 2, price: 15, taxPct: 0, acc: '4100' }];
  const a = makeSale(ids, { date: '2026-10-08', time: '10:00:00', lines, method: 'cash' }, [], []);
  assert.equal(a.sale.total, 408); assert.equal(a.journal.lines[0].acc, '1000');
  const b = makeSale(ids, { date: '2026-10-08', time: '10:05:00', lines, method: 'qr' }, [a.sale], [a.journal]);
  assert.equal(b.sale.no, 'POS-0002'); assert.equal(b.journal.lines[0].acc, '1010');
  const big = [{ desc: 'Valuation package', qty: 1, price: 12000, taxPct: 0, acc: '4100' }];
  assert.throws(() => makeSale(ids, { date: '2026-10-08', time: '11:00:00', lines: big, method: 'card' }, [], []), (e: unknown) => e instanceof BuddyError && e.code === 'needs-buyer');
  assert.equal(makeSale(ids, { date: '2026-10-08', time: '11:00:00', lines: big, method: 'card', buyer }, [], []).sale.buyer?.tin, buyer.tin);
});

test('e-Invoice: checks, consolidated receipts by tax rate, UBL totals and the 72-hour cancel window', () => {
  assert.ok(TIN_RE.test('C21234567890') && TIN_RE.test('IG12345678901') && TIN_RE.test(GENERAL_PUBLIC_TIN));
  assert.ok(!TIN_RE.test('900101-14-5678'));
  const { invoice } = postInvoice(ids, draftInv(), [], []);
  const e = einvFromInvoice(ids, invoice);
  assert.deepEqual(check(e, co).errors, []);
  assert.deepEqual(check(e, undefined).errors.slice(0, 3), ['supplier-tin', 'supplier-brn', 'supplier-msic']);
  assert.ok(check({ ...e, buyer: { ...buyer, tin: '1234' } }, co).errors.includes('buyer-tin'));
  const doc = buildUBL(e, co).Invoice[0];
  assert.equal(doc.LegalMonetaryTotal[0].PayableAmount[0]._, 25920);
  assert.equal(doc.InvoiceTypeCode[0].listVersionID, '1.1');
  assert.equal(doc.AccountingSupplierParty[0].Party[0].IndustryClassificationCode?.[0]._, '68201');

  const lines = [{ desc: 'Tenancy agreement', qty: 1, price: 350, taxPct: 8, acc: '4100' }, { desc: 'Key duplication', qty: 2, price: 15, taxPct: 0, acc: '4100' }];
  const s1 = makeSale(ids, { date: '2026-10-08', time: '10:00:00', lines, method: 'cash' }, [], []).sale;
  const s2 = { ...makeSale(ids, { date: '2026-10-09', time: '10:00:00', lines, method: 'cash', buyer }, [s1], []).sale };
  const own = einvFromSale(ids, s2); const s2b: AcctSale = { ...s2, einvId: own.id };
  const c = consolidate(ids, '2026-10', [s1, s2b], '2026-11-02', '09:00:00')!;
  assert.equal(c.sales.length, 1, 'a receipt with its own e-Invoice is left out');
  assert.equal(c.einv.lines.length, 2, 'taxed and untaxed parts stay separate');
  assert.equal(totals(c.einv.lines).total, s1.total);
  assert.equal(check(c.einv, co).dueBy, '2026-11-07');
  assert.equal(consolidate(ids, '2026-10', c.sales, '2026-11-02', '09:00:00'), null);

  const valid = applyAnswer(e, { status: 'valid', uuid: 'U1', longId: 'L1', env: 'preprod' }, 1000);
  assert.equal(canCancel(valid, 1000 + 71 * 3600_000), true);
  assert.equal(canCancel(valid, 1000 + 73 * 3600_000), false);
  assert.equal(shareUrl(valid), 'https://preprod.myinvois.hasil.gov.my/U1/share/L1');
});

test('payroll: estimate rates, one posted run per month, balanced journal', () => {
  const st: AcctStaff = { id: 's1', created: 0, updated: 0, name: 'Aisyah', role: 'Admin', basic: 3200, allowance: 200, commission: 0, pcb: 0, active: true };
  const p = payslip(st);
  assert.deepEqual([p.gross, p.epfEe, p.epfEr, p.socsoEe, p.eisEe, p.net], [3400, 374, 442, 17, 6.8, 3002.2]);
  const hi = payslip({ ...st, basic: 7000 });
  assert.equal(hi.epfEr, Math.ceil(7200 * 0.12)); assert.equal(hi.socsoEe, 30, 'SOCSO wage ceiling RM6,000');
  const { payrun, journal } = runPayroll(ids, '2026-10', [st, { ...st, id: 's2', active: false }], [], []);
  assert.equal(payrun.slips.length, 1); assert.equal(journal.date, '2026-10-31'); assert.ok(balanced(journal.lines));
  assert.throws(() => runPayroll(ids, '2026-10', [st], [payrun], [journal]), (e: unknown) => e instanceof BuddyError && e.code === 'already-run');
  assert.equal(hoursWorked({ id: 'a', created: 0, updated: 0, staffId: 's1', date: '2026-10-24', in: '08:45', out: '17:15' }), 8.5);
});

test('locks: final records cannot be rewritten or deleted, only moved on', () => {
  const j = postJournal(newJournal(ids, { date: '2026-10-01', memo: 'Rent', lines: [{ acc: '6100', dr: 1, cr: 0 }, { acc: '1010', dr: 0, cr: 1 }] }), [], 1) as unknown as Record<string, unknown>;
  assert.equal(lockedChange('acctJournals', j, { ...j, memo: 'changed' }), true);
  assert.equal(lockedChange('acctJournals', j, null), true);
  assert.equal(lockedChange('acctJournals', j, { ...j, status: 'reversed', reversedBy: 'JV-0002', updated: 9 }), false);
  const draft = { ...j, status: 'draft' };
  assert.equal(lockedChange('acctJournals', draft, null), false);
  const inv = { ...draftInv(), status: 'posted', no: 'INV-0001' } as unknown as Record<string, unknown>;
  assert.equal(lockedChange('acctInvoices', inv, { ...inv, status: 'paid', paidOn: '2026-10-20', receiptNo: 'JV-0003' }), false);
  assert.equal(lockedChange('acctInvoices', inv, { ...inv, lines: [] }), true);
  const sale = { id: 's', no: 'POS-0001', total: 1 } as Record<string, unknown>;
  assert.equal(lockedChange('acctSales', sale, null), true);
  assert.equal(lockedChange('acctSales', sale, { ...sale, consolidatedIn: 'x' }), false);
  const ev = { id: 'e', status: 'valid', lines: [1], buyer: {} } as Record<string, unknown>;
  assert.equal(lockedChange('acctEinvoices', ev, { ...ev, lines: [] }), true);
  assert.equal(lockedChange('acctEinvoices', ev, { ...ev, status: 'cancelled', cancelledAt: 5 }), false);
  assert.equal(lockedChange('acctPayruns', { id: 'p' }, { id: 'p', slips: [] }), true);
  assert.equal(lockedChange('properties', { id: 'x' }, null), false);
});

test('locks are enforced by the store itself', async () => {
  const store = await Store.open(new MemoryBackend());
  const j = postJournal(newJournal(ids, { date: '2026-10-01', memo: 'Rent', lines: [{ acc: '6100', dr: 1, cr: 0 }, { acc: '1010', dr: 0, cr: 1 }] }), [], 1);
  store.upsert('acctJournals', j);
  assert.throws(() => store.upsert('acctJournals', { ...j, memo: 'edited' }), (e: unknown) => e instanceof AccessError && e.why === 'locked');
  assert.throws(() => store.remove('acctJournals', j.id), (e: unknown) => e instanceof AccessError);
  store.upsert('acctJournals', { ...j, status: 'reversed', reversedBy: 'JV-0002' });
  assert.equal(store.getState().acctJournals[0].status, 'reversed');
  assert.ok(store.getState().meta.dirty.includes(`acctJournals:${j.id}`), 'waiting for the next sync');
});

test('feature switch: off by default, on from Settings or from Admin EAB beta.buddy-pos-ai', async () => {
  const store = await Store.open(new MemoryBackend());
  assert.equal(buddyEnabled(store), false);
  store.setSingleton('settings', { buddyPos: true });
  assert.equal(buddyEnabled(store), true);
  store.setSingleton('settings', { buddyPos: false });
  store.setSingleton('meta', { syncSession: { accessToken: 't', refreshToken: 'r', expiresAt: Date.now() + 3600_000, email: 'a@x.c', userId: 'u1' }, flags: { userId: 'u1', flags: { 'beta.buddy-pos-ai': true }, at: 1 } });
  assert.equal(buddyEnabled(store), true);
});

test('MyInvois client: no function deployed means not-configured, and nothing is marked sent', async () => {
  const store = await Store.open(new MemoryBackend());
  const cfg = { supabaseUrl: 'https://t.supabase.co', supabaseAnonKey: 'anon' };
  const { invoice } = postInvoice(ids, draftInv(), [], []);
  const e = einvFromInvoice(ids, invoice);
  await assert.rejects(submitEinvoice(store, cfg, e, co), (x: unknown) => x instanceof MyinvoisError && x.code === 'not-signed-in');
  store.setSingleton('meta', { syncSession: { accessToken: 't', refreshToken: 'r', expiresAt: Date.now() + 3600_000, email: 'a@x.c', userId: 'u1' } });
  const calls: string[] = [];
  const missing = (async (url: string) => { calls.push(String(url)); return new Response('{"message":"Function not found"}', { status: 404 }); }) as typeof fetch;
  await assert.rejects(submitEinvoice(store, cfg, e, co, missing), (x: unknown) => x instanceof MyinvoisError && x.code === 'not-configured');
  assert.equal(calls[0], 'https://t.supabase.co/functions/v1/myinvois');
  const noCreds = (async () => new Response('{"error":"not-configured"}', { status: 503 })) as unknown as typeof fetch;
  await assert.rejects(submitEinvoice(store, cfg, e, co, noCreds), (x: unknown) => x instanceof MyinvoisError && x.code === 'not-configured');
  const ok = (async (_u: string, init: RequestInit) => { const b = JSON.parse(String(init.body)); assert.equal(b.action, 'submit'); assert.equal(b.document.Invoice[0].ID[0]._, invoice.no); return Response.json({ status: 'submitted', submissionUid: 'S1', uuid: 'U1', env: 'preprod' }); }) as unknown as typeof fetch;
  const a = await submitEinvoice(store, cfg, e, co, ok);
  const after = applyAnswer(e, a, 5);
  assert.equal(after.status, 'submitted'); assert.equal(after.uuid, 'U1'); assert.deepEqual(after.lines, e.lines);
});

test('CRM stages and rule-based insights', () => {
  assert.equal(nextStage({ stage: 'viewing' } as never), 'offer');
  assert.equal(nextStage({ stage: 'won' } as never), 'won');
  const b = sampleBooks(ids, '2026-10-24');
  const keys = insights(b, '2026-10-24').map(i => i.key);
  for (const k of ['receivables', 'followup', 'einvoice', 'runway', 'sst'] as const) assert.ok(keys.includes(k), k);
  assert.equal(trialBalance(b.journals).dr, trialBalance(b.journals).cr);
  assert.equal(balanceSheet(b.journals).balanced, true);
});
