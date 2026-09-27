import { TRUST_BANDS, type BandCounts } from '@pramaan/shared';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { BAND_META } from '@/lib/bands';
import { TableView, TooltipBox } from './chart-parts';

const BAND_FILL = {
  verified: 'var(--verified-solid)',
  review: 'var(--review-solid)',
  flagged: 'var(--flagged-solid)',
} as const;

const pct = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

/**
 * Part-to-whole across the three trust bands. Status colours always come with the band's
 * icon and name in the legend (never colour alone), plus a table view.
 */
export function BandDonut({ bands }: { bands: BandCounts }) {
  const total = bands.verified + bands.review + bands.flagged;
  const data = TRUST_BANDS.map((band) => ({ band, value: bands[band] })).filter((d) => d.value > 0);

  return (
    <div>
      <div className="flex flex-col items-center gap-6 sm:flex-row">
        <div
          className="relative size-44 shrink-0"
          role="img"
          aria-label={TRUST_BANDS.map(
            (b) => `${bands[b]} ${BAND_META[b].label.toLowerCase()}`,
          ).join(', ')}
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="band"
                innerRadius="72%"
                outerRadius="100%"
                startAngle={90}
                endAngle={-270}
                // The 2px gap between segments is the card surface showing through.
                stroke="var(--card)"
                strokeWidth={2}
                isAnimationActive={false}
              >
                {data.map((d) => (
                  <Cell key={d.band} fill={BAND_FILL[d.band]} />
                ))}
              </Pie>
              <Tooltip
                content={({ active, payload }) => {
                  const d = payload?.[0]?.payload as
                    { band: keyof typeof BAND_FILL; value: number } | undefined;
                  return active && d ? (
                    <TooltipBox
                      title={BAND_META[d.band].label}
                      rows={[
                        {
                          key: d.band,
                          label: `${pct(d.value, total)}% of evidence`,
                          value: d.value.toLocaleString(),
                          color: BAND_FILL[d.band],
                        },
                      ]}
                    />
                  ) : null;
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
            <div>
              <p className="text-2xl font-semibold">{total.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">files</p>
            </div>
          </div>
        </div>
        <ul className="w-full space-y-2.5">
          {TRUST_BANDS.map((band) => {
            const { label, icon: Icon, text } = BAND_META[band];
            return (
              <li key={band} className="flex items-center gap-2.5 text-sm">
                <span
                  aria-hidden
                  className="size-3 shrink-0 rounded-[3px]"
                  style={{ background: BAND_FILL[band] }}
                />
                <Icon className={`size-4 shrink-0 ${text}`} aria-hidden />
                <span className="flex-1 whitespace-nowrap">{label}</span>
                <span className="font-semibold tabular">{bands[band].toLocaleString()}</span>
                <span className="w-10 text-right text-muted-foreground tabular">
                  {pct(bands[band], total)}%
                </span>
              </li>
            );
          })}
        </ul>
      </div>
      <TableView
        caption="Evidence by trust band"
        columns={['Band', 'Files', 'Share']}
        rows={TRUST_BANDS.map((b) => [BAND_META[b].label, bands[b], `${pct(bands[b], total)}%`])}
      />
    </div>
  );
}
