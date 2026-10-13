// Button 12 — Voice Command: the central place to capture information by voice (replacing the removed
// Smart Capture). Property details, to-dos, appointments and contacts are understood on the phone and always
// opened in their form for the agent to check before saving.
import { useState } from 'react';
import { Lang } from '../i18n';
import { useApp } from '../data/useStore';
import { Go } from '../nav';
import { PropertyVoice, changeLabel, showValue } from '../listing/PropertyVoice';
import { prefillFrom } from '../listing/ListingUI';
import { parseAgenda } from './agenda';
import { Listing, cardTitle, normalisePhone } from '../listing/model';
import { listingStrings } from '../listing/strings';
import { Change, applyChanges, currentValue } from '../listing/commands';
import { parseTargetedUpdate, Targeted } from '../listing/targeted';
import { parseBuyerQuery, findBuyers, BuyerMatch, BuyerQuery } from './buyerSearch';
import { LEAD_COLOURS } from '../data/types';

export const voiceCommandStrings = {
  en: {
    intro: 'Say or type what you want to do. The app shows what it understood and opens it for you to check before anything is saved.',
    can: 'You can say, for example',
    examples: [
      'Create a new terrace house in Putra Nilai for sale, asking price RM580,000, four bedrooms, freehold, owner Encik Ahmad 012 345 6789',
      'Find the factory in Salak Tinggi',
      'Remind me to call Buyer K tomorrow at 3pm',
      'Schedule a viewing for P1001 with Buyer K on Friday at 11am',
      'Show my appointments tomorrow',
      'Add a new buyer Lim 012 888 7777',
      'Set the asking price of P1001 to RM3 million',
      'Change the status of P1001 to Sold',
      'Find buyers looking for a factory in Salak Tinggi',
    ],
    more: {
      diag: 'Voice not working? Open Voice diagnostics', note: 'Commands are understood in English and Bahasa Malaysia. Chinese speech becomes text but its commands are not understood yet.',
      target: 'Proposed change', now: 'Now', next: 'New', apply: 'Apply change', cancel: 'Cancel', applied: 'Property updated.', choose: 'More than one property fits. Choose one, or say its reference (for example P1001).',
      same: 'The property already has these values. Nothing to change.', notFound: 'No property matches what you said. Say its reference, for example P1001.', noTarget: 'Which property? Say its reference (for example P1001) or the type and place (for example “the factory in Salak Tinggi”).',
      buyers: 'Buyers and tenants that fit', buyersNone: 'No buyer or tenant matches. Buyers are matched from their notes and the properties they asked about.', buyersHow: 'Matched from each buyer’s notes and the properties they asked about or viewed. Check each one before contacting.', open: 'Open', want: 'Looking for', lead: 'Lead',
    },
  },
  bm: {
    intro: 'Sebut atau taip apa yang anda mahu buat. Aplikasi menunjukkan apa yang difahami dan membukanya untuk anda semak sebelum disimpan.',
    can: 'Contohnya anda boleh sebut',
    examples: [
      'Cipta rumah teres baharu di Putra Nilai, harga lima ratus lapan puluh ribu ringgit, empat bilik tidur, pegangan bebas',
      'Cari kilang di Salak Tinggi',
      'Ingatkan saya telefon Buyer K esok pukul 3 petang',
      'Atur lawatan untuk P1001 dengan Buyer K hari Jumaat pukul 11 pagi',
      'Tunjuk temujanji esok',
      'Tambah pembeli baharu Lim 012 888 7777',
      'Tukar harga P1001 kepada RM3 juta',
      'Tukar status P1001 kepada terjual',
      'Cari pembeli yang mencari kilang di Salak Tinggi',
    ],
    more: {
      diag: 'Suara tidak berfungsi? Buka Diagnostik suara', note: 'Arahan difahami dalam Bahasa Inggeris dan Bahasa Malaysia. Pertuturan Cina menjadi teks tetapi arahannya belum difahami.',
      target: 'Perubahan dicadangkan', now: 'Sekarang', next: 'Baharu', apply: 'Guna perubahan', cancel: 'Batal', applied: 'Hartanah dikemas kini.', choose: 'Lebih daripada satu hartanah sepadan. Pilih satu, atau sebut rujukannya (contohnya P1001).',
      same: 'Hartanah sudah mempunyai nilai ini. Tiada apa untuk diubah.', notFound: 'Tiada hartanah sepadan dengan apa yang anda sebut. Sebut rujukannya, contohnya P1001.', noTarget: 'Hartanah yang mana? Sebut rujukannya (contohnya P1001) atau jenis dan tempat (contohnya “kilang di Salak Tinggi”).',
      buyers: 'Pembeli dan penyewa yang sepadan', buyersNone: 'Tiada pembeli atau penyewa sepadan. Pembeli dipadankan daripada nota mereka dan hartanah yang mereka tanya.', buyersHow: 'Dipadankan daripada nota setiap pembeli dan hartanah yang mereka tanya atau lawati. Semak setiap seorang sebelum menghubungi.', open: 'Buka', want: 'Mencari', lead: 'Prospek',
    },
  },
  zh: {
    intro: '说出或输入您要做的事。应用会显示理解的内容，并在保存前打开让您检查。',
    can: '例如，您可以说',
    examples: [
      'Create a new terrace house in Putra Nilai for sale, asking price RM580,000, four bedrooms, freehold',
      'Find the factory in Salak Tinggi',
      'Remind me to call Buyer K tomorrow at 3pm',
      'Schedule a viewing for P1001 with Buyer K on Friday at 11am',
      'Show my appointments tomorrow',
      'Add a new buyer Lim 012 888 7777',
      'Set the asking price of P1001 to RM3 million',
      'Change the status of P1001 to Sold',
      'Find buyers looking for a factory in Salak Tinggi',
    ],
    more: {
      diag: '语音不能用？打开语音诊断', note: '命令目前可识别英文和马来文。中文语音会转成文字，但其命令暂时无法理解。',
      target: '建议的更改', now: '现在', next: '新值', apply: '应用更改', cancel: '取消', applied: '房产已更新。', choose: '有多个房产符合。请选择一个，或说出它的编号（例如 P1001）。',
      same: '房产已是这些数值。没有需要更改的内容。', notFound: '没有房产符合您所说的。请说出它的编号，例如 P1001。', noTarget: '是哪个房产？请说出编号（例如 P1001）或类型和地点（例如 “the factory in Salak Tinggi”）。',
      buyers: '符合的买家和租客', buyersNone: '没有符合的买家或租客。买家是根据他们的备注和所询问的房产来匹配的。', buyersHow: '根据每位买家的备注，以及他们询问或看过的房产来匹配。联系前请逐一核对。', open: '打开', want: '想找', lead: '客户级别',
    },
  },
};

type Panel =
  | { kind: 'target'; result: Targeted; text: string }
  | { kind: 'buyers'; query: BuyerQuery; matches: BuyerMatch[] };

export function VoiceCommand({ lang, go }: { lang: Lang; go: Go }) {
  const { state, store } = useApp();
  const t = voiceCommandStrings[lang];
  const m = t.more;
  const [panel, setPanel] = useState<Panel | null>(null);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [done, setDone] = useState('');
  const places = [...(state.options.township ?? []), ...(state.options.city ?? [])].map(o => o.value);

  /** Buyer search and price / rent / status changes by name; then to-do, calendar and contact commands. Returns true when handled. */
  function agenda(text: string): boolean {
    setDone('');
    const bq = parseBuyerQuery(text, places);
    if (bq) {
      if (!bq.any) { setPanel(null); go({ name: 'contacts', role: 'buyer' }); return true; }
      setPanel({ kind: 'buyers', query: bq.query, matches: findBuyers(bq.query, state.contacts, state.inquiries, state.appointments, state.properties) });
      return true;
    }
    const tu = parseTargetedUpdate(text, state.properties, places);
    if (tu) {
      setTicked(tu.kind === 'update' ? Object.fromEntries(tu.changes.map(c => [c.key, true])) : {});
      setPanel({ kind: 'target', result: tu, text });
      return true;
    }
    setPanel(null);
    const cmd = parseAgenda(text);
    if (!cmd) return false;
    if (cmd.kind === 'show') {
      if (cmd.what === 'tasks') go({ name: 'todo' }); else go({ name: 'calendar', date: cmd.date });
      return true;
    }
    if (cmd.kind === 'task') {
      go({ name: 'taskForm', prefill: { title: cmd.title, due: cmd.date ? (cmd.time ? `${cmd.date}T${cmd.time}` : cmd.date) : undefined, priority: cmd.priority ?? 'medium' } });
      return true;
    }
    if (cmd.kind === 'appointment') {
      const prop = cmd.ref ? state.properties.find(p => (p.ref ?? '').toUpperCase() === cmd.ref) : undefined;
      const who = cmd.who?.replace(/^the\s+/i, '').toLowerCase();
      const contact = who ? state.contacts.find(c => c.name.toLowerCase().includes(who) || who.includes(c.name.toLowerCase().replace(/\s*\(sample\)/, ''))) : undefined;
      go({ name: 'apptForm', kind: cmd.apptKind, date: cmd.date, time: cmd.time, title: cmd.apptKind === 'viewing' ? undefined : cmd.title || undefined, propertyId: prop?.id, contactId: contact?.id });
      return true;
    }
    if (cmd.kind === 'contact') {
      go({ name: 'contactForm', role: cmd.role, prefill: { name: cmd.name, phone: normalisePhone(cmd.phone) } });
      return true;
    }
    return false;
  }

  const s = listingStrings[lang];
  const propLabel = (l: Listing) => [l.ref, cardTitle(l)].filter(Boolean).join(' · ');

  /** The agent picked one of several matching properties. */
  function choose(l: Listing, changes: Change[]) {
    const real = changes.filter(c => currentValue(l, c.key) !== c.value);
    setTicked(Object.fromEntries(real.map(c => [c.key, true])));
    setPanel({ kind: 'target', result: real.length ? { kind: 'update', property: l, changes: real } : { kind: 'same', property: l }, text: '' });
  }
  function apply(l: Listing, changes: Change[]) {
    const sel = changes.filter(c => ticked[c.key]);
    if (!sel.length) return;
    // Same save path as the property's own voice box: the change is added to the property's change history.
    const next = applyChanges(l, sel);
    store.upsert('properties', { ...next, history: [{ at: Date.now(), source: 'voice', summary: sel.map(x => x.key).join(', ') }, ...(l.history ?? [])] });
    setPanel(null); setDone(m.applied);
  }

  return (
    <section className="stack" data-testid="voice-command">
      <p className="notice">{t.intro}</p>
      <small className="muted" data-testid="voice-cmd-lang-note">{m.note}</small>
      <PropertyVoice lang={lang} mode="central" otherCommand={agenda}
        onCreate={changes => go({ name: 'listingForm', prefill: prefillFrom(changes) })}
        onFind={c => { go({ name: 'listing', filters: { type: c.type, typeWord: c.typeWord, location: c.area, purpose: c.purpose } }); return 0; }} />

      {done && <p className="voice-msg" role="status" data-testid="voice-done">{done}</p>}

      {panel?.kind === 'target' && (
        <div className="proposal stack-sm" data-testid="target-panel">
          {panel.result.kind === 'update' && (() => {
            const r = panel.result;
            return (
              <>
                <strong>{m.target}</strong>
                <small className="muted" data-testid="target-property">{propLabel(r.property)}</small>
                <ul className="prop-list">
                  {r.changes.map(c => (
                    <li key={c.key} className={ticked[c.key] ? 'on' : ''}>
                      <label className="prop-row">
                        <input type="checkbox" checked={!!ticked[c.key]} onChange={e => setTicked(v => ({ ...v, [c.key]: e.target.checked }))} aria-label={changeLabel(s, c.key)} data-testid={`target-${c.key}`} />
                        <span className="prop-main">
                          <span className="prop-label">{changeLabel(s, c.key)}</span>
                          <span className="prop-before">{m.now}: {showValue(s, c.key, currentValue(r.property, c.key), lang)}</span>
                          <span className="prop-after">{m.next}: {showValue(s, c.key, c.value, lang)}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                <div className="two">
                  <button className="btn secondary" onClick={() => setPanel(null)} data-testid="target-cancel">{m.cancel}</button>
                  <button className="btn primary" disabled={!r.changes.some(c => ticked[c.key])} onClick={() => apply(r.property, r.changes)} data-testid="target-apply">{m.apply}</button>
                </div>
              </>
            );
          })()}
          {panel.result.kind === 'same' && <p data-testid="target-same">{propLabel(panel.result.property)}: {m.same}</p>}
          {panel.result.kind === 'none' && <p className="warn-text" role="status" data-testid="target-none">{panel.result.reason === 'notFound' ? m.notFound : m.noTarget}</p>}
          {panel.result.kind === 'choose' && (() => {
            const r = panel.result;
            return (
              <>
                <p role="status" data-testid="target-choose">{m.choose}</p>
                {r.options.map(l => <button key={l.id} className="pick-item" onClick={() => choose(l, r.changes)} data-testid="target-option">{propLabel(l)}</button>)}
              </>
            );
          })()}
        </div>
      )}

      {panel?.kind === 'buyers' && (
        <div className="proposal stack-sm" data-testid="buyers-panel">
          <strong>{m.buyers}</strong>
          <small className="muted">{m.buyersHow}</small>
          {!panel.matches.length && <p data-testid="buyers-none">{m.buyersNone}</p>}
          {panel.matches.map(x => (
            <div key={x.contact.id} className="card stack-sm" data-testid="buyer-match">
              <div className="between">
                <strong>{x.contact.name}</strong>
                {x.contact.leadStatus && <span className="badge" style={{ background: LEAD_COLOURS[x.contact.leadStatus], color: '#000' }}>{x.contact.leadStatus}</span>}
              </div>
              <small className="muted">{x.reasons.join(' · ')}</small>
              <button className="btn small secondary" onClick={() => go({ name: 'contactDetail', id: x.contact.id })} data-testid="buyer-open">{m.open}</button>
            </div>
          ))}
          <button className="btn small ghost" onClick={() => setPanel(null)}>{m.cancel}</button>
        </div>
      )}

      <div className="card stack-sm">
        <div className="card-title">{t.can}</div>
        {t.examples.map(x => <small key={x}>• “{x}”</small>)}
      </div>
      <button className="btn secondary" onClick={() => go({ name: 'voiceDiag' })} data-testid="open-voice-diag">🩺 {m.diag}</button>
    </section>
  );
}
