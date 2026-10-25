// AI Buddy POS: what may still change once a financial record is final. The store checks this on every local save
// (data/store.ts checkWrite), so no screen, command or restore path can quietly rewrite the books.
//  - Journal: a draft may change or be deleted. Posted: only marking it reversed. Reversed: nothing.
//  - Invoice: a draft may change or be deleted. Posted: only being paid and linked to its e-Invoice. Paid: only the link.
//  - POS sale: never deleted; only its e-Invoice links may be added.
//  - e-Invoice: its content is fixed once submitted; only the LHDN status fields change. A valid or cancelled one is never deleted.
//  - Payroll run: never changed or deleted.
const BUDDY = new Set(['acctJournals', 'acctInvoices', 'acctSales', 'acctEinvoices', 'acctPayruns']);

type Rec = Record<string, unknown>;
const only = (before: Rec, after: Rec, allowed: string[]) => {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    if (k === 'updated' || allowed.includes(k)) continue;
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) return false;
  }
  return true;
};

/** True when this local change would rewrite a final record. */
export function lockedChange(collection: string, before: Rec | undefined, after: Rec | null): boolean {
  // Example records (Load example data) can always be removed again.
  if (!BUDDY.has(collection) || !before || before.sample) return false;
  const st = before.status as string | undefined;
  switch (collection) {
    case 'acctJournals':
      if (st === 'draft') return false;
      if (!after) return true;
      return !(st === 'posted' && after.status === 'reversed' && only(before, after, ['status', 'reversedBy']));
    case 'acctInvoices':
      if (st === 'draft') return false;
      if (!after) return true;
      if (st === 'posted') return !((after.status === 'posted' || after.status === 'paid') && only(before, after, ['status', 'receiptNo', 'paidOn', 'einvId']));
      return !(after.status === 'paid' && only(before, after, ['einvId']));
    case 'acctSales':
      return !after || !only(before, after, ['einvId', 'consolidatedIn']);
    case 'acctEinvoices': {
      const statusFields = ['status', 'submissionUid', 'uuid', 'longId', 'submittedAt', 'validatedAt', 'cancelledAt', 'errors', 'env'];
      if (!after) return st === 'valid' || st === 'cancelled' || st === 'submitted';
      if (st === 'ready' || st === 'invalid') return false;
      return !only(before, after, statusFields);
    }
    case 'acctPayruns':
      return true;
  }
  return false;
}
