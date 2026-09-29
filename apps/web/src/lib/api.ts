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

  /** Field-level messages from a zod validation error, keyed by the top-level field. */
  get fieldErrors(): Record<string, string> {
    const details =
      this.body && typeof this.body === 'object' && 'details' in this.body
        ? this.body.details
        : null;
    if (!Array.isArray(details)) return {};
    const errors: Record<string, string> = {};
    for (const issue of details as { path?: unknown[]; message?: string }[]) {
      const field = issue.path?.[0];
      if (typeof field === 'string' && issue.message && !errors[field]) {
        errors[field] = issue.message;
      }
    }
    return errors;
  }
}

interface RequestOptions {
  signal?: AbortSignal;
  /** Return the parsed body even for non-2xx responses (e.g. a degraded health report). */
  acceptErrorBody?: boolean;
}

/**
 * Call the API (same origin, auth via httpOnly cookie) and validate the response with a
 * shared zod schema, so UI code only ever sees well-formed data.
 */
async function request<T>(
  method: string,
  path: string,
  schema: z.ZodType<T> | null,
  body: unknown,
  { signal, acceptErrorBody = false }: RequestOptions = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (signal?.aborted) throw err;
    // Offline, DNS, or the server is restarting: say so in words.
    throw new ApiError(0, 'Can’t reach Pramaan. Check your connection and try again.', null);
  }
  const data: unknown = res.status === 204 ? null : await res.json().catch(() => null);

  if (!res.ok && !acceptErrorBody) {
    const message =
      data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
        ? data.error
        : `Request failed (${res.status})`;
    throw new ApiError(res.status, message, data);
  }
  if (schema === null) return undefined as T;
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw new ApiError(res.status, `Unexpected response from ${path}`, data);
  return parsed.data;
}

export const api = {
  get: <T>(path: string, schema: z.ZodType<T>, options?: RequestOptions) =>
    request('GET', path, schema, undefined, options),
  post: <T>(path: string, body: unknown, schema: z.ZodType<T> | null, options?: RequestOptions) =>
    request('POST', path, schema, body, options),
  put: <T>(path: string, body: unknown, schema: z.ZodType<T> | null, options?: RequestOptions) =>
    request('PUT', path, schema, body, options),
  delete: (path: string, options?: RequestOptions) =>
    request('DELETE', path, null, undefined, options),
};
