import type { AddressInfo } from 'node:net';
import http from 'node:http';
import type { Express } from 'express';

export interface SseMessage {
  id: string | null;
  event: string | null;
  data: string;
  comment: boolean;
}

/** Serve the app on a random port so tests can hold a real streaming connection open. */
export async function listen(app: Express) {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** Open an SSE stream and collect messages as they arrive. */
export async function openStream(url: string, headers: Record<string, string>) {
  const controller = new AbortController();
  const res = await fetch(url, { headers, signal: controller.signal });
  const messages: SseMessage[] = [];
  const waiters: (() => void)[] = [];

  if (res.ok && res.body) {
    void (async () => {
      const decoder = new TextDecoder();
      let buffer = '';
      try {
        for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
          buffer += decoder.decode(chunk, { stream: true });
          let end: number;
          while ((end = buffer.indexOf('\n\n')) !== -1) {
            const block = buffer.slice(0, end);
            buffer = buffer.slice(end + 2);
            const msg: SseMessage = { id: null, event: null, data: '', comment: false };
            for (const line of block.split('\n')) {
              if (line.startsWith(':')) msg.comment = true;
              else if (line.startsWith('id: ')) msg.id = line.slice(4);
              else if (line.startsWith('event: ')) msg.event = line.slice(7);
              else if (line.startsWith('data: ')) msg.data += line.slice(6);
            }
            messages.push(msg);
            waiters.splice(0).forEach((w) => w());
          }
        }
      } catch {
        // Aborted by close().
      }
    })();
  }

  /** Resolve with the first message matching `match`, waiting up to `timeoutMs`. */
  async function next(match: (m: SseMessage) => boolean, timeoutMs = 3000) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = messages.find(match);
      if (found) return found;
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error('Timed out waiting for an SSE message');
      await new Promise<void>((resolve) => {
        waiters.push(resolve);
        setTimeout(resolve, remaining);
      });
    }
  }

  return { status: res.status, messages, next, close: () => controller.abort() };
}
