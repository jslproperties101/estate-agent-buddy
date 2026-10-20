// Button 12 — AI Assisted Command: the central place to capture information by voice or typing.
// JoyChange002 Change 48: minimal by default. Change 50: the review shows which property (and contact) the words are about.
// JoyChange003 Batch E:
//  - 65: the logo and app name sit under the title bar, centred, about a tenth of the screen, and scroll away.
//  - 56 / 59: a full-width text box; under it, centred, the microphone, Clear (empties the box and the results, stops any
//    recording and forgets the selected record, with no question) and the gold AI Process button.
//  - 55: the phone's recogniser is made ready when the screen opens (SpeechBox warmUp); "Listening…" shows only when it is.
//  - 64: "open property / vendor / buyer list" shows that list right under the three buttons; the one chosen becomes the
//    selected record, and follow-ups ("change the price of this…", "WhatsApp this buyer…") are about it.
//  - 60 / 61: one sentence can hold several commands; each becomes a card that says what was understood. Nothing is saved
//    until Confirm, and Undo stays for a short time after. A new listing still opens the prefilled form (Change 58).
//  - 62: the last 10 commands and suggestions from the saved data. 63: one-tap Call and WhatsApp on people found.
//  - 57: "How to use and examples": eight or more examples per section, in shiny gold boxes with clear gaps.
// The understanding itself is in dispatch.ts / assistant.ts (no browser needed, so it is tested).
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { c048Strings } from './c048Strings';
import { c056Strings } from './c056Strings';
import { Ranked, rankContacts, preselect } from './match';
import { PropertyMatchPicker, ContactMatchPicker, NEW } from './MatchPickers';
import { WhatsAppPicker } from './WhatsAppPicker';
import { interpretAll, NAVIGATES, type Ctx, type Data, type Step } from './dispatch';
import { pushRecent, smartChips, waDigits, type ListKind, type WaTopic } from './assistant';
import { correctTerms, vocabularyFrom } from './correct';
import { can } from '../team/access';
import { strings, Lang } from '../i18n';
import { useApp } from '../data/useStore';
import { newId } from '../data/store';
import { Go } from '../nav';
import { changeLabel, showValue } from '../listing/PropertyVoice';
import { prefillFrom } from '../listing/ListingUI';
import { Listing, cardTitle, normalisePhone } from '../listing/model';
import { listingStrings } from '../listing/strings';
import { Change, ChangeKey, applyChanges, currentValue } from '../listing/commands';
import { LEAD_COLOURS, BUYER_ROLES, VENDOR_ROLES, type Appointment, type Contact, type Task } from '../data/types';
import { DEFAULT_APPT_REMINDERS, DEFAULT_TASK_REMINDERS } from '../domain/workflow';
import { fmtDateTime } from '../lib/dates';
import { agendaStrings } from '../agenda/strings';
import { PropertyThumb } from '../ui/PropertyPicker';
import { SpeechBox } from '../ui/SpeechBox';
import { IconLogo } from '../icons';
import { titled3 } from '../lib/titleCase';
import { usage } from '../usage/logger';

export const voiceCommandStrings = titled3( {
  en: {
    more: {
      target: 'Proposed change', now: 'Now', next: 'New', apply: 'Apply change', cancel: 'Cancel', applied: 'Property updated.', choose: 'More than one property fits. Choose one, or say its reference (for example P1001).',
      same: 'The property already has these values. Nothing to change.', notFound: 'No property matches what you said. Say its reference, for example P1001.', noTarget: 'Which property? Say its reference (for example P1001) or the type and place (for example “the factory in Salak Tinggi”).',
      buyers: 'Buyers and tenants that fit', buyersNone: 'No buyer or tenant matches. Buyers are matched from their notes and the properties they asked about.', buyersHow: 'Matched from each buyer’s notes and the properties they asked about or viewed. Check each one before contacting.', open: 'Open', want: 'Looking for', lead: 'Lead',
    },
  },
  bm: {
    more: {
      target: 'Perubahan dicadangkan', now: 'Sekarang', next: 'Baharu', apply: 'Guna perubahan', cancel: 'Batal', applied: 'Hartanah dikemas kini.', choose: 'Lebih daripada satu hartanah sepadan. Pilih satu, atau sebut rujukannya (contohnya P1001).',
      same: 'Hartanah sudah mempunyai nilai ini. Tiada apa untuk diubah.', notFound: 'Tiada hartanah sepadan dengan apa yang anda sebut. Sebut rujukannya, contohnya P1001.', noTarget: 'Hartanah yang mana? Sebut rujukannya (contohnya P1001) atau jenis dan tempat (contohnya “kilang di Salak Tinggi”).',
      buyers: 'Pembeli dan penyewa yang sepadan', buyersNone: 'Tiada pembeli atau penyewa sepadan. Pembeli dipadankan daripada nota mereka dan hartanah yang mereka tanya.', buyersHow: 'Dipadankan daripada nota setiap pembeli dan hartanah yang mereka tanya atau lawati. Semak setiap seorang sebelum menghubungi.', open: 'Buka', want: 'Mencari', lead: 'Prospek',
    },
  },
  zh: {
    more: {
      target: '建议的更改', now: '现在', next: '新值', apply: '应用更改', cancel: '取消', applied: '房产已更新。', choose: '有多个房产符合。请选择一个，或说出它的编号（例如 P1001）。',
      same: '房产已是这些数值。没有需要更改的内容。', notFound: '没有房产符合您所说的。请说出它的编号，例如 P1001。', noTarget: '是哪个房产？请说出编号（例如 P1001）或类型和地点（例如 “the factory in Salak Tinggi”）。',
      buyers: '符合的买家和租客', buyersNone: '没有符合的买家或租客。买家是根据他们的备注和所询问的房产来匹配的。', buyersHow: '根据每位买家的备注，以及他们询问或看过的房产来匹配。联系前请逐一核对。', open: '打开', want: '想找', lead: '客户级别',
    },
  },
});

/** Change 60: how long Undo stays after a change is saved. */
export const UNDO_MS = 10_000;

/** Details an agent usually states for a new property; the ones not said are listed, so nothing looks invented. */
const CREATE_EXPECTED: ChangeKey[] = ['type', 'township', 'street', 'landSqft', 'builtUpSqft', 'askingPrice', 'tenure'];

/** Does a later command name this person (after "him" / "her" became the name)? */
function mentions(st: Step, name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return false;
  const said = st.kind === 'task' ? st.cmd.title : st.kind === 'appointment' ? `${st.cmd.who ?? ''} ${st.cmd.title}` : st.kind === 'contactAction' ? st.action.who ?? '' : '';
  return new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(said);
}
const isBuyer = (c: Contact) => c.roles.some(r => BUYER_ROLES.includes(r));
const isVendorC = (c: Contact) => c.roles.some(r => VENDOR_ROLES.includes(r));
const propLabel = (l: Listing) => [l.ref, cardTitle(l)].filter(Boolean).join(' · ');
const joinDT = (d?: string, t?: string) => (d ? (t ? `${d}T${t}` : d) : undefined);

/** What a card hands back to the screen: a line saying what was done, and how to put it back (Change 60). */
type Saved = (message: string, undo?: () => void, ctx?: Ctx) => void;

export function VoiceCommand({ lang, go }: { lang: Lang; go: Go }) {
  const { state, store } = useApp();
  const t = c056Strings[lang];
  const k = c048Strings[lang];
  const [text, setText] = useState('');
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [run, setRun] = useState(0);
  const [closed, setClosed] = useState<Record<number, boolean>>({});
  const [ctx, setCtx] = useState<Ctx>({});
  const [list, setList] = useState<ListKind | null>(null);
  const [howTo, setHowTo] = useState(false);
  const [stopSignal, setStopSignal] = useState(0);
  const [done, setDone] = useState('');
  const [undo, setUndo] = useState<{ run: () => void; n: number } | null>(null);
  const [wa, setWa] = useState<{ contactId: string; propertyId?: string; topic?: WaTopic } | null>(null);
  // The selected record is shown once the agent chose it (from a list or a suggestion) or a confirmed card made it.
  const [showSel, setShowSel] = useState(false);
  // Change 61: a contact confirmed in this sentence; the later commands that name it ("… call him") are linked to it.
  const [made, setMade] = useState<{ index: number; id: string; name: string } | null>(null);

  // Undo stays for a short time only.
  useEffect(() => {
    if (!undo) return;
    const h = setTimeout(() => setUndo(u => (u && u.n === undo.n ? null : u)), UNDO_MS);
    return () => clearTimeout(h);
  }, [undo]);

  // Change 49: the agent's own saved places, so local names heard slightly wrong are corrected.
  const vocab = useMemo(() => vocabularyFrom(state.options, state.properties), [state.options, state.properties]);
  const fix = (heard: string) => correctTerms(heard, vocab);

  const data: Data = useMemo(() => {
    const live = state.properties.filter(p => !p.archived);
    const own = [...(state.options.township ?? []), ...(state.options.city ?? [])].map(o => o.value);
    const fromRecords = live.flatMap(p => [p.township, p.city]).filter((x): x is string => !!x);
    return {
      properties: live, contacts: state.contacts, inquiries: state.inquiries, appointments: state.appointments,
      editable: live.filter(p => can(state, 'edit', 'properties', p.id)),
      places: [...new Set([...own, ...fromRecords])],
    };
  }, [state]);

  function navigate(step: Step) {
    if (step.kind === 'show') { if (step.cmd.what === 'tasks') go({ name: 'todo' }); else go({ name: 'calendar', date: step.cmd.date }); }
    else if (step.kind === 'find') {
      const c = step.cmd;
      go({ name: 'listing', filters: { type: c.type, typeWord: c.typeWord, location: c.area, purpose: c.purpose, priceMin: c.priceMin, priceMax: c.priceMax, bedsMin: c.bedsMin, tenure: c.tenure, status: c.status } });
    } else if (step.kind === 'buyersAll') go({ name: 'contacts', role: 'buyer' });
  }

  function process(said = text) {
    const tx = said.trim();
    if (!tx) return;
    store.setSingleton('meta', { recentCmds: pushRecent(store.getState().meta.recentCmds, tx) });
    setDone(''); setUndo(null); setWa(null); setClosed({}); setMade(null);
    const r = interpretAll(tx, ctx, data);
    usage.command('command.assistant', r.steps.some(s => s.kind !== 'unknown'));   // Stage C: understood or not, never the words
    const openers = r.steps.filter((s): s is Extract<Step, { kind: 'openList' }> => s.kind === 'openList');
    setList(openers.length ? openers[openers.length - 1].list : null);
    const rest = r.steps.filter(s => s.kind !== 'openList');
    // A single "show" / "find" command opens its screen straight away.
    if (rest.length === 1 && !openers.length && NAVIGATES.has(rest[0].kind)) { navigate(rest[0]); return; }
    setSteps(rest.length ? rest : null);
    setRun(x => x + 1);
    setCtx(r.ctx);
  }

  // Change 59: Clear empties the box and the results, stops recording and forgets the selection. No question asked.
  function clearAll() {
    setText(''); setSteps(null); setList(null); setCtx({}); setWa(null); setDone(''); setUndo(null); setClosed({}); setShowSel(false); setMade(null);
    setStopSignal(x => x + 1);
  }

  const saved: Saved = (message, back, next) => {
    setDone(message);
    setUndo(back ? { run: back, n: Date.now() } : null);
    if (next) { setCtx(c => ({ ...c, ...next })); setShowSel(true); }
  };

  const selProp = ctx.propertyId ? state.properties.find(p => p.id === ctx.propertyId) : undefined;
  const selContact = ctx.contactId ? state.contacts.find(c => c.id === ctx.contactId) : undefined;
  const chips = useMemo(() => smartChips(state, new Date(), state.settings.followUpDays ?? 7), [state]);
  const recent = state.meta.recentCmds ?? [];
  const quiet = !steps && !list && !wa;

  return (
    <section className="stack cmd-screen" data-testid="voice-command">
      {/* Change 65: the logo and name from the main screen, under the title bar; it scrolls away with the page. */}
      <h2 className="brand brand-strip cmd-brand" aria-label={strings[lang].appName} data-testid="cmd-brand">
        <IconLogo size={66} big /><span className="wordmark"><span>{strings[lang].appNameA}</span><em>{strings[lang].appNameB}</em></span>
      </h2>

      <div className="stack-sm voice-cmd minimal" data-testid="voice-cmd">
        <SpeechBox lang={lang} value={text} onChange={setText} label={t.textLabel} compact transform={fix} testId="cmd-speech" warmUp stopSignal={stopSignal}
          between={<button type="button" className="btn secondary cmd-clear" onClick={clearAll} data-testid="cmd-clear">{t.clear}</button>}
          after={<button type="button" className="btn primary ai-process" disabled={!text.trim()} onClick={() => process()} data-testid="cmd-process">✦ {t.aiProcess}</button>} />
      </div>

      {/* Change 64: the list asked for, straight under the three buttons. */}
      {list && <ListPicker lang={lang} kind={list} data={data} contacts={state.contacts}
        onPick={(id) => { setCtx(c => (list === 'property' ? { ...c, propertyId: id } : { ...c, contactId: id })); setShowSel(true); setList(null); setWa(null); }}
        onClose={() => setList(null)} />}

      {showSel && (selProp || selContact) && (
        <div className="cmd-selected stack-sm" data-testid="cmd-selected">
          <div className="cmd-sel-row">
            <strong className="cmd-sel-name">{t.selected}: {[selProp && propLabel(selProp), selContact?.name].filter(Boolean).join(' · ')}</strong>
            <div className="cmd-sel-actions">
              {selContact && <QuickActions lang={lang} contact={selContact} compact onWhatsApp={() => setWa(w => (w ? null : { contactId: selContact.id, propertyId: selProp?.id }))} />}
              <button type="button" className="icon-btn small-icon" aria-label={t.open} title={t.open} data-testid="cmd-selected-open"
                onClick={() => (selContact ? go({ name: 'contactDetail', id: selContact.id }) : selProp && go({ name: 'listingDetail', id: selProp.id }))}>↗</button>
              <button type="button" className="icon-btn small-icon" aria-label={t.clearSelected} title={t.clearSelected} data-testid="cmd-selected-clear" onClick={() => { setCtx({}); setShowSel(false); setWa(null); }}>✕</button>
            </div>
          </div>
          {!steps && <small className="muted" data-testid="cmd-after-pick">{t.afterPick}</small>}
        </div>
      )}

      {wa && (() => {
        const c = state.contacts.find(x => x.id === wa.contactId);
        return c ? <WhatsAppPicker lang={lang} contact={c} property={wa.propertyId ? state.properties.find(p => p.id === wa.propertyId) : undefined} topic={wa.topic} /> : null;
      })()}

      {(done || undo) && (
        <div className="cmd-done" role="status">
          <span data-testid="voice-done">{done}</span>
          {undo && <button type="button" className="btn small secondary" data-testid="cmd-undo" onClick={() => { undo.run(); setUndo(null); setDone(t.undone); }}>↶ {t.undo}</button>}
        </div>
      )}

      {steps && steps.map((st, i) => !closed[i] && (
        <StepCard key={`${run}-${i}`} lang={lang} step={st} index={i} count={steps.length} data={data} go={go} navigate={navigate}
          linkContact={made && i > made.index && mentions(st, made.name) ? made.id : undefined}
          onSaved={(msg, back, next) => { saved(msg, back, next); if (st.kind === 'contact' && next?.contactId) setMade({ index: i, id: next.contactId, name: st.cmd.name ?? '' }); }}
          onClose={() => setClosed(c => ({ ...c, [i]: true }))} />
      ))}

      {/* Change 62: suggestions from the saved data, and the last commands. Only when nothing else is open. */}
      {quiet && chips.length > 0 && (
        <div className="stack-sm" data-testid="cmd-chips">
          <small className="muted">{t.suggestions}</small>
          <div className="cmd-chips">
            {chips.map((c, i) => {
              const label = c.kind === 'follow' ? t.chipFollow(c.name, c.days) : c.kind === 'viewing' ? t.chipViewing([c.name, c.place].filter(Boolean).join(' · '), c.time) : t.chipTasks(c.count);
              const tap = () => {
                if (c.kind === 'tasks') { go({ name: 'todo' }); return; }
                if (c.kind === 'follow') { setCtx({ contactId: c.contactId }); setShowSel(true); setWa({ contactId: c.contactId, topic: 'followup' }); return; }
                if (c.contactId) { setCtx({ contactId: c.contactId, propertyId: c.propertyId }); setShowSel(true); setWa({ contactId: c.contactId, propertyId: c.propertyId, topic: 'appointment' }); }
                else go({ name: 'calendar' });
              };
              return <button key={i} type="button" className="cmd-chip" data-testid="cmd-chip" data-kind={c.kind} onClick={tap}>{label}</button>;
            })}
          </div>
        </div>
      )}
      {quiet && recent.length > 0 && (
        <details className="cmd-recent" data-testid="cmd-recent">
          <summary>{t.recent} ({recent.length})</summary>
          <div className="stack-sm">
            {recent.map(r => (
              <div key={r} className="cmd-recent-row" data-testid="cmd-recent-row">
                <button type="button" className="cmd-recent-text" onClick={() => setText(r)} data-testid="cmd-recent-edit">{r}</button>
                <button type="button" className="btn small secondary" onClick={() => { setText(r); process(r); }} data-testid="cmd-recent-run">{t.run}</button>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Change 48 / 57: "How to use and examples" opens below its button and pushes the rest down. */}
      <button type="button" className="btn secondary howto-btn" aria-expanded={howTo} data-testid="cmd-howto" onClick={() => setHowTo(x => !x)}>{howTo ? t.hideHowTo : t.howTo}</button>
      {howTo && (
        <div className="card stack-sm howto" data-testid="cmd-howto-list">
          <p className="small">{t.howIntro}</p>
          <small className="muted">{t.tapToUse}</small>
          {t.groups.map(g => (
            <div key={g.title} className="howto-group" data-testid="cmd-howto-group">
              <strong className="howto-title">{g.title}</strong>
              {g.examples.map(x => (
                <button key={x} type="button" className="example gold-example" data-testid="cmd-example" onClick={() => setText(x)}>“{x}”</button>
              ))}
            </div>
          ))}
          <small className="muted" data-testid="voice-cmd-lang-note">{t.note}</small>
          <button className="btn small secondary" onClick={() => go({ name: 'voiceDiag' })} data-testid="open-voice-diag">🩺 {k.diag}</button>
        </div>
      )}
    </section>
  );
}

/** Change 63: one tap to call or WhatsApp a person found or chosen. */
function QuickActions({ lang, contact, onWhatsApp, onOpen, compact }: { lang: Lang; contact: Contact; onWhatsApp: () => void; onOpen?: () => void; compact?: boolean }) {
  const t = c056Strings[lang];
  const phone = waDigits(contact.phone);
  const cls = compact ? 'icon-btn small-icon' : 'btn small secondary';
  return <>
    {phone.length >= 9
      ? <a className={cls} href={`tel:+${phone}`} aria-label={t.call} title={t.call} data-testid="qa-call">📞{compact ? null : ` ${t.call}`}</a>
      : <button type="button" className={cls} disabled aria-label={t.call} title={t.noPhone} data-testid="qa-call">📞{compact ? null : ` ${t.call}`}</button>}
    <button type="button" className={cls} onClick={onWhatsApp} aria-label={t.whatsapp} title={t.whatsapp} data-testid="qa-whatsapp">💬{compact ? null : ` ${t.whatsapp}`}</button>
    {onOpen && <button type="button" className={cls} onClick={onOpen} data-testid="qa-open">{t.open}</button>}
  </>;
}

/** Change 64: the property, vendor or buyer list, with a search box. */
function ListPicker({ lang, kind, data, contacts, onPick, onClose }: { lang: Lang; kind: ListKind; data: Data; contacts: Contact[]; onPick: (id: string) => void; onClose: () => void }) {
  const t = c056Strings[lang];
  const [q, setQ] = useState('');
  const low = q.trim().toLowerCase();
  const title = kind === 'property' ? t.chooseProperty : kind === 'vendor' ? t.chooseVendor : t.chooseBuyer;
  const props = kind === 'property' ? data.properties.filter(p => !low || `${p.ref ?? ''} ${cardTitle(p)} ${p.township ?? ''} ${p.city ?? ''}`.toLowerCase().includes(low)) : [];
  const people = kind === 'property' ? [] : contacts.filter(c => (kind === 'vendor' ? isVendorC(c) : isBuyer(c)) && (!low || `${c.name} ${c.phone ?? ''}`.toLowerCase().includes(low)))
    .sort((a, b) => a.name.localeCompare(b.name));
  const none = kind === 'property' ? !props.length : !people.length;
  return (
    <div className="card stack-sm cmd-list" data-testid="cmd-list" data-kind={kind}>
      <div className="between"><strong>{title}</strong><button type="button" className="opt-icon" aria-label={t.dismiss} title={t.dismiss} onClick={onClose} data-testid="cmd-list-close">✕</button></div>
      <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder={t.search} aria-label={t.search} data-testid="cmd-list-search" />
      <div className="pp-list cmd-list-rows" role="listbox" aria-label={title}>
        {props.map(p => (
          <button key={p.id} type="button" role="option" aria-selected={false} className="pp-opt" data-testid="cmd-list-row" data-id={p.id} onClick={() => onPick(p.id)}>
            <span className="pp-row-inner"><PropertyThumb l={p} /><span className="pp-text"><span className="pp-addr">{cardTitle(p) || '—'}</span><strong className="pp-ref">{p.ref ?? ''}</strong></span></span>
          </button>
        ))}
        {people.map(c => (
          <button key={c.id} type="button" role="option" aria-selected={false} className="pp-opt" data-testid="cmd-list-row" data-id={c.id} onClick={() => onPick(c.id)}>
            <span className="pp-row-inner"><span className="pp-text"><strong>{c.name}</strong><small className="muted">{c.phone ?? ''}</small></span></span>
          </button>
        ))}
        {none && <small className="muted" data-testid="cmd-list-empty">{t.nothing}</small>}
      </div>
    </div>
  );
}

function Rows({ rows }: { rows: [string, ReactNode][] }) {
  // Change 84: "Label - Value" side by side.
  return <div className="cmd-rows">{rows.map(([l, v]) => <div key={l} className="kf"><span>{l}</span><strong>{v}</strong></div>)}</div>;
}

/** Change 60 / 61: one command of the sentence, as a card. Nothing is saved until Confirm. */
function StepCard({ lang, step: step0, index, count, data, go, navigate, onSaved, onClose, linkContact }: {
  lang: Lang; step: Step; index: number; count: number; data: Data; go: Go; navigate: (s: Step) => void; onSaved: Saved; onClose: () => void;
  /** Change 61: the contact confirmed earlier in the same sentence, when this command names it. */
  linkContact?: string;
}) {
  const step: Step = linkContact && (step0.kind === 'task' || step0.kind === 'appointment' || step0.kind === 'contactAction') ? { ...step0, contactId: linkContact } as Step : step0;
  const t = c056Strings[lang];
  const { state, store } = useApp();
  const head = count > 1 ? <small className="muted cmd-part" data-testid="step-part">{t.partOf(index + 1, count)}</small> : null;
  const whenText = (d?: string, tm?: string) => (d ? fmtDateTime(joinDT(d, tm), lang) : t.notSaid);
  const contactName = (id?: string) => (id ? state.contacts.find(c => c.id === id)?.name : undefined);
  const propName = (id?: string) => { const p = id ? state.properties.find(x => x.id === id) : undefined; return p ? propLabel(p) : undefined; };
  const card = (testId: string, title: string, body: ReactNode, actions: ReactNode) => (
    <div className="proposal stack-sm step-card" data-testid={testId} data-step={step.kind}>
      {head}
      <strong>{title}</strong>
      {body}
      <div className="two">{actions}</div>
    </div>
  );
  const cancel = <button type="button" className="btn secondary" onClick={onClose} data-testid="step-cancel">{t.cancel}</button>;

  switch (step.kind) {
    case 'target': return <TargetCard lang={lang} step={step} head={head} onSaved={onSaved} onClose={onClose} go={go} />;
    case 'create': return <CreateCard lang={lang} step={step} head={head} data={data} go={go} onClose={onClose} />;
    case 'buyers': return <BuyersCard lang={lang} step={step} head={head} go={go} onClose={onClose} />;
    case 'contactAction': return <ContactActionCard lang={lang} step={step} head={head} data={data} onClose={onClose} />;
    case 'show': case 'find': case 'buyersAll': {
      const label = step.kind === 'find' ? t.showResults : step.kind === 'buyersAll' ? t.showBuyers : step.cmd.what === 'tasks' ? t.showTasks : step.cmd.what === 'viewings' ? t.showViewings : t.showAppts;
      return card('step-open', label, <small className="muted">“{step.text}”</small>,
        <>{cancel}<button type="button" className="btn primary" onClick={() => navigate(step)} data-testid="step-open-btn">{t.showIt}</button></>);
    }
    case 'task': {
      const c = step.cmd;
      const save = () => {
        const now = Date.now();
        const rec: Task = { id: newId(), created: now, updated: now, title: c.title, due: joinDT(c.date, c.time), priority: c.priority ?? 'medium', done: false, kind: 'task', reminders: DEFAULT_TASK_REMINDERS, contactId: step.contactId };
        store.upsert('tasks', rec);
        onSaved(t.saved(t.task), () => store.remove('tasks', rec.id), step.contactId ? { contactId: step.contactId } : undefined);
        onClose();
      };
      return card('step-task', t.task,
        <Rows rows={[[t.titleL, c.title], [t.when, whenText(c.date, c.time)], ...(step.contactId ? [[t.whoL, contactName(step.contactId)] as [string, ReactNode]] : [])]} />,
        <>
          <button type="button" className="btn secondary" onClick={() => go({ name: 'taskForm', prefill: { title: c.title, due: joinDT(c.date, c.time), priority: c.priority ?? 'medium', contactId: step.contactId } })} data-testid="step-edit">{t.editInForm}</button>
          <button type="button" className="btn primary" onClick={save} data-testid="step-confirm">{t.confirm}</button>
        </>);
    }
    case 'appointment': {
      const c = step.cmd;
      const needsProperty = c.apptKind === 'viewing' && !step.propertyId;
      const save = () => {
        const now = Date.now();
        const rec: Appointment = {
          id: newId(), created: now, updated: now, kind: c.apptKind, title: c.apptKind === 'viewing' ? undefined : c.title || undefined, start: joinDT(c.date, c.time),
          status: c.date && c.time ? 'scheduled' : 'pending', propertyId: step.propertyId, contactId: step.contactId, reminders: DEFAULT_APPT_REMINDERS, durationMin: 60,
        };
        store.upsert('appointments', rec);
        onSaved(t.saved(t.appointment), () => store.remove('appointments', rec.id), { propertyId: step.propertyId, contactId: step.contactId });
        onClose();
      };
      const kindLabel = agendaStrings[lang].appt.kinds[c.apptKind] ?? c.apptKind;
      return card('step-appointment', t.appointment,
        <>
          <Rows rows={[[t.roleL, kindLabel], ...(c.apptKind === 'viewing' ? [] : [[t.titleL, c.title || t.notSaid] as [string, ReactNode]]), [t.when, whenText(c.date, c.time)],
            [t.propertyL, propName(step.propertyId) ?? t.notSaid], [t.whoL, contactName(step.contactId) ?? c.who ?? t.notSaid]]} />
          {needsProperty && <small className="warn-text" data-testid="step-need-property">{t.needProperty}</small>}
        </>,
        <>
          <button type="button" className="btn secondary" onClick={() => go({ name: 'apptForm', kind: c.apptKind, date: c.date, time: c.time, title: c.apptKind === 'viewing' ? undefined : c.title || undefined, propertyId: step.propertyId, contactId: step.contactId })} data-testid="step-edit">{t.editInForm}</button>
          <button type="button" className="btn primary" disabled={needsProperty} onClick={save} data-testid="step-confirm">{t.confirm}</button>
        </>);
    }
    case 'contact': {
      const c = step.cmd;
      const existing = step.existing ? state.contacts.find(x => x.id === step.existing) : undefined;
      const phone = normalisePhone(c.phone);
      const save = () => {
        const now = Date.now();
        const rec: Contact = { id: newId(), created: now, updated: now, name: c.name ?? '', phone, roles: [c.role], leadStatus: c.role === 'buyer' ? 'warm' : undefined, vendorStatus: c.role === 'vendor' ? 'pending_info' : undefined };
        store.upsert('contacts', rec);
        onSaved(t.saved(t.contact), () => store.remove('contacts', rec.id), { contactId: rec.id });
        onClose();
      };
      return card('step-contact', t.contact,
        <>
          <Rows rows={[[t.roleL, c.role === 'buyer' ? t.buyer : t.vendor], [t.nameL, c.name ?? t.notSaid], [t.phoneL, phone ?? t.notSaid]]} />
          {existing && <div className="stack-sm"><small className="warn-text" data-testid="step-contact-exists">{t.alreadySaved(existing.name)}</small>
            <button type="button" className="btn small secondary" onClick={() => go({ name: 'contactDetail', id: existing.id })} data-testid="step-open-existing">{t.openSaved}</button></div>}
        </>,
        <>
          <button type="button" className="btn secondary" onClick={() => go({ name: 'contactForm', role: c.role, prefill: { name: c.name, phone } })} data-testid="step-edit">{t.editInForm}</button>
          <button type="button" className="btn primary" disabled={!c.name} onClick={save} data-testid="step-confirm">{t.confirm}</button>
        </>);
    }
    case 'openList': return null;
    default:
      return (
        <div className="proposal stack-sm step-card" data-testid="step-unknown" data-step="unknown">
          {head}
          <small className="muted">“{step.text}”</small>
          <p className="warn-text">{t.unknown}</p>
          <button type="button" className="btn small ghost" onClick={onClose}>{t.dismiss}</button>
        </div>
      );
  }
}

/** A change to a saved property (status, price, rent…): the property is chosen in the picture dropdown (Change 50), the
 *  changes are ticked, Apply saves them and Undo puts the property back (Change 60). */
function TargetCard({ lang, step, head, onSaved, onClose, go }: { lang: Lang; step: Extract<Step, { kind: 'target' }>; head: ReactNode; onSaved: Saved; onClose: () => void; go: Go }) {
  const { store } = useApp();
  const m = voiceCommandStrings[lang].more;
  const k = c048Strings[lang];
  const s = listingStrings[lang];
  const [sel, setSel] = useState(step.first ?? NEW);
  const [ticked, setTicked] = useState<Record<string, boolean>>(() => Object.fromEntries(step.changes.map(c => [c.key, true])));
  const chosen = step.ranked.find(r => r.item.id === sel)?.item;
  const real = chosen ? step.changes.filter(c => currentValue(chosen, c.key) !== c.value) : step.changes;
  function apply(l: Listing) {
    const use = real.filter(c => ticked[c.key]);
    if (!use.length) return;
    const before = store.getState().properties.find(p => p.id === l.id) ?? l;
    // Same save path as the property's own voice box: the change is added to the property's change history.
    const next = applyChanges(before, use);
    store.upsert('properties', { ...next, history: [{ at: Date.now(), source: 'voice', summary: use.map(x => x.key).join(', ') }, ...(before.history ?? [])] });
    onSaved(m.applied, () => store.upsert('properties', before), { propertyId: l.id });
    onClose();
  }
  return (
    <div className="proposal stack-sm step-card" data-testid="target-panel" data-step="target">
      {head}
      <strong>{m.target}</strong>
      <PropertyMatchPicker lang={lang} ranked={step.ranked} value={sel} onChange={v => { setSel(v); setTicked(Object.fromEntries(step.changes.map(c => [c.key, true]))); }} />
      {chosen && <small className="muted" data-testid="target-property">{propLabel(chosen)}</small>}
      {chosen && !real.length && <p data-testid="target-same">{propLabel(chosen)}: {m.same}</p>}
      {!chosen && step.result.kind === 'none' && <p className="warn-text" role="status" data-testid="target-none">{step.result.reason === 'notFound' ? m.notFound : m.noTarget}</p>}
      {step.result.kind === 'choose' && chosen && <p role="status" className="muted" data-testid="target-choose">{m.choose}</p>}
      {real.length > 0 && (
        <ul className="prop-list">
          {real.map(c => (
            <li key={c.key} className={ticked[c.key] ? 'on' : ''}>
              <label className="prop-row">
                <input type="checkbox" checked={!!ticked[c.key]} onChange={e => setTicked(v => ({ ...v, [c.key]: e.target.checked }))} aria-label={changeLabel(s, c.key)} data-testid={`target-${c.key}`} />
                <span className="prop-main">
                  <span className="prop-label">{changeLabel(s, c.key)}</span>
                  {chosen && <span className="prop-before">{m.now}: {showValue(s, c.key, currentValue(chosen, c.key), lang)}</span>}
                  <span className="prop-after">{m.next}: {showValue(s, c.key, c.value, lang)}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <div className="two">
        <button className="btn secondary" onClick={onClose} data-testid="target-cancel">{m.cancel}</button>
        {chosen
          ? <button className="btn primary" disabled={!real.some(c => ticked[c.key])} onClick={() => apply(chosen)} data-testid="target-apply">{m.apply}</button>
          : <button className="btn primary" disabled={!step.changes.some(c => ticked[c.key])} data-testid="target-new"
              onClick={() => go({ name: 'listingForm', prefill: prefillFrom(step.changes.filter(c => ticked[c.key])) })}>{k.toForm}</button>}
      </div>
    </div>
  );
}

/** Change 58: a new listing opens the form with what was understood filled in, for the agent to check and save. The
 *  property and contact it may really be about are offered first (Change 50). */
function CreateCard({ lang, step, head, data, go, onClose }: { lang: Lang; step: Extract<Step, { kind: 'create' }>; head: ReactNode; data: Data; go: Go; onClose: () => void }) {
  const s = listingStrings[lang];
  const v = s.voice;
  const k = c048Strings[lang];
  const changes = step.cmd.changes;
  const [picked, setPicked] = useState<Record<string, boolean>>(() => Object.fromEntries(changes.map(c => [c.key, true])));
  const [keepWords, setKeepWords] = useState(false);
  const [propSel, setPropSel] = useState(() => preselect(step.props)?.id ?? NEW);
  const [contactSel, setContactSel] = useState(() => (step.contacts ? preselect(step.contacts)?.id ?? NEW : NEW));
  const people = data.contacts.filter(c => isBuyer(c) || isVendorC(c));
  const sel = changes.filter(c => picked[c.key]);
  const said = new Set(changes.map(c => c.key));
  const missing = CREATE_EXPECTED.filter(x => !said.has(x) && !(x === 'township' && said.has('city'))).map(x => changeLabel(s, x));
  function open() {
    const use0 = keepWords ? [...sel, { key: 'notes', value: step.text.trim() } as Change] : sel;
    // Change 50: a chosen saved contact becomes the vendor (instead of the typed owner name and phone).
    const contactId = contactSel === NEW ? undefined : contactSel;
    const use = contactId ? use0.filter(c => c.key !== 'ownerName' && c.key !== 'ownerPhone') : use0;
    go({ name: 'listingForm', id: propSel === NEW ? undefined : propSel, prefill: { ...prefillFrom(use), ...(contactId ? { vendorId: contactId } : {}) } });
  }
  if (!changes.length) {
    // "Add new listing" with nothing else said: straight to an empty form.
    return (
      <div className="proposal stack-sm step-card" data-testid="proposal" data-step="create">
        {head}
        <strong>{v.proposedNew}</strong>
        <div className="two">
          <button className="btn secondary" onClick={onClose}>{s.cancel}</button>
          <button className="btn primary" onClick={() => go({ name: 'listingForm' })} data-testid="step-create-empty">{v.toForm}</button>
        </div>
      </div>
    );
  }
  return (
    <div className="proposal stack-sm step-card" data-testid="proposal" data-step="create">
      {head}
      <strong>{v.proposedNew}</strong>
      <ul className="prop-list">
        {changes.map(c => (
          <li key={c.key} className={picked[c.key] ? 'on' : ''}>
            <label className="prop-row">
              <input type="checkbox" checked={!!picked[c.key]} onChange={e => setPicked(p => ({ ...p, [c.key]: e.target.checked }))} aria-label={`${v.use}: ${changeLabel(s, c.key)}`} />
              <span className="prop-main">
                <span className="prop-label">{changeLabel(s, c.key)}</span>
                <span className="prop-after">{showValue(s, c.key, c.value, lang)}</span>
                {c.note && c.note !== 'appended' && <small className="warn-text">{v[c.note]}</small>}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <div className="stack-sm match-pickers">
        <PropertyMatchPicker lang={lang} ranked={step.props} value={propSel} onChange={setPropSel} />
        {step.contacts && <ContactMatchPicker lang={lang} ranked={step.contacts} all={people} value={contactSel} onChange={setContactSel} />}
      </div>
      {missing.length > 0 && <small className="muted">{v.notMentioned(missing.join(', '))}</small>}
      {step.cmd.unclear.includes('factory') && <small className="warn-text">{v.unclearFactory}</small>}
      <label className="check"><input type="checkbox" checked={keepWords} onChange={e => setKeepWords(e.target.checked)} /> {v.keepWords}</label>
      <div className="two">
        <button className="btn secondary" onClick={onClose}>{s.cancel}</button>
        <button className="btn primary" disabled={!sel.length} onClick={open} data-testid="step-create-open">{propSel !== NEW ? k.openExisting : v.toForm}</button>
      </div>
    </div>
  );
}

/** Buyers and tenants that fit what was said, each with Call and WhatsApp (Change 63). */
function BuyersCard({ lang, step, head, go, onClose }: { lang: Lang; step: Extract<Step, { kind: 'buyers' }>; head: ReactNode; go: Go; onClose: () => void }) {
  const m = voiceCommandStrings[lang].more;
  const [wa, setWa] = useState<string | null>(null);
  return (
    <div className="proposal stack-sm step-card" data-testid="buyers-panel" data-step="buyers">
      {head}
      <strong>{m.buyers}</strong>
      <small className="muted">{m.buyersHow}</small>
      {!step.matches.length && <p data-testid="buyers-none">{m.buyersNone}</p>}
      {step.matches.map(x => (
        <div key={x.contact.id} className="card stack-sm" data-testid="buyer-match">
          <div className="between">
            <strong>{x.contact.name}</strong>
            {x.contact.leadStatus && <span className="badge" style={{ background: LEAD_COLOURS[x.contact.leadStatus], color: '#000' }}>{x.contact.leadStatus}</span>}
          </div>
          <small className="muted">{x.reasons.join(' · ')}</small>
          <div className="btn-row">
            <button className="btn small secondary" onClick={() => go({ name: 'contactDetail', id: x.contact.id })} data-testid="buyer-open">{m.open}</button>
            <QuickActions lang={lang} contact={x.contact} onWhatsApp={() => setWa(w => (w === x.contact.id ? null : x.contact.id))} />
          </div>
          {wa === x.contact.id && <WhatsAppPicker lang={lang} contact={x.contact} />}
        </div>
      ))}
      <button className="btn small ghost" onClick={onClose}>{m.cancel}</button>
    </div>
  );
}

/** "WhatsApp this buyer and remind our appointment", "call this owner": the person (asked when not known), then the
 *  suggested messages (Change 64) or the call button (Change 63). */
function ContactActionCard({ lang, step, head, data, onClose }: { lang: Lang; step: Extract<Step, { kind: 'contactAction' }>; head: ReactNode; data: Data; onClose: () => void }) {
  const t = c056Strings[lang];
  const people = data.contacts.filter(c => isBuyer(c) || isVendorC(c));
  const [who, setWho] = useState(step.contactId ?? NEW);
  useEffect(() => { if (step.contactId) setWho(step.contactId); }, [step.contactId]);
  const ranked: Ranked<Contact>[] = useMemo(() => (step.action.who ? rankContacts(step.action.who, people) : []), [step.action.who]); // eslint-disable-line react-hooks/exhaustive-deps
  const contact = who === NEW ? undefined : data.contacts.find(c => c.id === who);
  const property = step.propertyId ? data.properties.find(p => p.id === step.propertyId) : undefined;
  const phone = waDigits(contact?.phone);
  return (
    <div className="proposal stack-sm step-card" data-testid="step-contact-action" data-step="contactAction" data-action={step.action.kind}>
      {head}
      {(step.action.kind === 'call' || !contact) && <strong>{step.action.kind === 'call' ? t.callTitle : t.waTitle}</strong>}
      {!step.contactId && (
        <div className="stack-sm">
          <small className="muted">{step.action.who ? t.noContactFound : t.whoFor}</small>
          <ContactMatchPicker lang={lang} ranked={ranked} all={people} value={who} onChange={setWho} />
        </div>
      )}
      {contact && step.action.kind === 'whatsapp' && <WhatsAppPicker lang={lang} contact={contact} property={property} topic={step.action.topic} />}
      {contact && step.action.kind === 'call' && (phone.length >= 9
        ? <a className="btn primary" href={`tel:+${phone}`} data-testid="step-call">📞 {t.callNow(contact.name)}</a>
        : <p className="warn-text" data-testid="step-no-phone">{t.noPhone}</p>)}
      <button type="button" className="btn small ghost" onClick={onClose} data-testid="step-cancel">{t.dismiss}</button>
    </div>
  );
}
