// MainForAdmin-B (JoyChange009 A6; JoyChange005-Main Part6 H4, H5, I; Part2 C): the main app asks the company's database
// about its own account at app opening and after every sync (eab_my_account), and:
//  - suspended / banned / closed: signs out and the sign-in screen shows the reason and the support contact;
//  - forced sign-out: signs out when this phone's sign-in happened before the time the admin chose;
//  - sends the licence (when it changed), a Terms answer or a marketing choice made offline, and the queued sign-in log;
//  - MainForAdmin-F: sends the agent's own Contact number when it changed (for Admin EAB WhatsApp broadcasts);
//  - MainForAdmin-G: asks whether the company removed THIS phone (eab_my_device); if it was removed after this phone's
//    sign-in, the phone is signed out the same way as a forced sign-out (signing in again works).
// A database without these functions (an older project) is treated as "nothing to report": the app keeps working.
// The phone's own records are never deleted by any of this.
import type { Store } from '../data/store';
import type { SyncConfig } from '../data/sync';
import { rpc, TeamError } from '../team/api';
import { flushLoginLog, logLogin, deviceId } from './loginLog';

export interface MyAccount {
  status: 'active' | 'suspended' | 'banned' | 'closed'; reason?: string | null; force_logout_after?: string | null;
  terms?: { version: string; at: string } | null; marketing?: boolean | null;
  licence?: { type?: string | null; number?: string | null; verified?: boolean } | null;
  company_name?: string; support_email?: string | null; business_address?: string | null;
}

/** The licence types the company's database accepts (Change I); any other remembered type is sent without a type. */
export const LICENCE_TYPES = ['REN', 'REA', 'PEA', 'EA', 'FIRM'] as const;
export const licenceKey = (type: string | undefined, number: string | undefined, user: string) =>
  `${(LICENCE_TYPES as readonly string[]).includes((type ?? '').toUpperCase()) ? (type ?? '').toUpperCase() : ''}|${(number ?? '').trim()}|${user}`;

/** MainForAdmin-F: the agent's own Contact number as the company's database keeps it (spaces, dashes, brackets and dots
 *  removed; same rule as eab_set_my_phone). Undefined = not a phone number, so nothing is sent. Empty = no number. */
export function phoneForServer(phone: string | undefined): string | undefined {
  const p = (phone ?? '').replace(/[\s().-]/g, '');
  if (!p) return '';
  return /^\+?[0-9]{8,15}$/.test(p) ? p : undefined;
}

/** What the app should do with the account the database reported. Pure, for tests. */
export function verdict(a: MyAccount, signedInAt: number | undefined, deviceRemovedAt?: string | null): 'ok' | 'blocked' | 'forced' {
  if (a.status && a.status !== 'active') return 'blocked';
  if (a.force_logout_after && Date.parse(a.force_logout_after) > (signedInAt ?? 0)) return 'forced';
  if (deviceRemovedAt && Date.parse(deviceRemovedAt) > (signedInAt ?? 0)) return 'forced';
  return 'ok';
}

/** MainForAdmin-G: when the company removed this phone (null = never). An older database without the function = never. */
async function deviceRemovedAt(store: Store, cfg: SyncConfig): Promise<string | null> {
  try { return (await rpc<{ removed_at: string | null }>(store, cfg, 'eab_my_device', { p_device_id: deviceId() }))?.removed_at ?? null; }
  catch { return null; }
}

let busy = false;
/** Checks the account and sends what is waiting. Returns what happened ('unavailable' = older database, nothing done). */
export async function checkAccount(store: Store, cfg: SyncConfig): Promise<'ok' | 'blocked' | 'forced' | 'unavailable' | 'offline'> {
  const s = store.getState().meta.syncSession;
  if (!s || busy) return 'offline';
  busy = true;
  try {
    let a: MyAccount;
    try { a = await rpc<MyAccount>(store, cfg, 'eab_my_account'); }
    catch (e) { return e instanceof TeamError && e.code === 'unavailable' ? 'unavailable' : 'offline'; }
    const v = verdict(a, s.signedInAt, a.status === 'active' || !a.status ? await deviceRemovedAt(store, cfg) : null);
    if (v !== 'ok') {
      await logLogin(v === 'forced' ? 'forced_out' : 'blocked', v === 'forced' ? undefined : a.status);
      await flushLoginLog(store, cfg);
      store.setSingleton('meta', {
        syncSession: undefined, syncError: undefined,
        accountBlock: { status: v === 'forced' ? 'forced' : a.status as 'suspended' | 'banned' | 'closed', reason: a.reason ?? undefined,
          supportEmail: a.support_email ?? undefined, address: a.business_address ?? undefined, at: Date.now() },
      });
      return v;
    }
    store.setSingleton('meta', { account: {
      userId: s.userId, terms: a.terms ?? null, marketing: a.marketing ?? null, licence: a.licence ?? null,
      companyName: a.company_name, supportEmail: a.support_email ?? null, address: a.business_address ?? null, checkedAt: Date.now() } });
    if (a.terms?.version) {
      const st = store.getState().settings;
      if (st.termsAccepted?.user !== s.userId || st.termsAccepted.version !== a.terms.version)
        store.setSingleton('settings', { termsAccepted: { version: a.terms.version, user: s.userId, at: Date.parse(a.terms.at) || Date.now() } });
    }
    await sendWaiting(store, cfg, a);
    await flushLoginLog(store, cfg);
    return 'ok';
  } finally { busy = false; }
}

/** The licence, a Terms answer and a marketing choice that have not reached the database yet. */
async function sendWaiting(store: Store, cfg: SyncConfig, a: MyAccount) {
  const st = store.getState();
  const s = st.meta.syncSession!;
  // A new phone: the licence saved on the account fills an empty profile.
  const p = st.profile;
  if (!p.regNo && a.licence?.number) {
    store.setSingleton('profile', { regType: a.licence.type ?? p.regType, regNo: a.licence.number });
    store.setSingleton('meta', { licenceSent: licenceKey(a.licence.type ?? undefined, a.licence.number, s.userId) });
  } else {
    const key = licenceKey(p.regType, p.regNo, s.userId);
    const onServer = licenceKey(a.licence?.type ?? undefined, a.licence?.number ?? undefined, s.userId);
    if (key !== onServer && key !== st.meta.licenceSent) {
      try {
        const [type, number] = key.split('|');
        await rpc(store, cfg, 'eab_set_my_licence', { p_type: type || null, p_number: number || null });
        store.setSingleton('meta', { licenceSent: key });
      } catch { /* tried again after the next sync */ }
    }
  }
  // MainForAdmin-F (Joe, 22 Oct 2026): the agent's own Contact number from Agent Profile goes to the company, so Admin EAB
  // can send WhatsApp messages. Sent only when it changed; Owner / Admin / Compliance see it in broadcast lists only.
  const ph = phoneForServer(p.phone);
  if (ph !== undefined && `${s.userId}|${ph}` !== st.meta.phoneSent && !(ph === '' && st.meta.phoneSent === undefined)) {
    try {
      await rpc(store, cfg, 'eab_set_my_phone', { p_phone: ph || null });
      store.setSingleton('meta', { phoneSent: `${s.userId}|${ph}` });
    } catch (e) {
      // an older database without the function, or a number it refuses: do not ask again until the number changes
      if (e instanceof TeamError && e.code !== 'network') store.setSingleton('meta', { phoneSent: `${s.userId}|${ph}` });
    }
  }
  const tp = st.settings.termsPending;
  if (tp && tp.user === s.userId) {
    try {
      await rpc(store, cfg, 'eab_accept_terms', { p_version: tp.version, p_marketing: tp.marketing, p_device_id: deviceId() });
      store.setSingleton('settings', { termsPending: undefined });
    } catch { /* tried again later */ }
  }
  const mp = store.getState().settings.marketingPending;
  if (mp && mp.user === s.userId) {
    try {
      await rpc(store, cfg, 'eab_set_marketing', { p_on: mp.on, p_device_id: deviceId() });
      store.setSingleton('settings', { marketingPending: undefined });
    } catch { /* tried again later */ }
  }
}
