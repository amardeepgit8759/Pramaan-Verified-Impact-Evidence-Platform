/** Postgres raised unique_violation (e.g. an email that's already registered). */
export function isUniqueViolation(err: unknown): boolean {
  const cause = err instanceof Error && 'cause' in err ? err.cause : undefined;
  return [err, cause].some(
    (e) => typeof e === 'object' && e !== null && 'code' in e && e.code === '23505',
  );
}
