/** Only follow `?next=` to an in-app path, never to another site. */
export function safeNext(next: string | null, fallback = '/app'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return fallback;
  }
  return next;
}
