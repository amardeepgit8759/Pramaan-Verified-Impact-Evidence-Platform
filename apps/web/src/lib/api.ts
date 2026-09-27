import type { z } from 'zod';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Fetch JSON from the API (same origin, auth via httpOnly cookie) and validate it
 * against the shared zod schema so UI code only ever sees well-formed data.
 * Non-2xx responses whose body still matches the schema (e.g. a degraded health
 * report) are returned when `acceptErrorBody` is set.
 */
export async function apiGet<T>(
  path: string,
  schema: z.ZodType<T>,
  { acceptErrorBody = false, signal }: { acceptErrorBody?: boolean; signal?: AbortSignal } = {},
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
    signal,
  });
  const body: unknown = await res.json().catch(() => null);

  if (!res.ok && !acceptErrorBody) {
    const message =
      body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
        ? body.error
        : `Request failed (${res.status})`;
    throw new ApiError(res.status, message, body);
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw new ApiError(res.status, `Unexpected response from ${path}`, body);
  }
  return parsed.data;
}
