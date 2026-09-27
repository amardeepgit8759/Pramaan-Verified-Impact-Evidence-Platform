import { SDG_INFO } from '@pramaan/shared';
import { cn } from '@/lib/utils';

/**
 * An SDG in its official colour. The colour is decorative; the goal number and name are
 * always available as text (visibly, or to screen readers and as a tooltip when compact).
 */
export function SdgChip({
  goal,
  compact = false,
  className,
}: {
  goal: number;
  compact?: boolean;
  className?: string;
}) {
  const info = SDG_INFO[goal];
  if (!info) return null;
  const full = `SDG ${goal}: ${info.name}`;
  return (
    <span
      title={full}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full text-xs font-medium',
        !compact && 'border bg-card py-0.5 pr-2.5 pl-0.5',
        className,
      )}
    >
      <span
        aria-hidden
        className="grid size-6 place-items-center rounded-full text-[11px] font-semibold text-white tabular"
        style={{ backgroundColor: info.color }}
      >
        {goal}
      </span>
      {compact ? <span className="sr-only">{full}</span> : <span>{info.name}</span>}
    </span>
  );
}
