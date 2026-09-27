import { z } from 'zod';

export const siteInput = z.object({
  name: z.string().trim().min(1, 'Give the site a name').max(160),
  lat: z
    .number({ error: 'Pick a location on the map or enter a latitude' })
    .min(-90, 'Latitude must be between -90 and 90')
    .max(90, 'Latitude must be between -90 and 90'),
  lng: z
    .number({ error: 'Pick a location on the map or enter a longitude' })
    .min(-180, 'Longitude must be between -180 and 180')
    .max(180, 'Longitude must be between -180 and 180'),
  radiusM: z
    .number({ error: 'Enter a radius in metres' })
    .int('Use whole metres')
    .min(10, 'Use at least 10 m')
    .max(100_000, 'Use at most 100 km'),
});
export type SiteInput = z.infer<typeof siteInput>;

export const siteSchema = siteInput.extend({
  id: z.uuid(),
  projectId: z.uuid(),
  createdAt: z.string(),
  assetCount: z.number().int(),
});
export type Site = z.infer<typeof siteSchema>;

export const siteListResponse = z.object({ sites: z.array(siteSchema) });
