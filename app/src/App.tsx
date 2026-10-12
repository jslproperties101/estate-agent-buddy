import { useEffect, useRef, useState } from 'react';
import {
  Field, blankFields, practiceFields, confirmField, editField, rejectField, resetField,
  needsExplicitConfirm, pendingCount, canSave, buildSave, SavedValue, ReviewRuleError,
  chooseCandidate, hasConflict,
} from './review';
import { readSource, readNote, SourceInfo, SourceResult } from './local/pipeline';
import { pdfPages } from './local/pdf-browser';
import { extract } from './local/rules';
import { merge, keepDecisions } from './local/merge';
import { compressImage } from './local/images';
import { sha256Hex, kindOf } from './local/files';
import { SAMPLE_FILES, sampleFile } from './local/samples';
import { VoicePanel, VoiceNoteAttach, VoiceNote } from './voice/VoiceUI';
import { SAMPLE_PLACES } from './voice/places';
import { PropertyListing, ListingDetails, ListingForm, Layout, PriceLine } from './listing/ListingUI';
import { PropertyVoice } from './listing/PropertyVoice';
import { Listing, SAMPLE_LISTINGS, cardTitle, nextRef, MarketingFieldDef, Filters, mainPhoto, MAX_CUSTOM_FIELDS, ChangeEntry } from './listing/model';
import { listingStrings } from './listing/strings';
import { Change } from './listing/commands';
import { SAMPLE_VENDORS, Vendor } from './contacts/model';

/** Switch: set to false to hide all voice input without affecting other features. */
export const VOICE_ENABLED = true;
import { Deleted, moveToDeleted, restore, deletePermanently, daysLeft, purgeExpired } from './deleted';
import { Lang, strings } from './i18n';
import {
  IconBack, IconNews, IconCamera, IconTrash, IconCheck, IconTodo, IconCalendar, IconTrend, IconHome,
  IconVendor, IconBuyer, IconGps, IconExpert, IconLock, IconRestore, IconNote, IconMic, IconLogo,
} from './icons';

type Kind = 'photo' | 'document' | 'note' | 'practice';
export interface Capture {
  id: string;
  title: string;
  kind: Kind;
  created: number;
  fields: Field[];
  previewUrl?: string;
  note?: string;
  sources?: SourceInfo[];
  summary?: Summary;
}
interface Summary { found: number; conflicts: number; missing: number; wouldAskAi: boolean; sensitive: boolean }

/** Turns what was read from the sources into review fields (local rules, no AI). */
function recompute(list: SourceResult[], oldFields: Field[] | null): { fields: Field[]; summary?: Summary } {
  const segs = list.flatMap(r => r.segments);
  if (!segs.length) return { fields: oldFields ?? blankFields() };
  const ps = extract(segs, s => list.find(r => r.blocked.has(s))?.blocked.get(s) ?? []);
  const m = merge(ps);
  const fields = oldFields ? keepDecisions(oldFields, m.fields) : m.fields;
  const sensitive = list.some(r => r.info.sensitive);
  return { fields, summary: { found: m.fields.filter(f => f.suggested || f.candidates).length, conflicts: m.conflicts.length, missing: m.missing.length, wouldAskAi: m.wouldAskAi && !sensitive, sensitive } };
}

const kb = (n: number) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB');
interface SavedCapture { id: string; title: string; values: SavedValue[]; savedAt: number }

type Screen =
  | { name: 'home' }
  | { name: 'capture' }
  | { name: 'review'; id: string }
  | { name: 'deleted' }
  | { name: 'voicenote'; text: string }
  | { name: 'listing'; filters?: Filters }
  | { name: 'listingDetail'; id: string }
  | { name: 'listingForm'; id?: string; prefill?: Partial<Listing> }
  | { name: 'voice' }
  | { name: 'news' }
  | { name: 'placeholder'; title: string };

const TILES: { key: string; icon: () => JSX.Element; target?: Screen }[] = [
  { key: 'todo', icon: () => <IconTodo /> },
  { key: 'calendar', icon: () => <IconCalendar /> },
  { key: 'opportunities', icon: () => <IconTrend /> },
  { key: 'property', icon: () => <IconHome />, target: { name: 'listing' } },
  { key: 'vendor', icon: () => <IconVendor /> },
  { key: 'buyer', icon: () => <IconBuyer /> },
  { key: 'gps', icon: () => <IconGps /> },
  { key: 'expert', icon: () => <IconExpert /> },
];
/** Tile 12: the central voice command screen. Tiles 9 to 11 stay "Coming soon" until the handwritten notes arrive. */
const VOICE_TILE = { key: 'voice', icon: () => <IconMic />, target: { name: 'voice' } as Screen };

const readLayout = (): Layout => { try { return localStorage.getItem('eab.layout') === 'grid' ? 'grid' : 'large'; } catch { return 'large'; } };

/** Turns reviewed voice changes into starting values for the Add Property form, marked "from your words". */
function prefillFrom(changes: Change[]): Partial<Listing> {
  const p: Record<string, unknown> = { filledFrom: {} };
  for (const c of changes) {
    if (c.key.startsWith('tenancy.')) { p.tenancy = { ...(p.tenancy as object ?? {}), [c.key.slice(8)]: c.value }; continue; }
    p[c.key] = c.value;
    (p.filledFrom as Record<string, string>)[c.key] = 'words';
  }
  return p as Partial<Listing>;
}

const newId = () =>
  (globalThis.crypto && 'randomUUID' in globalThis.crypto)
    ? globalThis.crypto.randomUUID()
    : Math.random().toString(36).slice(2);

export default function App() {
  const [lang, setLang] = useState<Lang>('en');
  const t = strings[lang];
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const [history, setHistory] = useState<Screen[]>([]);
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [bin, setBin] = useState<Deleted<Capture>[]>([]);
  const [saved, setSaved] = useState<SavedCapture[]>([]);
  const [toast, setToast] = useState<{ text: string; undoId?: string } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const results = useRef(new Map<string, SourceResult[]>());
  const [busy, setBusy] = useState<string | null>(null);
  const [voiceNotes, setVoiceNotes] = useState<VoiceNote[]>([]);
  const [listings, setListings] = useState<Listing[]>(SAMPLE_LISTINGS);
  const [vendors, setVendors] = useState<Vendor[]>(SAMPLE_VENDORS);
  const [fieldDefs, setFieldDefs] = useState<MarketingFieldDef[]>([]);
  const [layout, setLayoutState] = useState<Layout>(readLayout);
  const setLayout = (l: Layout) => { setLayoutState(l); try { localStorage.setItem('eab.layout', l); } catch { /* not kept */ } };
  const ls = listingStrings[lang];

  function saveListing(l: Listing, source: ChangeEntry['source'], summary = '') {
    let next = l;
    // A typed owner becomes a shared vendor record, so the coming Vendor List uses the same record (no duplicate).
    if (!next.vendorId && next.ownerName) {
      const v: Vendor = { id: newId(), name: next.ownerName, phone: next.ownerPhone, created: Date.now() };
      setVendors(prev => [...prev, v]);
      next = { ...next, vendorId: v.id, ownerName: undefined, ownerPhone: undefined };
    }
    next = { ...next, updated: Date.now(), history: [{ at: Date.now(), source, summary }, ...(next.history ?? [])] };
    const isNew = !listings.some(x => x.id === next.id);
    setListings(prev => (isNew ? [next, ...prev] : prev.map(x => (x.id === next.id ? next : x))));
    return { next, isNew };
  }

  useEffect(() => { document.documentElement.lang = lang === 'bm' ? 'ms' : 'en'; }, [lang]);
  useEffect(() => { setBin(b => purgeExpired(b, Date.now())); }, [screen]);

  function go(next: Screen) { setHistory(h => [...h, screen]); setScreen(next); window.scrollTo(0, 0); }
  function back() {
    const prev: Screen = history[history.length - 1] ?? { name: 'home' };
    setHistory(history.slice(0, -1));
    setScreen(prev);
  }

  function addCapture(kind: Kind, title: string, extra: Partial<Capture> = {}) {
    const c: Capture = {
      id: newId(), title, kind, created: Date.now(),
      fields: kind === 'practice' ? practiceFields() : blankFields(), ...extra,
    };
    setCaptures(prev => [c, ...prev]);
    go({ name: 'review', id: c.id });
  }

  /** Reads one file on this phone. Returns null for a duplicate. */
  async function ingest(file: File): Promise<SourceResult | null> {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const hash = await sha256Hex(bytes);
    const dup = captures.find(c => c.sources?.some(s => s.hash === hash));
    if (dup) { setToast({ text: t.duplicate(dup.title) }); return null; }
    const r = await readSource({ id: newId(), name: file.name, mime: file.type, bytes }, pdfPages);
    if (kindOf(file.name, file.type) === 'image') {
      try {
        const c = await compressImage(file);
        r.info.compressedBytes = c.after;
        r.info.previewUrl = URL.createObjectURL(c.blob);
      } catch { /* keep the original */ }
    }
    return r;
  }

  /** Runs a file step with a visible 'Reading…' state, a time limit and a clear message if it fails. */
  async function guarded<R>(file: File, step: () => Promise<R>): Promise<R | null> {
    setBusy(file.name);
    try {
      return await Promise.race([
        step(),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 30000)),
      ]);
    } catch (e) {
      setToast({ text: t.readFailed(file.name, e instanceof Error ? e.message : String(e)) });
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function onFile(file: File) {
    const r = await guarded(file, () => ingest(file));
    if (!r) return;
    const id = newId();
    results.current.set(id, [r]);
    const { fields, summary } = recompute([r], null);
    const c: Capture = {
      id, title: file.name, kind: r.info.kind === 'image' ? 'photo' : 'document', created: Date.now(),
      fields, sources: [r.info], summary, previewUrl: r.info.previewUrl,
    };
    setCaptures(prev => [c, ...prev]);
    go({ name: 'review', id });
  }

  async function addFileTo(captureId: string, file: File) {
    const r = await guarded(file, () => ingest(file));
    if (!r) return;
    const list = [...(results.current.get(captureId) ?? []), r];
    results.current.set(captureId, list);
    setCaptures(prev => prev.map(c => {
      if (c.id !== captureId) return c;
      const { fields, summary } = recompute(list, c.sources?.length ? c.fields : null);
      return { ...c, fields, summary, sources: [...(c.sources ?? []), r.info] };
    }));
  }

  async function addNoteCapture(text: string, name?: string) {
    const id = newId();
    const r = await readNote(newId(), text, name);
    results.current.set(id, [r]);
    const { fields, summary } = recompute([r], null);
    const c: Capture = { id, title: text.slice(0, 40), kind: 'note', created: Date.now(), fields, note: text, sources: [r.info], summary };
    setCaptures(prev => [c, ...prev]);
    go({ name: 'review', id });
  }

  function updateFields(id: string, fn: (f: Field[]) => Field[]) {
    setCaptures(prev => prev.map(c => (c.id === id ? { ...c, fields: fn(c.fields) } : c)));
  }

  function save(id: string) {
    const c = captures.find(x => x.id === id);
    if (!c) return;
    try {
      const values = buildSave(c.fields);
      setSaved(s => [{ id: c.id, title: c.title, values, savedAt: Date.now() }, ...s]);
      setCaptures(prev => prev.filter(x => x.id !== id));
      setToast({ text: t.savedOk });
      setHistory([]);
      setScreen({ name: 'capture' });
    } catch (e) {
      if (e instanceof ReviewRuleError) setToast({ text: t.saveLocked });
    }
  }

  function doDelete(id: string) {
    const r = moveToDeleted(captures, bin, id, Date.now());
    setCaptures(r.items); setBin(r.bin);
    setConfirmDeleteId(null);
    setToast({ text: t.movedToast, undoId: id });
    if (screen.name === 'review') { setHistory([]); setScreen({ name: 'capture' }); }
  }
  function doRestore(id: string) {
    const r = restore(captures, bin, id);
    setCaptures(r.items); setBin(r.bin); setToast(null);
  }

  const title =
    screen.name === 'home' ? t.appName
      : screen.name === 'capture' ? t.smartCapture
        : screen.name === 'review' ? t.review
          : screen.name === 'deleted' ? t.recentlyDeleted
          : screen.name === 'voicenote' ? t.voice.noteTitle
          : screen.name === 'listing' ? ls.title
          : screen.name === 'listingDetail' ? (cardTitle(listings.find(l => l.id === screen.id) ?? SAMPLE_LISTINGS[0]) || ls.untitled)
          : screen.name === 'listingForm' ? (screen.id ? ls.editTitle : ls.newTitle)
          : screen.name === 'voice' ? t.tiles.voice
            : screen.name === 'news' ? t.news
              : screen.title;

  return (
    <div className="shell">
      <header className={screen.name === 'home' ? 'topbar home' : 'topbar'}>
        {screen.name !== 'home' && (
          <button className="icon-btn" onClick={back} aria-label={t.back}><IconBack /></button>
        )}
        {screen.name === 'home'
          ? <h1 className="brand" aria-label={t.appName}><IconLogo size={34} /><span className="wordmark"><span>{t.appNameA}</span><em>{t.appNameB}</em></span></h1>
          : <h1>{title}</h1>}
        <button className="icon-btn news-btn" onClick={() => go({ name: 'news' })} aria-label={t.news} title={t.news}>
          <IconNews />
        </button>
        <div className="lang" role="group" aria-label={t.langSwitch}>
          <button aria-pressed={lang === 'en'} onClick={() => setLang('en')}>EN</button>
          <button aria-pressed={lang === 'bm'} onClick={() => setLang('bm')}>BM</button>
        </div>
      </header>
      <div className="proto-bar">{t.prototype}</div>

      <main className="content">
        {screen.name === 'home' && (
          <Home t={t} go={go} listings={listings} lang={lang} />
        )}

        {screen.name === 'capture' && (
          <section className="stack">
            <p className="notice">{t.noAiNotice}</p>
            {/* A real label around the file input: tapping it opens the phone's file picker directly
                (more reliable inside apps than a hidden input opened from code). */}
            <label className="big-action" aria-busy={!!busy}>
              <IconCamera size={28} />
              <span><strong>{busy ? t.reading(busy) : t.addSource}</strong><small>{t.addSourceSub}</small></span>
              <input ref={fileRef} data-testid="file-input" type="file" className="file-input"
                accept="image/*,application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,.doc"
                onChange={e => { const f = e.target.files?.[0]; if (f) void onFile(f); e.currentTarget.value = ''; }} />
            </label>
            <div className="card stack-sm" data-testid="sample-files">
              <div className="card-title">{t.trySamples}</div>
              <small className="muted">{t.trySamplesSub}</small>
              <div className="sample-grid">
                {SAMPLE_FILES.map((f, i) => (
                  <button key={f.name} className="btn secondary small" disabled={!!busy} onClick={() => void onFile(sampleFile(i))}>{f.name}</button>
                ))}
              </div>
            </div>
            <div className="card stack-sm">
              <label htmlFor="note" className="card-title"><IconNote /> {t.addNote}</label>
              <textarea id="note" value={note} onChange={e => setNote(e.target.value)} placeholder={t.notePlaceholder} rows={3} />
              <button className="btn secondary" disabled={!note.trim()}
                onClick={() => { void addNoteCapture(note.trim()); setNote(''); }}>
                {t.addNoteBtn}
              </button>
            </div>
            {VOICE_ENABLED && <VoicePanel t={t}
              onReview={(text, lang) => void addNoteCapture(text, `Voice (${lang})`)}
              onSaveNote={text => go({ name: 'voicenote', text })} />}
            {voiceNotes.length > 0 && (
              <div className="card stack-sm" data-testid="voice-notes">
                <div className="card-title">{t.voice.notesTitle}</div>
                {voiceNotes.map(n => (
                  <div key={n.id} className="src-row"><span>“{n.text}”</span><small className="muted">{n.attachedTo ? t.voice.attachedTo(n.attachedTo) : t.voice.unattached}</small></div>
                ))}
              </div>
            )}
            <button className="btn ghost" onClick={() => addCapture('practice', 'Unit 7 · Jalan Perindustrian 2/3')}>
              {t.practice}
            </button>

            <h2>{t.queue} <span className="count">{captures.length}</span></h2>
            {captures.length === 0 ? <p className="muted">{t.queueEmpty}</p> : (
              <ul className="list">
                {captures.map(c => (
                  <li key={c.id} className="row">
                    <button className="row-main" onClick={() => go({ name: 'review', id: c.id })}>
                      <strong>{c.title}</strong>
                      <small>{t.progress(c.fields.length - pendingCount(c.fields), c.fields.length)}{c.kind === 'practice' ? ` · ${t.sampleBadge}` : ''}</small>
                    </button>
                    <button className="icon-btn danger" aria-label={`${t.deleteCapture}: ${c.title}`} onClick={() => setConfirmDeleteId(c.id)}><IconTrash /></button>
                  </li>
                ))}
              </ul>
            )}

            <button className="link-row" onClick={() => go({ name: 'deleted' })}>
              <IconTrash size={18} /> {t.recentlyDeleted} <span className="count">{bin.length}</span>
            </button>

            <h2>{t.savedDrafts}</h2>
            {saved.length === 0 ? <p className="muted">{t.savedEmpty}</p> : (
              <ul className="list">
                {saved.map(s => (
                  <li key={s.id} className="card saved">
                    <strong>{s.title}</strong>
                    <dl>
                      {s.values.map(v => (
                        <div key={v.id}><dt>{t.fields[v.id]}</dt><dd>{v.value} <small>({t.decided[v.decision]})</small></dd></div>
                      ))}
                    </dl>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {screen.name === 'review' && (() => {
          const c = captures.find(x => x.id === screen.id);
          if (!c) return <p className="muted">{t.queueEmpty}</p>;
          return <Review t={t} capture={c}
            update={fn => updateFields(c.id, fn)}
            onAddFile={f => void addFileTo(c.id, f)}
            onSave={() => save(c.id)}
            onDelete={() => setConfirmDeleteId(c.id)} />;
        })()}

        {screen.name === 'deleted' && <RecentlyDeleted t={t} bin={bin} onRestore={doRestore}
          onPermanent={(id, typed) => { const r = deletePermanently(bin, id, typed, t.typeWord); if (r.ok) setBin(r.bin); return r.ok; }} />}

        {screen.name === 'voicenote' && <VoiceNoteAttach t={t} text={screen.text} places={SAMPLE_PLACES}
          onSave={n => { setVoiceNotes(v => [{ id: newId(), created: Date.now(), ...n }, ...v]); setToast({ text: t.voice.saved }); setHistory([]); setScreen({ name: 'capture' }); }} />}
        {screen.name === 'listing' && <PropertyListing key={JSON.stringify(screen.filters ?? {})} lang={lang} listings={listings} vendors={vendors}
          layout={layout} setLayout={setLayout} initial={screen.filters}
          onOpen={id => go({ name: 'listingDetail', id })} onAdd={() => go({ name: 'listingForm' })}
          onCapture={() => go({ name: 'capture' })}
          onVoiceCreate={changes => go({ name: 'listingForm', prefill: prefillFrom(changes) })} />}
        {screen.name === 'listingDetail' && (() => {
          const l = listings.find(x => x.id === screen.id);
          return l ? <ListingDetails lang={lang} l={l} vendors={vendors} fieldDefs={fieldDefs} onEdit={() => go({ name: 'listingForm', id: l.id })}
            onUpdate={(next, source, summary) => { saveListing(next, source, summary); setToast({ text: ls.updated }); }} /> : null;
        })()}
        {screen.name === 'listingForm' && <ListingForm key={screen.id ?? 'new'} lang={lang} initial={listings.find(x => x.id === screen.id)}
          prefill={screen.prefill} vendors={vendors} fieldDefs={fieldDefs} nextRef={nextRef(listings)}
          onAddFieldDef={label => setFieldDefs(prev => (prev.length >= MAX_CUSTOM_FIELDS ? prev : [...prev, { id: newId(), label }]))}
          onCapture={() => go({ name: 'capture' })}
          onCancel={back}
          onSave={l => {
            const { next, isNew } = saveListing(l, screen.prefill ? 'voice' : 'form', screen.prefill ? 'reviewed in the form' : '');
            setToast({ text: isNew ? ls.saved : ls.updated });
            setHistory([{ name: 'home' }, { name: 'listing' }]);
            setScreen({ name: 'listingDetail', id: next.id });
          }} />}
        {screen.name === 'voice' && <VoiceCommand t={t} lang={lang}
          onCreate={changes => go({ name: 'listingForm', prefill: prefillFrom(changes) })}
          onFind={f => go({ name: 'listing', filters: f })} />}
        {screen.name === 'news' && <News t={t} />}

        {screen.name === 'placeholder' && (
          <section className="card stack-sm"><h2>{t.notBuilt}</h2><p>{t.notBuiltBody}</p></section>
        )}
      </main>

      {confirmDeleteId && (
        <div className="scrim" role="presentation">
          <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dq">
            <h2 id="dq">{t.deleteQ}</h2>
            <p>{t.deleteBody}</p>
            <div className="two">
              <button className="btn secondary" onClick={() => setConfirmDeleteId(null)}>{t.cancel}</button>
              <button className="btn danger" onClick={() => doDelete(confirmDeleteId)}>{t.moveToDeleted}</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className="toast" role="status">
          <span>{toast.text}</span>
          {toast.undoId && <button onClick={() => doRestore(toast.undoId!)}>{t.undo}</button>}
          <button aria-label="Dismiss" onClick={() => setToast(null)}>✕</button>
        </div>
      )}
    </div>
  );
}

type T = typeof strings.en;

function Home({ t, go, listings, lang }: { t: T; go: (s: Screen) => void; listings: Listing[]; lang: Lang }) {
  const ls = listingStrings[lang];
  return (
    <section className="stack home">
      <nav className="grid" aria-label="Home">
        {TILES.map(tile => (
          <button key={tile.key} className={`tile ${tile.key === 'gps' ? 'deferred' : ''}`}
            onClick={() => go(tile.target ?? { name: 'placeholder', title: t.tiles[tile.key] })}>
            <span className="tile-icon">{tile.icon()}</span><span>{t.tiles[tile.key]}</span>
            {tile.key === 'gps' && <small>{t.deferred}</small>}
          </button>
        ))}
        {[9, 10, 11].map(n => (
          <button key={n} className="tile soon" disabled aria-label={`${t.button} ${n}: ${t.comingSoon}`}>
            <span className="tile-icon"><IconLock /></span><span>{t.button} {n}</span><small>{t.comingSoon}</small>
          </button>
        ))}
        <button className="tile voice-tile" onClick={() => go(VOICE_TILE.target)} aria-label={t.tiles.voice}>
          <span className="tile-icon">{VOICE_TILE.icon()}</span><span>{t.tiles.voice}</span>
        </button>
      </nav>

      <h2>{t.recentProperties} <span className="badge">{t.sample}</span></h2>
      <div className="photo-cards">
        {listings.slice(0, 3).map(l => {
          const p = mainPhoto(l);
          return (
            <button key={l.id} className="photo-card" onClick={() => go({ name: 'listingDetail', id: l.id })} aria-label={`${ls.open}: ${cardTitle(l)}`}>
              <span className="photo">{p && <img src={p.url} alt="" />}</span>
              <strong>{l.ref ?? ''}</strong><small>{[l.type, l.area].filter(Boolean).join(' · ')}</small><span><PriceLine l={l} s={ls} short /></span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Tile 12. Property commands work now on sample data; buyer, vendor and calendar commands come in later stages. */
function VoiceCommand({ t, lang, onCreate, onFind }: { t: T; lang: Lang; onCreate: (c: Change[]) => void; onFind: (f: Filters) => void }) {
  const laterStage = (text: string) => {
    const low = text.toLowerCase();
    const hit = /buyer|pembeli/.test(low) ? 'buyer' : /vendor|penjual|owner/.test(low) && /missing|incomplete|find|show|cari/.test(low) ? 'vendor'
      : /appointment|calendar|temujanji|viewing/.test(low) ? 'appointment' : /\btask|to-?do|tugasan/.test(low) ? 'task' : null;
    if (hit) return t.vc.laterBody(t.vc.laterNames[hit]);
    if (/^(?:change|update|set|add|tukar|ubah)\b/i.test(text.trim()) && !/\bnew\b|baharu/i.test(text)) return t.vc.openFirst;
    return null;
  };
  return (
    <section className="stack">
      <p className="notice">{t.vc.intro}</p>
      <PropertyVoice lang={lang} mode="central" laterStage={laterStage} onCreate={onCreate}
        onFind={c => { onFind({ type: c.type, typeWord: c.typeWord, location: c.area, purpose: c.purpose }); return 0; }} />
      <div className="card stack-sm">
        <div className="card-title">{t.vc.worksNow}</div>
        {t.vc.nowItems.map(x => <small key={x}>✓ {x}</small>)}
      </div>
      <div className="card stack-sm">
        <div className="card-title">{t.vc.later}</div>
        {t.vc.laterItems.map(x => <small key={x} className="muted">○ {x}</small>)}
      </div>
    </section>
  );
}

function Review({ t, capture, update, onAddFile, onSave, onDelete }: {
  t: T; capture: Capture; update: (fn: (f: Field[]) => Field[]) => void; onAddFile: (f: File) => void; onSave: () => void; onDelete: () => void;
}) {
  const moreRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<{ id: string; text: string; error?: boolean } | null>(null);
  const [asking, setAsking] = useState<string | null>(null);
  const fields = capture.fields;
  const done = fields.length - pendingCount(fields);
  const ready = canSave(fields);
  const setOne = (id: string, fn: (f: Field) => Field) => update(fs => fs.map(f => (f.id === id ? fn(f) : f)));

  return (
    <section className="stack">
      <div className="card source">
        {capture.previewUrl ? <img src={capture.previewUrl} alt="" /> : <div className="source-icon"><IconNote /></div>}
        <div>
          <strong>{capture.title}</strong>
          {capture.kind === 'practice' && <span className="badge warn">{t.sampleBadge}</span>}
          {capture.note && <p className="small">“{capture.note}”</p>}
        </div>
      </div>

      {capture.sources && capture.kind !== 'practice' && (
        <div className="card stack-sm" data-testid="sources">
          <div className="card-title">{t.sourcesTitle}</div>
          {capture.sources.map(src => (
            <div key={src.id} className="src-row" data-testid="source-row">
              <div className="between"><strong className="src-name">{src.name}</strong><small className="muted">{t.pagesMs(src.pages, src.ms)}</small></div>
              <small className={src.status === 'read' ? 'ok-text' : 'warn-text'}>{t.status[src.status]}</small>
              {src.sensitive && <small className="sens" data-testid="sensitive-note">{t.sensitiveNote}</small>}
              {src.compressedBytes !== undefined && src.compressedBytes < src.bytes && <small className="muted">{t.compressed(kb(src.bytes), kb(src.compressedBytes))}</small>}
            </div>
          ))}
          {capture.summary && (
            <div className="summary" data-testid="summary">
              <strong>{t.summary(capture.summary.found, capture.summary.conflicts, capture.summary.missing)}</strong>
              <small>{capture.summary.sensitive ? t.sensitiveNoAi : capture.summary.wouldAskAi ? t.wouldAskAi : t.noAiNeeded}</small>
            </div>
          )}
          <div className="sample-grid" data-testid="add-sample">
            {SAMPLE_FILES.map((sf, i) => capture.sources?.some(x => x.name === sf.name) ? null : (
              <button key={sf.name} className="btn secondary small" onClick={() => onAddFile(sampleFile(i))}>+ {sf.name}</button>
            ))}
          </div>
          <label className="btn ghost">
            {t.addAnotherFile}
            <input ref={moreRef} data-testid="more-file-input" type="file" className="file-input" accept="image/*,application/pdf,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.docx,.doc"
              onChange={e => { const f = e.target.files?.[0]; if (f) onAddFile(f); e.currentTarget.value = ''; }} />
          </label>
        </div>
      )}

      {fields.map(f => {
        const blank = !f.suggested;
        const isEditing = editing?.id === f.id;
        return (
          <article key={f.id} className={`field ${f.decision}`} data-testid={`field-${f.id}`}>
            <div className="between">
              <span className="field-name">{t.fields[f.id]}</span>
              {hasConflict(f) && f.decision === 'pending'
                ? <span className="chip conflict">{t.conflictBadge}</span>
                : f.label
                  ? <span className={`chip ${f.label.toLowerCase()}`}>{t.labels[f.label]}</span>
                  : <span className="chip none">{t.noSuggestion}</span>}
            </div>
            {!blank && <div className="value">{f.suggested}</div>}
            <p className="evidence">{t.evidence[f.evidence] ?? f.evidence}</p>

            {f.decision !== 'pending' && !isEditing ? (
              <div className="between decided">
                <span>
                  <IconCheck size={18} />{' '}
                  {f.decision === 'rejected' && blank ? t.rejectedBlank : t.decided[f.decision]}
                  {f.decision === 'edited' && <>: <strong>{f.finalValue}</strong></>}
                </span>
                <button className="btn small ghost" onClick={() => setOne(f.id, resetField)}>{t.change}</button>
              </div>
            ) : isEditing ? (
              <div className="stack-sm">
                <input aria-label={t.fields[f.id]} autoFocus value={editing!.text}
                  onChange={e => setEditing({ id: f.id, text: e.target.value })} />
                {editing!.error && <p className="error" role="alert">{t.editEmpty}</p>}
                <div className="two">
                  <button className="btn secondary" onClick={() => setEditing(null)}>{t.cancel}</button>
                  <button className="btn primary" onClick={() => {
                    // Check the rule first, then store the result (an error inside a state update would not be caught here).
                    let next: Field;
                    try { next = editField(f, editing!.text); } catch { setEditing({ ...editing!, error: true }); return; }
                    setOne(f.id, () => next); setEditing(null);
                  }}>{t.saveEdit}</button>
                </div>
              </div>
            ) : asking === f.id ? (
              <div className="ask" role="group">
                <p>{t.inferredQ}</p>
                <div className="two">
                  <button className="btn secondary" onClick={() => setAsking(null)}>{t.cancel}</button>
                  <button className="btn primary" onClick={() => { const next = confirmField(f, true); setOne(f.id, () => next); setAsking(null); }}>{t.yesConfirm}</button>
                </div>
              </div>
            ) : hasConflict(f) ? (
              <div className="stack-sm">
                {f.candidates!.map((c, i) => (
                  <button key={i} className="cand" onClick={() => { const next = chooseCandidate(f, i); setOne(f.id, () => next); }}>
                    <span className="between"><strong>{c.value}</strong><span className={`chip ${c.label.toLowerCase()}`}>{t.labels[c.label]}</span></span>
                    <small>{c.evidence}</small>
                    <span className="use">{t.useThis}</span>
                  </button>
                ))}
                <div className="two">
                  <button className="btn secondary" onClick={() => setEditing({ id: f.id, text: '' })}>{t.enterValue}</button>
                  <button className="btn secondary" onClick={() => setOne(f.id, rejectField)}>{t.leaveBlank}</button>
                </div>
              </div>
            ) : blank ? (
              <div className="two">
                <button className="btn primary" onClick={() => setEditing({ id: f.id, text: '' })}>{t.enterValue}</button>
                <button className="btn secondary" onClick={() => setOne(f.id, rejectField)}>{t.leaveBlank}</button>
              </div>
            ) : (
              <div className="three">
                <button className="btn primary" onClick={() => {
                  if (needsExplicitConfirm(f)) setAsking(f.id);
                  else { const next = confirmField(f); setOne(f.id, () => next); }
                }}>{t.confirm}</button>
                <button className="btn secondary" onClick={() => setEditing({ id: f.id, text: f.suggested })}>{t.edit}</button>
                <button className="btn secondary danger-text" onClick={() => setOne(f.id, rejectField)}>{t.reject}</button>
              </div>
            )}
          </article>
        );
      })}

      <div className="save-bar">
        <p className="small" aria-live="polite">{t.progress(done, fields.length)} · {ready ? t.saveReady : t.saveLocked}</p>
        <div className="two wide-right">
          <button className="btn secondary danger-text" onClick={onDelete}><IconTrash size={18} /> {t.deleteCapture}</button>
          <button className="btn primary" disabled={!ready} onClick={onSave}>{t.save}</button>
        </div>
      </div>
    </section>
  );
}

function RecentlyDeleted({ t, bin, onRestore, onPermanent }: {
  t: T; bin: Deleted<Capture>[]; onRestore: (id: string) => void; onPermanent: (id: string, typed: string) => boolean;
}) {
  const [confirming, setConfirming] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  const now = Date.now();
  if (!bin.length) return <p className="muted">{t.deletedEmpty}</p>;
  return (
    <ul className="list">
      {bin.map(d => (
        <li key={d.item.id} className="card stack-sm">
          <div className="between"><strong>{d.item.title}</strong><small>{t.daysLeft(daysLeft(d, now))}</small></div>
          {confirming === d.item.id ? (
            <div className="stack-sm">
              <label htmlFor={`perm-${d.item.id}`}>{t.typeToConfirm(t.typeWord)}</label>
              <input id={`perm-${d.item.id}`} value={typed} onChange={e => setTyped(e.target.value)} />
              <div className="two">
                <button className="btn secondary" onClick={() => { setConfirming(null); setTyped(''); }}>{t.cancel}</button>
                <button className="btn danger" disabled={typed.trim().toUpperCase() !== t.typeWord}
                  onClick={() => { if (onPermanent(d.item.id, typed)) { setConfirming(null); setTyped(''); } }}>{t.deletePermanent}</button>
              </div>
            </div>
          ) : (
            <div className="two">
              <button className="btn primary" onClick={() => onRestore(d.item.id)}><IconRestore size={18} /> {t.restore}</button>
              <button className="btn secondary danger-text" onClick={() => { setConfirming(d.item.id); setTyped(''); }}>{t.deletePermanent}</button>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}

function News({ t }: { t: T }) {
  return (
    <section className="stack">
      <div className="news-banner">
        <span className="badge light">BIG NEWS</span>
        <h2>{t.newsBanner}</h2>
        <p className="small">{t.newsSampleOnly}</p>
      </div>
      {t.newsCards.map(([cat, head]) => (
        <article key={cat} className="card stack-sm">
          <span className="eyebrow">{cat}</span>
          <strong>{head}</strong>
          <small className="muted">{t.newsSampleOnly}</small>
        </article>
      ))}
      <p className="notice">{t.newsRule}</p>
    </section>
  );
}
