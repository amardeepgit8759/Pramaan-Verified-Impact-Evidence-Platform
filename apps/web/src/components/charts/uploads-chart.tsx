import type { Metrics } from '@pramaan/shared';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { TableView, TooltipBox } from './chart-parts';
import { AXIS_TICK, GRID_STROKE, shortDay } from './chart-utils';

/** Uploads per day, one series: the title names it, so no legend box. */
export function UploadsChart({ data }: { data: Metrics['uploadsPerDay'] }) {
  const total = data.reduce((sum, d) => sum + d.count, 0);
  return (
    <div>
      <div
        className="h-56"
        role="img"
        aria-label={`Uploads per day over the last ${data.length} days: ${total} in total`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeWidth={1} />
            <XAxis
              dataKey="date"
              tickFormatter={shortDay}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={{ stroke: GRID_STROKE }}
              minTickGap={28}
              interval="preserveStartEnd"
            />
            <YAxis
              allowDecimals={false}
              tick={AXIS_TICK}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <Tooltip
              cursor={{ stroke: 'var(--muted-foreground)', strokeWidth: 1 }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TooltipBox
                    title={shortDay(String(label))}
                    rows={[
                      {
                        key: 'count',
                        label: 'uploads',
                        value: String(payload[0]?.value ?? 0),
                        color: 'var(--chart-series)',
                      },
                    ]}
                  />
                ) : null
              }
            />
            <Area
              type="linear"
              dataKey="count"
              stroke="var(--chart-series)"
              strokeWidth={2}
              strokeLinecap="round"
              fill="var(--chart-series)"
              fillOpacity={0.1}
              activeDot={{
                r: 4,
                stroke: 'var(--card)',
                strokeWidth: 2,
                fill: 'var(--chart-series)',
              }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <TableView
        caption="Uploads per day"
        columns={['Day', 'Uploads']}
        rows={data.map((d) => [shortDay(d.date), d.count])}
      />
    </div>
  );
}
