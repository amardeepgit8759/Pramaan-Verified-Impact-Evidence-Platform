const dayFormat = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** Format a `YYYY-MM-DD` date (no time zone) for display. */
export function formatIsoDate(iso: string): string {
  return dayFormat.format(new Date(`${iso}T00:00:00Z`));
}

export function formatDateRange(start: string, end: string | null): string {
  return end ? `${formatIsoDate(start)} – ${formatIsoDate(end)}` : `Since ${formatIsoDate(start)}`;
}

/** "Good morning" etc., by the viewer's local time. */
export function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}
