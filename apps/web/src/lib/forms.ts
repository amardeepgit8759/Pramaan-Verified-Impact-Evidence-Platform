import type { z } from 'zod';
import { ApiError } from './api';

export type FieldErrors = Record<string, string>;

/** Validate with the same shared schema the API uses; first message per field. */
export function validate<T>(
  schema: z.ZodType<T>,
  values: unknown,
): { data: T; errors: null } | { data: null; errors: FieldErrors } {
  const result = schema.safeParse(values);
  if (result.success) return { data: result.data, errors: null };
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (typeof field === 'string' && !errors[field]) errors[field] = issue.message;
  }
  return { data: null, errors };
}

/** Split a failed request into field errors and a form-level message. */
export function describeError(err: unknown): { fields: FieldErrors; message: string | null } {
  if (err instanceof ApiError) {
    const fields = err.fieldErrors;
    return { fields, message: Object.keys(fields).length > 0 ? null : err.message };
  }
  return { fields: {}, message: 'Something went wrong. Check your connection and try again.' };
}
