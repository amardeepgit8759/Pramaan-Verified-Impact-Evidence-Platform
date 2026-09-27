import { CalendarClock, Copy, MapPinOff } from 'lucide-react';
import { Logo, LogoMark } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';

const POINTS = [
  { icon: Copy, text: 'Catches reused and near-identical photos across projects' },
  { icon: MapPinOff, text: 'Checks GPS against the site it claims to show' },
  { icon: CalendarClock, text: 'Flags photos taken outside the project’s dates' },
];

/** Split layout: brand panel on large screens, a single focused column on phones. */
export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-ink p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="absolute -top-32 -left-32 size-[32rem] rounded-full bg-emerald-400/15 blur-3xl"
        />
        <div className="relative flex items-center gap-2.5 text-lg font-semibold">
          <LogoMark className="[&_rect]:fill-white/10" />
          Pramaan
        </div>
        <div className="relative max-w-md">
          <p className="font-display text-5xl leading-[1.05]">Every claim links back to a photo.</p>
          <ul className="mt-10 space-y-4 text-white/75">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex gap-3">
                <Icon className="mt-0.5 size-5 shrink-0 text-emerald-300" aria-hidden />
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-white/55">
          Reports are aligned to SDG and CSR categories.
        </p>
      </aside>

      <main className="flex flex-col px-4 py-6 sm:px-8">
        <div className="flex items-center justify-between">
          <Logo className="lg:invisible" />
          <ThemeToggle />
        </div>
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <h1 className="font-display text-4xl tracking-tight">{title}</h1>
          <p className="mt-2 text-muted-foreground">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </main>
    </div>
  );
}
