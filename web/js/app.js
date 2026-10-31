// Malaysia Welcome AI Buddy — screens. Plain JavaScript, no build step; runs in the Android app (Capacitor) and a browser.
import * as S from './store.js';
import * as C from './content.js';
import { MENUS, t, menuName } from './i18n.js';
import { putFile, getFile, deleteFile, clearFiles, imageToDataUrl } from './files.js';
import { BUILD } from './build-info.js';
import * as O from './office.js';

let state = S.load();
const $app = document.getElementById('app');
const L = k => t(k, state.lang);

// ---------- helpers ----------
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = u => (/^https:\/\//i.test(u || '') ? u : '');
function commit() { S.save(state); }
function go(route) { location.hash = '#/' + route; }
function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove('show'), 2200);
}
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return isNaN(d) ? iso : d.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' });
}
function dueLabel(days) {
  if (days === null) return '';
  if (days < 0) return `${L('overdueBy')} ${-days} ${L('days')}`;
  if (days === 0) return L('dueToday');
  return `${days} ${L('daysLeft')}`;
}
const chip = (text, cls = '') => `<span class="chip ${cls}">${esc(text)}</span>`;
/** Items the MM2H office published for this kind (hotspots, coupons, services…). Empty when there are none. */
function officeList(kind, title = 'From the MM2H office') {
  const items = O.contentOf(kind);
  if (!items.length) return '';
  return `<section><h3>${esc(title)}</h3><ul class="cards">${items.map(i => `<li class="card col" data-testid="office-${kind}"><div class="card-main"><strong>${esc(i.title)}</strong>
    ${[i.area, i.status, i.valid_until ? `Valid until ${fmtDate(i.valid_until)}` : ''].filter(Boolean).length ? `<span>${esc([i.area, i.status, i.valid_until ? `Valid until ${fmtDate(i.valid_until)}` : ''].filter(Boolean).join(' · '))}</span>` : ''}
    ${i.body ? `<span class="desc">${esc(i.body)}</span>` : ''}</div>
    <span class="actions">${i.phone ? `<a class="act" href="tel:${esc(String(i.phone).replace(/[^\d+]/g, ''))}">Call</a>` : ''}${safeUrl(i.url) ? `<a class="act" href="${esc(safeUrl(i.url))}" target="_blank" rel="noopener">Open</a>` : ''}</span></li>`).join('')}</ul></section>`;
}
/** Office banners on Home: announcement, and "please update" when this version is older than the minimum. */
function officeBanners() {
  const st = O.cachedStatus();
  if (!st) return '';
  const out = [];
  if (st.announcement) out.push(`<p class="callout" data-testid="office-banner">📣 ${esc(st.announcement)}</p>`);
  if (O.needsUpdate(st.min_version)) out.push(`<p class="callout warn" data-testid="office-update">A newer version (${esc(st.min_version)}) is needed.${safeUrl(st.update_url) ? ` <a href="${esc(safeUrl(st.update_url))}" target="_blank" rel="noopener">Update now</a>` : ' Please update the app.'}</p>`);
  return out.join('');
}
const empty = (msg = L('nothingYet')) => `<div class="empty">${esc(msg)}</div>`;

function header(id, extra = '') {
  const m = MENUS.find(x => x.id === id);
  return `<header class="top">
    ${id === 'home' ? '<img class="brand-mark" src="img/icon.svg" alt="">' : `<a class="iconbtn" href="#/menu" aria-label="${esc(L('back'))}">‹</a>`}
    <div class="top-title"><small>${m ? `Menu ${m.n}` : ''}</small><h1>${esc(m ? menuName(id, state.lang) : id)}</h1></div>
    ${extra}
  </header>`;
}

// ---------- generic collections (list + form) ----------
const familyOptions = () => ['', ...state.family.map(m => m.name).filter(Boolean)];

const COLLECTIONS = {
  family: {
    title: 'Family member', route: 'family',
    fields: [
      { k: 'name', label: 'Full name', req: true },
      { k: 'relation', label: 'Relationship', type: 'select', options: ['Principal', 'Spouse', 'Child', 'Parent', 'Parent-in-law', 'Maid', 'Other'] },
      { k: 'dob', label: 'Date of birth', type: 'date' },
      { k: 'nationality', label: 'Nationality' },
      { k: 'passportNo', label: 'Passport number' },
      { k: 'passportExpiry', label: 'Passport expiry', type: 'date' },
      { k: 'passExpiry', label: 'MM2H pass expiry', type: 'date' },
      { k: 'notes', label: 'Notes', type: 'textarea' },
    ],
    line: m => [m.relation, S.age(m.dob) !== null ? `${S.age(m.dob)} yrs` : '', m.nationality].filter(Boolean).join(' · '),
  },
  renewals: {
    title: 'Renewal', route: 'renewals',
    fields: [
      { k: 'title', label: 'What needs renewing', req: true },
      { k: 'date', label: 'Due date', type: 'date', req: true },
      { k: 'notes', label: 'Notes', type: 'textarea' },
    ],
    line: r => fmtDate(r.date),
  },
  docs: {
    title: 'Document', route: 'docs',
    fields: [
      { k: 'title', label: 'Document name', req: true },
      { k: 'category', label: 'Category', type: 'select', options: ['Passport', 'MM2H', 'Bank', 'Medical', 'Insurance', 'Property', 'Education', 'Certificate', 'Other'] },
      { k: 'owner', label: 'Belongs to', type: 'select', options: familyOptions },
      { k: 'expiry', label: 'Expiry date', type: 'date' },
      { k: 'notes', label: 'Notes', type: 'textarea' },
      { k: 'photoId', label: 'Photo or scan', type: 'photo' },
    ],
    line: d => [d.category, d.owner, d.expiry ? `expires ${fmtDate(d.expiry)}` : '', d.photoId ? '📎 photo' : ''].filter(Boolean).join(' · '),
  },
  withdrawals: {
    title: 'FD withdrawal', route: 'finance',
    fields: [
      { k: 'date', label: 'Date', type: 'date' },
      { k: 'amount', label: 'Amount (same currency as FD)', type: 'number', req: true },
      { k: 'purpose', label: 'Purpose', type: 'select', options: S.WITHDRAW_PURPOSES },
      { k: 'notes', label: 'Notes', type: 'textarea' },
    ],
    name: w => `${w.purpose || 'Withdrawal'} — ${Number(w.amount || 0).toLocaleString('en-MY')}`,
    line: w => fmtDate(w.date),
  },
  homes: {
    title: 'Home', route: 'housing',
    fields: [
      { k: 'name', label: 'Property / project', req: true },
      { k: 'area', label: 'Area' },
      { k: 'type', label: 'Type', type: 'select', options: ['Condo', 'Landed', 'Townhouse', 'Bungalow', 'Other'] },
      { k: 'mode', label: 'Buy or rent', type: 'select', options: ['Buy', 'Rent'] },
      { k: 'price', label: 'Price (RM)', type: 'number' },
      { k: 'link', label: 'Listing link (https://…)', type: 'url' },
      { k: 'status', label: 'Status', type: 'select', options: ['Shortlisted', 'Viewed', 'Offer made', 'Chosen', 'Rejected'] },
      { k: 'notes', label: 'Notes', type: 'textarea' },
    ],
    line: h => [h.mode, h.type, h.area, h.price ? S.money(h.price) : ''].filter(Boolean).join(' · '),
    badge: h => h.status,
  },
  schools: {
    title: 'School', route: 'schools',
    fields: [
      { k: 'name', label: 'School', req: true },
      { k: 'curriculum', label: 'Curriculum', type: 'select', options: C.CURRICULA.map(c => c.name) },
      { k: 'area', label: 'Area' },
      { k: 'fee', label: 'Annual fee (RM)', type: 'number' },
      { k: 'deadline', label: 'Application deadline', type: 'date' },
      { k: 'status', label: 'Status', type: 'select', options: ['Researching', 'Visited', 'Applied', 'Offered', 'Enrolled'] },
      { k: 'notes', label: 'Notes', type: 'textarea' },
    ],
    line: s => [s.curriculum, s.area, s.fee ? S.money(s.fee) + '/yr' : ''].filter(Boolean).join(' · '),
    badge: s => s.status,
  },
  providers: {
    title: 'Healthcare provider', route: 'health',
    fields: [
      { k: 'name', label: 'Name', req: true },
      { k: 'type', label: 'Type', type: 'select', options: ['Hospital', 'Clinic / GP', 'Dentist', 'Specialist', 'Pharmacy'] },
      { k: 'phone', label: 'Phone', type: 'tel' },
      { k: 'area', label: 'Area' },
      { k: 'notes', label: 'Notes', type: 'textarea' },
    ],
    line: p => [p.type, p.area, p.phone].filter(Boolean).join(' · '),
  },
  policies: {
    title: 'Insurance policy', route: 'health',
    fields: [
      { k: 'insurer', label: 'Insurer', req: true },
      { k: 'policyNo', label: 'Policy number' },
      { k: 'covers', label: 'Who is covered' },
      { k: 'renewal', label: 'Renewal date', type: 'date' },
      { k: 'premium', label: 'Premium (RM / year)', type: 'number' },
      { k: 'notes', label: 'Notes', type: 'textarea' },
    ],
    name: p => p.insurer,
    line: p => [p.covers, p.renewal ? `renews ${fmtDate(p.renewal)}` : ''].filter(Boolean).join(' · '),
  },
  contacts: {
    title: 'Contact', route: 'directory',
    fields: [
      { k: 'name', label: 'Name / company', req: true },
      { k: 'category', label: 'Category', type: 'select', options: C.CONTACT_CATEGORIES },
      { k: 'phone', label: 'Phone', type: 'tel' },
      { k: 'whatsapp', label: 'WhatsApp number (with country code, e.g. 60123456789)', type: 'tel' },
      { k: 'email', label: 'Email', type: 'email' },
      { k: 'notes', label: 'Notes', type: 'textarea' },
    ],
    line: c => [c.category, c.phone].filter(Boolean).join(' · '),
  },
  tasks: {
    title: 'Task', route: 'tasks',
    fields: [
      { k: 'title', label: 'Task', req: true },
      { k: 'due', label: 'Due date', type: 'date' },
      { k: 'member', label: 'For', type: 'select', options: familyOptions },
      { k: 'notes', label: 'Notes', type: 'textarea' },
    ],
    line: x => [x.due ? fmtDate(x.due) : '', x.member].filter(Boolean).join(' · '),
  },
  coupons: {
    title: 'Coupon', route: 'coupons',
    fields: [
      { k: 'title', label: 'Offer', req: true },
      { k: 'merchant', label: 'Shop / partner' },
      { k: 'code', label: 'Code' },
      { k: 'expiry', label: 'Expires', type: 'date' },
      { k: 'notes', label: 'Terms / notes', type: 'textarea' },
    ],
    line: c => [c.merchant, c.expiry ? `expires ${fmtDate(c.expiry)}` : ''].filter(Boolean).join(' · '),
  },
};

function itemName(key, it) {
  const c = COLLECTIONS[key];
  return c.name ? c.name(it) : (it.name || it.title || '(untitled)');
}

function cardList(key, items = state[key], opts = {}) {
  const c = COLLECTIONS[key];
  if (!items.length) return empty(opts.empty);
  return `<ul class="cards">${items.map(it => {
    const badge = c.badge?.(it);
    return `<li class="card" data-testid="${key}-item">
      <a class="card-main" href="#/form/${key}/${esc(it.id)}">
        <strong>${esc(itemName(key, it))}</strong>
        ${c.line?.(it) ? `<span>${esc(c.line(it))}</span>` : ''}
        ${opts.extra ? opts.extra(it) : ''}
      </a>
      ${badge ? chip(badge) : ''}
    </li>`;
  }).join('')}</ul>`;
}

function addBtn(key, label) {
  return `<a class="btn primary" href="#/form/${key}/new" data-testid="add-${key}">＋ ${esc(label || `${L('add')} ${COLLECTIONS[key].title.toLowerCase()}`)}</a>`;
}

async function renderForm(key, id) {
  const c = COLLECTIONS[key];
  if (!c) return go('home');
  const isNew = id === 'new';
  const it = isNew ? {} : state[key].find(x => x.id === id);
  if (!it) return go(c.route);
  let photo = '';
  if (it.photoId) { try { photo = await getFile(it.photoId) || ''; } catch { photo = ''; } }
  const field = f => {
    const v = it[f.k] ?? '';
    const id = `f-${f.k}`;
    const lab = `<label for="${id}">${esc(f.label)}${f.req ? ' *' : ''}</label>`;
    if (f.type === 'select') {
      const opts = typeof f.options === 'function' ? f.options() : f.options;
      const all = opts.includes(v) || v === '' ? opts : [...opts, v];
      return `${lab}<select id="${id}" name="${f.k}">${all.map(o => `<option value="${esc(o)}" ${o === v ? 'selected' : ''}>${esc(o || '—')}</option>`).join('')}</select>`;
    }
    if (f.type === 'textarea') return `${lab}<textarea id="${id}" name="${f.k}" rows="3">${esc(v)}</textarea>`;
    if (f.type === 'photo') {
      return `${lab}<div class="photo-field">
        ${photo ? `<img src="${photo}" alt="Saved photo" class="doc-photo" data-testid="doc-photo">` : '<p class="muted">No photo saved.</p>'}
        <input id="${id}" type="file" accept="image/*" capture="environment" name="__photo">
        ${photo ? '<label class="inline"><input type="checkbox" name="__removePhoto"> Remove photo</label>' : ''}
      </div>`;
    }
    const type = f.type === 'number' ? 'number' : f.type || 'text';
    return `${lab}<input id="${id}" name="${f.k}" type="${type}" value="${esc(v)}" ${f.type === 'number' ? 'inputmode="decimal" step="any" min="0"' : ''} ${f.req ? 'required' : ''}>`;
  };
  $app.innerHTML = `<header class="top"><a class="iconbtn" href="#/${c.route}" aria-label="${esc(L('back'))}">‹</a>
      <div class="top-title"><small>${esc(menuName(c.route, state.lang))}</small><h1>${isNew ? L('add') : L('edit')} ${esc(c.title.toLowerCase())}</h1></div></header>
    <main class="page"><form class="form" id="itemForm" novalidate>
      ${c.fields.map(field).join('')}
      <div class="form-actions">
        <button class="btn primary" type="submit" data-testid="save">${L('save')}</button>
        <a class="btn" href="#/${c.route}">${L('cancel')}</a>
        ${isNew ? '' : `<button class="btn danger" type="button" id="del" data-testid="delete">${L('delete')}</button>`}
      </div>
    </form></main>`;
  const form = document.getElementById('itemForm');
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(form);
    const out = { ...it, id: it.id || S.uid() };
    for (const f of c.fields) if (f.type !== 'photo') out[f.k] = String(fd.get(f.k) ?? '').trim();
    const missing = c.fields.find(f => f.req && !out[f.k]);
    if (missing) { toast(`Please fill in: ${missing.label}`); form.querySelector(`[name="${missing.k}"]`)?.focus(); return; }
    if (out.link && !safeUrl(out.link)) { toast('Links must start with https://'); return; }
    const file = fd.get('__photo');
    try {
      if (fd.get('__removePhoto') && out.photoId) { await deleteFile(out.photoId); out.photoId = ''; }
      if (file && file.size) {
        const data = await imageToDataUrl(file);
        out.photoId = out.photoId || 'doc-' + out.id;
        await putFile(out.photoId, data);
      }
    } catch (err) { toast(err.message || 'Photo not saved.'); }
    if (isNew) state[key].push(out); else state[key] = state[key].map(x => (x.id === out.id ? out : x));
    commit();
    toast('Saved');
    go(c.route);
  });
  document.getElementById('del')?.addEventListener('click', async () => {
    if (!confirm(`Delete "${itemName(key, it)}"?`)) return;
    if (it.photoId) { try { await deleteFile(it.photoId); } catch { /* photo already gone */ } }
    state[key] = state[key].filter(x => x.id !== it.id);
    commit();
    toast('Deleted');
    go(c.route);
  });
}

// ---------- screens ----------
function deadlineList(items) {
  if (!items.length) return empty(L('noDeadlines'));
  return `<ul class="deadlines">${items.map(d => `<li class="dl ${d.level}" data-testid="deadline">
      <a href="#/${d.route}"><span>${esc(d.title)}</span><small>${esc(fmtDate(d.date))} · ${esc(dueLabel(d.days))}</small></a></li>`).join('')}</ul>`;
}

function menuGrid() {
  return `<nav class="grid" aria-label="${esc(L('allMenus'))}">${MENUS.filter(m => m.id !== 'home').map(m =>
    `<a class="tile" href="#/${m.id}" data-testid="menu-${m.id}"><span class="tile-icon" aria-hidden="true">${m.icon}</span><span class="tile-n">${m.n}</span><span class="tile-label">${esc(menuName(m.id, state.lang))}</span></a>`).join('')}</nav>`;
}

function officeSettings() {
  if (!O.available()) return '';
  const st = screens.settings;
  const s = O.session();
  if (!O.sharing()) {
    return `<section class="card-block" data-testid="office-card"><h3>Share with MM2H office</h3>
      <p class="muted">Optional. Lets your MM2H office see your application step and pass expiry dates so they can remind you, and lets you ask them for help.</p>
      <p class="muted"><b>Sent:</b> family name, principal's nationality, state, arrival date, each member's name, relationship and MM2H pass expiry, and your current application step.<br>
      <b>Never sent:</b> passport numbers, dates of birth, documents, photos, money details.</p>
      <label class="inline"><input type="checkbox" data-act="officeconsent" ${st.consent ? 'checked' : ''} data-testid="office-consent"> I agree to share these details with the MM2H office. I can stop at any time, which deletes them from the office.</label>
      <button class="btn primary" data-act="officesignin" ${st.consent ? '' : 'disabled'} data-testid="office-signin">Sign in with Google and share</button>
      ${st.msg ? `<p class="note" role="status" data-testid="office-msg">${esc(st.msg)}</p>` : ''}</section>`;
  }
  const last = O.lastShared();
  return `<section class="card-block" data-testid="office-card"><h3>Share with MM2H office</h3>
    <p>Sharing as <b>${esc(s.email)}</b>.${last ? ` Last shared ${new Date(last).toLocaleString('en-MY')}.` : ''}</p>
    <div class="quick"><button class="btn primary" data-act="officeshare" data-testid="office-share">Share now</button>
      <button class="btn" data-act="officecopy" data-testid="office-copy">Ask for a copy of my data</button>
      <button class="btn danger" data-act="officestop" data-testid="office-stop">Stop sharing and delete</button></div>
    <form class="form compact" id="problemForm"><label for="pr-s">Report a problem to the office</label><input id="pr-s" name="subject" maxlength="200" placeholder="What went wrong?" data-testid="problem-subject">
      <textarea name="body" rows="3" maxlength="5000" placeholder="Details (optional)"></textarea><button class="btn" data-testid="problem-send">Send</button></form>
    ${st.msg ? `<p class="note" role="status" data-testid="office-msg">${esc(st.msg)}</p>` : ''}</section>`;
}

/** Shown instead of the app while the office has switched on maintenance. */
function maintenancePage(st) {
  return `<main class="page"><section class="hero"><h2>We'll be right back</h2><p data-testid="maintenance">${esc(st.maintenance_message || 'The app is being updated. Please try again soon.')}</p>
    <button class="btn primary" data-act="officeretry">Try again</button></section></main>`;
}

const screens = {
  home() {
    const p = state.profile;
    const progress = S.stageProgress(state.stages);
    const dls = S.collectDeadlines(state).filter(d => d.days >= -30).slice(0, 5);
    const arr = S.daysUntil(p.arrival);
    return `${header('home')}
    <main class="page">
      ${officeBanners()}
      <section class="hero">
        <p class="eyebrow">${L('welcome')}${p.familyName ? `, ${esc(p.familyName)} family` : ''}</p>
        <h2>${L('tagline')}</h2>
        <div class="hero-meta">${chip(p.tier === 'Undecided' ? 'Tier not chosen' : `${p.tier} tier`, 'gold')}${chip(p.state)}${arr !== null && arr >= 0 ? chip(`Arrival in ${arr} days`) : ''}</div>
        <div class="bar" role="progressbar" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100"><i style="width:${progress}%"></i></div>
        <p class="bar-label">${L('progress')}: <b data-testid="home-progress">${progress}%</b></p>
      </section>
      <section><h3>${L('nextDeadlines')}</h3>${deadlineList(dls)}</section>
      <section><h3>${L('quick')}</h3><div class="quick">
        <a class="btn" href="#/form/family/new">＋ Family member</a>
        <a class="btn" href="#/form/tasks/new">＋ Task</a>
        <a class="btn" href="#/form/docs/new">＋ Document</a>
        <a class="btn" href="#/chat">💬 Ask Buddy</a>
      </div></section>
      <section><h3>${L('allMenus')}</h3>${menuGrid()}</section>
    </main>`;
  },

  menu() {
    return `<header class="top"><img class="brand-mark" src="img/icon.svg" alt=""><div class="top-title"><small>${esc(L('appName'))}</small><h1>${L('allMenus')}</h1></div></header>
      <main class="page">${menuGrid()}</main>`;
  },

  tracker() {
    const progress = S.stageProgress(state.stages);
    const cl = S.checklistProgress(state.checklist);
    const statusLabel = { todo: 'To do', doing: 'In progress', done: 'Done' };
    return `${header('tracker')}<main class="page">
      <section class="card-block"><div class="bar"><i style="width:${progress}%"></i></div><p class="bar-label">Overall: <b data-testid="tracker-progress">${progress}%</b> · tap a step to change its status</p></section>
      <ol class="stages">${state.stages.map((s, i) => `<li class="stage ${s.status}">
        <button class="stage-btn" data-act="stage" data-id="${s.id}" data-testid="stage-${s.id}"><span class="stage-n">${i + 1}</span><span class="stage-t">${esc(s.title)}</span>${chip(statusLabel[s.status], s.status)}</button>
      </li>`).join('')}</ol>
      <section><h3>Documents checklist <small>${cl}%</small></h3>
        <ul class="checks">${state.checklist.map(c => `<li><label><input type="checkbox" data-act="check" data-list="checklist" data-id="${c.id}" ${c.done ? 'checked' : ''}> <span>${esc(c.title)}</span></label></li>`).join('')}</ul>
      </section>
      <section><h3>MM2H tiers at a glance</h3>
        <div class="table-wrap"><table class="tiers"><thead><tr><th>Tier</th><th>Age</th><th>Fixed deposit</th><th>Property</th><th>Pass</th></tr></thead>
        <tbody>${C.TIER_INFO.map(r => `<tr class="${r.tier === state.profile.tier ? 'mine' : ''}"><td>${esc(r.tier)}</td><td>${esc(r.age)}</td><td>${esc(r.fd)}</td><td>${esc(r.property)}</td><td>${esc(r.pass)}</td></tr>`).join('')}</tbody></table></div>
        <ul class="rules">${C.GENERAL_RULES.map(r => `<li>${esc(r)}</li>`).join('')}</ul>
        <p class="note">Reference only, checked ${C.RULES_CHECKED}. Rules change — always confirm on the <a href="${C.OFFICIAL_MM2H}" target="_blank" rel="noopener">official MM2H guidelines</a> or with your licensed agent.</p>
      </section></main>`;
  },

  renewals() {
    const items = S.collectDeadlines(state).filter(d => ['passport', 'pass', 'renewal'].includes(d.kind));
    const undated = state.family.filter(m => !m.passportExpiry || !m.passExpiry);
    return `${header('renewals')}<main class="page">
      <p class="lead">Passport and pass dates come from Family Members. You are warned 60 days ahead.</p>
      ${deadlineList(items)}
      ${undated.length ? `<p class="note">Missing dates for: ${undated.map(m => `<a href="#/form/family/${esc(m.id)}">${esc(m.name)}</a>`).join(', ')}</p>` : ''}
      <section><h3>Other renewals</h3>${cardList('renewals', [...state.renewals].sort((a, b) => (a.date || '').localeCompare(b.date || '')), { empty: 'Add road tax, tenancy, visas for helpers and more.' })}${addBtn('renewals')}</section>
      <p class="note">Pass renewal is every five years or by passport validity. Renewal fee RM500/year; visa fee RM0–50 by nationality (checked ${C.RULES_CHECKED}).</p>
    </main>`;
  },

  family() {
    const order = ['Principal', 'Spouse', 'Child', 'Parent', 'Parent-in-law', 'Maid', 'Other'];
    const items = [...state.family].sort((a, b) => order.indexOf(a.relation) - order.indexOf(b.relation));
    return `${header('family')}<main class="page">${cardList('family', items, {
      empty: 'Add the principal applicant first, then each dependant.',
      extra: m => {
        const pe = S.daysUntil(m.passportExpiry), pa = S.daysUntil(m.passExpiry);
        return `<span class="mini">${pe !== null ? chip(`Passport ${dueLabel(pe)}`, S.urgency(pe)) : ''}${pa !== null ? chip(`Pass ${dueLabel(pa)}`, S.urgency(pa)) : ''}</span>`;
      },
    })}${addBtn('family')}</main>`;
  },

  docs() {
    const q = (screens.docs.q || '').toLowerCase();
    const items = state.docs.filter(d => !q || [d.title, d.category, d.owner, d.notes].join(' ').toLowerCase().includes(q));
    return `${header('docs')}<main class="page">
      <input class="search" type="search" placeholder="${esc(L('search'))} documents" value="${esc(screens.docs.q || '')}" data-act="docsearch" aria-label="Search documents">
      ${cardList('docs', items, { empty: 'Save photos of passports, bank letters, insurance and certificates. They stay on this phone.' })}
      ${addBtn('docs')}
      <p class="note">Documents and photos are stored only on this phone. Back up regularly from Settings.</p></main>`;
  },

  finance() {
    const fd = state.fd;
    const s = S.withdrawalSummary(fd, state.withdrawals);
    const cur = fd.currency || 'USD';
    const conv = S.convert(fd.amount, screens.finance.rate);
    return `${header('finance')}<main class="page">
      <section class="card-block"><h3>Fixed deposit</h3>
        <form class="form compact" id="fdForm">
          <label for="fd-bank">Bank</label><input id="fd-bank" name="bank" value="${esc(fd.bank)}">
          <div class="row2"><div><label for="fd-amount">Amount</label><input id="fd-amount" name="amount" type="number" inputmode="decimal" min="0" step="any" value="${esc(fd.amount)}" data-testid="fd-amount"></div>
          <div><label for="fd-cur">Currency</label><select id="fd-cur" name="currency">${['USD', 'MYR', 'SGD', 'GBP', 'EUR', 'AUD', 'CNY', 'JPY', 'HKD'].map(c => `<option ${c === cur ? 'selected' : ''}>${c}</option>`).join('')}</select></div></div>
          <div class="row2"><div><label for="fd-placed">Placed on</label><input id="fd-placed" name="placed" type="date" value="${esc(fd.placed)}"></div>
          <div><label for="fd-mat">Matures on</label><input id="fd-mat" name="maturity" type="date" value="${esc(fd.maturity)}"></div></div>
          <button class="btn primary" type="submit" data-testid="fd-save">${L('save')}</button>
        </form></section>
      <section class="stats">
        <div><small>Withdrawal limit (50%)</small><b data-testid="fd-cap">${s.cap.toLocaleString('en-MY')} ${cur}</b></div>
        <div><small>Withdrawn</small><b>${s.used.toLocaleString('en-MY')} ${cur}</b></div>
        <div class="${s.over ? 'warn' : ''}"><small>Still allowed</small><b data-testid="fd-remaining">${s.remaining.toLocaleString('en-MY')} ${cur}</b></div>
      </section>
      ${s.over ? '<p class="alert">Withdrawals are above 50% of the deposit. Check with your agent.</p>' : ''}
      <section><h3>Withdrawals</h3>${cardList('withdrawals', state.withdrawals, { empty: 'Allowed after approval for residence, education, medical or tourism.' })}${addBtn('withdrawals', 'Log a withdrawal')}</section>
      <section class="card-block"><h3>Currency helper</h3>
        <p class="muted">Type today's rate from your bank (no live rates offline).</p>
        <label for="rate">1 ${cur} = ? MYR</label><input id="rate" type="number" inputmode="decimal" step="any" min="0" value="${esc(screens.finance.rate || '')}" data-act="rate" data-testid="rate">
        <p class="big" data-testid="converted">${conv !== null ? `${(Number(fd.amount) || 0).toLocaleString('en-MY')} ${cur} ≈ ${S.money(conv)}` : 'Enter the FD amount and a rate.'}</p>
      </section></main>`;
  },

  housing() {
    const t = C.TIER_INFO.find(x => x.tier === state.profile.tier);
    return `${header('housing')}<main class="page">
      ${t ? `<p class="callout">As a <b>${esc(t.tier)}</b> participant you must buy a residence of <b>${esc(t.property)}</b> after approval, and hold it for 10 years (upgrades allowed).</p>` : '<p class="callout">Buying a residence at your tier\'s minimum price is compulsory after approval. Choose your tier in Settings to see your minimum.</p>'}
      ${cardList('homes', state.homes, { empty: 'Shortlist condos and houses you like.', extra: h => (safeUrl(h.link) ? `<span class="mini">🔗 listing saved</span>` : '') })}
      ${addBtn('homes')}
      ${officeList('housing', 'Listings from the MM2H office')}
      <p class="note">Property search through our Estate Agent AI Buddy app is a future integration (menu 16).</p></main>`;
  },

  schools() {
    return `${header('schools')}<main class="page">
      ${cardList('schools', [...state.schools].sort((a, b) => (a.deadline || '9').localeCompare(b.deadline || '9')), { empty: 'Shortlist schools with fees and deadlines.' })}
      ${addBtn('schools')}
      ${officeList('school', 'Schools suggested by the MM2H office')}
      <section><h3>Curricula in Malaysia</h3><ul class="info">${C.CURRICULA.map(c => `<li><b>${esc(c.name)}</b><span>${esc(c.note)}</span></li>`).join('')}</ul></section></main>`;
  },

  health() {
    return `${header('health')}<main class="page">
      <a class="emergency" href="tel:999" data-testid="call-999">📞 Emergency 999</a>
      <section><h3>Insurance policies</h3>${cardList('policies', state.policies, { empty: 'Health insurance covering Malaysia is required for MM2H.' })}${addBtn('policies')}</section>
      <section><h3>Clinics & hospitals</h3>${cardList('providers', state.providers, { empty: 'Save your GP, hospital, dentist and pharmacy.' })}${addBtn('providers')}</section>
      ${officeList('healthcare', 'Healthcare & insurance from the MM2H office')}</main>`;
  },

  settle() {
    const p = S.checklistProgress(state.settle);
    return `${header('settle')}<main class="page">
      <div class="bar"><i style="width:${p}%"></i></div><p class="bar-label"><b data-testid="settle-progress">${p}%</b> settled in</p>
      <ul class="checks">${state.settle.map(c => `<li><label><input type="checkbox" data-act="check" data-list="settle" data-id="${c.id}" ${c.done ? 'checked' : ''}> <span>${esc(c.title)}</span></label>
        ${c.custom ? `<button class="x" data-act="rmsettle" data-id="${c.id}" aria-label="Remove">✕</button>` : ''}</li>`).join('')}</ul>
      <form class="inline-add" id="settleAdd"><input name="t" placeholder="Add your own step" aria-label="Add your own step"><button class="btn primary">${L('add')}</button></form></main>`;
  },

  guide() {
    const q = (screens.guide.q || '').toLowerCase();
    const items = C.GUIDE.filter(g => !q || (g.title + g.body).toLowerCase().includes(q));
    return `${header('guide')}<main class="page">
      <input class="search" type="search" placeholder="${esc(L('search'))} guide" value="${esc(screens.guide.q || '')}" data-act="guidesearch" aria-label="Search guide">
      ${items.length ? items.map(g => `<details class="acc" data-testid="guide-item"><summary>${esc(g.title)}</summary><p>${esc(g.body)}</p></details>`).join('') : empty('No guide topics match.')}
      ${officeList('guide', 'Guides from the MM2H office')}
      ${officeList('rule', 'MM2H rules & figures (official references)')}
    </main>`;
  },

  chat() {
    const msgs = state.chat.slice(-40);
    const sugg = ['Which MM2H tier suits us?', 'How much FD can I withdraw?', 'What do I do first after arriving?', 'Emergency number?'];
    return `${header('chat', `<span class="chip">${L('offline')}</span>`)}<main class="page chat-page">
      <div class="msgs" id="msgs">${msgs.length ? msgs.map(m => `<div class="msg ${m.from}" data-testid="msg-${m.from}"><p>${esc(m.text)}</p>${m.go ? `<a href="#/${esc(m.go)}">Open ${esc(menuName(m.go, state.lang))} ›</a>` : ''}</div>`).join('')
        : `<div class="msg buddy"><p>Hi! I'm your Malaysia Welcome Buddy. I answer common MM2H and settling-in questions offline. For your own case, check with your licensed agent.</p></div>`}</div>
      <div class="sugg">${sugg.map(s => `<button class="chip btnchip" data-act="ask" data-q="${esc(s)}">${esc(s)}</button>`).join('')}</div>
      <form class="composer" id="chatForm"><input name="q" placeholder="Ask Buddy…" aria-label="Ask Buddy" autocomplete="off"><button class="btn primary" data-testid="send">${L('ask')}</button></form>
      ${state.chat.length ? '<button class="linkbtn" data-act="clearchat">Clear chat</button>' : ''}
    </main>`;
  },

  directory() {
    const cat = screens.directory.cat || 'All';
    const mine = state.contacts.filter(c => cat === 'All' || c.category === cat);
    const actions = c => `<span class="actions">
      ${c.phone ? `<a class="act" href="tel:${esc(c.phone.replace(/[^\d+]/g, ''))}">Call</a>` : ''}
      ${c.whatsapp ? `<a class="act" href="https://wa.me/${esc(c.whatsapp.replace(/\D/g, ''))}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
      ${c.email ? `<a class="act" href="mailto:${esc(c.email)}">Email</a>` : ''}</span>`;
    return `${header('directory')}<main class="page">
      <section><h3>Official & emergency</h3><ul class="cards">${C.OFFICIAL_CONTACTS.map(o => `<li class="card"><div class="card-main"><strong>${esc(o.name)}</strong><span>${esc(o.category)}</span></div>
        ${o.phone ? `<a class="act" href="tel:${o.phone}">Call ${o.phone}</a>` : `<a class="act" href="${o.url}" target="_blank" rel="noopener">Open</a>`}</li>`).join('')}</ul></section>
      <section><h3>My contacts</h3>
        <div class="filters">${['All', ...C.CONTACT_CATEGORIES].map(c => `<button class="chip btnchip ${c === cat ? 'on' : ''}" data-act="dircat" data-cat="${c}">${c}</button>`).join('')}</div>
        ${mine.length ? `<ul class="cards">${mine.map(c => `<li class="card" data-testid="contacts-item"><a class="card-main" href="#/form/contacts/${esc(c.id)}"><strong>${esc(c.name)}</strong><span>${esc(COLLECTIONS.contacts.line(c))}</span></a>${actions(c)}</li>`).join('')}</ul>` : empty('Save your agent, lawyer, bank officer, movers and more.')}
        ${addBtn('contacts')}</section>
      ${officeList('service', 'Services recommended by the MM2H office')}</main>`;
  },

  tasks() {
    const g = S.groupTasks(state.tasks);
    const view = screens.tasks.month || S.todayISO().slice(0, 7);
    const [y, m] = view.split('-').map(Number);
    const first = new Date(y, m - 1, 1), daysIn = new Date(y, m, 0).getDate();
    const dates = S.taskDates(state.tasks), today = S.todayISO();
    const cells = [];
    for (let i = 0; i < first.getDay(); i++) cells.push('<span></span>');
    for (let d = 1; d <= daysIn; d++) {
      const iso = `${view}-${String(d).padStart(2, '0')}`;
      cells.push(`<span class="${iso === today ? 'today' : ''} ${dates.has(iso) ? 'has' : ''}">${d}</span>`);
    }
    const row = x => `<li class="task ${x.done ? 'done' : ''}" data-testid="tasks-item"><label><input type="checkbox" data-act="task" data-id="${x.id}" ${x.done ? 'checked' : ''}><span>${esc(x.title)}</span></label><a href="#/form/tasks/${esc(x.id)}" class="mini">${esc(COLLECTIONS.tasks.line(x))} ›</a></li>`;
    const grp = (title, list, cls = '') => (list.length ? `<h4 class="${cls}">${title} (${list.length})</h4><ul class="tasks">${list.map(row).join('')}</ul>` : '');
    return `${header('tasks')}<main class="page">
      <section class="cal"><div class="cal-head"><button class="iconbtn" data-act="month" data-d="-1" aria-label="Previous month">‹</button><b>${first.toLocaleDateString('en-MY', { month: 'long', year: 'numeric' })}</b><button class="iconbtn" data-act="month" data-d="1" aria-label="Next month">›</button></div>
        <div class="cal-grid">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => `<em>${d}</em>`).join('')}${cells.join('')}</div></section>
      ${addBtn('tasks')}
      ${state.tasks.length ? grp('Overdue', g.overdue, 'red') + grp('Today', g.today) + grp('Upcoming', g.upcoming) + grp('No date', g.someday) + grp('Done', g.done) : empty('Add tasks like "Book medical check" or "Open bank account".')}
    </main>`;
  },

  settings() {
    const p = state.profile;
    return `${header('settings')}<main class="page">
      <section class="card-block"><h3>Family profile</h3>
        <form class="form compact" id="profileForm">
          <label for="p-name">${L('familyName')}</label><input id="p-name" name="familyName" value="${esc(p.familyName)}">
          <label for="p-tier">${L('tier')}</label><select id="p-tier" name="tier">${S.TIERS.map(x => `<option ${x === p.tier ? 'selected' : ''}>${x}</option>`).join('')}</select>
          <label for="p-state">${L('state')}</label><select id="p-state" name="state">${STATES.map(x => `<option ${x === p.state ? 'selected' : ''}>${x}</option>`).join('')}</select>
          <label for="p-arr">${L('arrival')}</label><input id="p-arr" name="arrival" type="date" value="${esc(p.arrival)}">
          <button class="btn primary" data-testid="profile-save">${L('save')}</button>
        </form></section>
      <section class="card-block"><h3>${L('language')}</h3><div class="seg">
        <button class="${state.lang === 'en' ? 'on' : ''}" data-act="lang" data-l="en">English</button>
        <button class="${state.lang === 'ms' ? 'on' : ''}" data-act="lang" data-l="ms" data-testid="lang-ms">Bahasa Malaysia</button></div></section>
      ${officeSettings()}
      <section class="card-block"><h3>Backup & restore</h3>
        <p class="muted">Your data is stored only on this phone. Copy the backup text and keep it somewhere safe (e.g. email it to yourself). Document photos are not included.</p>
        <div class="quick"><button class="btn" data-act="backup" data-testid="backup">Create backup</button><button class="btn" data-act="restore" data-testid="restore">Restore</button></div>
        <textarea id="backupText" rows="5" placeholder="Backup text appears here, or paste a backup to restore" data-testid="backup-text"></textarea>
      </section>
      <section class="card-block"><h3>Reset</h3><button class="btn danger" data-act="reset" data-testid="reset">Erase all data on this phone</button></section>
      <section class="about"><p><b>Malaysia Welcome AI Buddy</b> · version ${esc(BUILD.version)} · build ${esc(BUILD.commit)}</p>
        <p class="muted">Reference information only, not legal or immigration advice. Confirm MM2H rules on mm2h.gov.my or with a licensed agent.</p></section>
    </main>`;
  },

  integrations() {
    const cls = s => ({ 'Planned': 'todo', 'In design': 'doing', 'Needs approval': 'warn', 'Not started': 'muted', 'Available (link)': 'done' }[s] || '');
    return `${header('integrations')}<main class="page">
      <p class="lead">What is connected today, and what is coming. Nothing listed as Planned or In design works yet.</p>
      <ul class="cards">${(O.contentOf('integration').length ? O.contentOf('integration').map(i => ({ name: i.title, note: i.body || '', status: i.status || 'Planned' })) : C.INTEGRATIONS).map(i => `<li class="card col" data-testid="integration"><div class="card-main"><strong>${esc(i.name)}</strong><span>${esc(i.note)}</span></div>${chip(i.status, cls(i.status))}</li>`).join('')}</ul></main>`;
  },

  news() {
    const n = state.news;
    const topic = screens.news.topic || 'mm2h';
    return `${header('news')}<main class="page">
      <div class="filters">${Object.entries(NEWS_TOPICS).map(([k, v]) => `<button class="chip btnchip ${k === topic ? 'on' : ''}" data-act="newstopic" data-k="${k}">${esc(v.label)}</button>`).join('')}</div>
      <div class="news-bar"><span class="muted" data-testid="news-status">${esc(screens.news.status || (n.fetchedAt ? `Updated ${new Date(n.fetchedAt).toLocaleString('en-MY')}` : 'Not loaded yet'))}</span><button class="btn" data-act="refreshnews" data-testid="news-refresh">↻ Refresh</button></div>
      ${(n.items || []).filter(i => !i.topic || i.topic === topic).length ? `<ul class="news">${n.items.filter(i => !i.topic || i.topic === topic).map(i => `<li data-testid="news-item"><a href="${esc(safeUrl(i.link))}" target="_blank" rel="noopener"><strong>${esc(i.title)}</strong><small>${esc([i.source, i.date ? new Date(i.date).toLocaleDateString('en-MY') : ''].filter(Boolean).join(' · '))}</small></a></li>`).join('')}</ul>`
        : empty('Connect to the internet and tap Refresh for the latest headlines.')}
      <section><h3>Official sources</h3><ul class="cards">
        <li class="card"><div class="card-main"><strong>MM2H official portal</strong><span>Rules, guidelines and announcements</span></div><a class="act" href="https://www.mm2h.gov.my/" target="_blank" rel="noopener">Open</a></li>
        <li class="card"><div class="card-main"><strong>Immigration Department</strong><span>Passes and visas</span></div><a class="act" href="${C.OFFICIAL_IMMIGRATION}" target="_blank" rel="noopener">Open</a></li></ul></section>
      ${officeList('news_source', 'News sources from the MM2H office')}
      <p class="note">Headlines come from Google News search and open in your browser. They are not checked by us.</p></main>`;
  },

  hotspots() {
    const st = screens.hotspots.state || 'All', cat = screens.hotspots.cat || 'All', fav = screens.hotspots.fav;
    const statesList = ['All', ...new Set(C.HOTSPOTS.map(h => h.state))];
    const items = C.HOTSPOTS.filter(h => (st === 'All' || h.state === st) && (cat === 'All' || h.cat === cat) && (!fav || state.favHotspots.includes(h.id)));
    return `${header('hotspots')}<main class="page">
      <div class="row2"><div><label for="hs-state">State</label><select id="hs-state" data-act="hsstate">${statesList.map(s => `<option ${s === st ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
      <div><label for="hs-cat">Type</label><select id="hs-cat" data-act="hscat">${['All', ...C.HOTSPOT_CATEGORIES].map(s => `<option ${s === cat ? 'selected' : ''}>${s}</option>`).join('')}</select></div></div>
      ${officeList('hotspot', 'Hotspots from the MM2H office')}
      <label class="inline"><input type="checkbox" data-act="hsfav" ${fav ? 'checked' : ''}> Favourites only</label>
      ${items.length ? `<ul class="cards">${items.map(h => {
        const on = state.favHotspots.includes(h.id);
        return `<li class="card col" data-testid="hotspot"><div class="card-main"><strong>${esc(h.name)}</strong><span>${esc(h.state)} · ${esc(h.cat)}</span><span class="desc">${esc(h.note)}</span></div>
          <span class="actions"><button class="act ${on ? 'on' : ''}" data-act="fav" data-id="${h.id}" aria-pressed="${on}" data-testid="fav-${h.id}">${on ? '★ Saved' : '☆ Save'}</button>
          <a class="act" href="${C.mapsLink(h)}" target="_blank" rel="noopener">Map</a></span></li>`;
      }).join('')}</ul>` : empty('No places match these filters.')}</main>`;
  },

  coupons() {
    const tab = screens.coupons.tab || 'mine';
    const mine = [...state.coupons].sort((a, b) => (a.expiry || '9').localeCompare(b.expiry || '9'));
    const claimed = new Set(state.coupons.map(c => c.sampleId).filter(Boolean));
    const stLabel = { active: 'Active', expiring: 'Expiring soon', expired: 'Expired', used: 'Used' };
    const stCls = { active: 'done', expiring: 'soon', expired: 'overdue', used: 'muted' };
    return `${header('coupons')}<main class="page">
      <div class="seg"><button class="${tab === 'mine' ? 'on' : ''}" data-act="ctab" data-t="mine">My wallet (${mine.length})</button><button class="${tab === 'offers' ? 'on' : ''}" data-act="ctab" data-t="offers" data-testid="tab-offers">Welcome offers</button></div>
      ${tab === 'mine' ? `${mine.length ? `<ul class="cards">${mine.map(c => {
        const s = S.couponStatus(c);
        return `<li class="card col coupon ${s}" data-testid="coupons-item"><a class="card-main" href="#/form/coupons/${esc(c.id)}"><strong>${esc(c.title)}</strong><span>${esc(COLLECTIONS.coupons.line(c))}</span></a>
          <span class="actions">${chip(stLabel[s], stCls[s])}${c.code ? `<button class="act code" data-act="copy" data-code="${esc(c.code)}">${esc(c.code)} ⧉</button>` : ''}
          <button class="act" data-act="used" data-id="${c.id}" data-testid="used-${c.id}">${c.used ? 'Mark unused' : 'Mark used'}</button></span></li>`;
      }).join('')}</ul>` : empty('Save welcome offers and discount codes here. We remind you 7 days before they expire.')}${addBtn('coupons')}`
        : `${officeList('coupon', 'Offers from the MM2H office')}<p class="callout">Partner offers for MM2H families are coming soon (menu 16). These are <b>samples</b> to show how offers will look.</p>
        <ul class="cards">${C.SAMPLE_COUPONS.map(o => `<li class="card col coupon" data-testid="offer"><div class="card-main"><strong>${esc(o.title)}</strong><span>${esc(o.merchant)}</span><span class="desc">${esc(o.note)}</span></div>
          <span class="actions">${chip('Sample', 'muted')}<button class="act" data-act="claim" data-id="${o.id}" ${claimed.has(o.id) ? 'disabled' : ''} data-testid="claim-${o.id}">${claimed.has(o.id) ? 'In wallet' : 'Add to wallet'}</button></span></li>`).join('')}</ul>`}
    </main>`;
  },
};
screens.docs.q = ''; screens.guide.q = ''; screens.finance.rate = ''; screens.directory.cat = 'All';
screens.tasks.month = ''; screens.news.topic = 'mm2h'; screens.news.status = ''; screens.hotspots.state = 'All';
screens.hotspots.cat = 'All'; screens.hotspots.fav = false; screens.coupons.tab = 'mine';
screens.settings.consent = false; screens.settings.msg = '';

const STATES = ['Kuala Lumpur', 'Selangor', 'Penang', 'Johor', 'Melaka', 'Perak', 'Negeri Sembilan', 'Pahang', 'Kedah', 'Sabah', 'Sarawak', 'Terengganu', 'Kelantan', 'Perlis', 'Putrajaya', 'Labuan', 'Not decided'];

const NEWS_TOPICS = {
  mm2h: { label: 'MM2H', q: 'MM2H Malaysia My Second Home' },
  living: { label: 'Living in Malaysia', q: 'Malaysia expats living' },
  property: { label: 'Property', q: 'Malaysia property market' },
};

// ---------- onboarding ----------
function onboarding() {
  return `<main class="page onboard">
    <img class="brand-big" src="img/icon.svg" alt="">
    <h1>${esc(L('appName'))}</h1><p class="lead">${L('tagline')}: track your MM2H application, renewals, documents, schools and settling in — all on your phone.</p>
    <form class="form" id="onboardForm">
      <label for="o-name">${L('familyName')}</label><input id="o-name" name="familyName" placeholder="e.g. Tan" data-testid="onboard-name">
      <label for="o-tier">${L('tier')}</label><select id="o-tier" name="tier" data-testid="onboard-tier">${S.TIERS.map(x => `<option ${x === 'Undecided' ? 'selected' : ''}>${x}</option>`).join('')}</select>
      <label for="o-state">${L('state')}</label><select id="o-state" name="state">${STATES.map(x => `<option>${x}</option>`).join('')}</select>
      <label for="o-arr">${L('arrival')}</label><input id="o-arr" name="arrival" type="date">
      <div class="seg"><button type="button" class="${state.lang === 'en' ? 'on' : ''}" data-act="lang" data-l="en">English</button><button type="button" class="${state.lang === 'ms' ? 'on' : ''}" data-act="lang" data-l="ms">Bahasa Malaysia</button></div>
      <button class="btn primary big" data-testid="onboard-start">${L('getStarted')}</button>
    </form>
    <p class="note">Reference information only, not legal or immigration advice.</p></main>`;
}

// ---------- render + routing ----------
const TABS = [['home', '🏠', 'Home', 'Utama'], ['tracker', '🧭', 'Tracker', 'Penjejak'], ['chat', '💬', 'Buddy', 'Buddy'], ['coupons', '🎟️', 'Coupons', 'Kupon'], ['menu', '☰', 'Menu', 'Menu']];

async function render() {
  const route = (location.hash.replace(/^#\/?/, '') || 'home').split('/');
  const nav = document.getElementById('tabbar');
  if (!state.onboarded) {
    nav.hidden = true;
    $app.innerHTML = onboarding();
    bindForms();
    return;
  }
  const ost = O.cachedStatus();
  if (ost?.maintenance_on) { nav.hidden = true; $app.innerHTML = maintenancePage(ost); return; }
  nav.hidden = false;
  const [name, key, id] = route;
  if (name === 'form') {
    await renderForm(key, id);
  } else {
    const fn = screens[name] || screens.home;
    $app.innerHTML = fn();
    bindForms();
  }
  const active = name === 'form' ? COLLECTIONS[key]?.route : name;
  nav.innerHTML = TABS.map(([r, ic, en, ms]) => `<a href="#/${r}" class="${active === r || (r === 'menu' && !TABS.some(x => x[0] === active)) ? 'on' : ''}" data-testid="tab-${r}"><span aria-hidden="true">${ic}</span>${esc(state.lang === 'ms' ? ms : en)}</a>`).join('');
  if (name === 'chat') { const m = document.getElementById('msgs'); if (m) m.scrollTop = m.scrollHeight; }
  if (name === 'news' && !state.news.fetchedAt && !screens.news.tried) { screens.news.tried = true; refreshNews(); }
  window.scrollTo(0, 0);
}

function bindForms() {
  const on = (id, fn) => document.getElementById(id)?.addEventListener('submit', e => { e.preventDefault(); fn(new FormData(e.target)); });
  on('onboardForm', fd => {
    state.profile = { ...state.profile, familyName: String(fd.get('familyName') || '').trim(), tier: fd.get('tier'), state: fd.get('state'), arrival: fd.get('arrival') || '' };
    state.onboarded = true; commit(); go('home'); render();
  });
  on('profileForm', fd => {
    state.profile = { ...state.profile, familyName: String(fd.get('familyName') || '').trim(), tier: fd.get('tier'), state: fd.get('state'), arrival: fd.get('arrival') || '' };
    commit(); toast('Profile saved'); render();
  });
  on('fdForm', fd => {
    state.fd = { ...state.fd, bank: String(fd.get('bank') || '').trim(), amount: fd.get('amount') || '', currency: fd.get('currency'), placed: fd.get('placed') || '', maturity: fd.get('maturity') || '' };
    commit(); toast('Fixed deposit saved'); render();
  });
  on('settleAdd', fd => {
    const t = String(fd.get('t') || '').trim();
    if (!t) return;
    state.settle.push({ id: S.uid(), title: t, done: false, custom: true }); commit(); render();
  });
  on('chatForm', fd => ask(String(fd.get('q') || '')));
  on('problemForm', async fd => {
    const subject = String(fd.get('subject') || '').trim();
    if (!subject) { toast('Write what went wrong'); return; }
    try { await O.reportProblem(subject, String(fd.get('body') || '')); screens.settings.msg = 'Sent to the MM2H office. Thank you.'; }
    catch { screens.settings.msg = 'Could not send. Check the internet and try again.'; }
    render();
  });
}

function ask(q) {
  q = q.trim();
  if (!q) return;
  const o = O.officeAnswer(q);
  const r = o ? { a: o.body || o.title, go: null } : C.answer(q);
  state.chat.push({ from: 'me', text: q }, { from: 'buddy', text: r.a, go: r.go });
  state.chat = state.chat.slice(-80);
  commit(); render();
}

async function refreshNews() {
  const topic = screens.news.topic || 'mm2h';
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(NEWS_TOPICS[topic].q)}&hl=en-MY&gl=MY&ceid=MY:en`;
  screens.news.status = 'Loading…';
  if (location.hash.startsWith('#/news')) render();
  try {
    const http = globalThis.Capacitor?.isNativePlatform?.() && globalThis.Capacitor?.Plugins?.CapacitorHttp;
    let text;
    if (http) {
      const res = await http.get({ url, responseType: 'text' });
      if (res.status >= 400) throw new Error('HTTP ' + res.status);
      text = typeof res.data === 'string' ? res.data : String(res.data);
    } else {
      const res = await fetch(url);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      text = await res.text();
    }
    const items = S.parseRss(text).map(i => ({ ...i, topic }));
    if (!items.length) throw new Error('No headlines found');
    state.news = { items: S.mergeNews(state.news.items.filter(i => i.topic !== topic), items, 90), fetchedAt: new Date().toISOString() };
    screens.news.status = '';
    commit();
  } catch {
    screens.news.status = navigator.onLine === false ? 'You are offline. Showing saved headlines.' : 'Could not load headlines. Showing saved ones.';
  }
  if (location.hash.startsWith('#/news')) render();
}

// ---------- clicks and inputs (delegated) ----------
document.addEventListener('click', async e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.tagName === 'INPUT' || el.tagName === 'SELECT') return;
  const a = el.dataset.act, id = el.dataset.id;
  switch (a) {
    case 'stage': {
      const s = state.stages.find(x => x.id === id);
      if (s) { s.status = S.nextStatus(s.status); commit(); render(); }
      break;
    }
    case 'rmsettle': state.settle = state.settle.filter(x => x.id !== id); commit(); render(); break;
    case 'ask': ask(el.dataset.q); break;
    case 'clearchat': state.chat = []; commit(); render(); break;
    case 'dircat': screens.directory.cat = el.dataset.cat; render(); break;
    case 'month': {
      const [y, m] = (screens.tasks.month || S.todayISO().slice(0, 7)).split('-').map(Number);
      const d = new Date(y, m - 1 + Number(el.dataset.d), 1);
      screens.tasks.month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; render(); break;
    }
    case 'lang': state.lang = el.dataset.l; commit(); render(); break;
    case 'backup': {
      const ta = document.getElementById('backupText');
      ta.value = S.exportBackup(state);
      ta.select();
      try { await navigator.clipboard.writeText(ta.value); toast('Backup copied — paste it somewhere safe'); } catch { toast('Backup ready — select and copy the text'); }
      break;
    }
    case 'restore': {
      const ta = document.getElementById('backupText');
      try {
        const next = S.importBackup(ta.value);
        if (!confirm('Replace all data on this phone with this backup?')) return;
        state = next; state.onboarded = true; commit(); toast('Backup restored'); render();
      } catch (err) { toast(err.message); }
      break;
    }
    case 'reset': {
      if (!confirm('Erase everything on this phone? This cannot be undone.')) return;
      try { await clearFiles(); } catch { /* no photos stored */ }
      state = S.emptyState(); commit(); go('home'); render(); break;
    }
    case 'newstopic': screens.news.topic = el.dataset.k; screens.news.status = ''; render(); if (!state.news.items.some(i => i.topic === el.dataset.k)) refreshNews(); break;
    case 'refreshnews': refreshNews(); break;
    case 'fav': {
      state.favHotspots = state.favHotspots.includes(id) ? state.favHotspots.filter(x => x !== id) : [...state.favHotspots, id];
      commit(); render(); break;
    }
    case 'ctab': screens.coupons.tab = el.dataset.t; render(); break;
    case 'officesignin': {
      if (!screens.settings.consent) return;
      try { localStorage.setItem('mwab:office:consent', '1'); } catch { /* blocked */ }
      try { await O.signIn(); } catch { screens.settings.msg = 'Could not open Google sign-in. Check the internet.'; render(); }
      break;
    }
    case 'officeshare': await officeShare(); break;
    case 'officecopy': {
      try { await O.requestData('copy', ''); screens.settings.msg = 'Request sent. The office will send you a copy of what they hold.'; }
      catch { screens.settings.msg = 'Could not send the request. Try again.'; }
      render(); break;
    }
    case 'officestop': {
      if (!confirm('Stop sharing? Everything the MM2H office holds about your family from this app will be deleted. Your data on this phone stays.')) return;
      try { await O.stopSharing(); screens.settings.msg = 'Stopped. The office no longer holds your details from this app.'; screens.settings.consent = false; }
      catch { screens.settings.msg = 'Could not reach the office. You are signed out on this phone; try "Stop sharing" again when online to delete from the office.'; }
      render(); break;
    }
    case 'officeretry': await startOffice(); break;
    case 'copy': try { await navigator.clipboard.writeText(el.dataset.code); toast('Code copied'); } catch { toast(`Code: ${el.dataset.code}`); } break;
    case 'used': {
      const c = state.coupons.find(x => x.id === id);
      if (c) { c.used = !c.used; commit(); render(); }
      break;
    }
    case 'claim': {
      const o = C.SAMPLE_COUPONS.find(x => x.id === id);
      if (o && !state.coupons.some(c => c.sampleId === o.id)) {
        state.coupons.push({ id: S.uid(), sampleId: o.id, title: o.title, merchant: o.merchant, code: o.code, expiry: '', notes: o.note, used: false });
        commit(); toast('Added to your wallet'); render();
      }
      break;
    }
  }
});

document.addEventListener('change', e => {
  const el = e.target;
  const a = el.dataset?.act;
  if (a === 'check') {
    const it = state[el.dataset.list].find(x => x.id === el.dataset.id);
    if (it) { it.done = el.checked; commit(); render(); }
  } else if (a === 'task') {
    const it = state.tasks.find(x => x.id === el.dataset.id);
    if (it) { it.done = el.checked; commit(); render(); }
  } else if (a === 'hsstate') { screens.hotspots.state = el.value; render(); }
  else if (a === 'hscat') { screens.hotspots.cat = el.value; render(); }
  else if (a === 'hsfav') { screens.hotspots.fav = el.checked; render(); }
  else if (a === 'officeconsent') { screens.settings.consent = el.checked; render(); }
});

let typing;
document.addEventListener('input', e => {
  const el = e.target, a = el.dataset?.act;
  const keep = () => { const n = document.querySelector(`[data-act="${a}"]`); if (n) { n.focus(); n.setSelectionRange?.(n.value.length, n.value.length); } };
  if (a === 'docsearch' || a === 'guidesearch') {
    clearTimeout(typing);
    typing = setTimeout(() => { (a === 'docsearch' ? screens.docs : screens.guide).q = el.value; render().then(keep); }, 200);
  } else if (a === 'rate') {
    screens.finance.rate = el.value;
    const conv = S.convert(state.fd.amount, el.value);
    const out = document.querySelector('[data-testid="converted"]');
    if (out) out.textContent = conv !== null ? `${(Number(state.fd.amount) || 0).toLocaleString('en-MY')} ${state.fd.currency} ≈ ${S.money(conv)}` : 'Enter the FD amount and a rate.';
  }
});

// ---------- MM2H office (optional) ----------
async function officeShare(quiet = false) {
  try { await O.share(state); screens.settings.msg = 'Shared with the MM2H office.'; }
  catch (e) { screens.settings.msg = e.status === 401 ? 'Please sign in again.' : 'Could not share. Check the internet and try again.'; }
  if (!quiet || location.hash.startsWith('#/settings')) render();
}
async function finishOffice(url) {
  try {
    if (!(await O.finishSignIn(url))) return;
    let ok = false;
    try { ok = localStorage.getItem('mwab:office:consent') === '1'; localStorage.removeItem('mwab:office:consent'); } catch { /* blocked */ }
    if (ok) await officeShare(); else { screens.settings.msg = 'Signed in. Tick the box and tap Share now to share.'; render(); }
    go('settings');
  } catch (e) { screens.settings.msg = e.message || 'Sign-in did not finish.'; go('settings'); render(); }
}
async function startOffice() {
  if (!O.available()) return;
  await O.refresh();
  render();
  if (O.sharing()) officeShare(true);
}
window.addEventListener('error', e => O.noteError(e.message, location.hash));
window.addEventListener('unhandledrejection', e => O.noteError(e.reason?.message || String(e.reason), location.hash));
O.onReturn(url => finishOffice(url));
if (/[?&]office=1/.test(location.search)) finishOffice(location.href);
startOffice();

window.addEventListener('hashchange', render);
window.addEventListener('online', () => { if (location.hash.startsWith('#/news')) refreshNews(); });
render();
globalThis.__mwab = { get state() { return state; } };
