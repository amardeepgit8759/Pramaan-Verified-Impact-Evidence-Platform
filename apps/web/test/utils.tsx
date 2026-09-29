import type { SessionResponse } from '@pramaan/shared';
import { QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { createQueryClient } from '@/lib/query-client';
import { ThemeProvider } from '@/lib/theme';
import { routes } from '@/router';

type Reply = [status: number, body?: unknown];

/**
 * Stub `fetch` with canned replies keyed by "METHOD /api/path". Unknown requests fail
 * loudly so tests can't silently depend on the network.
 */
export function mockApi(replies: Record<string, Reply | ((body: unknown) => Reply)>) {
  const calls: { key: string; body: unknown }[] = [];
  const fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    const key = `${init?.method ?? 'GET'} ${input.split('?')[0]}`;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ key, body });
    const reply = replies[key];
    if (!reply) {
      // Logged as well as thrown: the API client turns fetch failures into a friendly message.
      console.error(`Unexpected request: ${key}`);
      throw new Error(`Unexpected request: ${key}`);
    }
    const [status, data] = typeof reply === 'function' ? reply(body) : reply;
    return new Response(status === 204 ? null : JSON.stringify(data ?? null), { status });
  });
  vi.stubGlobal('fetch', fetchMock);
  return { calls };
}

/** Render the real route tree at a URL. */
export function renderRoute(path: string) {
  const queryClient = createQueryClient({ queries: { retry: false } });
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </ThemeProvider>,
  );
  return { router, queryClient };
}

export const adminSession: SessionResponse = {
  user: {
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Asha Rao',
    email: 'asha@example.org',
    role: 'admin',
  },
  org: { id: '22222222-2222-4222-8222-222222222222', name: 'Jal Seva Trust' },
};

export const viewerSession: SessionResponse = {
  ...adminSession,
  user: { ...adminSession.user, name: 'Vik Viewer', role: 'viewer' },
};
