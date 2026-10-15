// To-Do, Calendar, appointments, inquiries: real records saved on the phone, with reminders.
import { useMemo, useRef, useState } from 'react';
import { useDraft } from '../ui/useDraft';
import { DraftBanner } from '../ui/DraftBanner';
import { Lang, strings } from '../i18n';
import { useApp } from '../data/useStore';
import { newId } from '../data/store';
import { agendaStrings } from './strings';
import { Go } from '../nav';
import { InquiryHistory, ViewingHistory, ViewingItem } from './History';
import { visible, can } from '../team/access';
import { SharingLine } from '../team/TeamUI';
import { teamStrings } from '../team/strings';
import { ContactSelect, PropertySelect, ReminderPicker, LeadPicker, LeadDot, Tabs, Empty, Confirm, SampleTag } from '../ui/common';
import { useToast } from '../ui/toast';
import {
  APPT_KINDS, APPT_STATUSES, INQUIRY_CHANNELS, PRIORITIES, BUYER_ROLES, Appointment, ApptKind, Inquiry, InquiryChannel, Task, Priority, LeadStatus,
} from '../data/types';
import {
  DEFAULT_APPT_REMINDERS, DEFAULT_TASK_REMINDERS, completeTask, convertToViewing, dayItems, followUpTask, setApptStatus, sortTasks,
  taskBucket, TaskBucket, touchContact, isOpenAppt,
} from '../domain/workflow';
import { addDays, datePart, fmtDate, fmtDateTime, fmtTime, localeOf, monthGrid, parseLocal, timePart, weekOf, ymd, ymdhm } from '../lib/dates';
import { cardTitle } from '../listing/model';

const joinDT = (d: string, t: string) => (d ? (t ? `${d}T${t}` : d) : undefined);

// ---------- Inquiries & Viewings screen ----------
export function ActivityScreen({ lang, go, propertyId, contactId, tab }: { lang: Lang; go: Go; propertyId?: string; contactId?: string; tab?: 'inquiries' | 'viewings' }) {
  const a = agendaStrings[lang];
  const { state } = useApp();
  const [t, setT] = useState<'inquiries' | 'viewings'>(tab ?? 'inquiries');
  const prop = state.properties.find(p => p.id === propertyId);
  const contact = state.contacts.find(c => c.id === contactId);
  const scoped = (x: { propertyId?: string; contactId?: string }) => (!propertyId || x.propertyId === propertyId) && (!contactId || x.contactId === contactId);
  return (
    <section className="stack">
      {(prop || contact) && <p className="small muted">{prop ? [prop.ref, cardTitle(prop)].filter(Boolean).join(' · ') : contact!.name}</p>}
      <Tabs label={a.activity.title} value={t} onChange={setT} options={[
        { value: 'inquiries', label: a.inq.title, count: state.inquiries.filter(scoped).length },
        { value: 'viewings', label: a.view.title, count: state.appointments.filter(x => x.kind === 'viewing' && scoped(x)).length },
      ]} />
      <div className="card stack-sm">
        {t === 'inquiries'
          ? <><small className="muted">{a.inq.help}</small><InquiryHistory lang={lang} go={go} propertyId={propertyId} contactId={contactId} plain /></>
          : <><small className="muted">{a.view.flow}</small><ViewingHistory lang={lang} go={go} propertyId={propertyId} contactId={contactId} plain /></>}
      </div>
    </section>
  );
}

// ---------- inquiry form ----------
export function InquiryForm({ lang, back, id, propertyId, contactId }: { lang: Lang; back: () => void; id?: string; propertyId?: string; contactId?: string }) {
  const { state, store } = useApp();
  const a = agendaStrings[lang];
  const c = strings[lang].c;
  const toast = useToast();
  const existing = id ? state.inquiries.find(x => x.id === id) : undefined;
  const [d, setD] = useState<Inquiry>(() => existing ?? {
    id: newId(), created: Date.now(), updated: Date.now(), contactId: contactId ?? '', propertyId, at: ymdhm(new Date()), channel: 'whatsapp' as InquiryChannel,
  });
  const followTask = existing?.followUpTaskId ? state.tasks.find(t => t.id === existing.followUpTaskId) : undefined;
  const [follow, setFollow] = useState(followTask?.due?.slice(0, 10) ?? '');
  const [err, setErr] = useState(false);
  const [del, setDel] = useState(false);
  const followInit = useRef(follow);
  const draft = useDraft<Inquiry>({ collection: 'inquiries', existing, value: d, apply: setD, extra: follow, applyExtra: e => setFollow(typeof e === 'string' ? e : followInit.current), variant: { contactId, propertyId } });
  const contact = state.contacts.find(x => x.id === d.contactId);

  function save(): Inquiry | null {
    if (!d.contactId) { setErr(true); return null; }
    let next = { ...d };
    if (follow) {
      const title = a.inq.followUpTitle(contact?.name ?? '');
      // The follow-up task's id comes from the inquiry's, so pressing Save twice can never create two tasks.
      const task = followTask ? { ...followTask, due: follow, title: followTask.title || title } : followUpTask({ id: `${d.id}:fu`, title, due: follow, contactId: d.contactId, propertyId: d.propertyId, inquiryId: d.id, notes: d.message });
      store.upsert('tasks', task);
      next = { ...next, followUpTaskId: task.id };
    }
    store.upsert('inquiries', next);
    if (contact && !existing && can(store.getState(), 'edit', 'contacts', contact.id)) store.upsert('contacts', touchContact(contact));
    return next;
  }

  return (
    <section className="stack" data-testid="inquiry-form">
      <DraftBanner lang={lang} draft={draft} />
      <div className="card stack-sm">
        <ContactSelect lang={lang} label={a.inq.who} roles={BUYER_ROLES.slice(0, 1)} value={d.contactId || undefined} required invalid={err}
          onChange={v => { setD(x => ({ ...x, contactId: v ?? '' })); setErr(false); }} />
        {err && <p className="error" role="alert">{a.inq.contactRequired}</p>}
        {contact && <LeadPicker lang={lang} value={contact.leadStatus} onChange={(v: LeadStatus | undefined) => store.upsert('contacts', { ...contact, leadStatus: v })} />}
        <PropertySelect lang={lang} value={d.propertyId} onChange={v => setD(x => ({ ...x, propertyId: v }))} />
        <label className="ff">{a.inq.at}<input type="datetime-local" value={d.at} onChange={e => setD(x => ({ ...x, at: e.target.value || x.at }))} /></label>
        <label className="ff">{a.inq.channel}
          <select value={d.channel} onChange={e => setD(x => ({ ...x, channel: e.target.value as InquiryChannel }))}>
            {INQUIRY_CHANNELS.map(ch => <option key={ch} value={ch}>{a.inq.channels[ch]}</option>)}
          </select>
        </label>
        <label className="ff">{a.inq.message}<textarea rows={3} value={d.message ?? ''} onChange={e => setD(x => ({ ...x, message: e.target.value || undefined }))} /></label>
        <label className="ff">{a.inq.followUp}<input type="date" value={follow} onChange={e => setFollow(e.target.value)} /></label>
      </div>
      {existing && (
        <div className="two">
          <button className="btn secondary" onClick={() => {
            const saved = save(); if (!saved) return;
            store.upsert('appointments', convertToViewing(saved, { id: newId() }));
            store.remove('inquiries', saved.id);
            draft.clear();
            toast(a.inq.converted); back();
          }}>{a.inq.convert}</button>
          <button className="btn ghost danger-text" onClick={() => setDel(true)}>{c.delete}</button>
        </div>
      )}
      <div className="save-bar"><div className="two">
        <button className="btn secondary" onClick={back}>{c.cancel}</button>
        <button className="btn primary" data-testid="save-inquiry" onClick={() => { if (save()) { draft.clear(); toast(c.saved); back(); } }}>{c.save}</button>
      </div></div>
      {del && existing && <Confirm lang={lang} title={c.deleteQ} body={c.deleteBody} onCancel={() => setDel(false)} onOk={() => { store.remove('inquiries', existing.id); back(); }} />}
    </section>
  );
}

// ---------- appointment form ----------
export function ApptForm({ lang, back, id, kind, propertyId, contactId, date, time, title }: {
  lang: Lang; back: () => void; id?: string; kind?: ApptKind; propertyId?: string; contactId?: string; date?: string; time?: string; title?: string;
}) {
  const { state, store } = useApp();
  const a = agendaStrings[lang];
  const c = strings[lang].c;
  const toast = useToast();
  const existing = id ? state.appointments.find(x => x.id === id) : undefined;
  const [d, setD] = useState<Appointment>(() => existing ?? {
    id: newId(), created: Date.now(), updated: Date.now(), kind: kind ?? 'viewing', status: date && time ? 'scheduled' : 'pending',
    start: joinDT(date ?? '', time ?? ''), propertyId, contactId, title, reminders: DEFAULT_APPT_REMINDERS, durationMin: 60,
  });
  const [dDate, setDDate] = useState(datePart(d.start));
  const [dTime, setDTime] = useState(timePart(d.start));
  const [del, setDel] = useState(false);
  const dtInit = useRef({ dDate, dTime });
  const draft = useDraft<Appointment>({
    collection: 'appointments', existing, value: d, apply: setD, extra: { dDate, dTime }, variant: { kind, propertyId, contactId, date, time, title },
    applyExtra: e => { const x = (e ?? dtInit.current) as { dDate: string; dTime: string }; setDDate(x.dDate); setDTime(x.dTime); },
  });
  const contact = state.contacts.find(x => x.id === d.contactId);
  const statusLabel = (s: string) => (d.kind === 'viewing' ? a.view.status[s] : a.appt.status[s]);
  // Change 010: a calendar entry another agent shares with me as View Only is shown but cannot be saved or deleted.
  const readOnly = !!existing && !can(state, 'edit', 'appointments', existing.id);
  const mayDelete = !!existing && can(state, 'delete', 'appointments', existing.id);

  function save(): Appointment {
    const start = joinDT(dDate, dTime);
    const next = { ...d, start, completedAt: d.status === 'completed' ? d.completedAt ?? Date.now() : undefined };
    store.upsert('appointments', next);
    if (contact && next.status === 'completed' && existing?.status !== 'completed' && can(store.getState(), 'edit', 'contacts', contact.id)) store.upsert('contacts', touchContact(contact));
    return next;
  }

  return (
    <section className="stack" data-testid="appt-form">
      <DraftBanner lang={lang} draft={draft} />
      <div className="card stack-sm">
        <label className="ff">{a.appt.kind}
          <select data-field="kind" value={d.kind} onChange={e => setD(x => ({ ...x, kind: e.target.value as ApptKind }))}>
            {APPT_KINDS.map(k => <option key={k} value={k}>{a.appt.kinds[k]}</option>)}
          </select>
        </label>
        <label className="ff">{strings[lang].c.status}
          <select data-field="status" value={d.status} onChange={e => setD(x => ({ ...x, status: e.target.value as Appointment['status'] }))}>
            {APPT_STATUSES.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </select>
        </label>
        {d.status === 'pending' && <small className="muted">{a.appt.pendingHint}</small>}
        <label className="ff">{a.appt.title}<input data-field="title" value={d.title ?? ''} onChange={e => setD(x => ({ ...x, title: e.target.value || undefined }))} /></label>
        <div className="two">
          <label className="ff">{a.appt.date}<input type="date" data-field="date" value={dDate} onChange={e => setDDate(e.target.value)} /></label>
          <label className="ff">{a.appt.time}<input type="time" data-field="time" value={dTime} onChange={e => setDTime(e.target.value)} /></label>
        </div>
        <label className="ff">{a.appt.duration}<input inputMode="numeric" value={d.durationMin ?? ''} onChange={e => setD(x => ({ ...x, durationMin: Number(e.target.value.replace(/\D/g, '')) || undefined }))} /></label>
        <PropertySelect lang={lang} value={d.propertyId} onChange={v => setD(x => ({ ...x, propertyId: v }))} />
        <ContactSelect lang={lang} roles={d.kind === 'viewing' ? ['buyer'] : ['other']} value={d.contactId} onChange={v => setD(x => ({ ...x, contactId: v }))} />
        {contact && can(state, 'edit', 'contacts', contact.id) && <LeadPicker lang={lang} value={contact.leadStatus} onChange={v => store.upsert('contacts', { ...contact, leadStatus: v })} />}
        <label className="ff">{a.appt.place}<input value={d.place ?? ''} onChange={e => setD(x => ({ ...x, place: e.target.value || undefined }))} /></label>
        <label className="ff">{strings[lang].c.notes}<textarea rows={2} value={d.notes ?? ''} onChange={e => setD(x => ({ ...x, notes: e.target.value || undefined }))} /></label>
        {(d.status === 'completed' || d.outcome) && <label className="ff">{d.kind === 'viewing' ? a.view.outcome : a.appt.outcome}<textarea rows={2} value={d.outcome ?? ''} onChange={e => setD(x => ({ ...x, outcome: e.target.value || undefined }))} /></label>}
        <ReminderPicker lang={lang} value={d.reminders} onChange={r => setD(x => ({ ...x, reminders: r }))} />
        <small className="muted">{strings[lang].reminders.note}</small>
      </div>
      {readOnly && <p className="notice" data-testid="read-only-note">{teamStrings[lang].readOnlyNote}</p>}
      {existing && existing.id && <SharingLine lang={lang} collection="appointments" id={existing.id} />}
      {existing && !readOnly && (
        <div className="row-wrap">
          <button className="btn secondary" onClick={() => {
            const saved = save();
            const name = [a.appt.kinds[saved.kind], contact?.name].filter(Boolean).join(' · ');
            const due = ymd(addDays(new Date(), 1));
            store.upsert('tasks', followUpTask({ id: `${saved.id}:fu`, title: a.appt.followUpTitle(name), due, contactId: saved.contactId, propertyId: saved.propertyId, appointmentId: saved.id }));
            toast(c.saved);
          }}>{a.appt.followUp}</button>
          {mayDelete && <button className="btn ghost danger-text" onClick={() => setDel(true)}>{c.delete}</button>}
        </div>
      )}
      <div className="save-bar"><div className="two">
        <button className="btn secondary" onClick={back}>{c.cancel}</button>
        <button className="btn primary" data-testid="save-appt" disabled={readOnly} onClick={() => {
          if (existing && !can(store.getState(), 'edit', 'appointments', existing.id)) { toast(teamStrings[lang].notAllowed, 'error'); return; }
          save(); draft.clear(); toast(c.saved); back();
        }}>{c.save}</button>
      </div></div>
      {del && existing && <Confirm lang={lang} title={a.appt.deleteQ} body={c.deleteBody} onCancel={() => setDel(false)} onOk={() => { if (can(store.getState(), 'delete', 'appointments', existing.id)) store.remove('appointments', existing.id); back(); }} />}
    </section>
  );
}

// ---------- To-Do ----------
export function TodoScreen({ lang, go }: { lang: Lang; go: Go }) {
  const { state, store } = useApp();
  const a = agendaStrings[lang];
  const now = new Date();
  const buckets = useMemo(() => {
    const b: Record<TaskBucket, Task[]> = { overdue: [], today: [], upcoming: [], someday: [], done: [] };
    for (const t of visible(state, 'tasks', state.tasks)) b[taskBucket(t, now)].push(t);
    for (const k of Object.keys(b) as TaskBucket[]) b[k] = sortTasks(b[k]);
    return b;
  }, [state.tasks, state.meta.shared, state.meta.team, state.settings.workspaceView]); // eslint-disable-line react-hooks/exhaustive-deps
  const [tab, setTab] = useState<TaskBucket>(buckets.overdue.length ? 'overdue' : 'today');
  const order: TaskBucket[] = ['overdue', 'today', 'upcoming', 'someday', 'done'];
  return (
    <section className="stack" data-testid="todo">
      <button className="btn primary" onClick={() => go({ name: 'taskForm' })}>{a.todo.add}</button>
      <Tabs label={a.todo.title} value={tab} onChange={setTab} options={order.map(k => ({ value: k, label: a.todo.tabs[k], count: buckets[k].length }))} />
      {tab === 'done' && <small className="muted">{a.todo.history}</small>}
      {buckets[tab].length === 0 ? <Empty>{a.todo.none[tab]}</Empty> : (
        <ul className="task-list">
          {buckets[tab].map(t => <TaskRow key={t.id} lang={lang} t={t} go={go} onToggle={() => {
            if (!can(store.getState(), 'edit', 'tasks', t.id)) return;
            const next = completeTask(t, !t.done);
            store.upsert('tasks', next);
            const contact = state.contacts.find(c => c.id === t.contactId);
            if (next.done && contact && can(store.getState(), 'edit', 'contacts', contact.id)) store.upsert('contacts', touchContact(contact));
          }} />)}
        </ul>
      )}
    </section>
  );
}

export function TaskRow({ lang, t, go, onToggle }: { lang: Lang; t: Task; go: Go; onToggle: () => void }) {
  const { state } = useApp();
  const a = agendaStrings[lang];
  const prop = state.properties.find(p => p.id === t.propertyId);
  const contact = state.contacts.find(c => c.id === t.contactId);
  const overdue = taskBucket(t, new Date()) === 'overdue';
  return (
    <li className={`task ${t.done ? 'done' : ''} ${overdue ? 'overdue' : ''}`} data-testid="task">
      <input type="checkbox" checked={t.done} onChange={onToggle} aria-label={t.done ? a.todo.reopen(t.title) : a.todo.markDone(t.title)} />
      <button className="task-main" onClick={() => go({ name: 'taskForm', id: t.id })}>
        <strong>{t.title}</strong>
        <span className="row-wrap small">
          <span className={`prio prio-${t.priority}`}>{a.todo.priority[t.priority]}</span>
          {t.kind === 'follow_up' && <span className="chip-tag">{a.todo.followUp}</span>}
          {t.due && <span className={overdue ? 'warn-text' : 'muted'}>{fmtDateTime(t.due, lang)}</span>}
          {t.sample && <SampleTag lang={lang} />}
          {t.done && t.completedAt && <span className="muted">{a.todo.completedOn(fmtDate(t.completedAt, lang))}</span>}
        </span>
        {(prop || contact) && <span className="small muted">{[prop && (cardTitle(prop) || prop.ref), contact?.name].filter(Boolean).join(' · ')}</span>}
      </button>
      {contact?.leadStatus && <LeadDot lang={lang} status={contact.leadStatus} withText={false} />}
    </li>
  );
}

export function TaskForm({ lang, back, id, prefill }: { lang: Lang; back: () => void; id?: string; prefill?: Partial<Task> }) {
  const { state, store } = useApp();
  const a = agendaStrings[lang];
  const c = strings[lang].c;
  const toast = useToast();
  const existing = id ? state.tasks.find(x => x.id === id) : undefined;
  const [d, setD] = useState<Task>(() => existing ?? {
    id: newId(), created: Date.now(), updated: Date.now(), title: '', priority: 'medium', done: false, kind: 'task', reminders: DEFAULT_TASK_REMINDERS, ...prefill,
  });
  const [dDate, setDDate] = useState(datePart(d.due));
  const [dTime, setDTime] = useState(timePart(d.due));
  const [err, setErr] = useState(false);
  const [del, setDel] = useState(false);
  const dtInit = useRef({ dDate, dTime });
  const draft = useDraft<Task>({
    collection: 'tasks', existing, value: d, apply: setD, extra: { dDate, dTime }, variant: prefill,
    applyExtra: e => { const x = (e ?? dtInit.current) as { dDate: string; dTime: string }; setDDate(x.dDate); setDTime(x.dTime); },
  });
  return (
    <section className="stack" data-testid="task-form">
      <DraftBanner lang={lang} draft={draft} />
      <div className="card stack-sm">
        <label className="ff">{a.todo.fields.title}<input data-field="title" aria-invalid={err} value={d.title} onChange={e => { setD(x => ({ ...x, title: e.target.value })); setErr(false); }} /></label>
        {err && <p className="error" role="alert">{a.todo.titleRequired}</p>}
        <div className="two">
          <label className="ff">{a.todo.fields.due}<input type="date" data-field="due" value={dDate} onChange={e => setDDate(e.target.value)} /></label>
          <label className="ff">{a.todo.fields.time}<input type="time" data-field="dueTime" value={dTime} onChange={e => setDTime(e.target.value)} /></label>
        </div>
        <label className="ff">{a.todo.fields.priority}
          <select data-field="priority" value={d.priority} onChange={e => setD(x => ({ ...x, priority: e.target.value as Priority }))}>
            {PRIORITIES.map(p => <option key={p} value={p}>{a.todo.priority[p]}</option>)}
          </select>
        </label>
        <label className="check"><input type="checkbox" checked={d.kind === 'follow_up'} onChange={e => setD(x => ({ ...x, kind: e.target.checked ? 'follow_up' : 'task' }))} /> {a.todo.fields.followUp}</label>
        <PropertySelect lang={lang} value={d.propertyId} onChange={v => setD(x => ({ ...x, propertyId: v }))} />
        <ContactSelect lang={lang} roles={['other']} value={d.contactId} onChange={v => setD(x => ({ ...x, contactId: v }))} />
        <label className="ff">{a.todo.fields.notes}<textarea rows={2} value={d.notes ?? ''} onChange={e => setD(x => ({ ...x, notes: e.target.value || undefined }))} /></label>
        <ReminderPicker lang={lang} value={d.reminders} onChange={r => setD(x => ({ ...x, reminders: r }))} />
        {existing && <label className="check"><input type="checkbox" checked={d.done} onChange={e => setD(x => completeTask(x, e.target.checked))} /> {strings[lang].c.done}</label>}
      </div>
      {existing && <SharingLine lang={lang} collection="tasks" id={existing.id} />}
      {existing && !can(state, 'edit', 'tasks', existing.id) && <p className="notice" data-testid="read-only-note">{teamStrings[lang].readOnlyNote}</p>}
      {existing && can(state, 'delete', 'tasks', existing.id) && <button className="btn ghost danger-text" onClick={() => setDel(true)}>{c.delete}</button>}
      <div className="save-bar"><div className="two">
        <button className="btn secondary" onClick={back}>{c.cancel}</button>
        <button className="btn primary" data-testid="save-task" disabled={!!existing && !can(state, 'edit', 'tasks', existing.id)} onClick={() => {
          if (!d.title.trim()) { setErr(true); return; }
          if (existing && !can(store.getState(), 'edit', 'tasks', existing.id)) { toast(teamStrings[lang].notAllowed, 'error'); return; }
          store.upsert('tasks', { ...d, title: d.title.trim(), due: joinDT(dDate, dTime) });
          draft.clear();
          toast(c.saved); back();
        }}>{c.save}</button>
      </div></div>
      {del && existing && <Confirm lang={lang} title={a.todo.deleteQ} body={c.deleteBody} onCancel={() => setDel(false)} onOk={() => { if (can(store.getState(), 'delete', 'tasks', existing.id)) store.remove('tasks', existing.id); back(); }} />}
    </section>
  );
}

// ---------- Calendar ----------
export function CalendarScreen({ lang, go, date }: { lang: Lang; go: Go; date?: string }) {
  const { state, store } = useApp();
  const a = agendaStrings[lang];
  const today = ymd(new Date());
  const [sel, setSel] = useState(date ?? today);
  const [view, setView] = useState<'month' | 'week'>('month');
  const [filter, setFilter] = useState<'all' | 'open' | 'completed' | 'cancelled'>('all');
  const selDate = parseLocal(sel)!;
  const [month, setMonth] = useState({ y: selDate.getFullYear(), m: selDate.getMonth() });
  const days = view === 'month' ? monthGrid(month.y, month.m) : weekOf(selDate);
  const weekdayNames = weekOf(new Date(2026, 9, 12)).map(d => d.toLocaleDateString(localeOf(lang), { weekday: 'short' }));
  const counts = useMemo(() => {
    const m = new Map<string, { appts: number; tasks: number }>();
    for (const ap of visible(state, 'appointments', state.appointments)) if (ap.start && ap.status !== 'cancelled') { const k = ap.start.slice(0, 10); const v = m.get(k) ?? { appts: 0, tasks: 0 }; v.appts++; m.set(k, v); }
    for (const t of visible(state, 'tasks', state.tasks)) if (t.due && !t.done) { const k = t.due.slice(0, 10); const v = m.get(k) ?? { appts: 0, tasks: 0 }; v.tasks++; m.set(k, v); }
    return m;
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
  const items = dayItems(sel, visible(state, 'appointments', state.appointments), visible(state, 'tasks', state.tasks));
  const appts = items.appts.filter(x => filter === 'all' || (filter === 'open' ? isOpenAppt(x) : x.status === filter));
  const shift = (n: number) => {
    if (view === 'month') setMonth(p => { const d = new Date(p.y, p.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
    else { const d = addDays(selDate, 7 * n); setSel(ymd(d)); setMonth({ y: d.getFullYear(), m: d.getMonth() }); }
  };
  const title = view === 'month'
    ? new Date(month.y, month.m, 1).toLocaleDateString(localeOf(lang), { month: 'long', year: 'numeric' })
    : `${fmtDate(ymd(days[0]), lang, { day: 'numeric', month: 'short' })} – ${fmtDate(ymd(days[6]), lang, { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return (
    <section className="stack" data-testid="calendar">
      <div className="between cal-head">
        <button className="icon-btn" aria-label={view === 'month' ? a.cal.prev : a.cal.prevWeek} onClick={() => shift(-1)}>‹</button>
        <strong data-testid="cal-title">{title}</strong>
        <button className="icon-btn" aria-label={view === 'month' ? a.cal.next : a.cal.nextWeek} onClick={() => shift(1)}>›</button>
      </div>
      <div className="row-wrap">
        <div className="seg" role="group" aria-label={a.cal.title}>
          <button aria-pressed={view === 'month'} onClick={() => setView('month')}>{a.cal.month}</button>
          <button aria-pressed={view === 'week'} onClick={() => setView('week')}>{a.cal.week}</button>
        </div>
        <button className="btn small secondary" onClick={() => { setSel(today); const d = new Date(); setMonth({ y: d.getFullYear(), m: d.getMonth() }); }}>{a.cal.today}</button>
      </div>
      <div className="cal-grid" role="grid" aria-label={title}>
        {weekdayNames.map(w => <span key={w} className="cal-wd" role="columnheader">{w}</span>)}
        {days.map(d => {
          const k = ymd(d);
          const cnt = counts.get(k);
          const other = view === 'month' && d.getMonth() !== month.m;
          return (
            <button key={k} role="gridcell" aria-selected={k === sel} data-date={k}
              className={`cal-day ${k === sel ? 'sel' : ''} ${k === today ? 'today' : ''} ${other ? 'other' : ''}`}
              aria-label={`${fmtDate(k, lang, { weekday: 'long', day: 'numeric', month: 'long' })}${cnt ? ` · ${cnt.appts + cnt.tasks}` : ''}`}
              onClick={() => setSel(k)}>
              <span>{d.getDate()}</span>
              <span className="cal-dots">{cnt?.appts ? <i className="dot-a" /> : null}{cnt?.tasks ? <i className="dot-t" /> : null}</span>
            </button>
          );
        })}
      </div>

      <div className="card stack-sm" data-testid="cal-day">
        <div className="card-title">{fmtDate(sel, lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</div>
        <div className="row-wrap">
          <button className="btn small primary" onClick={() => go({ name: 'apptForm', kind: 'meeting', date: sel })}>{a.cal.add}</button>
          <button className="btn small secondary" onClick={() => go({ name: 'taskForm', prefill: { due: sel } })}>{a.cal.addTask}</button>
        </div>
        <Tabs label={a.cal.title} value={filter} onChange={setFilter} options={(['all', 'open', 'completed', 'cancelled'] as const).map(f => ({ value: f, label: a.cal.filter[f] }))} />
        {appts.length === 0 && items.tasks.length === 0 && <Empty>{a.cal.none}</Empty>}
        <ul className="act-list">
          {appts.map(ap => ap.kind === 'viewing'
            ? <ViewingItem key={ap.id} lang={lang} v={ap} go={go} showProperty />
            : <ApptItem key={ap.id} lang={lang} ap={ap} go={go} onStatus={s => store.upsert('appointments', setApptStatus(ap, s))} />)}
        </ul>
        {items.tasks.length > 0 && <>
          <strong className="small">{a.cal.tasksDue}</strong>
          <ul className="task-list">{items.tasks.map(t => <TaskRow key={t.id} lang={lang} t={t} go={go} onToggle={() => store.upsert('tasks', completeTask(t, !t.done))} />)}</ul>
        </>}
      </div>
    </section>
  );
}

function ApptItem({ lang, ap, go, onStatus }: { lang: Lang; ap: Appointment; go: Go; onStatus: (s: Appointment['status']) => void }) {
  const { state } = useApp();
  const a = agendaStrings[lang];
  const contact = state.contacts.find(c => c.id === ap.contactId);
  const prop = state.properties.find(p => p.id === ap.propertyId);
  const open = isOpenAppt(ap);
  return (
    <li className={`act-item st-${ap.status}`} data-testid="appt-item">
      <div className="between">
        <button className="link-btn" onClick={() => go({ name: 'apptForm', id: ap.id })}><strong>{ap.title || a.appt.kinds[ap.kind]}</strong></button>{ap.sample && <SampleTag lang={lang} />}
        <span className={`appt-st appt-${ap.status}`}>{a.appt.status[ap.status]}</span>
      </div>
      <small className="muted">{[fmtTime(ap.start, lang), a.appt.kinds[ap.kind], contact?.name, prop && cardTitle(prop)].filter(Boolean).join(' · ')}</small>
      {open && (
        <div className="row-wrap">
          <button className="btn small primary" onClick={() => onStatus('completed')}>{a.appt.complete}</button>
          <button className="btn small secondary" onClick={() => onStatus('cancelled')}>{a.appt.cancel}</button>
        </div>
      )}
      {!open && <button className="btn small ghost" onClick={() => onStatus('scheduled')}>{a.appt.reopen}</button>}
    </li>
  );
}
