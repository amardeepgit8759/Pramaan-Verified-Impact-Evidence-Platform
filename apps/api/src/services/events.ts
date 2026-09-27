import type { EventType } from '@pramaan/shared';
import type { Db } from '../db/client.js';
import { events } from '../db/schema.js';

type Writer = Pick<Db, 'insert'>;

/**
 * Append to the organization's activity log. The log feeds the activity feed and lets SSE
 * clients replay what they missed.
 */
export async function recordEvents(
  db: Writer,
  orgId: string,
  items: { type: EventType; payload: Record<string, unknown> }[],
) {
  if (items.length === 0) return [];
  return db
    .insert(events)
    .values(items.map((item) => ({ orgId, type: item.type, payload: item.payload })))
    .returning();
}

export function recordEvent(
  db: Writer,
  orgId: string,
  type: EventType,
  payload: Record<string, unknown>,
) {
  return recordEvents(db, orgId, [{ type, payload }]);
}
