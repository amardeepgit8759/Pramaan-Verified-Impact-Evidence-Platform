import {
  animate,
  motion,
  useAnimate,
  useMotionValue,
  useReducedMotion,
  useTransform,
} from 'framer-motion';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/** Counts to a new value in under 200 ms (or jumps, with reduced motion). */
function AnimatedNumber({ value, format }: { value: number; format: (n: number) => string }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => format(v));
  useEffect(() => {
    if (reduce) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, { duration: 0.18, ease: 'easeOut' });
    return () => controls.stop();
  }, [mv, value, reduce]);
  return <motion.span>{text}</motion.span>;
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
  const [scope, animateTile] = useAnimate<HTMLDivElement>();
  const reduce = useReducedMotion();
  const previous = useRef(value);

  useEffect(() => {
    if (previous.current !== value && previous.current !== null && !reduce) {
      void animateTile(
        scope.current,
        { boxShadow: ['0 0 0 3px var(--ring)', '0 0 0 0px transparent'] },
        { duration: 0.6, ease: 'easeOut' },
      );
    }
    previous.current = value;
  }, [value, reduce, animateTile, scope]);

  return (
    <div
      ref={scope}
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
