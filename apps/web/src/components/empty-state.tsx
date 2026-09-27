import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/** A real empty state: what's missing, why it matters, and what to do next. */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-4 rounded-2xl border border-dashed bg-card/50 px-6 py-14 text-center',
        className,
      )}
    >
      <div className="grid size-12 place-items-center rounded-2xl bg-verified-soft text-verified">
        <Icon className="size-6" aria-hidden />
      </div>
      <div className="max-w-sm space-y-1.5">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="text-sm text-muted-foreground">{children}</p>
      </div>
      {action}
    </div>
  );
}
