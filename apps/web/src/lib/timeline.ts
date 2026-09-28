import type { Asset } from '@pramaan/shared';

const monthFormat = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** When the evidence was taken; upload time when the file has no capture date. */
const when = (a: Asset) => a.capturedAt ?? a.uploadedAt;

interface MonthGroup {
  key: string;
  label: string;
  sites: { name: string; assets: Asset[] }[];
}

export function groupByMonthAndSite(assets: Asset[]): MonthGroup[] {
  const sorted = [...assets].sort((a, b) => when(b).localeCompare(when(a)));
  const months = new Map<string, Map<string, Asset[]>>();
  for (const a of sorted) {
    const key = when(a).slice(0, 7);
    const site = a.siteName ?? 'No site';
    const bySite = months.get(key) ?? new Map<string, Asset[]>();
    bySite.set(site, [...(bySite.get(site) ?? []), a]);
    months.set(key, bySite);
  }
  return [...months].map(([key, bySite]) => ({
    key,
    label: monthFormat.format(new Date(`${key}-01T00:00:00Z`)),
    sites: [...bySite].map(([name, list]) => ({ name, assets: list })),
  }));
}
