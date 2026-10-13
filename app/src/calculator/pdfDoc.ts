// The calculator's PDF: what was entered, the full breakdown, the rates used and the "estimate only" notice.
import type { Lang } from '../i18n';
import type { Calculation, Profile, Contact } from '../data/types';
import { cardTitle, Listing } from '../listing/model';
import { calcStrings } from './strings';
import { inputRows, resultRows } from './saved';
import { fmtDate } from '../lib/dates';
import { fromFlat } from './saved';
import type { Doc } from '../lib/pdf';

export function buildCalculationDoc(
  calc: Calculation,
  ctx: { lang: Lang; property?: Listing; contact?: Pick<Contact, 'name'>; agent?: Pick<Profile, 'fullName' | 'phone' | 'agency' | 'regNo'>; now: number },
): Doc {
  const t = calcStrings[ctx.lang];
  const x = t.x;
  const a = fromFlat(calc.rates);
  const blocks: Doc['blocks'] = [];
  blocks.push({ t: 'title', text: calc.title || x.pdf.doc(x.hist.kind[calc.kind]), sub: `${x.pdf.date}: ${fmtDate(ctx.now, ctx.lang)}` });
  if (ctx.property) blocks.push({ t: 'rows', rows: [{ k: x.pdf.property, v: [ctx.property.ref, cardTitle(ctx.property)].filter(Boolean).join(' · ') || '—' }] });
  if (ctx.contact) blocks.push({ t: 'text', text: x.pdf.preparedFor(ctx.contact.name) });
  blocks.push({ t: 'heading', text: x.pdf.inputs }, { t: 'rows', rows: inputRows(calc, t) });
  blocks.push({ t: 'heading', text: x.pdf.results }, { t: 'rows', rows: resultRows(calc, t) });
  blocks.push({ t: 'heading', text: x.pdf.rates }, { t: 'text', small: true, text: x.pdf.ratesNote });
  blocks.push({
    t: 'rows', rows: [
      { k: t.as.nonCitizen, v: `${a.nonCitizenMotPct}%` }, { k: t.as.loanStamp, v: `${a.loanStampPct}%` }, { k: t.as.sst, v: `${a.sstPct}%` },
      ...a.motTiers.map((tr, i) => ({ k: t.as.motTier(i), v: `${tr.pct}%` })),
      ...a.legalTiers.map((tr, i) => ({ k: t.as.legalTier(i), v: `${tr.pct}%` })),
    ],
  });
  blocks.push({ t: 'space', h: 6 }, { t: 'text', small: true, text: t.estimateNote });
  if (ctx.agent?.fullName) {
    blocks.push({ t: 'rule' }, { t: 'text', small: true, text: `${x.pdf.agent}: ${[ctx.agent.fullName, ctx.agent.agency, ctx.agent.regNo, ctx.agent.phone].filter(Boolean).join(' · ')}` });
  }
  return { blocks, footer: x.pdf.footer };
}
