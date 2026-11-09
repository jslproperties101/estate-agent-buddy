// Google Play Developer API sign-in, shared by billing (the agent's purchases) and billing-webhook (Google's notices).
// The fetch function and clock are passed in, so the tests run it under Node with a stand-in Google.
import { googleServiceJwt } from './billing.ts';

export interface PlayCfg { packageName: string; email: string; privateKey: string }
export type PlayApi = { access: string; base: string };

/** The Play Developer API settings from the function secrets (PLAY_PACKAGE_NAME, PLAY_SERVICE_ACCOUNT_*). */
export const playCfg = (env: (k: string) => string): PlayCfg => ({
  packageName: env('PLAY_PACKAGE_NAME'), email: env('PLAY_SERVICE_ACCOUNT_EMAIL'), privateKey: env('PLAY_SERVICE_ACCOUNT_PRIVATE_KEY').replace(/\\n/g, '\n'),
});

/** An access token and this app's API address, or why not ('not-configured' or 'google-auth' with Google's status). */
export async function playApi(fetchFn: typeof fetch, nowMs: number, c: PlayCfg): Promise<PlayApi | { error: 'not-configured' | 'google-auth'; status?: number }> {
  if (!c.packageName || !c.email || !c.privateKey) return { error: 'not-configured' };
  const jwt = await googleServiceJwt(c.email, c.privateKey, 'https://www.googleapis.com/auth/androidpublisher', Math.floor(nowMs / 1000));
  const tr = await fetchFn('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }).toString() });
  if (!tr.ok) return { error: 'google-auth', status: tr.status };
  const access = (await tr.json().catch(() => null))?.access_token;
  if (typeof access !== 'string' || !access) return { error: 'google-auth', status: tr.status };
  return { access, base: `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${encodeURIComponent(c.packageName)}` };
}

/**
 * Is this one-time purchase in Google's list of voided (refunded or charged-back) purchases of the last 30 days? Google keeps
 * that list for 30 days; it is read page by page (at most 20 pages of 1,000).
 */
export async function isVoided(fetchFn: typeof fetch, g: PlayApi, token: string, nowMs: number): Promise<boolean | 'error'> {
  let page = '';
  for (let i = 0; i < 20; i++) {
    const q = new URLSearchParams({ startTime: String(nowMs - 30 * 86_400_000), maxResults: '1000' });
    if (page) q.set('token', page);
    const r = await fetchFn(`${g.base}/purchases/voidedpurchases?${q}`, { headers: { authorization: `Bearer ${g.access}` } });
    if (!r.ok) return 'error';
    const j = await r.json().catch(() => null);
    const list: { purchaseToken?: string }[] = Array.isArray(j?.voidedPurchases) ? j.voidedPurchases : [];
    if (list.some(v => v.purchaseToken === token)) return true;
    page = typeof j?.tokenPagination?.nextPageToken === 'string' ? j.tokenPagination.nextPageToken : '';
    if (!page) return false;
  }
  return false;
}
