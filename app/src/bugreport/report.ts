// Easy Bug Report: builds the report and sends it to the private "eab_bug_reports" table and the private "bug-reports"
// storage bucket in Supabase (supabase/migrations/20261013120000_bug_reports.sql). Nothing is sent unless the person
// presses Send, and only to the person's own Supabase project. The report holds the description, the screenshot (if
// one was added), the app version, the platform, the language and the name of the screen it was opened from. It never
// holds passwords, keys, tokens or the person's records; the account is identified by the database from the sign-in,
// not by anything the app writes into the report.
import { configured, fresh, supabaseCall, supabaseHeaders, SyncError, Session, SyncConfig } from '../data/sync';

export const MAX_DESCRIPTION = 1000;
/** A screenshot is shrunk to at most this many pixels on its longest side and saved as JPEG before it is sent. */
export const MAX_SIDE = 1280;
export const MAX_SHOT_BYTES = 3 * 1024 * 1024;
export const BUCKET = 'bug-reports';
export const TABLE = 'eab_bug_reports';

export type BugFailure = 'empty' | 'notConfigured' | 'notSignedIn' | 'network' | 'rejected' | 'server' | 'tooBig' | 'badImage';
export type BugResult = { ok: true } | { ok: false; reason: BugFailure };

export interface BugReportInput {
  description: string;
  screenshot?: Blob;
  /** Name of the screen the person came from (for example "settings"). */
  screen: string;
  language: string;
  appVersion: string;
  platform: string;
}

/** The row stored in the table. user_id is filled in by the database from the sign-in. */
export interface BugReportRow {
  id: string;
  description: string;
  screenshot_path: string | null;
  app_version: string;
  platform: string;
  language: string;
  screen: string;
}

export const cleanDescription = (s: string) => s.replace(/\r\n/g, '\n').trim().slice(0, MAX_DESCRIPTION);

export function buildRow(i: BugReportInput, id: string, screenshotPath: string | null): BugReportRow {
  return {
    id, description: cleanDescription(i.description), screenshot_path: screenshotPath,
    app_version: i.appVersion.slice(0, 40), platform: i.platform.slice(0, 20), language: i.language.slice(0, 10), screen: i.screen.slice(0, 40),
  };
}

const uuid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.floor(Math.random() * 16); return (c === 'x' ? r : (r & 3) | 8).toString(16); }));

function reasonOf(e: unknown): BugFailure {
  if (e instanceof SyncError) return e.code === 'network' ? 'network' : e.code === 'auth' || e.code === 'no-access' ? 'rejected' : 'server';
  return 'server';
}

/** Sends one report. Resolves with ok: true only after the database has accepted the row (and the screenshot, if any). */
export async function sendBugReport(input: BugReportInput, cfg: SyncConfig, session: Session | undefined, fetchFn: typeof fetch = fetch): Promise<BugResult> {
  if (!cleanDescription(input.description)) return { ok: false, reason: 'empty' };
  if (input.screenshot && input.screenshot.size > MAX_SHOT_BYTES) return { ok: false, reason: 'tooBig' };
  if (!configured(cfg)) return { ok: false, reason: 'notConfigured' };
  if (!session) return { ok: false, reason: 'notSignedIn' };
  try {
    const s = await fresh(cfg, session, fetchFn);
    const id = uuid();
    let path: string | null = null;
    if (input.screenshot) {
      path = `${s.userId}/${id}.jpg`;
      await supabaseCall(fetchFn, `${cfg.supabaseUrl}/storage/v1/object/${BUCKET}/${path}`, {
        method: 'POST', body: input.screenshot,
        headers: { apikey: cfg.supabaseAnonKey, authorization: `Bearer ${s.accessToken}`, 'content-type': input.screenshot.type || 'image/jpeg' },
      });
    }
    await supabaseCall(fetchFn, `${cfg.supabaseUrl}/rest/v1/${TABLE}`, {
      method: 'POST', body: JSON.stringify(buildRow(input, id, path)), headers: { ...supabaseHeaders(cfg, s.accessToken), prefer: 'return=minimal' },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: reasonOf(e) };
  }
}

/** Shrinks a chosen image to a JPEG of at most MAX_SIDE pixels. Rejects with 'badImage' when it is not an image. */
export async function prepareScreenshot(file: File): Promise<Blob> {
  if (!/^image\/(png|jpe?g|webp)$/i.test(file.type)) throw new Error('badImage');
  const bmp = await createImageBitmap(file).catch(() => { throw new Error('badImage'); });
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bmp.width * k)); canvas.height = Math.max(1, Math.round(bmp.height * k));
  const g = canvas.getContext('2d');
  if (!g) throw new Error('badImage');
  g.fillStyle = '#fff'; g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 0.8));
  if (!blob) throw new Error('badImage');
  return blob;
}
