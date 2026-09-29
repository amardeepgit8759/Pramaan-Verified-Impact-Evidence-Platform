import { LogoMark } from '@/components/logo';

/** Shown for the moment the first page's code is loading. Plain markup, no data. */
export function StartupSkeleton() {
  return (
    <div className="grid min-h-dvh place-items-center" aria-busy="true">
      <span className="sr-only">Loading Pramaan…</span>
      <LogoMark className="size-10 animate-pulse" />
    </div>
  );
}
