import { cn } from '@/lib/utils';

/** Placeholder shape shown while data loads. Full pages use these, never spinners. */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn('animate-pulse rounded-xl bg-muted', className)}
      {...props}
    />
  );
}

export { Skeleton };
