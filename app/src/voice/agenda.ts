// Voice / text commands for To-Do and Calendar, in English and Bahasa Malaysia. Like property commands, they only
// PROPOSE a task or appointment; the agent checks it and saves. A date or time that was not said is left empty.
import { normaliseSpoken } from './spoken';
import { addDays, startOfDay, ymd } from '../lib/dates';
import type { ApptKind } from '../data/types';

export type AgendaCommand =
  | { kind: 'task'; title: string; date?: string; time?: string; priority?: 'urgent' | 'high' }
  | { kind: 'appointment'; apptKind: ApptKind; title: string; date?: string; time?: string; who?: string; ref?: string }
  | { kind: 'show'; what: 'appointments' | 'tasks' | 'viewings'; date?: string }
  | { kind: 'contact'; role: 'buyer' | 'vendor'; name?: string; phone?: string };

const WEEKDAYS_EN = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const WEEKDAYS_BM = ['ahad', 'isnin', 'selasa', 'rabu', 'khamis', 'jumaat', 'sabtu'];
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTHS_BM = ['jan', 'feb', 'mac', 'apr', 'mei', 'jun', 'jul', 'ogo', 'sep', 'okt', 'nov', 'dis'];

/** A date said in words: today, tomorrow, day after tomorrow, a weekday, "12 October", "12/10". */
export function readDate(text: string, now: Date): { date?: string; match?: string } {
  const low = text.toLowerCase();
  const today = startOfDay(now);
  const rel: [RegExp, number][] = [
    [/\b(?:day after tomorrow|lusa)\b/, 2], [/\b(?:tomorrow|esok)\b/, 1], [/\b(?:today|hari ini|tonight|malam ini)\b/, 0],
  ];
  for (const [re, n] of rel) { const m = re.exec(low); if (m) return { date: ymd(addDays(today, n)), match: m[0] }; }
  const wd = /\b(?:(next|depan)\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|ahad|isnin|selasa|rabu|khamis|jumaat|sabtu)(?:\s+(depan|ini))?\b/.exec(low);
  if (wd) {
    const name = wd[2];
    const target = WEEKDAYS_EN.includes(name) ? WEEKDAYS_EN.indexOf(name) : WEEKDAYS_BM.indexOf(name);
    // The coming one: "Friday" on a Friday means next week's Friday.
    let diff = (target - today.getDay() + 7) % 7;
    if (diff === 0) diff = 7;
    return { date: ymd(addDays(today, diff)), match: wd[0] };
  }
  const dm = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?([a-z]{3})[a-z]*(?:\s+(\d{4}))?\b/.exec(low);
  if (dm) {
    const k = dm[2];
    const mi = MONTHS.indexOf(k) >= 0 ? MONTHS.indexOf(k) : MONTHS_BM.indexOf(k);
    if (mi >= 0) {
      let y = dm[3] ? Number(dm[3]) : today.getFullYear();
      let d = new Date(y, mi, Number(dm[1]));
      if (!dm[3] && d < today) { y += 1; d = new Date(y, mi, Number(dm[1])); }
      return { date: ymd(d), match: dm[0] };
    }
  }
  const slash = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(low);
  if (slash) {
    let y = slash[3] ? Number(slash[3].length === 2 ? '20' + slash[3] : slash[3]) : today.getFullYear();
    let d = new Date(y, Number(slash[2]) - 1, Number(slash[1]));
    if (!slash[3] && d < today) { y += 1; d = new Date(y, Number(slash[2]) - 1, Number(slash[1])); }
    return { date: ymd(d), match: slash[0] };
  }
  return {};
}

/** A time said in words: "3pm", "3.30 pm", "15:30", "pukul 3 petang", "10 pagi". */
export function readTime(text: string): { time?: string; match?: string } {
  const low = text.toLowerCase();
  const two = (n: number) => String(n).padStart(2, '0');
  const ampm = /\b(?:at\s+|pukul\s+|jam\s+)?(\d{1,2})(?:[.:](\d{2}))?\s*(a\.?m\.?|p\.?m\.?|pagi|tengah hari|petang|malam)\b/.exec(low);
  if (ampm) {
    let h = Number(ampm[1]);
    const m = Number(ampm[2] ?? 0);
    const suffix = ampm[3].replace(/\./g, '');
    if ((suffix === 'pm' || suffix === 'petang' || suffix === 'malam') && h < 12) h += 12;
    if ((suffix === 'am' || suffix === 'pagi') && h === 12) h = 0;
    if (suffix === 'tengah hari' && h < 11) h += 12;
    if (h < 24 && m < 60) return { time: `${two(h)}:${two(m)}`, match: ampm[0] };
  }
  const h24 = /\b(?:at\s+|pukul\s+|jam\s+)?([01]?\d|2[0-3])[:.]([0-5]\d)\b/.exec(low);
  if (h24) return { time: `${two(Number(h24[1]))}:${h24[2]}`, match: h24[0] };
  const bare = /\b(?:at|pukul|jam)\s+(\d{1,2})\b/.exec(low);
  if (bare && Number(bare[1]) <= 23) {
    let h = Number(bare[1]);
    if (h >= 1 && h <= 7) h += 12; // "at 3" in working hours means 3 pm
    return { time: `${two(h)}:00`, match: bare[0] };
  }
  return {};
}

const tidy = (s: string) => s.replace(/\s+/g, ' ').replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, '').replace(/^\w/, c => c.toUpperCase());

export function parseAgenda(raw: string, now = new Date()): AgendaCommand | null {
  const text = normaliseSpoken(raw.trim());
  const low = text.toLowerCase();
  if (!low) return null;

  // "show my appointments tomorrow", "tunjuk temujanji esok", "what are my tasks today"
  if (/^(?:please\s+)?(?:show|list|what(?:'s| is| are)|tunjuk|senarai|apa)\b/.test(low) && /\b(?:appointments?|calendar|schedule|viewings?|tasks?|to-?dos?|temujanji|jadual|lawatan|tugasan)\b/.test(low)) {
    const what = /\b(?:viewings?|lawatan)\b/.test(low) ? 'viewings' : /\b(?:tasks?|to-?dos?|tugasan)\b/.test(low) ? 'tasks' : 'appointments';
    return { kind: 'show', what, date: readDate(text, now).date };
  }

  // "add a new buyer Ahmad 012 345 6789", "tambah pembeli baharu"
  const contact = /^(?:please\s+)?(?:add|create|new|tambah|cipta|daftar)\s+(?:a\s+)?(?:new\s+)?(buyer|tenant|vendor|owner|landlord|pembeli|penyewa|penjual|pemilik)(?:\s+baharu)?\b(.*)$/i.exec(text);
  if (contact) {
    const role = /buyer|tenant|pembeli|penyewa/i.test(contact[1]) ? 'buyer' : 'vendor';
    const rest = contact[2] ?? '';
    const phone = /(?:\+?6?0)1\d[\s-]?\d{3,4}[\s-]?\d{4}|0[3-9][\s-]?\d{3,4}[\s-]?\d{4}/.exec(rest)?.[0];
    const name = tidy(rest.replace(phone ?? '', '').replace(/^\s*(?:named|called|bernama|nama)\s+/i, '').replace(/\b(?:phone|telefon|number|nombor)\b.*$/i, ''));
    return { kind: 'contact', role, name: name || undefined, phone };
  }

  const d = readDate(text, now);
  const tm = readTime(text);
  const strip = (s: string): string => [d.match, tm.match].reduce<string>((acc, m) => (m ? acc.replace(new RegExp(m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ') : acc), s);

  // Appointments: "schedule a viewing for P1001 with Ahmad on Friday at 11am", "set a meeting with the lawyer tomorrow 3pm"
  const appt = /^(?:please\s+)?(?:schedule|book|set(?:\s+up)?|arrange|add|create|make|buat|atur|tetapkan|tambah)\s+(?:an?\s+)?(viewing|site\s+visit|meeting|appointment|signing|lawatan|temujanji|mesyuarat|tandatangan)\b(.*)$/i.exec(text);
  if (appt) {
    const w = appt[1].toLowerCase();
    const apptKind: ApptKind = /viewing|lawatan/.test(w) ? 'viewing' : /site/.test(w) ? 'site_visit' : /signing|tandatangan/.test(w) ? 'signing' : 'meeting';
    const rest = strip(appt[2] ?? '');
    const ref = /\b([A-Za-z]{1,6}-?\d{3,9})\b/.exec(rest)?.[1]?.toUpperCase().replace('-', '');
    const who = /\b(?:with|dengan)\s+((?:the\s+)?[A-Za-z][\w'.-]*(?:\s+(?:bin|binti|[A-Z][\w'.-]*)){0,3})/.exec(rest)?.[1];
    const title = tidy(rest.replace(/\b(?:on|at|for|pada|untuk)\s*$/i, '').replace(/^\s*(?:for|untuk)\s+/i, ''));
    return { kind: 'appointment', apptKind, title, date: d.date, time: tm.time, who, ref };
  }

  // Tasks: "remind me to call Ahmad tomorrow at 3pm", "add a task: send brochure", "ingatkan saya ..."
  const task = /^(?:please\s+)?(?:remind\s+me\s+to|remind\s+me|add\s+(?:a\s+)?(?:task|to-?do|follow[-\s]?up)(?:\s+to)?|new\s+task|create\s+(?:a\s+)?task|ingatkan\s+saya(?:\s+untuk)?|tambah\s+tugasan|tugasan\s+baharu)\b[:\s]*(.*)$/i.exec(text);
  if (task) {
    const body = strip(task[1] ?? '');
    const priority = /\b(?:urgent|segera|penting)\b/i.test(body) ? 'urgent' : /\bhigh priority\b/i.test(body) ? 'high' : undefined;
    const title = tidy(body.replace(/\b(?:urgent|segera|high priority)\b/gi, '').replace(/\b(?:on|at|by|pada|sebelum)\s*$/i, ''));
    if (!title) return null;
    return { kind: 'task', title, date: d.date, time: tm.time, priority };
  }
  return null;
}
