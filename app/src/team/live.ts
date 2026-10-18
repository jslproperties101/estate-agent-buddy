// Change 24: the invitation pop-up appears at once while the app is open.
// One Supabase Realtime connection (a WebSocket) while the app is ON SCREEN. When an invitation for me, or one I sent,
// is created, cancelled or answered, Supabase sends a short message; the app then asks the cloud as before
// (checkInvitations). The message content is never trusted or shown. Who is told is decided by the database's
// row-level security on the invitations table (supabase/proposed/20261018200000_change024_live_invites.sql).
// The connection closes when the app goes to the background (battery); phone notifications then come from Change 25.
// Protocol: https://supabase.com/docs/guides/realtime/protocol (v1.0.0 JSON messages, heartbeat every 25 s).

export interface LiveOptions {
  url: string;                                   // the Supabase project URL (https://...)
  anonKey: string;
  /** A current sign-in token (refreshed when needed). */
  token: () => Promise<string>;
  /** Something about my invitations changed. */
  onChange: () => void;
  /** The connection is ready (true) or lost (false). */
  onState?: (live: boolean) => void;
  /** For tests. */
  makeSocket?: (url: string) => WebSocketLike;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
}
export interface WebSocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
}

export const HEARTBEAT_MS = 25_000;
/** Waits before connecting again after a loss: 2 s, 5 s, 15 s, 30 s, then every 60 s. */
export const RETRY_MS = [2_000, 5_000, 15_000, 30_000, 60_000];
export const TOPIC = 'realtime:eab-team-invites';

export const socketUrl = (url: string, anonKey: string) =>
  `${url.replace(/\/+$/, '').replace(/^http/, 'ws')}/realtime/v1/websocket?apikey=${encodeURIComponent(anonKey)}&vsn=1.0.0`;

export function joinMessage(accessToken: string, ref: string) {
  return {
    topic: TOPIC, event: 'phx_join', ref, join_ref: ref,
    payload: {
      config: { broadcast: { ack: false, self: false }, presence: { key: '' }, private: false,
        postgres_changes: [{ event: '*', schema: 'public', table: 'eab_team_invites' }] },
      access_token: accessToken,
    },
  };
}

export class LiveInvites {
  private ws?: WebSocketLike;
  private n = 0;
  private joinRef = '';
  private beat?: unknown;
  private retry?: unknown;
  private tries = 0;
  private stopped = true;
  private ready = false;
  private lastToken = '';
  constructor(private o: LiveOptions) {}

  private set = (fn: () => void, ms: number) => (this.o.setTimer ?? ((f, m) => setTimeout(f, m)))(fn, ms);
  private clr = (t: unknown) => { if (t !== undefined) (this.o.clearTimer ?? (x => clearTimeout(x as ReturnType<typeof setTimeout>)))(t); };
  private ref = () => String(++this.n);
  private send(m: unknown) { try { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m)); } catch { /* lost: onclose reconnects */ } }
  private state(v: boolean) { if (this.ready !== v) { this.ready = v; try { this.o.onState?.(v); } catch { /* display only */ } } }

  get connected() { return this.ready; }

  start() { if (!this.stopped) return; this.stopped = false; this.tries = 0; void this.open(); }

  stop() {
    this.stopped = true;
    this.clr(this.retry); this.retry = undefined;
    this.clr(this.beat); this.beat = undefined;
    const ws = this.ws; this.ws = undefined;
    if (ws) { ws.onclose = null; ws.onmessage = null; ws.onerror = null; try { ws.close(); } catch { /* already closed */ } }
    this.state(false);
  }

  private async open() {
    if (this.stopped) return;
    let token: string;
    try { token = await this.o.token(); } catch { this.again(); return; }
    if (this.stopped) return;
    let ws: WebSocketLike;
    try { ws = (this.o.makeSocket ?? (u => new WebSocket(u) as unknown as WebSocketLike))(socketUrl(this.o.url, this.o.anonKey)); } catch { this.again(); return; }
    this.ws = ws; this.lastToken = token;
    ws.onopen = () => {
      this.joinRef = this.ref();
      this.send(joinMessage(token, this.joinRef));
      this.beat = this.set(() => this.heartbeat(), HEARTBEAT_MS);
    };
    ws.onmessage = ev => this.message(ev.data);
    ws.onerror = () => { /* onclose follows */ };
    ws.onclose = () => { if (this.ws === ws) { this.ws = undefined; this.clr(this.beat); this.beat = undefined; this.state(false); this.again(); } };
  }

  private async heartbeat() {
    if (this.stopped || !this.ws) return;
    this.send({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: this.ref(), join_ref: null });
    // a renewed sign-in token is handed to the open channel (no reconnect needed)
    try {
      const t = await this.o.token();
      if (t && t !== this.lastToken && this.ready) { this.lastToken = t; this.send({ topic: TOPIC, event: 'access_token', payload: { access_token: t }, ref: this.ref(), join_ref: this.joinRef }); }
    } catch { /* tried again at the next heartbeat */ }
    if (!this.stopped && this.ws) this.beat = this.set(() => void this.heartbeat(), HEARTBEAT_MS);
  }

  private message(raw: unknown) {
    let m: { topic?: string; event?: string; ref?: string | null; payload?: { status?: string; response?: unknown; extension?: string } };
    try { m = JSON.parse(String(raw)); } catch { return; }
    if (m.topic !== TOPIC) return;
    if (m.event === 'phx_reply' && m.ref === this.joinRef) {
      if (m.payload?.status === 'ok') {
        this.tries = 0; this.state(true);
        this.change();                                   // anything that happened while not connected is fetched now
      } else this.drop();
      return;
    }
    if (m.event === 'postgres_changes') { this.change(); return; }
    if (m.event === 'phx_close' || m.event === 'phx_error' || (m.event === 'system' && m.payload?.status === 'error' && m.payload?.extension !== 'postgres_changes')) this.drop();
  }

  private change() { try { this.o.onChange(); } catch { /* the watcher handles its own errors */ } }

  /** The channel was refused or closed: close the socket and connect again later (with a fresh token). */
  private drop() { const ws = this.ws; if (ws) { try { ws.close(); } catch { /* closed */ } } }

  private again() {
    if (this.stopped || this.retry !== undefined) return;
    const ms = RETRY_MS[Math.min(this.tries++, RETRY_MS.length - 1)];
    this.retry = this.set(() => { this.retry = undefined; void this.open(); }, ms);
  }
}
