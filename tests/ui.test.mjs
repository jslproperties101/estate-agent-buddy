// Screen tests in a phone-sized Chromium (Playwright). Runs against dist/ (npm run build first).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';
import { serve } from '../scripts/serve.mjs';
import { MENUS } from '../web/js/i18n.js';

let srv, browser, url;
const SHOTS = 'tests/screens';
mkdirSync(SHOTS, { recursive: true });

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>
<item><title>MM2H applications rise in 2026 - The Daily</title><link>https://example.com/a</link><pubDate>Tue, 28 Oct 2026 08:00:00 GMT</pubDate><source url="https://example.com">The Daily</source></item>
<item><title>New guidance for SFZ participants</title><link>https://example.com/b</link><pubDate>Mon, 27 Oct 2026 08:00:00 GMT</pubDate></item>
<item><title>Unsafe link</title><link>javascript:alert(1)</link></item>
</channel></rss>`;

before(async () => {
  srv = await serve('dist');
  url = `http://127.0.0.1:${srv.address().port}/`;
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); srv?.close(); });

async function newPage({ news = 'ok' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('https://news.google.com/**', r => (news === 'ok' ? r.fulfill({ status: 200, contentType: 'application/rss+xml', body: RSS }) : r.abort()));
  page.on('dialog', d => d.accept());
  page.errors = errors;
  return page;
}

async function onboard(page, name = 'Tan', tier = 'Gold') {
  await page.goto(url);
  await page.fill('[data-testid=onboard-name]', name);
  await page.selectOption('[data-testid=onboard-tier]', tier);
  await page.click('[data-testid=onboard-start]');
  await page.waitForSelector('[data-testid=home-progress]');
}

test('onboarding leads to Welcome Home with the family name and tier', async () => {
  const page = await newPage();
  await onboard(page);
  assert.match(await page.textContent('.hero'), /Tan family/);
  assert.match(await page.textContent('.hero'), /Gold tier/);
  assert.equal(await page.locator('[data-testid^=menu-]').count(), 18, 'home grid lists menus 2-19');
  await page.screenshot({ path: `${SHOTS}/01-home.png`, fullPage: true });
  assert.deepEqual(page.errors, []);
});

test('every one of the 19 menus opens without errors and shows its title', async () => {
  const page = await newPage();
  await onboard(page);
  for (const m of MENUS) {
    await page.goto(`${url}#/${m.id}`);
    await page.waitForSelector('header.top h1');
    assert.equal((await page.textContent('header.top h1')).trim(), m.en, m.id);
    assert.match(await page.textContent('header.top small'), new RegExp(`Menu ${m.n}`));
    await page.screenshot({ path: `${SHOTS}/menu-${String(m.n).padStart(2, '0')}-${m.id}.png` });
  }
  assert.deepEqual(page.errors, []);
});

test('family member with dates feeds Renewals and Home deadlines; data survives a reload', async () => {
  const page = await newPage();
  await onboard(page);
  await page.goto(`${url}#/family`);
  await page.click('[data-testid=add-family]');
  await page.fill('#f-name', 'Ali Tan');
  await page.selectOption('#f-relation', 'Principal');
  const soon = new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10);
  await page.fill('#f-passportExpiry', soon);
  await page.fill('#f-passExpiry', '2031-01-01');
  await page.click('[data-testid=save]');
  await page.waitForSelector('[data-testid=family-item]');
  await page.goto(`${url}#/renewals`);
  assert.match(await page.textContent('.deadlines'), /Ali Tan — passport expires/);
  assert.equal(await page.locator('.dl.soon').count(), 1);
  await page.reload();
  await page.goto(`${url}#/home`);
  assert.match(await page.textContent('.deadlines'), /Ali Tan/);
});

test('required fields are enforced and items can be edited and deleted', async () => {
  const page = await newPage();
  await onboard(page);
  await page.goto(`${url}#/form/tasks/new`);
  await page.click('[data-testid=save]');
  assert.match(await page.textContent('#toast'), /Please fill in: Task/);
  await page.fill('#f-title', 'Book medical check');
  await page.click('[data-testid=save]');
  await page.waitForSelector('[data-testid=tasks-item]');
  await page.click('[data-testid=tasks-item] a');
  await page.fill('#f-title', 'Book medical check at clinic');
  await page.click('[data-testid=save]');
  assert.match(await page.textContent('[data-testid=tasks-item]'), /at clinic/);
  await page.check('[data-testid=tasks-item] input[type=checkbox]');
  assert.match(await page.textContent('main'), /Done \(1\)/);
  await page.click('[data-testid=tasks-item] a');
  await page.click('[data-testid=delete]');
  await page.waitForSelector('text=Add tasks like');
  assert.deepEqual(page.errors, []);
});

test('tracker steps cycle status and update progress; checklist ticks persist', async () => {
  const page = await newPage();
  await onboard(page);
  await page.goto(`${url}#/tracker`);
  await page.click('[data-testid=stage-tier]');
  await page.click('[data-testid=stage-tier]');
  assert.equal(await page.textContent('[data-testid=tracker-progress]'), '11%');
  await page.locator('.checks input').first().check();
  await page.reload();
  assert.equal(await page.locator('.checks input').first().isChecked(), true);
  assert.equal(await page.locator('tr.mine td').first().textContent(), 'Gold');
});

test('fixed deposit: 50% limit, withdrawals and currency helper', async () => {
  const page = await newPage();
  await onboard(page);
  await page.goto(`${url}#/finance`);
  await page.fill('[data-testid=fd-amount]', '500000');
  await page.click('[data-testid=fd-save]');
  assert.match(await page.textContent('[data-testid=fd-cap]'), /250,000 USD/);
  await page.click('[data-testid=add-withdrawals]');
  await page.fill('#f-amount', '100000');
  await page.selectOption('#f-purpose', 'Education');
  await page.click('[data-testid=save]');
  await page.waitForSelector('[data-testid=fd-remaining]');
  assert.match(await page.textContent('[data-testid=fd-remaining]'), /150,000 USD/);
  await page.fill('[data-testid=rate]', '4.5');
  assert.match(await page.textContent('[data-testid=converted]'), /RM 2,250,000/);
});

test('documents vault saves a photo on the phone and finds it by search', async () => {
  const page = await newPage();
  await onboard(page);
  await page.goto(`${url}#/form/docs/new`);
  await page.fill('#f-title', 'Principal passport');
  await page.selectOption('#f-category', 'Passport');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await page.setInputFiles('#f-photoId', { name: 'p.png', mimeType: 'image/png', buffer: png });
  await page.click('[data-testid=save]');
  await page.waitForSelector('[data-testid=docs-item]');
  assert.match(await page.textContent('[data-testid=docs-item]'), /photo/);
  await page.click('[data-testid=docs-item] a');
  await page.waitForSelector('[data-testid=doc-photo]');
  await page.goto(`${url}#/docs`);
  await page.fill('.search', 'zzz');
  await page.waitForSelector('text=Save photos of passports');
  await page.fill('.search', 'passport');
  await page.waitForSelector('[data-testid=docs-item]');
  assert.deepEqual(page.errors, []);
});

test('news loads headlines (only https links), and falls back when offline', async () => {
  const page = await newPage();
  await onboard(page);
  await page.goto(`${url}#/news`);
  await page.waitForSelector('[data-testid=news-item]');
  assert.equal(await page.locator('[data-testid=news-item]').count(), 2);
  assert.match(await page.textContent('[data-testid=news-item]'), /MM2H applications rise in 2026/);
  assert.doesNotMatch(await page.textContent('.news'), /The Daily\s*The Daily/);
  await page.screenshot({ path: `${SHOTS}/news-loaded.png` });

  const off = await newPage({ news: 'fail' });
  await onboard(off);
  await off.goto(`${url}#/news`);
  await off.waitForFunction(() => /Could not load|offline/i.test(document.querySelector('[data-testid=news-status]')?.textContent || ''));
  assert.match(await off.textContent('main'), /Official sources/);
});

test('hotspots filter by state and type, and favourites are saved', async () => {
  const page = await newPage();
  await onboard(page);
  await page.goto(`${url}#/hotspots`);
  const all = await page.locator('[data-testid=hotspot]').count();
  assert.ok(all >= 15);
  await page.selectOption('#hs-state', 'Penang');
  const pen = await page.locator('[data-testid=hotspot]').count();
  assert.ok(pen > 0 && pen < all);
  await page.selectOption('#hs-cat', 'Food');
  assert.equal(await page.locator('[data-testid=hotspot]').count(), 1);
  await page.click('[data-testid=fav-gurneydrive]');
  await page.selectOption('#hs-state', 'All');
  await page.selectOption('#hs-cat', 'All');
  await page.check('[data-act=hsfav]');
  assert.equal(await page.locator('[data-testid=hotspot]').count(), 1);
  assert.match(await page.locator('[data-testid=hotspot] a').getAttribute('href'), /^https:\/\/www\.google\.com\/maps\/search/);
});

test('coupons: claim a sample offer, add own coupon, expiring and used states', async () => {
  const page = await newPage();
  await onboard(page);
  await page.goto(`${url}#/coupons`);
  await page.click('[data-testid=tab-offers]');
  assert.match(await page.textContent('main'), /samples/);
  await page.click('[data-testid=claim-sample-health]');
  assert.equal(await page.locator('[data-testid=claim-sample-health]').isDisabled(), true);
  await page.click('[data-act=ctab][data-t=mine]');
  await page.click('[data-testid=add-coupons]');
  await page.fill('#f-title', 'Grocery RM20 off');
  await page.fill('#f-code', 'HELLO20');
  await page.fill('#f-expiry', new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10));
  await page.click('[data-testid=save]');
  await page.waitForSelector('[data-testid=coupons-item]');
  assert.equal(await page.locator('[data-testid=coupons-item]').count(), 2);
  assert.equal(await page.locator('.coupon.expiring').count(), 1);
  await page.locator('.coupon.expiring [data-act=used]').click();
  assert.equal(await page.locator('.coupon.used').count(), 1);
  await page.goto(`${url}#/home`);
  assert.doesNotMatch(await page.textContent('main'), /Grocery RM20 off coupon expires/, 'used coupons leave the deadlines');
});

test('AI Buddy answers offline and links to the right menu', async () => {
  const page = await newPage();
  await onboard(page);
  await page.goto(`${url}#/chat`);
  await page.fill('.composer input', 'How much fixed deposit can I withdraw?');
  await page.click('[data-testid=send]');
  await page.waitForSelector('[data-testid=msg-buddy]');
  assert.match(await page.textContent('[data-testid=msg-buddy]'), /50%/);
  await page.click('[data-testid=msg-buddy] a');
  await page.waitForSelector('[data-testid=fd-amount]');
});

test('Future Integrations lists statuses; Bahasa Malaysia switch; backup and restore', async () => {
  const page = await newPage();
  await onboard(page);
  await page.goto(`${url}#/integrations`);
  assert.ok(await page.locator('[data-testid=integration]').count() >= 8);
  assert.match(await page.textContent('main'), /Planned/);
  assert.match(await page.textContent('main'), /Needs approval/);

  await page.goto(`${url}#/form/contacts/new`);
  await page.fill('#f-name', 'My MM2H agent');
  await page.fill('#f-whatsapp', '+60 12-345 6789');
  await page.click('[data-testid=save]');
  await page.waitForSelector('[data-testid=contacts-item]');
  assert.equal(await page.locator('[data-testid=contacts-item] a[href^="https://wa.me/60123456789"]').count(), 1);

  await page.goto(`${url}#/settings`);
  await page.click('[data-testid=backup]');
  const backup = await page.inputValue('[data-testid=backup-text]');
  assert.match(backup, /malaysia-welcome-ai-buddy/);
  await page.click('[data-testid=reset]');
  await page.waitForSelector('[data-testid=onboard-start]');
  await onboard(page, 'Temp', 'Silver');
  await page.goto(`${url}#/settings`);
  await page.fill('[data-testid=backup-text]', backup);
  await page.click('[data-testid=restore]');
  await page.goto(`${url}#/directory`);
  assert.match(await page.textContent('main'), /My MM2H agent/);
  await page.goto(`${url}#/settings`);
  await page.click('[data-testid=lang-ms]');
  await page.goto(`${url}#/menu`);
  assert.match(await page.textContent('main'), /Penjejak Permohonan/);
  assert.match(await page.textContent('#tabbar'), /Utama/);
  assert.deepEqual(page.errors, []);
});

test('layout fits a small phone with no sideways scrolling', async () => {
  const page = await newPage();
  await onboard(page);
  await page.setViewportSize({ width: 360, height: 740 });
  for (const m of MENUS) {
    await page.goto(`${url}#/${m.id}`);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    assert.ok(over <= 0, `${m.id} overflows by ${over}px`);
  }
});

// ---------- Share with MM2H office (a build with the office set; fake office database) ----------
import { execFileSync } from 'node:child_process';
const OFFICE = 'https://fakeoffice.supabase.co';
test('office: content from the office shows; share needs consent + Google; then report a problem and stop sharing', async () => {
  execFileSync(process.execPath, ['scripts/build.mjs'], { env: { ...process.env, MW_OFFICE_URL: OFFICE, MW_OFFICE_KEY: 'sb_publishable_test', MW_OUTDIR: 'dist-office' }, stdio: 'pipe' });
  const osrv = await serve('dist-office');
  const ourl = `http://127.0.0.1:${osrv.address().port}/`;
  const page = await newPage();
  const calls = [];
  let maintenance = false;
  const ok = b => ({ status: 200, contentType: 'application/json', body: JSON.stringify(b) });
  await page.route(`${OFFICE}/**`, async r => {
    const u = r.request().url();
    const fn = u.split('/rpc/')[1];
    let args = {};
    try { args = r.request().postDataJSON() ?? {}; } catch { /* none */ }
    calls.push({ fn: fn ?? u, args, auth: r.request().headers().authorization });
    if (u.includes('/auth/v1/authorize')) { const back = new URL(u).searchParams.get('redirect_to'); return r.fulfill({ status: 302, headers: { location: `${back}&code=c1` } }); }
    if (u.includes('/auth/v1/token')) return r.fulfill(ok({ access_token: 'famtok', refresh_token: 'r', expires_in: 3600, user: { id: 'f1', email: 'tan@example.com' } }));
    if (u.includes('/auth/v1/logout')) return r.fulfill({ status: 204 });
    switch (fn) {
      case 'eab_app_status': return r.fulfill(ok({ maintenance_on: maintenance, maintenance_message: 'Back by 6pm', min_version: '9.0.0', update_url: 'https://play.google.com/x', announcement: 'Office closed on Friday', flags: {} }));
      case 'mm2h_content_list': return r.fulfill(ok([{ kind: 'hotspot', id: 'h1', title: 'Penang Hill', area: 'Penang', body: 'Funicular to the top', url: 'https://penanghill.gov.my' },
        { kind: 'knowledge', id: 'k1', title: 'Fixed deposit withdrawal', body: 'Office answer: you may withdraw for approved purposes after a year.' }]));
      case 'mm2h_sync': return r.fulfill(ok({ ok: true, at: '2026-10-31T01:00:00Z' }));
      case 'eab_app_ticket': return r.fulfill(ok('t1'));
      case 'mm2h_forget_me': return r.fulfill(ok(null));
      default: return r.fulfill({ status: 404, body: '{}' });
    }
  });
  // onboard on the office build
  await page.goto(ourl);
  await page.fill('[data-testid=onboard-name]', 'Tan');
  await page.selectOption('[data-testid=onboard-tier]', 'Gold');
  await page.click('[data-testid=onboard-start]');
  await page.waitForSelector('[data-testid=office-banner]');
  assert.match(await page.textContent('[data-testid=office-banner]'), /Office closed on Friday/);
  assert.match(await page.textContent('[data-testid=office-update]'), /9\.0\.0/);
  await page.goto(`${ourl}#/hotspots`);
  await page.waitForSelector('[data-testid=office-hotspot]');
  assert.match(await page.textContent('[data-testid=office-hotspot]'), /Penang Hill/);
  await page.goto(`${ourl}#/chat`);
  await page.fill('input[name=q]', 'Can I make a fixed deposit withdrawal?');
  await page.click('[data-testid=send]');
  await page.waitForSelector('text=Office answer');
  assert.equal(calls.filter(c => c.fn === 'mm2h_sync').length, 0, 'nothing shared before consent');
  // settings: consent first, then Google
  await page.goto(`${ourl}#/settings`);
  assert.ok(await page.isDisabled('[data-testid=office-signin]'), 'sign-in waits for the consent box');
  await page.check('[data-testid=office-consent]');
  await page.click('[data-testid=office-signin]');
  await page.waitForSelector('[data-testid=office-share]');
  const sync = calls.find(c => c.fn === 'mm2h_sync');
  assert.ok(sync, 'shared after sign-in'); assert.equal(sync.auth, 'Bearer famtok');
  assert.equal(sync.args.p.family.family_name, 'Tan'); assert.equal(sync.args.p.consent, true);
  assert.match(await page.textContent('[data-testid=office-card]'), /tan@example\.com/);
  await page.screenshot({ path: `${SHOTS}/30-office-sharing.png`, fullPage: true });
  await page.fill('[data-testid=problem-subject]', 'Coupons page is blank');
  await page.click('[data-testid=problem-send]');
  await page.waitForSelector('text=Sent to the MM2H office');
  assert.equal(calls.find(c => c.fn === 'eab_app_ticket').args.p_subject, 'Coupons page is blank');
  await page.click('[data-testid=office-stop]');
  await page.waitForSelector('[data-testid=office-consent]');
  assert.ok(calls.some(c => c.fn === 'mm2h_forget_me'), 'deleted from the office');
  assert.equal(await page.evaluate(() => localStorage.getItem('mwab:office:session')), null);
  // maintenance closes the app
  maintenance = true;
  await page.goto(ourl); await page.reload();
  await page.waitForSelector('[data-testid=maintenance]');
  assert.match(await page.textContent('[data-testid=maintenance]'), /Back by 6pm/);
  await page.screenshot({ path: `${SHOTS}/31-office-maintenance.png`, fullPage: true });
  assert.deepEqual(page.errors, []);
  osrv.close();
});
