// WebSocket client (BRIEF §6.4): reconnects, resyncs on a seq gap, and tracks the server clock offset.
import type { ClientMsg, ServerMsg } from '@tandem/server';

export type Status = 'connecting' | 'open' | 'closed';

export interface NetHandlers {
  onMessage(m: ServerMsg): void;
  onStatus(s: Status): void;
}

const BACKOFF = [250, 500, 1000, 2000, 4000, 8000];

export class Net {
  private ws: WebSocket | null = null;
  private tries = 0;
  private closed = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pinger: ReturnType<typeof setInterval> | null = null;
  private queue: ClientMsg[] = [];
  private joinMsg: ClientMsg | null = null;
  /** serverTs - clientTs, median of recent samples; clocks render against this. */
  offset = 0;
  private offsets: number[] = [];
  lastSeq = 0;
  private lastResyncAt = 0;

  constructor(private url: string, private h: NetHandlers) {}

  connect(): void {
    if (this.closed) return;
    this.h.onStatus('connecting');
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.tries = 0;
      this.lastSeq = 0;          // sequence numbers are per-connection on the server's side
      this.h.onStatus('open');
      if (this.joinMsg) ws.send(JSON.stringify(this.joinMsg));
      for (const m of this.queue.splice(0)) ws.send(JSON.stringify(m));
      this.ping();
      this.pinger = setInterval(() => this.ping(), 5_000);
    };
    ws.onmessage = (ev) => {
      let m: ServerMsg;
      try { m = JSON.parse(String(ev.data)) as ServerMsg; } catch { return; }
      if (m.type === 'pong') {
        // An unsolicited pong is the server probing latency; echo it straight back.
        if (m.t === m.serverTs) { this.send({ type: 'ping', t: m.t }); return; }
        const rtt = Date.now() - m.t;
        this.offsets.push(m.serverTs + rtt / 2 - Date.now());
        if (this.offsets.length > 5) this.offsets.shift();
        const s = [...this.offsets].sort((a, b) => a - b);
        this.offset = s[Math.floor(s.length / 2)]!;
        return;
      }
      if ('seq' in m && typeof m.seq === 'number') {
        // A gap means we missed a broadcast, so ask for the whole state rather than drift.
        // Throttled: one request a second, so a persistent gap can never become a flood.
        if (this.lastSeq && m.seq > this.lastSeq + 1 && Date.now() - this.lastResyncAt > 1000) {
          this.lastResyncAt = Date.now();
          this.send({ type: 'resync' });
        }
        this.lastSeq = Math.max(this.lastSeq, m.seq);
      }
      this.h.onMessage(m);
    };
    const bye = () => {
      if (this.pinger) { clearInterval(this.pinger); this.pinger = null; }
      if (this.ws !== ws) return;
      this.ws = null;
      this.h.onStatus('closed');
      if (this.closed) return;
      const wait = BACKOFF[Math.min(this.tries++, BACKOFF.length - 1)]!;
      this.timer = setTimeout(() => this.connect(), wait);
    };
    ws.onclose = bye;
    ws.onerror = () => { try { ws.close(); } catch { /* already gone */ } };
  }

  private ping() { this.send({ type: 'ping', t: Date.now() }); }

  /** The join message is replayed on every reconnect so the seat is reclaimed automatically. */
  setJoin(m: ClientMsg): void { this.joinMsg = m; }

  send(m: ClientMsg): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
    else if (m.type !== 'ping') this.queue.push(m);
  }

  /** Server time now, as best this client knows it. */
  now(): number { return Date.now() + this.offset; }

  close(): void {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.pinger) clearInterval(this.pinger);
    try { this.ws?.close(); } catch { /* already gone */ }
    this.ws = null;
  }
}
