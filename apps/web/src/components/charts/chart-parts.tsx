import { Table2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** A card that holds one chart, with a title that names what's plotted. */
export function ChartCard({
  title,
  description,
  children,
  className,
  dimmed = false,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  /** Hold the previous render, faded, while fresh data loads. */
  dimmed?: boolean;
}) {
  return (
    <section className={cn('rounded-2xl border bg-card p-5 shadow-soft', className)}>
      <header>
        <h2 className="font-semibold tracking-tight">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </header>
      <div className={cn('mt-4 transition-opacity duration-150', dimmed && 'opacity-60')}>
        {children}
      </div>
    </section>
  );
}

/** Every chart's values, as a table: the accessible twin of the picture. */
export function TableView({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: (string | number)[][];
}) {
  return (
    <details className="group mt-3 text-sm">
      <summary className="inline-flex cursor-pointer items-center gap-1.5 rounded-md text-muted-foreground hover:text-foreground">
        <Table2 className="size-3.5" aria-hidden />
        <span className="group-open:hidden">Show as table</span>
        <span className="hidden group-open:inline">Hide table</span>
      </summary>
      <div className="mt-2 max-h-64 overflow-auto rounded-xl border">
        <table className="w-full text-left">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
            <tr>
              {columns.map((c) => (
                <th key={c} scope="col" className="px-3 py-2 font-medium">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y tabular">
            {rows.map((row) => (
              <tr key={String(row[0])}>
                {row.map((cell, i) => (
                  <td key={i} className="px-3 py-1.5">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Tooltip: the value leads, the label follows; a short line key for the series. */
export function TooltipBox({
  title,
  rows,
}: {
  title: string;
  rows: { key: string; label: string; value: string; color: string }[];
}) {
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-xs shadow-lift">
      <p className="mb-1 text-muted-foreground">{title}</p>
      {rows.map((r) => (
        <p key={r.key} className="flex items-center gap-2">
          <span aria-hidden className="h-0.5 w-3 rounded-full" style={{ background: r.color }} />
          <span className="text-sm font-semibold text-foreground tabular">{r.value}</span>
          <span className="text-muted-foreground">{r.label}</span>
        </p>
      ))}
    </div>
  );
}
