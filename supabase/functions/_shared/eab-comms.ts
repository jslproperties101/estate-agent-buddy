// AdminBatch008 — shared, pure helpers for the broadcast and weekly-report Edge Functions (no network, no secrets).
// Also imported by the Node tests in supabase/tests/comms-functions-test.mjs.

export type Lang = 'en' | 'bm' | 'zh';
export interface Broadcast {
  id: string; ref: string; channel: 'email' | 'whatsapp'; kind: 'service' | 'news';
  subject_en?: string | null; subject_bm?: string | null; subject_zh?: string | null;
  body_en: string; body_bm?: string | null; body_zh?: string | null;
}
export interface Recipient { id: number; address: string; lang: Lang; token: string }

/** The agent's language, or English when that version was left empty. */
export function textFor(b: Broadcast, lang: Lang): { subject: string; body: string } {
  const pick = (en?: string | null, bm?: string | null, zh?: string | null) =>
    ((lang === 'bm' ? bm : lang === 'zh' ? zh : en) || en || '').trim();
  return { subject: pick(b.subject_en, b.subject_bm, b.subject_zh), body: pick(b.body_en, b.body_bm, b.body_zh) };
}

const FOOT: Record<Lang, { service: (c: string) => string; news: (c: string) => string; unsub: string }> = {
  en: { service: c => `This is a service notice from ${c} about your Estate Agent AI Buddy account.`,
        news: c => `You get this because you said yes to news & offers from ${c}.`, unsub: 'Stop news & offers' },
  bm: { service: c => `Ini ialah notis perkhidmatan daripada ${c} tentang akaun Estate Agent AI Buddy anda.`,
        news: c => `Anda menerima ini kerana anda bersetuju menerima berita & tawaran daripada ${c}.`, unsub: 'Henti berita & tawaran' },
  zh: { service: c => `这是 ${c} 关于您的 Estate Agent AI Buddy 账户的服务通知。`,
        news: c => `您收到此邮件是因为您同意接收 ${c} 的新闻与优惠。`, unsub: '停止接收新闻与优惠' },
};

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** One email (Resend format). Every email carries the unsubscribe link (it turns "news & offers" off). */
export function emailFor(b: Broadcast, r: Recipient, opts: { from: string; company: string; unsubscribeBase: string }) {
  const { subject, body } = textFor(b, r.lang);
  const f = FOOT[r.lang] ?? FOOT.en;
  const url = `${opts.unsubscribeBase}?t=${r.token}`;
  const why = b.kind === 'news' ? f.news(opts.company) : f.service(opts.company);
  const text = `${body}\n\n--\n${why}\n${f.unsub}: ${url}\n${b.ref}`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#111">${esc(body).replace(/\n/g, '<br>')}</div>`
    + `<hr style="border:0;border-top:1px solid #ddd;margin:24px 0 8px"><p style="font-family:Arial,sans-serif;font-size:12px;color:#666">`
    + `${esc(why)}<br><a href="${esc(url)}">${esc(f.unsub)}</a> · ${esc(b.ref)}</p>`;
  return { from: opts.from, to: [r.address], subject, text, html,
    headers: { 'List-Unsubscribe': `<${url}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } };
}

/** WhatsApp Business (Meta Cloud API): an approved template with ONE text variable {{1}} carrying the message.
 *  Meta does not allow new lines or tabs in a variable, so they become " · ". */
export function waTemplateFor(b: Broadcast, r: Recipient, opts: { template: string; langs: Record<string, string> }) {
  const { body } = textFor(b, r.lang);
  const one = body.replace(/[\t\r]+/g, ' ').replace(/\n+/g, ' · ').replace(/ {4,}/g, '   ').slice(0, 1000);
  return { messaging_product: 'whatsapp', to: r.address, type: 'template',
    template: { name: opts.template, language: { code: opts.langs[r.lang] ?? opts.langs.en ?? 'en' },
      components: [{ type: 'body', parameters: [{ type: 'text', text: one }] }] } };
}

/** Tap-to-send link (used by Admin EAB, kept here so both sides agree). */
export const waLink = (number: string, text: string) => `https://wa.me/${number.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;

// ---------- unsubscribe page ----------
const UNSUB_PAGE: Record<Lang, { ok: string; bad: string; note: string }> = {
  en: { ok: 'You will no longer get news & offers.', bad: 'This link is not valid any more.', note: 'Service notices about your account still arrive. You can turn news & offers on again in the app: Settings.' },
  bm: { ok: 'Anda tidak akan menerima berita & tawaran lagi.', bad: 'Pautan ini tidak sah lagi.', note: 'Notis perkhidmatan tentang akaun anda masih dihantar. Anda boleh menghidupkan semula berita & tawaran dalam aplikasi: Tetapan.' },
  zh: { ok: '您将不再收到新闻与优惠。', bad: '此链接已失效。', note: '有关您账户的服务通知仍会发送。您可以在应用的设置中重新开启新闻与优惠。' },
};
export function unsubscribePage(ok: boolean, lang: Lang = 'en'): string {
  const t = UNSUB_PAGE[lang] ?? UNSUB_PAGE.en;
  return `<!doctype html><html lang="${lang === 'bm' ? 'ms' : lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<title>Estate Agent AI Buddy</title></head><body style="font-family:Arial,sans-serif;background:#08080A;color:#F7F4EC;padding:32px 16px">`
    + `<h1 style="color:#D4AF37;font-size:22px">${esc(ok ? t.ok : t.bad)}</h1><p>${esc(t.note)}</p></body></html>`;
}

// ---------- weekly report numbers → lines for the PDF ----------
export interface ReportData {
  ref: string; from: string; to: string; company?: string | null; made_at: string;
  agents_total: number; agents_new: number; agents_active: number; active_by_day: { day: string; agents: number }[];
  listings: number; listings_new: number; closed: number; sync_runs: number; sync_fails: number;
  tickets_new: number; tickets_open: number; posts_published: number; broadcasts_sent: number;
  accounts_not_active: number; licences_unverified: number; admin_actions: number; admin_views: number; log_chain_ok: boolean;
}
export function reportLines(d: ReportData): { section: string; rows: [string, string][] }[] {
  const n = (x: number) => String(x ?? 0);
  return [
    { section: 'Agents', rows: [['Agents (total)', n(d.agents_total)], ['New this week', n(d.agents_new)], ['Used the app this week', n(d.agents_active)],
      ['Accounts not active', n(d.accounts_not_active)], ['Licences not verified', n(d.licences_unverified)]] },
    { section: 'Listings', rows: [['Listings (total)', n(d.listings)], ['New listings this week', n(d.listings_new)], ['Sold / rented this week', n(d.closed)]] },
    { section: 'Operations', rows: [['Syncs this week', n(d.sync_runs)], ['Syncs that failed', n(d.sync_fails)], ['New support tickets', n(d.tickets_new)],
      ['Tickets still open', n(d.tickets_open)], ['Posts published', n(d.posts_published)], ['Broadcasts sent', n(d.broadcasts_sent)]] },
    { section: 'Admin EAB', rows: [['Admin actions recorded', n(d.admin_actions)], ['Records viewed by admins', n(d.admin_views)],
      ['Audit log check', d.log_chain_ok ? 'OK — no change found' : 'PROBLEM — open Master Audit Log']] },
  ];
}
/** Only characters the built-in PDF font can draw (others become "?"). */
export const pdfSafe = (s: string) => s.replace(/[^\x20-\x7E -ÿ]/g, '?');

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(h), x => x.toString(16).padStart(2, '0')).join('');
}

/** The PDF itself (pdf-lib is passed in, so Deno and the Node tests use the same code). */
// deno-lint-ignore no-explicit-any
export async function buildReportPdf(lib: any, d: ReportData, contentSha: string): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = lib;
  const doc = await PDFDocument.create();
  doc.setTitle(`Weekly summary ${d.ref}`); doc.setProducer('Admin EAB'); doc.setCreationDate(new Date(d.made_at));
  const font = await doc.embedFont(StandardFonts.Helvetica); const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const page = doc.addPage([595.28, 841.89]);   // A4
  const gold = rgb(0.61, 0.48, 0.13); const ink = rgb(0.1, 0.1, 0.1); const grey = rgb(0.45, 0.45, 0.45);
  let y = 800;
  const text = (s: string, x: number, size: number, f = font, color = ink) => page.drawText(pdfSafe(s), { x, y, size, font: f, color });
  text(`${d.company || 'Estate Agent AI Buddy'} - Weekly summary`, 40, 18, bold, gold); y -= 22;
  text(`${d.from} to ${d.to} (Malaysia time)   Reference ${d.ref}`, 40, 10, font, grey); y -= 14;
  text(`Made ${new Date(d.made_at).toISOString().replace('T', ' ').slice(0, 16)} UTC by Admin EAB. Totals only, no agent names.`, 40, 9, font, grey); y -= 26;
  for (const s of reportLines(d)) {
    text(s.section, 40, 12, bold, gold); y -= 16;
    for (const [k, v] of s.rows) { text(k, 52, 10); text(v, 360, 10, bold); y -= 14; }
    y -= 10;
  }
  // daily active agents as bars
  text('Agents using the app each day', 40, 12, bold, gold); y -= 18;
  const max = Math.max(1, ...d.active_by_day.map(x => x.agents));
  const top = y; const h = 90; const w = 52;
  d.active_by_day.forEach((x, i) => {
    const bh = Math.round((x.agents / max) * h);
    page.drawRectangle({ x: 52 + i * (w + 14), y: top - h, width: w, height: Math.max(bh, 1), color: gold });
    page.drawText(String(x.agents), { x: 52 + i * (w + 14), y: top - h + Math.max(bh, 1) + 3, size: 9, font: bold, color: ink });
    page.drawText(pdfSafe(x.day.slice(5)), { x: 52 + i * (w + 14), y: top - h - 12, size: 8, font, color: grey });
  });
  y = top - h - 40;
  text('Content fingerprint (SHA-256 of the numbers above):', 40, 8, font, grey); y -= 11;
  text(contentSha, 40, 8, font, grey); y -= 11;
  text('The file fingerprint is recorded in Admin EAB; use "Check a file" in the Document Vault to prove a copy is unchanged.', 40, 8, font, grey);
  return await doc.save();
}
