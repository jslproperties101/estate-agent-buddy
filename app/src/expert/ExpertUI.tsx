// Button 11 — Ask Expert: Lawyer, Banker, Financial Advisor, Tax Adviser, Accountant, Property Valuer, Wealth Planner
// and Agent AI. Questions are saved with their answers. Each answer is labelled with the specialist and a disclaimer.
import { useState } from 'react';
import { Lang, strings } from '../i18n';
import { useApp } from '../data/useStore';
import { newId } from '../data/store';
import { Go } from '../nav';
import { expertStrings } from './strings';
import { EXPERTS, ExpertKey, ExpertThread, ExpertMessage } from '../data/types';
import { PropertySelect, Empty, Confirm } from '../ui/common';
import { SpeechBox } from '../ui/SpeechBox';
import { askAi, propertyContext, propertyLabel } from '../domain/expert';
import { whatsappLink } from '../domain/namecard';
import { config } from '../config';
import { fmtDateTime } from '../lib/dates';
import { IconExpert } from '../icons';
import { usage } from '../usage/logger';
import { Select } from '../ui/Select';

export function ExpertHome({ lang, go }: { lang: Lang; go: Go }) {
  const { state } = useApp();
  const e = expertStrings[lang];
  const threads = [...state.expertThreads].sort((a, b) => b.updated - a.updated);
  return (
    <section className="stack" data-testid="expert">
      <p className="notice">{e.intro}</p>
      <div className="expert-grid">
        {EXPERTS.map(x => (
          <button key={x} className="expert-tile" onClick={() => go({ name: 'expertAsk', expert: x })} data-testid={`expert-${x}`}>
            <span className="tile-icon"><IconExpert /></span><strong>{e.experts[x]}</strong><small>{e.topics[x]}</small>
          </button>
        ))}
      </div>
      <div className="card stack-sm">
        <div className="card-title">{e.previous}</div>
        {threads.length === 0 ? <Empty>{e.none}</Empty> : threads.map(t => (
          <button key={t.id} className="link-row" onClick={() => go({ name: 'expertThread', id: t.id })} data-testid="thread-row">
            <span className="between"><strong className="clamp-2">{t.question}</strong><span className="chip-tag">{e.experts[t.expert]}</span></span>
            <small className="muted">{fmtDateTime(t.updated, lang)} · {t.messages.filter(m => m.from !== 'me').length} ✉</small>
          </button>
        ))}
      </div>
    </section>
  );
}

export function ExpertAsk({ lang, go, expert, propertyId }: { lang: Lang; go: Go; expert: ExpertKey; propertyId?: string }) {
  const { store } = useApp();
  const e = expertStrings[lang];
  const [q, setQ] = useState('');
  const [pid, setPid] = useState(propertyId);
  return (
    <section className="stack" data-testid="expert-ask">
      <h2>{e.experts[expert]}</h2>
      <small className="muted">{e.topics[expert]}</small>
      <div className="card stack-sm">
        <SpeechBox lang={lang} value={q} onChange={setQ} label={e.ask} rows={4} />
        <PropertySelect lang={lang} label={e.property} value={pid} onChange={setPid} />
      </div>
      <button className="btn primary" disabled={!q.trim()} data-testid="save-question" onClick={() => {
        const now = Date.now();
        const t: ExpertThread = { id: newId(), created: now, updated: now, expert, question: q.trim(), propertyId: pid, messages: [{ id: newId(), from: 'me', text: q.trim(), at: now }] };
        store.upsert('expertThreads', t);
        go({ name: 'expertThread', id: t.id });
      }}>{e.save}</button>
    </section>
  );
}

export function ExpertThreadScreen({ lang, go, id }: { lang: Lang; go: Go; id: string }) {
  const { state, store } = useApp();
  const e = expertStrings[lang];
  const c = strings[lang].c;
  const t = state.expertThreads.find(x => x.id === id);
  const [contactId, setContactId] = useState('');
  const [answer, setAnswer] = useState('');
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [del, setDel] = useState(false);
  if (!t) return <Empty>{e.none}</Empty>;
  const who = e.experts[t.expert];
  const prop = state.properties.find(p => p.id === t.propertyId);
  const pros = state.contacts.filter(x => x.roles.includes('professional') && (x.profession === t.expert || !x.profession) && x.phone);
  const pro = state.contacts.find(x => x.id === contactId);
  const cfg = config(state.settings);
  const add = (m: Omit<ExpertMessage, 'id' | 'at'>) => store.upsert('expertThreads', { ...t, messages: [...t.messages, { id: newId(), at: Date.now(), ...m }] });

  async function ai() {
    setBusy(true); setErr('');
    try {
      const headers: Record<string, string> = {};
      if (cfg.supabaseAnonKey) headers.apikey = cfg.supabaseAnonKey;
      const token = state.meta.syncSession?.accessToken ?? cfg.supabaseAnonKey;
      if (token) headers.authorization = `Bearer ${token}`;
      const text = await askAi(cfg.expertApiUrl, {
        expert: t!.expert, question: t!.question, context: propertyContext(prop), lang,
        history: t!.messages.slice(1).map(m => ({ from: m.from, text: m.text })),
      }, headers);
      add({ from: 'ai', text, via: 'ai' });
      usage.ai('expert.ask', true);
    } catch { usage.ai('expert.ask', false); setErr(e.aiErr); }
    setBusy(false);
  }

  return (
    <section className="stack" data-testid="expert-thread">
      <div className="between"><h2>{who}</h2>{prop && <button className="link-btn small" onClick={() => go({ name: 'listingDetail', id: prop.id })}>{propertyLabel(prop)}</button>}</div>
      <ul className="thread">
        {t.messages.map(m => (
          <li key={m.id} className={`msg msg-${m.from}`} data-testid={`msg-${m.from}`}>
            <small className="muted">{m.from === 'me' ? e.you : m.from === 'ai' ? `${who} · ${e.ai}` : `${state.contacts.find(x => x.id === m.contactId)?.name ?? who} · ${e.manual}`}{m.via === 'whatsapp' ? ` · ${e.viaWhatsApp}` : ''} · {fmtDateTime(m.at, lang)}</small>
            <p className="pre">{m.text}</p>
            {m.from !== 'me' && <small className="disclaimer" data-testid="disclaimer">{e.disclaimer(who)}</small>}
          </li>
        ))}
      </ul>

      {t.expert !== 'agent_ai' && (
        <div className="card stack-sm">
          <div className="card-title">{e.sendTo(who)}</div>
          {pros.length === 0 ? <>
            <small className="muted">{e.noExpertContacts(who)}</small>
            <button className="btn small secondary" onClick={() => go({ name: 'contactForm', role: 'professional' })}>{e.addExpertContact}</button>
          </> : <>
            <Select aria-label={e.chooseExpert(who)} value={contactId} onChange={ev => setContactId(ev.target.value)}>
              <option value="">{e.chooseExpert(who)}</option>
              {pros.map(x => <option key={x.id} value={x.id}>{x.name}{x.company ? ` · ${x.company}` : ''}</option>)}
            </Select>
            <a className={`btn primary ${pro ? '' : 'disabled'}`} aria-disabled={!pro} target="_blank" rel="noreferrer"
              href={pro ? whatsappLink(pro.phone, e.waText(pro.name, t.question, propertyLabel(prop))) : undefined}
              onClick={ev => { if (!pro) { ev.preventDefault(); return; } add({ from: 'me', text: t.question, via: 'whatsapp', contactId: pro.id }); }}>WhatsApp</a>
          </>}
        </div>
      )}

      <div className="card stack-sm">
        <button className="btn secondary" disabled={!cfg.expertApiUrl || busy} onClick={() => void ai()} data-testid="ask-ai">{busy ? e.aiBusy : e.aiAsk}</button>
        {!cfg.expertApiUrl && <small className="muted" data-testid="ai-off">{e.aiOff}</small>}
        {err && <p className="error" role="alert">{err}</p>}
      </div>

      <div className="card stack-sm">
        {!recording ? <button className="btn secondary" onClick={() => setRecording(true)}>{e.record}</button> : <>
          <label className="ff">{e.answer}<textarea rows={4} value={answer} onChange={ev => setAnswer(ev.target.value)} /></label>
          <div className="two">
            <button className="btn secondary" onClick={() => { setRecording(false); setAnswer(''); }}>{c.cancel}</button>
            <button className="btn primary" disabled={!answer.trim()} data-testid="save-answer" onClick={() => { add({ from: 'expert', text: answer.trim(), via: 'manual', contactId: contactId || undefined }); setAnswer(''); setRecording(false); }}>{e.saveAnswer}</button>
          </div>
        </>}
      </div>
      <button className="btn ghost danger-text" onClick={() => setDel(true)}>{c.delete}</button>
      {del && <Confirm lang={lang} title={e.deleteQ} body={c.deleteBody} onCancel={() => setDel(false)} onOk={() => { store.remove('expertThreads', t.id); go({ name: 'expert' }); }} />}
    </section>
  );
}
