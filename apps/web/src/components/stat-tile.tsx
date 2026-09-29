import type { LucideIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

// Plain requestAnimationFrame and the Web Animations API: the dashboard shouldn't need an
// animation library for a count-up and a glow.
const COUNT_MS = 180;
const GLOW_MS = 600;

const prefersReducedMotion = () =>
  typeof window.matchMedia !== 'function' ||
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Counts to a new value in under 200 ms (or jumps, with reduced motion). The span's text is
 * written directly, frame by frame, so React never reconciles the in-between numbers.
 */
function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = shown.current;
    shown.current = value;
    if (from === value || prefersReducedMotion() || typeof requestAnimationFrame !== 'function') {
      el.textContent = format(value);
      return;
    }
    // Time from the first frame's own timestamp: it may use a different clock than
    // performance.now().
    let start: number | null = null;
    let frame = 0;
    const step = (now: number) => {
      start ??= now;
      const t = Math.min(1, (now - start) / COUNT_MS);
      el.textContent = format(from + (value - from) * (1 - (1 - t) ** 3));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      el.textContent = format(value);
    };
  }, [value, format]);
  return <span ref={ref} />;
}

/**
 * A KPI: label, value, optional hint. Values use the UI sans with proportional figures,
 * and the tile glows briefly when a live update changes the number.
 */
export function StatTile({
  label,
  value,
  format = (n) => Math.round(n).toLocaleString(),
  hint,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: number | null;
  format?: (n: number) => string;
  hint?: string;
  icon?: LucideIcon;
  tone?: 'default' | 'verified' | 'review' | 'flagged';
}) {
  const tile = useRef<HTMLDivElement>(null);
  const previous = useRef(value);

  useEffect(() => {
    if (previous.current !== value && previous.current !== null && !prefersReducedMotion()) {
      tile.current?.animate?.(
        [{ boxShadow: '0 0 0 3px var(--ring)' }, { boxShadow: '0 0 0 0px transparent' }],
        { duration: GLOW_MS, easing: 'ease-out' },
      );
    }
    previous.current = value;
  }, [value]);

  return (
    <div
      ref={tile}
      className="flex flex-col rounded-2xl border bg-card p-5 shadow-soft"
      data-tone={tone}
    >
      <dt className="flex items-center gap-2 text-sm text-muted-foreground">
        {Icon && (
          <Icon
            className={cn(
              'size-4',
              tone === 'verified' && 'text-verified',
              tone === 'review' && 'text-review',
              tone === 'flagged' && 'text-flagged',
            )}
            aria-hidden
          />
        )}
        {label}
      </dt>
      <dd className="mt-2 text-3xl font-semibold tracking-tight" aria-live="polite">
        {value === null ? '—' : <AnimatedNumber value={value} format={format} />}
      </dd>
      {hint && <dd className="mt-1 text-xs text-muted-foreground">{hint}</dd>}
    </div>
  );
}
