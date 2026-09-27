import { DEFAULT_ORG_SETTINGS, orgSettingsSchema, type OrgSettings } from '@pramaan/shared';
import { eq } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { settings } from '../db/schema.js';

type SettingsRow = typeof settings.$inferSelect;

export function toOrgSettings(row: SettingsRow): OrgSettings {
  return orgSettingsSchema.parse({
    weights: row.weights,
    phashThreshold: row.phashThreshold,
    lateUploadDays: row.lateUploadDays,
    gapDays: row.gapDays,
    bandVerifiedMin: row.bandVerifiedMin,
    bandReviewMin: row.bandReviewMin,
    duplicateBurstDays: row.duplicateBurstDays,
    farLocationMultiplier: row.farLocationMultiplier,
  });
}

/** Seed an organization's settings from the shared defaults. */
export async function createDefaultSettings(db: Pick<Db, 'insert'>, orgId: string) {
  await db.insert(settings).values({ orgId, ...DEFAULT_ORG_SETTINGS });
}

export async function getOrgSettings(db: Db, orgId: string): Promise<OrgSettings> {
  const [row] = await db.select().from(settings).where(eq(settings.orgId, orgId));
  if (!row) throw new Error(`Organization ${orgId} has no settings row`);
  return toOrgSettings(row);
}
