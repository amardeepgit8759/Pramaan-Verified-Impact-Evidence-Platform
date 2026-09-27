import { Link } from 'react-router';
import { cn } from '@/lib/utils';

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn('size-8', className)}>
      <rect width="32" height="32" rx="9" className="fill-foreground dark:fill-secondary" />
      <path
        d="M16 6.5l8 3v6.2c0 4.9-3.3 8.6-8 9.8-4.7-1.2-8-4.9-8-9.8V9.5l8-3z"
        fill="none"
        className="stroke-primary dark:stroke-verified-solid"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="M12.4 16.2l2.6 2.6 4.8-5.2"
        fill="none"
        className="stroke-primary dark:stroke-verified-solid"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Logo({ to = '/', className }: { to?: string; className?: string }) {
  return (
    <Link
      to={to}
      className={cn('inline-flex items-center gap-2.5 rounded-xl text-lg font-semibold', className)}
    >
      <LogoMark />
      <span className="tracking-tight">Pramaan</span>
    </Link>
  );
}
