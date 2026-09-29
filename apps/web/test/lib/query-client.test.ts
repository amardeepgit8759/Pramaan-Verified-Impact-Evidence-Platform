import type { MutationOptions } from '@tanstack/react-query';
import { toast } from 'sonner';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '@/lib/api';
import { createQueryClient } from '@/lib/query-client';

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

/** Run one mutation through the app's client, as useMutation would. */
function run(options: MutationOptions<unknown, Error, undefined>) {
  const client = createQueryClient();
  return client
    .getMutationCache()
    .build(client, options)
    .execute(undefined)
    .catch(() => undefined);
}

describe('failed actions', () => {
  it('toast when nothing else handles the error', async () => {
    await run({ mutationFn: () => Promise.reject(new Error('Server is down')) });
    expect(toast.error).toHaveBeenCalledWith('Server is down');
  });

  it('stay quiet when the caller shows the error itself', async () => {
    await run({
      mutationFn: () => Promise.reject(new Error('Wrong password')),
      meta: { handlesErrors: true },
    });
    await run({ mutationFn: () => Promise.reject(new Error('x')), onError: () => undefined });
    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe('API client', () => {
  it('explains a network failure in words', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const err = await api.delete('/reports/x').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe(
      'Can’t reach Pramaan. Check your connection and try again.',
    );
  });

  it('lets an aborted request stay aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    const abort = new DOMException('Aborted', 'AbortError');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abort));
    await expect(api.delete('/reports/x', { signal: controller.signal })).rejects.toBe(abort);
  });
});
