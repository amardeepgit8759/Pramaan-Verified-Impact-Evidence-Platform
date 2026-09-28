import type { TrustBand } from '@pramaan/shared';
import { BAND_META } from '@/lib/bands';
import { cn } from '@/lib/utils';

const BAND_STROKE: Record<TrustBand, string> = {
  verified: 'var(--verified-solid)',
  review: 'var(--review-solid)',
  flagged: 'var(--flagged-solid)',
};

/** Open ring (270°) so the start and end read clearly; score fills clockwise from bottom-left. */
const SWEEP = 270;
const R = 44;
const C = 2 * Math.PI * R;
const ARC = (C * SWEEP) / 360;

/**
 * Radial Trust Score: the arc fills to the score in the band's colour, with small marks at
 * the band cut-offs. The number, band icon and band name are always shown as text.
 */
export function TrustGauge({
  score,
  band,
  cutoffs,
  className,
}: {
  score: number;
  band: TrustBand;
  cutoffs?: { verified: number; review: number };
  className?: string;
}) {
  const { label, icon: Icon, text } = BAND_META[band];
  const filled = (ARC * Math.max(0, Math.min(100, score))) / 100;
  const tick = (value: number) => {
    // Angle along the arc, starting at 135° (bottom-left), going clockwise.
    const angle = ((135 + (SWEEP * value) / 100) * Math.PI) / 180;
    const [x1, y1] = [50 + (R - 7) * Math.cos(angle), 50 + (R - 7) * Math.sin(angle)];
    const [x2, y2] = [50 + (R + 7) * Math.cos(angle), 50 + (R + 7) * Math.sin(angle)];
    return (
      <line
        key={value}
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="var(--background)"
        strokeWidth={2}
      />
    );
  };

  return (
    <div
      className={cn('relative size-36', className)}
      role="img"
      aria-label={`Trust Score ${score} of 100: ${label}`}
    >
      <svg viewBox="0 0 100 100" className="size-full">
        <circle
          cx={50}
          cy={50}
          r={R}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={`${ARC} ${C}`}
          transform="rotate(135 50 50)"
        />
        <circle
          cx={50}
          cy={50}
          r={R}
          fill="none"
          stroke={BAND_STROKE[band]}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${C}`}
          transform="rotate(135 50 50)"
          className="transition-[stroke-dasharray] duration-200"
        />
        {cutoffs && [cutoffs.review, cutoffs.verified].map(tick)}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-semibold tracking-tight">{score}</span>
        <span className={cn('mt-0.5 inline-flex items-center gap-1 text-xs font-medium', text)}>
          <Icon className="size-3.5" aria-hidden /> {label}
        </span>
      </div>
    </div>
  );
}
