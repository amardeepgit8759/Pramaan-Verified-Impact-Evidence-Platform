import { TRUST_BANDS, type BandCounts } from '@pramaan/shared';
import { BAND_META } from '@/lib/bands';
import { cn } from '@/lib/utils';

/** Stacked bar of how an evidence set splits across bands, with a text equivalent. */
export function TrustBar({ bands, className }: { bands: BandCounts; className?: string }) {
  const total = bands.verified + bands.review + bands.flagged;
  const summary = TRUST_BANDS.map((b) => `${bands[b]} ${BAND_META[b].label.toLowerCase()}`).join(
    ', ',
  );

  return (
    <div className={cn('space-y-2', className)}>
      <div
        role="img"
        aria-label={total === 0 ? 'No evidence yet' : summary}
        className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full bg-muted"
      >
        {total > 0 &&
          TRUST_BANDS.map(
            (b) =>
              bands[b] > 0 && (
                <div
                  key={b}
                  className={cn('h-full transition-[flex-grow] duration-200', BAND_META[b].solid)}
                  style={{ flexGrow: bands[b] }}
                />
              ),
          )}
      </div>
      {total === 0 ? (
        <p className="text-xs text-muted-foreground">No evidence uploaded yet</p>
      ) : (
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {TRUST_BANDS.map((b) => {
            const Icon = BAND_META[b].icon;
            return (
              <li key={b} className="inline-flex items-center gap-1 tabular">
                <Icon className={cn('size-3.5', BAND_META[b].text)} aria-hidden />
                {bands[b]} {BAND_META[b].label.toLowerCase()}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
