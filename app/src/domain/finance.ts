// Agent Financial: income, commissions, expenses and targets for a month or a year.
import type { Deal, Expense, Income, Target } from '../data/types';

export const EXPENSE_CATEGORIES = ['Fuel', 'Toll and parking', 'Advertising', 'Phone and internet', 'Printing', 'Client meals', 'Licence and training', 'Office', 'Transport'] as const;
export const INCOME_SOURCES = ['Commission', 'Referral fee', 'Rental management', 'Consultancy'] as const;

/** The agent's own part of a deal's commission. */
export const myCommission = (d: Pick<Deal, 'commission' | 'sharePct'>) => (d.commission * (d.sharePct ?? 100)) / 100;
/** What has actually been paid to the agent for a deal. */
export const receivedOf = (d: Deal) => (d.status === 'received' ? d.receivedAmount ?? myCommission(d) : 0);

/** Commission from price and percentage, rounded to sen. */
export const commissionFrom = (value: number, pct: number) => Math.round(value * pct) / 100;

export type Period = { kind: 'month'; key: string } | { kind: 'year'; key: string };
const inPeriod = (date: string | undefined, p: Period) => !!date && date.startsWith(p.key);

export interface FinanceSummary {
  received: number;            // commissions received + other income, in the period
  commissionReceived: number;
  otherIncome: number;
  expenses: number;
  net: number;                 // received − expenses
  outstanding: number;         // all confirmed or estimated commissions not received yet (any period)
  outstandingConfirmed: number;
  completedDeals: number;      // deals closed in the period (confirmed or received)
  dealValue: number;
  target?: number;
  targetProgress?: number;     // 0..1+
  expensesByCategory: { category: string; amount: number }[];
}

export function summarise(p: Period, deals: Deal[], incomes: Income[], expenses: Expense[], targets: Target[]): FinanceSummary {
  const commissionReceived = deals.filter(d => d.status === 'received' && inPeriod(d.receivedDate ?? d.date, p)).reduce((s, d) => s + receivedOf(d), 0);
  const otherIncome = incomes.filter(i => inPeriod(i.date, p)).reduce((s, i) => s + i.amount, 0);
  const exp = expenses.filter(e => inPeriod(e.date, p));
  const expTotal = exp.reduce((s, e) => s + e.amount, 0);
  const open = deals.filter(d => d.status !== 'received');
  const closed = deals.filter(d => d.status !== 'estimated' && inPeriod(d.date, p));
  const byCat = new Map<string, number>();
  for (const e of exp) byCat.set(e.category, (byCat.get(e.category) ?? 0) + e.amount);
  const target = targets.find(t => t.period === p.kind && t.key === p.key)?.amount;
  const received = commissionReceived + otherIncome;
  return {
    received, commissionReceived, otherIncome,
    expenses: expTotal, net: received - expTotal,
    outstanding: open.reduce((s, d) => s + myCommission(d), 0),
    outstandingConfirmed: open.filter(d => d.status === 'confirmed').reduce((s, d) => s + myCommission(d), 0),
    completedDeals: closed.length,
    dealValue: closed.reduce((s, d) => s + d.value, 0),
    target, targetProgress: target ? received / target : undefined,
    expensesByCategory: [...byCat].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
  };
}

/** Monthly received income for each month of a year (for the small bar chart). */
export function monthlyIncome(year: string, deals: Deal[], incomes: Income[]): number[] {
  return Array.from({ length: 12 }, (_, i) => {
    const key = `${year}-${String(i + 1).padStart(2, '0')}`;
    const s = summarise({ kind: 'month', key }, deals, incomes, [], []);
    return s.received;
  });
}
