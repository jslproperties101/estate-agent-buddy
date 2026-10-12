// Button 10 — User Profile / Digital Name Card, the name-card sender, and Settings.
// Sending: the app prepares the message and opens WhatsApp (or the phone's share sheet for the card images).
// The agent reviews it there and presses Send; nothing is ever sent automatically.
import { useState } from 'react';
import { Lang, LANGS, strings } from '../i18n';
import { useApp, useStore } from '../data/useStore';
import { Go } from '../nav';
import { profileStrings } from './strings';
import { OptionSelect } from '../ui/OptionSelect';
import { StoredImage } from '../ui/common';
import { useToast } from '../ui/toast';
import { DEFAULT_SHARE, shareText, shareFiles, whatsappLink, anyChosen } from '../domain/namecard';
import { Profile, ShareChoice, COLLECTIONS, CollectionName } from '../data/types';
import { normalisePhone, phoneDigits } from '../listing/model';
import { compressImage } from '../lib/images';
import { pickPhoneContacts } from '../lib/phonebook';
import { config } from '../config';
import { signIn, syncNow, SyncError } from '../data/sync';
import { fmtDateTime } from '../lib/dates';
import { permission, requestPermission } from '../lib/notify';
import { sampleData } from '../data/sample';

export const REG_TYPES = ['REN', 'PEA', 'REA'] as const;

export function ProfileScreen({ lang, go }: { lang: Lang; go: Go }) {
  const { state } = useApp();
  const t = profileStrings[lang];
  const p = state.profile;
  const has = !!(p.fullName || p.phone || p.agency);
  return (
    <section className="stack" data-testid="profile">
      <div className="namecard">
        <div className="nc-photo"><StoredImage fileId={p.photoFileId} /></div>
        <div className="nc-body">
          <strong className="nc-name">{p.fullName || '—'}</strong>
          {p.regNo && <span>{t.regLabel(p.regType || 'REN')}: {p.regNo}</span>}
          {p.agency && <span>{p.agency}</span>}
          {p.phone && <span>📞 {p.phone}</span>}
          {p.email && <span>✉ {p.email}</span>}
        </div>
      </div>
      {!has && <p className="muted">{t.empty}</p>}
      {(p.cardFrontFileId || p.cardBackFileId) && (
        <div className="two card-imgs">
          {p.cardFrontFileId && <figure><StoredImage fileId={p.cardFrontFileId} /><figcaption className="small muted">{t.f.front}</figcaption></figure>}
          {p.cardBackFileId && <figure><StoredImage fileId={p.cardBackFileId} /><figcaption className="small muted">{t.f.back}</figcaption></figure>}
        </div>
      )}
      <button className="btn primary" onClick={() => go({ name: 'nameCard' })} disabled={!has}>{t.send}</button>
      <button className="btn secondary" onClick={() => go({ name: 'profileEdit' })}>{t.edit}</button>
      <button className="btn secondary" onClick={() => go({ name: 'settings' })}>⚙ {t.settings}</button>
    </section>
  );
}

function ImageField({ lang, label, fileId, onChange, testId }: { lang: Lang; label: string; fileId?: string; onChange: (id: string | undefined) => void; testId: string }) {
  const store = useStore();
  const t = profileStrings[lang];
  return (
    <div className="ff img-field">
      <span>{label}</span>
      {fileId && <StoredImage fileId={fileId} className="img-prev" />}
      <div className="row-wrap">
        <label className="btn small secondary">{fileId ? t.replace : t.upload}
          <input data-testid={testId} className="file-input" type="file" accept="image/*" onChange={async e => {
            const f = e.target.files?.[0];
            e.currentTarget.value = '';
            if (!f) return;
            let blob: Blob = f;
            try { blob = (await compressImage(f, 1800, 0.85)).blob; } catch { /* keep original */ }
            const id = await store.putFile(blob);
            if (fileId) store.removeFile(fileId);
            onChange(id);
          }} />
        </label>
        {fileId && <button className="btn small ghost danger-text" onClick={() => { store.removeFile(fileId); onChange(undefined); }}>{t.remove}</button>}
      </div>
    </div>
  );
}

export function ProfileEdit({ lang, back }: { lang: Lang; back: () => void }) {
  const { state, store } = useApp();
  const t = profileStrings[lang];
  const c = strings[lang].c;
  const toast = useToast();
  const [p, setP] = useState<Profile>({ ...state.profile });
  const set = (k: keyof Profile, v: string | undefined) => setP(x => ({ ...x, [k]: v || undefined }));
  // Images are saved straight away (they are files); text fields are saved with Save.
  const setImg = (k: 'photoFileId' | 'cardFrontFileId' | 'cardBackFileId') => (id: string | undefined) => { setP(x => ({ ...x, [k]: id })); store.setSingleton('profile', { [k]: id }); };
  return (
    <section className="stack" data-testid="profile-edit">
      <div className="card stack-sm">
        <label className="ff">{t.f.fullName}<input data-field="fullName" value={p.fullName ?? ''} onChange={e => set('fullName', e.target.value)} /></label>
        <OptionSelect lang={lang} label={t.f.regType} listKey="regType" builtIns={REG_TYPES.map(v => ({ value: v }))} value={p.regType} onChange={v => set('regType', v)} testId="opt-regType" />
        <label className="ff">{t.f.regNo}<input data-field="regNo" value={p.regNo ?? ''} onChange={e => set('regNo', e.target.value)} /></label>
        <label className="ff">{t.f.agency}<input data-field="agency" value={p.agency ?? ''} onChange={e => set('agency', e.target.value)} /></label>
        <label className="ff">{t.f.phone}<input data-field="phone" type="tel" inputMode="tel" value={p.phone ?? ''} onChange={e => set('phone', e.target.value)} onBlur={() => setP(x => ({ ...x, phone: normalisePhone(x.phone) }))} /></label>
        <label className="ff">{t.f.email}<input data-field="email" type="email" value={p.email ?? ''} onChange={e => set('email', e.target.value)} /></label>
      </div>
      <div className="card stack-sm">
        <ImageField lang={lang} label={t.f.photo} fileId={p.photoFileId} onChange={setImg('photoFileId')} testId="photo-upload" />
        <ImageField lang={lang} label={t.f.front} fileId={p.cardFrontFileId} onChange={setImg('cardFrontFileId')} testId="front-upload" />
        <ImageField lang={lang} label={t.f.back} fileId={p.cardBackFileId} onChange={setImg('cardBackFileId')} testId="back-upload" />
      </div>
      <div className="save-bar"><div className="two">
        <button className="btn secondary" onClick={back}>{c.cancel}</button>
        <button className="btn primary" data-testid="save-profile" onClick={() => {
          store.setSingleton('profile', { fullName: p.fullName, regType: p.regType, regNo: p.regNo, agency: p.agency, phone: normalisePhone(p.phone), email: p.email });
          toast(c.saved); back();
        }}>{c.save}</button>
      </div></div>
    </section>
  );
}

type Source = 'app' | 'phone' | 'typed';

export function NameCardSend({ lang }: { lang: Lang }) {
  const { state, store } = useApp();
  const t = profileStrings[lang];
  const toast = useToast();
  const p = state.profile;
  const [choice, setChoice] = useState<ShareChoice>(p.shareDefaults ?? DEFAULT_SHARE);
  const [source, setSource] = useState<Source>('app');
  const [contactId, setContactId] = useState('');
  const [picked, setPicked] = useState<{ name: string; tel?: string } | null>(null);
  const [typed, setTyped] = useState('');
  const [msg, setMsg] = useState('');
  const contact = state.contacts.find(x => x.id === contactId);
  const recipient = source === 'app' ? (contact?.phone ? { name: contact.name, tel: contact.phone } : null) : source === 'phone' ? (picked?.tel ? picked : null) : (phoneDigits(typed).length >= 9 ? { name: typed, tel: typed } : null);
  const text = shareText(p, choice, { greeting: t.greeting, regLabel: t.regLabel, agency: t.inc.agency, phone: t.inc.phone, email: t.inc.email, closing: t.closing });
  const files = shareFiles(p, choice);
  const remember = () => store.setSingleton('profile', { shareDefaults: choice });
  const toggle = (k: keyof ShareChoice) => setChoice(x => ({ ...x, [k]: !x[k] }));
  const available: Record<keyof ShareChoice, boolean> = { regNo: !!p.regNo, front: !!p.cardFrontFileId, back: !!p.cardBackFileId, agency: !!p.agency, phone: !!p.phone, email: !!p.email };

  async function shareWithImages() {
    remember();
    if (!files.length) { setMsg(t.needImages); return; }
    const blobs = await Promise.all(files.map(id => store.getFile(id)));
    const fs = blobs.filter(Boolean).map((b, i) => new File([b!], `name-card-${i + 1}.jpg`, { type: b!.type || 'image/jpeg' }));
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (!nav.share || !nav.canShare?.({ files: fs })) { setMsg(t.shareUnsupported); return; }
    try { await nav.share({ files: fs, text }); } catch { /* the person closed the share sheet */ }
  }

  return (
    <section className="stack" data-testid="namecard-send">
      <div className="card stack-sm">
        <div className="card-title">{t.recipient}</div>
        <div className="seg" role="group" aria-label={t.recipient}>
          {(['app', 'phone', 'typed'] as Source[]).map(s => <button key={s} aria-pressed={source === s} onClick={() => { setSource(s); setMsg(''); }}>{s === 'app' ? t.fromApp : s === 'phone' ? t.fromPhone : t.typed}</button>)}
        </div>
        {source === 'app' && (
          <select aria-label={t.fromApp} data-testid="recipient-app" value={contactId} onChange={e => setContactId(e.target.value)}>
            <option value="">{strings[lang].c.choose}</option>
            {[...state.contacts].filter(x => x.phone).sort((a, b) => a.name.localeCompare(b.name)).map(x => <option key={x.id} value={x.id}>{x.name} · {x.phone}</option>)}
          </select>
        )}
        {source === 'phone' && (
          <button className="btn secondary" onClick={async () => {
            const r = await pickPhoneContacts(false);
            if (r === null) { setMsg(t.phoneUnsupported); return; }
            if (r[0]) setPicked({ name: r[0].name, tel: r[0].tel });
          }}>{t.pickPhone}</button>
        )}
        {source === 'typed' && <input aria-label={t.typed} type="tel" inputMode="tel" placeholder="+60" value={typed} onChange={e => setTyped(e.target.value)} />}
        {recipient && <small className="ok-text" data-testid="recipient">{t.chosen(`${recipient.name}${recipient.tel && recipient.tel !== recipient.name ? ` · ${recipient.tel}` : ''}`)}</small>}
      </div>
      <div className="card stack-sm" data-testid="share-choices">
        <div className="card-title">{t.include}</div>
        {(Object.keys(DEFAULT_SHARE) as (keyof ShareChoice)[]).map(k => (
          <label key={k} className={`check ${available[k] ? '' : 'muted'}`}><input type="checkbox" data-choice={k} checked={choice[k]} onChange={() => toggle(k)} /> {t.inc[k]}</label>
        ))}
        <small className="muted">{t.remembered}</small>
      </div>
      <div className="card stack-sm">
        <div className="card-title">{t.preview}</div>
        <pre className="msg-preview" data-testid="share-preview">{text}</pre>
        {files.length > 0 && <div className="row-wrap">{files.map(f => <StoredImage key={f} fileId={f} className="mini-card" />)}</div>}
      </div>
      <p className="small muted">{t.neverAuto}</p>
      {msg && <p className="warn-text" role="status">{msg}</p>}
      <a className={`btn primary ${recipient && anyChosen(choice) ? '' : 'disabled'}`} data-testid="open-whatsapp" aria-disabled={!recipient}
        href={recipient ? whatsappLink(recipient.tel, text) : undefined} target="_blank" rel="noreferrer"
        onClick={e => { if (!recipient) { e.preventDefault(); setMsg(t.needRecipient); return; } remember(); toast(strings[lang].c.saved); }}>{t.openWhatsApp}</a>
      {(choice.front || choice.back) && <>
        <button className="btn secondary" onClick={() => void shareWithImages()}>{t.shareImages}</button>
        <small className="muted">{t.imagesNote}</small>
      </>}
    </section>
  );
}

export function SettingsScreen({ lang }: { lang: Lang }) {
  const { state, store } = useApp();
  const t = profileStrings[lang];
  const toast = useToast();
  const s = state.settings;
  const built = config({});
  const [form, setForm] = useState({ mapsApiKey: s.mapsApiKey ?? '', supabaseUrl: s.supabaseUrl ?? '', supabaseAnonKey: s.supabaseAnonKey ?? '', expertApiUrl: s.expertApiUrl ?? '' });
  const [email, setEmail] = useState(state.meta.syncSession?.email ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [perm, setPerm] = useState(permission());
  const cfg = config(s);
  const session = state.meta.syncSession;
  const errText = (e: unknown) => (e instanceof SyncError ? t.syncErr[e.code] : String(e));
  const hint = (k: keyof typeof built.source) => (built.source[k] === 'build' ? t.fromBuild : t.notSetYet);

  return (
    <section className="stack" data-testid="settings">
      <div className="card stack-sm">
        <div className="card-title">{t.language}</div>
        <div className="seg" role="group" aria-label={t.language}>
          {LANGS.map(l => <button key={l.code} aria-pressed={s.lang === l.code} onClick={() => store.setSingleton('settings', { lang: l.code })}>{l.label}</button>)}
        </div>
      </div>
      <div className="card stack-sm">
        <div className="card-title">{t.maps}</div>
        <label className="ff">{t.mapsKey}<input data-field="mapsApiKey" type="password" autoComplete="off" placeholder={hint('googleMapsApiKey')} value={form.mapsApiKey} onChange={e => setForm(f => ({ ...f, mapsApiKey: e.target.value }))} /></label>
        <small className="muted">{t.mapsHelp}</small>
      </div>
      <div className="card stack-sm">
        <div className="card-title">{t.expert}</div>
        <label className="ff">{t.expertUrl}<input type="url" placeholder={hint('expertApiUrl')} value={form.expertApiUrl} onChange={e => setForm(f => ({ ...f, expertApiUrl: e.target.value }))} /></label>
        <small className="muted">{t.expertHelp}</small>
      </div>
      <div className="card stack-sm">
        <div className="card-title">{t.cloud}</div>
        <small className="muted">{t.cloudHelp}</small>
        <label className="ff">{t.sbUrl}<input type="url" placeholder={hint('supabaseUrl')} value={form.supabaseUrl} onChange={e => setForm(f => ({ ...f, supabaseUrl: e.target.value }))} /></label>
        <label className="ff">{t.sbKey}<input type="password" autoComplete="off" placeholder={hint('supabaseAnonKey')} value={form.supabaseAnonKey} onChange={e => setForm(f => ({ ...f, supabaseAnonKey: e.target.value }))} /></label>
        <button className="btn primary" data-testid="save-settings" onClick={() => {
          store.setSingleton('settings', { mapsApiKey: form.mapsApiKey.trim() || undefined, supabaseUrl: form.supabaseUrl.trim() || undefined, supabaseAnonKey: form.supabaseAnonKey.trim() || undefined, expertApiUrl: form.expertApiUrl.trim() || undefined });
          toast(t.settingsSaved);
        }}>{t.saveSettings}</button>
        {session ? (
          <>
            <small className="ok-text">{t.signedIn(session.email)}</small>
            <small className="muted">{state.meta.lastSync ? t.lastSync(fmtDateTime(state.meta.lastSync, lang)) : t.neverSynced} · {t.pending(state.meta.dirty.length)}</small>
            <div className="two">
              <button className="btn primary" disabled={busy} onClick={async () => {
                setBusy(true); setMsg('');
                try { const r = await syncNow(store, cfg); setMsg(t.syncDone(r.pushed, r.pulled + r.removed)); } catch (e) { setMsg(errText(e)); }
                setBusy(false);
              }}>{busy ? t.syncing : t.syncNow}</button>
              <button className="btn secondary" onClick={() => store.setSingleton('meta', { syncSession: undefined })}>{t.signOut}</button>
            </div>
          </>
        ) : (
          <>
            <label className="ff">{t.email}<input type="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
            <label className="ff">{t.password}<input type="password" value={password} onChange={e => setPassword(e.target.value)} /></label>
            <button className="btn secondary" disabled={busy || !email || !password} onClick={async () => {
              setBusy(true); setMsg('');
              try { const sess = await signIn(cfg, email.trim(), password); store.setSingleton('meta', { syncSession: sess }); setPassword(''); } catch (e) { setMsg(errText(e)); }
              setBusy(false);
            }}>{t.signIn}</button>
          </>
        )}
        {msg && <p className="small" role="status">{msg}</p>}
      </div>
      <div className="card stack-sm">
        <div className="card-title">{t.notif}</div>
        <small className="muted">{strings[lang].reminders.note}</small>
        {perm === 'granted' ? <small className="ok-text">{strings[lang].reminders.allowed}</small>
          : perm === 'denied' ? <small className="warn-text">{strings[lang].reminders.blocked}</small>
            : perm === 'default' ? <button className="btn secondary" onClick={async () => setPerm(await requestPermission())}>{strings[lang].reminders.allow}</button> : null}
      </div>
      <div className="card stack-sm">
        <div className="card-title">{t.storage}</div>
        <small className={store.persistent ? 'ok-text' : 'warn-text'}>{store.persistent ? t.persistent : t.notPersistent}</small>
      </div>
      <div className="card stack-sm" data-testid="sample-data">
        <div className="card-title">{t.sample}</div>
        <small className="muted">{t.sampleHelp}</small>
        <div className="two">
          <button className="btn secondary" data-testid="load-sample" onClick={() => {
            const d = sampleData();
            for (const c of Object.keys(d) as (keyof typeof d)[]) for (const r of d[c]) if (!(state[c] as { id: string }[]).some(x => x.id === r.id)) store.upsert(c, r as never);
            toast(t.sampleLoaded);
          }}>{t.loadSample}</button>
          <button className="btn secondary danger-text" data-testid="remove-sample" onClick={() => {
            const sampleProps = new Set(state.properties.filter(p => p.sample).map(p => p.id));
            for (const c of COLLECTIONS as CollectionName[]) for (const r of state[c] as { id: string; sample?: boolean }[]) if (r.sample) store.remove(c, r.id);
            // Banners recorded on a sample property go with it, so none is left pointing at a property that is gone.
            for (const b of state.banners) if (sampleProps.has(b.propertyId)) { if (b.photoFileId) store.removeFile(b.photoFileId); store.remove('banners', b.id); }
            toast(t.sampleRemoved);
          }}>{t.removeSample}</button>
        </div>
      </div>
      <small className="muted">{t.version} 2.0.0</small>
    </section>
  );
}
