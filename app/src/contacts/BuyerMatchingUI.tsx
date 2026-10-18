// Buyer Matching (Change 013). The home card opens a list of buyers; choosing one (or "Matching Properties" on a buyer's
// own record) opens that buyer's saved matches and the properties to choose from, shown with the Subsale List's own grid
// cards and filters. Several properties can be ticked and saved (or removed) in one go; the matches are stored on the
// buyer's record (Contact.savedMatches), so they work offline, sync and are still there when the buyer is reopened.
// A match is only a recommendation: nothing here ever sends a WhatsApp, an email or a PDF.
// Archived properties are left out of the choices unless "Show Archived Properties" is set to Yes, and are then marked
// Archived. A saved match whose property was later archived, sold, rented or taken off the market stays saved and says so.
import { useRemembered } from '../ui/screenMemory';
import { useMemo, useState } from 'react';
import type { Lang } from '../i18n';
import { useApp } from '../data/useStore';
import { Go } from '../nav';
import { BUYER_ROLES, Contact } from '../data/types';
import { Filters, Listing, TYPES, applyFilters, rmShort } from '../listing/model';
import { listingStrings, typeLabel } from '../listing/strings';
import { GridCardButton } from '../listing/ListingUI';
import { c11Strings } from '../ui/c011Strings';
import { matchStrings } from './matchStrings';
import { matchesForBuyer, offerable } from '../domain/matching';
import { LeadDot, Empty } from '../ui/common';
import { MoneyInput } from '../ui/MoneyInput';
import { useToast } from '../ui/toast';
import { can, visible } from '../team/access';

const isBuyer = (c: Contact) => c.roles.some(r => BUYER_ROLES.includes(r));

/** The home card: choose a buyer. */
export function BuyerMatchingScreen({ lang, go }: { lang: Lang; go: Go }) {
  const { state } = useApp();
  const t = c11Strings[lang].match;
  const buyers = visible(state, 'contacts', state.contacts).filter(isBuyer).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <section className="stack" data-testid="buyer-matching">
      <p className="notice">{t.tileIntro}</p>
      {buyers.length === 0 ? <Empty>{t.noBuyers}</Empty> : (
        <div className="card stack-sm">
          {buyers.map(b => (
            <button key={b.id} className="link-row" data-testid="bm-buyer" onClick={() => go({ name: 'buyerMatches', contactId: b.id })}>
              <span className="between"><strong>{b.name}</strong><LeadDot lang={lang} status={b.leadStatus} /></span>
              <small className="muted">{t.buyerMatches((b.savedMatches ?? []).length)}</small>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

/** Why a property is not offered as available, or undefined when it is. */
const unavailableWhy = (p: Listing, s: ReturnType<typeof labels>) => (p.archived ? s.archived : !offerable(p) ? (p.status ? s.status(p.status) : s.unavailable) : undefined);
const labels = (lang: Lang) => {
  const t = c11Strings[lang].match; const ls = listingStrings[lang];
  return { archived: t.archivedTag, unavailable: t.unavailable, status: (k: string) => ls.status[k] ?? t.unavailable };
};

/** One buyer's saved matches and the properties to choose from. */
export function BuyerMatchesScreen({ lang, contactId, go }: { lang: Lang; contactId: string; go: Go }) {
  const { state, store } = useApp();
  const toast = useToast();
  const t = c11Strings[lang].match;
  const ls = listingStrings[lang];
  const ms = matchStrings[lang];
  const lab = labels(lang);
  const buyer = state.contacts.find(c => c.id === contactId);
  const req = buyer?.requirements?.find(r => r.purpose || r.budgetMax !== undefined || r.budgetMin !== undefined);
  // Start from what the buyer asked for (purpose and budget); the agent can change every filter.
  const [f, setF] = useRemembered<Filters>('filters', () => ({
    purpose: req?.purpose === 'rent' ? 'rent' : req?.purpose === 'sale' ? 'sale' : undefined,
    priceMin: req?.budgetMin, priceMax: req?.budgetMax,
    type: req?.types?.length === 1 ? req.types[0] : undefined,
  }));
  const [showArchived, setShowArchived] = useRemembered('archived', false);
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [drop, setDrop] = useState<Set<string>>(new Set());
  const props = visible(state, 'properties', state.properties);
  const saved = buyer?.savedMatches ?? [];
  const savedIds = new Set(saved.map(m => m.propertyId));
  const levels = useMemo(() => (buyer ? new Map(matchesForBuyer(buyer, props.filter(p => !p.archived)).map(m => [m.property.id, m.level])) : new Map()), [buyer, props]);
  const candidates = useMemo(() => {
    // New recommendations are taken from available properties; archived ones only when the agent asks to see them.
    const pool = props.filter(p => (showArchived ? true : !p.archived) && (p.archived || offerable(p)) && p.sample === buyer?.sample);
    const RANK: Record<string, number> = { exact: 0, partial: 1, near: 2 };
    return applyFilters(pool, f).sort((a, b) => (RANK[levels.get(a.id) ?? ''] ?? 9) - (RANK[levels.get(b.id) ?? ''] ?? 9) || (a.archived ? 1 : 0) - (b.archived ? 1 : 0));
  }, [props, f, showArchived, levels, buyer?.sample]);

  if (!buyer) return <section className="stack"><p className="warn-text">{t.noBuyers}</p></section>;
  const mayEdit = can(state, 'edit', 'contacts', buyer.id);
  const set = (patch: Partial<Filters>) => setF(prev => ({ ...prev, ...patch }));
  const toggle = (which: 'pick' | 'drop', id: string) => (which === 'pick' ? setPick : setDrop)(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  function write(next: Contact['savedMatches'], done: string) {
    const now = store.getState();
    const cur = now.contacts.find(c => c.id === contactId);
    if (!cur || !can(now, 'edit', 'contacts', cur.id)) { toast(t.notAllowed, 'error'); return false; }
    store.upsert('contacts', { ...cur, savedMatches: next && next.length ? next : undefined });
    toast(done);
    return true;
  }
  function saveSelected() {
    const cur = store.getState().contacts.find(c => c.id === contactId);
    const have = cur?.savedMatches ?? [];
    const at = Date.now();
    const add = [...pick].filter(id => !have.some(m => m.propertyId === id));
    if (write([...have, ...add.map(propertyId => ({ propertyId, at }))], t.savedToast(add.length))) setPick(new Set());
  }
  function removeSelected() {
    const cur = store.getState().contacts.find(c => c.id === contactId);
    const have = cur?.savedMatches ?? [];
    const n = have.filter(m => drop.has(m.propertyId)).length;
    if (write(have.filter(m => !drop.has(m.propertyId)), t.removedToast(n))) setDrop(new Set());
  }

  const tag = (p: Listing) => {
    const why = unavailableWhy(p, lab);
    const lv = levels.get(p.id);
    return (
      <span className="bm-tags">
        {why && <span className={`bm-tag ${p.archived ? 'bm-archived' : 'bm-unavailable'}`} data-testid={p.archived ? 'bm-archived-tag' : 'bm-unavailable-tag'}>{why}</span>}
        {!why && lv && lv !== 'none' && <span className="bm-tag bm-level" data-level={lv}>{ms.levels[lv as 'exact']}</span>}
      </span>
    );
  };

  return (
    <section className="stack" data-testid="buyer-matches" data-contact={buyer.id}>
      <div className="card stack-sm">
        <div className="between"><strong className="bm-buyer-name">{buyer.name}</strong><LeadDot lang={lang} status={buyer.leadStatus} /></div>
        {req && (req.budgetMin !== undefined || req.budgetMax !== undefined) && <small className="muted">{t.budget(`${req.budgetMin !== undefined ? rmShort(req.budgetMin) : ''}${req.budgetMin !== undefined && req.budgetMax !== undefined ? ' – ' : req.budgetMax !== undefined ? '≤ ' : '≥ '}${req.budgetMax !== undefined ? rmShort(req.budgetMax) : ''}`)}</small>}
        <small className="muted">{t.note}</small>
      </div>

      <h2>{t.saved} <span className="count">{saved.length}</span></h2>
      {saved.length === 0 ? <Empty>{t.savedNone}</Empty> : (
        <>
          <ul className="lc-grid" data-testid="bm-saved">
            {saved.map(m => {
              const p = state.properties.find(x => x.id === m.propertyId);
              if (!p) return null;
              return (
                <li key={m.propertyId} data-testid="bm-saved-card" data-id={p.id}>
                  <GridCardButton l={p} s={ls} onOpen={() => go({ name: 'listingDetail', id: p.id })} extra={tag(p)} />
                  {mayEdit && <label className="check bm-check"><input type="checkbox" checked={drop.has(p.id)} onChange={() => toggle('drop', p.id)} aria-label={t.select(p.ref ?? p.id)} data-testid="bm-drop" /> <span>{t.removeN(0)}</span></label>}
                </li>
              );
            })}
          </ul>
          {mayEdit && <div className="btn-row"><button className="btn secondary danger-text" disabled={!drop.size} onClick={removeSelected} data-testid="bm-remove">{t.removeN(drop.size)}</button></div>}
        </>
      )}

      <h2>{t.candidates}</h2>
      <div className="card stack-sm" data-testid="bm-filters">
        <input aria-label={ls.f.location} placeholder={ls.search} value={f.location ?? ''} onChange={e => set({ location: e.target.value || undefined })} data-testid="bm-search" />
        <div className="filter-grid">
          <label>{ls.f.purpose}
            <select aria-label={ls.f.purpose} value={f.purpose ?? ''} onChange={e => set({ purpose: (e.target.value || undefined) as Filters['purpose'] })} data-testid="bm-purpose">
              <option value="">{ls.any}</option>{(['sale', 'rent'] as const).map(x => <option key={x} value={x}>{ls.purposeFilter[x]}</option>)}
            </select>
          </label>
          <label>{ls.f.type}
            <select aria-label={ls.f.type} value={f.type ?? ''} onChange={e => set({ type: e.target.value || undefined })} data-testid="bm-type">
              <option value="">{ls.any}</option>{TYPES.map(x => <option key={x} value={x}>{typeLabel(ls, x)}</option>)}
            </select>
          </label>
        </div>
        <div className="two">
          <label className="ff">{ls.min}<MoneyInput aria-label={`${ls.f.price} ${ls.min}`} value={f.priceMin} onChange={n => set({ priceMin: n })} /></label>
          <label className="ff">{ls.max}<MoneyInput aria-label={`${ls.f.price} ${ls.max}`} value={f.priceMax} onChange={n => set({ priceMax: n })} /></label>
        </div>
        <label className="ff">{t.showArchived}
          <select value={showArchived ? 'yes' : 'no'} onChange={e => setShowArchived(e.target.value === 'yes')} data-testid="bm-show-archived">
            <option value="no">{t.archivedNo}</option><option value="yes">{t.archivedYes}</option>
          </select>
        </label>
        <div className="btn-row"><button className="btn secondary" onClick={() => setF({})} data-testid="bm-clear">{ls.clear}</button></div>
      </div>
      <div className="small muted" data-testid="bm-count">{ls.results(candidates.length, props.filter(p => !p.archived).length)}</div>
      {candidates.length === 0 ? <Empty>{t.noneFound}</Empty> : (
        <ul className="lc-grid" data-testid="bm-candidates">
          {candidates.map(p => {
            const already = savedIds.has(p.id);
            return (
              <li key={p.id} data-testid="bm-card" data-id={p.id} data-archived={p.archived ? 'yes' : undefined}>
                <GridCardButton l={p} s={ls} onOpen={() => go({ name: 'listingDetail', id: p.id })} extra={tag(p)} />
                {already ? <small className="ok-text bm-check">✓ {t.alreadySaved}</small> : mayEdit && (
                  <label className="check bm-check"><input type="checkbox" checked={pick.has(p.id)} onChange={() => toggle('pick', p.id)} aria-label={t.select(p.ref ?? p.id)} data-testid="bm-pick" /> <span>{t.select('')}</span></label>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {mayEdit && (
        <div className="save-bar floating" data-testid="bm-savebar">
          <div className="btn-row"><button className="btn primary" disabled={!pick.size} onClick={saveSelected} data-testid="bm-save">{t.saveN(pick.size)}</button></div>
        </div>
      )}
    </section>
  );
}
