/** Recharts styling shared by every chart: recessive hairline axes, muted tick text. */
export const AXIS_TICK = { fill: 'var(--muted-foreground)', fontSize: 12 } as const;
export const GRID_STROKE = 'var(--border)';

const dayFormat = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

/** "12 Mar" for a YYYY-MM-DD day. */
export const shortDay = (iso: string) => dayFormat.format(new Date(`${iso}T00:00:00Z`));
