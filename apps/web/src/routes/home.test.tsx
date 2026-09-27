import type { HealthResponse } from '@pramaan/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomePage } from './home';

function renderHome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function respondWith(status: number, body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('HomePage system status', () => {
  it('shows what the API reports', async () => {
    const health: HealthResponse = {
      status: 'ok',
      version: '9.9.9',
      uptimeSeconds: 5,
      database: { connected: true, pgvector: true, latencyMs: 4 },
    };
    respondWith(200, health);
    renderHome();
    expect(await screen.findByText('v9.9.9')).toBeInTheDocument();
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('4 ms')).toBeInTheDocument();
  });

  it('shows a degraded database instead of an error', async () => {
    const health: HealthResponse = {
      status: 'degraded',
      version: '1.0.0',
      uptimeSeconds: 5,
      database: { connected: false, pgvector: false, latencyMs: null },
    };
    respondWith(503, health);
    renderHome();
    expect(await screen.findByText('Unreachable')).toBeInTheDocument();
    expect(screen.queryByText(/DB latency/)).not.toBeInTheDocument();
  });

  it('offers a retry when the API is down', async () => {
    respondWith(502, { error: 'Bad gateway' });
    renderHome();
    expect(await screen.findByText(/Can't reach the API/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });
});
