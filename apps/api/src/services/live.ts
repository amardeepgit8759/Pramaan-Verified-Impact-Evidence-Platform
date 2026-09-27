import type { EventType } from '@pramaan/shared';
import { and, asc, desc, eq, gt } from 'drizzle-orm';
import type { Response } from 'express';
import type { Db } from '../db/client.js';
import { events } from '../db/schema.js';
import type { Logger } from '../logger.js';

type EventRow = typeof events.$inferSelect;

interface Client {
  orgId: string;
  res: Response;
  /** Highest event id this client has been sent; nothing at or below it is sent again. */
  lastSentId: number;
  /** While replaying missed events, live events wait here so order is kept. */
  buffer: EventRow[] | null;
}

export interface LiveHubOptions {
  heartbeatMs?: number;
  /** Safety net for events written outside a request; requests poke the hub directly. */
  pollMs?: number;
  /** Most events replayed to a reconnecting client. */
  replayLimit?: number;
}

/**
 * Server-Sent Events for live dashboards. The `events` table is the source of truth: the hub
 * reads new rows after each request completes (so only committed data is ever sent) and on a
 * slow timer, and fans them out to that organization's open streams. Reconnecting clients
 * send Last-Event-ID and get what they missed.
 */
export class LiveHub {
  private readonly clients = new Set<Client>();
  private lastId = 0;
  private fetching: Promise<void> | null = null;
  private dirty = false;
  private readonly timers: NodeJS.Timeout[] = [];
  private readonly heartbeatMs: number;
  private readonly replayLimit: number;

  constructor(
    private readonly db: Db,
    private readonly logger: Logger,
    options: LiveHubOptions = {},
  ) {
    this.heartbeatMs = options.heartbeatMs ?? 20_000;
    this.replayLimit = options.replayLimit ?? 500;
    this.timers.push(setInterval(() => this.heartbeat(), this.heartbeatMs).unref());
    this.timers.push(setInterval(() => this.poke(), options.pollMs ?? 5_000).unref());
  }

  /** Start from the newest event, so a restart doesn't re-broadcast history. */
  async init() {
    const [latest] = await this.db
      .select({ id: events.id })
      .from(events)
      .orderBy(desc(events.id))
      .limit(1);
    this.lastId = latest?.id ?? 0;
  }

  get connectionCount() {
    return this.clients.size;
  }

  /** Something may have been written: look for new events (coalesced). */
  poke() {
    if (this.clients.size === 0) return;
    if (this.fetching) {
      this.dirty = true;
      return;
    }
    this.fetching = this.fetchNew()
      .catch((err: unknown) => this.logger.warn({ err }, 'Live event fetch failed'))
      .finally(() => {
        this.fetching = null;
        if (this.dirty) {
          this.dirty = false;
          this.poke();
        }
      });
  }

  /** Wait for any in-flight fetch, then fetch once more. For tests and shutdown. */
  async flush() {
    await this.fetching;
    await this.fetchNew();
  }

  private async fetchNew() {
    const rows = await this.db
      .select()
      .from(events)
      .where(gt(events.id, this.lastId))
      .orderBy(asc(events.id))
      .limit(1000);
    for (const row of rows) {
      this.lastId = Math.max(this.lastId, row.id);
      for (const client of this.clients) {
        if (client.orgId !== row.orgId) continue;
        if (client.buffer) client.buffer.push(row);
        else this.send(client, row);
      }
    }
  }

  async subscribe(orgId: string, res: Response, lastEventId: number | null) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Stop proxies (nginx, Render) from buffering the stream.
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 3000\n\n');

    const client: Client = {
      orgId,
      res,
      lastSentId: lastEventId ?? this.lastId,
      buffer: lastEventId === null ? null : [],
    };
    this.clients.add(client);
    res.on('close', () => this.clients.delete(client));

    if (lastEventId !== null) {
      const missed = await this.db
        .select()
        .from(events)
        .where(and(eq(events.orgId, orgId), gt(events.id, lastEventId)))
        .orderBy(asc(events.id))
        .limit(this.replayLimit);
      for (const row of missed) this.send(client, row);
      const buffered = client.buffer ?? [];
      client.buffer = null;
      for (const row of buffered) this.send(client, row);
    }
  }

  private send(client: Client, row: EventRow) {
    // Replay and live delivery can overlap; each event goes out once, in order.
    if (row.id <= client.lastSentId) return;
    client.lastSentId = row.id;
    const data = JSON.stringify({
      id: row.id,
      type: row.type as EventType,
      payload: row.payload,
      createdAt: row.createdAt.toISOString(),
    });
    client.res.write(`id: ${row.id}\nevent: ${row.type}\ndata: ${data}\n\n`);
  }

  private heartbeat() {
    for (const client of this.clients) client.res.write(': heartbeat\n\n');
  }

  close() {
    for (const timer of this.timers) clearInterval(timer);
    for (const client of this.clients) client.res.end();
    this.clients.clear();
  }
}
