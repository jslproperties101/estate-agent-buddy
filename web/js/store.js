// Malaysia Welcome AI Buddy — app state, saved on the phone (localStorage), plus the pure helpers the screens use.
// Everything here works offline. Nothing is sent anywhere.

export const STORAGE_KEY = 'mwab:v1';
export const SCHEMA_VERSION = 1;

export const TIERS = ['Silver', 'Gold', 'Platinum', 'SEZ/SFZ', 'Undecided'];
export const STAGE_STATUSES = ['todo', 'doing', 'done'];

export const DEFAULT_STAGES = [
  { id: 'tier', title: 'Choose your MM2H tier and a licensed agent' },
  { id: 'docs', title: 'Gather documents (passports, photos, bank statements)' },
  { id: 'medical', title: 'Medical report and health insurance' },
  { id: 'submit', title: 'Submit application through your agent' },
  { id: 'approval', title: 'Conditional approval letter received' },
  { id: 'fd', title: 'Open Malaysian bank account and place fixed deposit' },
  { id: 'residence', title: 'Buy (or arrange) your residence' },
  { id: 'endorse', title: 'Pass endorsed in passports' },
  { id: 'arrive', title: 'Arrive and settle in' },
];

export const DEFAULT_CHECKLIST = [
  'Passport copies (all pages) for every family member',
  'Recent passport-size photos (white background)',
  'CV / résumé of principal applicant',
  'Bank statements (latest months)',
  'Proof of offshore income or assets',
  'Marriage certificate (if applying with spouse)',
  'Birth certificates of children',
  'Medical report from a Malaysian-registered clinic',
  'Health insurance covering Malaysia',
  'Police / good conduct certificate',
];

export const DEFAULT_SETTLE = [
  'Get a Malaysian SIM card (passport needed)',
  'Open a local bank account',
  'Set up electricity, water and internet',
  'Convert or apply for a Malaysian driving licence',
  'Register with a nearby clinic / GP',
  'Enrol children in school',
  'Install ride-hailing, maps and e-wallet apps',
  'Save emergency numbers (999)',
  'Join a local expat or community group',
  'Learn basic Bahasa Malaysia greetings',
];

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function emptyState() {
  return {
    v: SCHEMA_VERSION,
    lang: 'en',
    onboarded: false,
    profile: { familyName: '', tier: 'Undecided', state: 'Kuala Lumpur', arrival: '' },
    stages: DEFAULT_STAGES.map(s => ({ ...s, status: 'todo', note: '' })),
    checklist: DEFAULT_CHECKLIST.map(t => ({ id: uid(), title: t, done: false })),
    settle: DEFAULT_SETTLE.map(t => ({ id: uid(), title: t, done: false })),
    family: [],
    renewals: [],
    docs: [],
    fd: { bank: '', amount: '', currency: 'USD', placed: '', maturity: '', rate: '' },
    withdrawals: [],
    homes: [],
    schools: [],
    providers: [],
    policies: [],
    contacts: [],
    tasks: [],
    coupons: [],
    favHotspots: [],
    news: { items: [], fetchedAt: '' },
    chat: [],
  };
}

/** Fill any missing keys from a saved state (older saves, partial restores). */
export function normalise(raw) {
  const base = emptyState();
  if (!raw || typeof raw !== 'object') return base;
  const out = { ...base, ...raw };
  out.profile = { ...base.profile, ...(raw.profile || {}) };
  out.fd = { ...base.fd, ...(raw.fd || {}) };
  out.news = { ...base.news, ...(raw.news || {}) };
  for (const k of Object.keys(base)) {
    if (Array.isArray(base[k]) && !Array.isArray(out[k])) out[k] = base[k];
  }
  if (!TIERS.includes(out.profile.tier)) out.profile.tier = 'Undecided';
  out.v = SCHEMA_VERSION;
  return out;
}

export function load(storage = globalThis.localStorage) {
  try {
    const s = storage?.getItem(STORAGE_KEY);
    return normalise(s ? JSON.parse(s) : null);
  } catch {
    return emptyState();
  }
}

export function save(state, storage = globalThis.localStorage) {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

/** Backup text: the state as JSON with a header the restore checks. */
export function exportBackup(state) {
  return JSON.stringify({ app: 'malaysia-welcome-ai-buddy', exportedAt: new Date().toISOString(), state }, null, 1);
}

export function importBackup(text) {
  let j;
  try { j = JSON.parse(text); } catch { throw new Error('This is not a valid backup (not JSON).'); }
  if (!j || j.app !== 'malaysia-welcome-ai-buddy' || typeof j.state !== 'object') {
    throw new Error('This backup is not from Malaysia Welcome AI Buddy.');
  }
  return normalise(j.state);
}

// ---------- dates ----------
export function todayISO(now = new Date()) {
  const d = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 10);
}

/** Whole days from today to an ISO date (negative = past). null if no/invalid date. */
export function daysUntil(iso, now = new Date()) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const target = Date.UTC(y, m - 1, d);
  const t = todayISO(now).split('-').map(Number);
  const today = Date.UTC(t[0], t[1] - 1, t[2]);
  return Math.round((target - today) / 86400000);
}

/** 'overdue' | 'soon' (within warnDays) | 'ok' | 'none' */
export function urgency(days, warnDays = 60) {
  if (days === null || days === undefined) return 'none';
  if (days < 0) return 'overdue';
  if (days <= warnDays) return 'soon';
  return 'ok';
}

export function age(dob, now = new Date()) {
  if (!dob) return null;
  const b = new Date(dob + 'T00:00:00');
  if (isNaN(b)) return null;
  let a = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
  return a;
}

// ---------- tracker ----------
export function stageProgress(stages) {
  if (!stages?.length) return 0;
  const score = stages.reduce((n, s) => n + (s.status === 'done' ? 1 : s.status === 'doing' ? 0.5 : 0), 0);
  return Math.round((score / stages.length) * 100);
}

export function nextStatus(s) {
  return STAGE_STATUSES[(STAGE_STATUSES.indexOf(s) + 1) % STAGE_STATUSES.length];
}

export function checklistProgress(items) {
  if (!items?.length) return 0;
  return Math.round((items.filter(i => i.done).length / items.length) * 100);
}

// ---------- deadlines (dashboard + renewals) ----------
/** Every dated item across the app, soonest first. */
export function collectDeadlines(state, now = new Date()) {
  const out = [];
  const push = (title, date, kind, route) => {
    const days = daysUntil(date, now);
    if (days !== null) out.push({ title, date, days, kind, route, level: urgency(days) });
  };
  for (const m of state.family) {
    push(`${m.name || 'Member'} — passport expires`, m.passportExpiry, 'passport', 'renewals');
    push(`${m.name || 'Member'} — MM2H pass expires`, m.passExpiry, 'pass', 'renewals');
  }
  for (const r of state.renewals) push(r.title, r.date, 'renewal', 'renewals');
  for (const d of state.docs) push(`${d.title} expires`, d.expiry, 'document', 'docs');
  for (const p of state.policies) push(`${p.insurer || 'Insurance'} renewal`, p.renewal, 'insurance', 'health');
  for (const s of state.schools) push(`${s.name} application deadline`, s.deadline, 'school', 'schools');
  for (const t of state.tasks) if (!t.done) push(t.title, t.due, 'task', 'tasks');
  for (const c of state.coupons) if (!c.used) push(`${c.title} coupon expires`, c.expiry, 'coupon', 'coupons');
  if (state.fd?.maturity) push('Fixed deposit matures', state.fd.maturity, 'fd', 'finance');
  return out.sort((a, b) => a.days - b.days);
}

// ---------- finance ----------
export const WITHDRAW_PURPOSES = ['Residence', 'Education', 'Medical', 'Tourism'];

/** Withdrawals allowed up to 50% of the principal FD after approval (MM2H guidelines). */
export function withdrawalSummary(fd, withdrawals) {
  const amount = Number(fd?.amount) || 0;
  const cap = amount * 0.5;
  const used = withdrawals.reduce((n, w) => n + (Number(w.amount) || 0), 0);
  return { amount, cap, used, remaining: Math.max(0, cap - used), over: used > cap && cap > 0 };
}

export function convert(amount, rate) {
  const a = Number(amount), r = Number(rate);
  if (!isFinite(a) || !isFinite(r) || r <= 0) return null;
  return Math.round(a * r * 100) / 100;
}

export function money(n, cur = 'RM') {
  const v = Number(n);
  if (!isFinite(v)) return '—';
  return `${cur} ${v.toLocaleString('en-MY', { maximumFractionDigits: 2 })}`;
}

// ---------- coupons ----------
export function couponStatus(c, now = new Date()) {
  if (c.used) return 'used';
  const d = daysUntil(c.expiry, now);
  if (d === null) return 'active';
  if (d < 0) return 'expired';
  if (d <= 7) return 'expiring';
  return 'active';
}

// ---------- tasks ----------
export function groupTasks(tasks, now = new Date()) {
  const g = { overdue: [], today: [], upcoming: [], someday: [], done: [] };
  for (const t of tasks) {
    if (t.done) { g.done.push(t); continue; }
    const d = daysUntil(t.due, now);
    if (d === null) g.someday.push(t);
    else if (d < 0) g.overdue.push(t);
    else if (d === 0) g.today.push(t);
    else g.upcoming.push(t);
  }
  g.upcoming.sort((a, b) => a.due.localeCompare(b.due));
  g.overdue.sort((a, b) => a.due.localeCompare(b.due));
  return g;
}

/** Dates in a month that have at least one open task: Set of ISO strings. */
export function taskDates(tasks) {
  return new Set(tasks.filter(t => !t.done && t.due).map(t => t.due));
}

// ---------- news (RSS) ----------
/** Parse RSS 2.0 text into [{title, link, date, source}] using a DOMParser-like parser. */
export function parseRss(xml, Parser = globalThis.DOMParser) {
  if (!xml || !Parser) return [];
  const doc = new Parser().parseFromString(xml, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length) return [];
  const items = [...doc.getElementsByTagName('item')];
  const txt = (el, tag) => el.getElementsByTagName(tag)[0]?.textContent?.trim() || '';
  return items.map(it => {
    let title = txt(it, 'title');
    const source = txt(it, 'source');
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    return { title, link: txt(it, 'link'), date: txt(it, 'pubDate'), source };
  }).filter(i => i.title && /^https:\/\//.test(i.link));
}

export function mergeNews(oldItems, newItems, max = 60) {
  const seen = new Set();
  const all = [...newItems, ...oldItems].filter(i => (seen.has(i.link) ? false : seen.add(i.link)));
  all.sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0));
  return all.slice(0, max);
}
