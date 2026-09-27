import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  CalendarClock,
  Camera,
  Copy,
  FileText,
  Hourglass,
  MapPinOff,
  ScanSearch,
  ShieldCheck,
  TagsIcon,
} from 'lucide-react';
import { Link } from 'react-router';
import { Logo } from '@/components/logo';
import { ThemeToggle } from '@/components/theme-toggle';
import { Button } from '@/components/ui/button';
import { useSession } from '@/lib/auth';
import { publicStatsQuery } from '@/lib/queries';

const fadeUp = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.18, ease: 'easeOut' },
} as const;

export function LandingPage() {
  return (
    <div className="min-h-dvh overflow-x-clip">
      <LandingHeader />
      <main>
        <Hero />
        <HowItWorks />
        <Checks />
        <ClosingCta />
      </main>
      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:justify-between sm:px-6">
          <p>Pramaan · प्रमाण · “proof”</p>
          <p>
            Reports are aligned to SDG and CSR categories. Pramaan does not certify legal
            compliance.
          </p>
        </div>
      </footer>
    </div>
  );
}

function LandingHeader() {
  const { data: session } = useSession();
  return (
    <header className="sticky top-0 z-40 border-b border-transparent bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav className="flex items-center gap-1 sm:gap-2" aria-label="Main">
          <a
            href="#how-it-works"
            className="hidden rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground sm:block"
          >
            How it works
          </a>
          <ThemeToggle />
          {session ? (
            <Button asChild size="sm">
              <Link to="/app">
                Open app <ArrowRight />
              </Link>
            </Button>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link to="/signin">Sign in</Link>
              </Button>
              <Button asChild size="sm" className="hidden sm:inline-flex">
                <Link to="/signup">Get started</Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative isolate">
      {/* Quiet backdrop: a fading grid and a soft emerald glow. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)] bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:48px_48px]"
      />
      <div
        aria-hidden
        className="absolute top-[-10rem] left-1/2 -z-10 h-[28rem] w-[48rem] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl dark:bg-primary/10"
      />
      <div className="mx-auto max-w-6xl px-4 pt-16 pb-20 sm:px-6 sm:pt-24 lg:pt-32">
        <motion.p
          {...fadeUp}
          className="inline-flex items-center gap-2 rounded-full border bg-card/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow-soft backdrop-blur"
        >
          <ShieldCheck className="size-3.5 text-verified" aria-hidden />
          Verified impact evidence for NGOs, CSR teams and funders
        </motion.p>
        <motion.h1
          {...fadeUp}
          transition={{ ...fadeUp.transition, delay: 0.04 }}
          className="mt-6 font-display text-6xl leading-[0.95] tracking-tight sm:text-7xl lg:text-8xl"
        >
          Proof, not <em className="text-primary">promises.</em>
        </motion.h1>
        <motion.p
          {...fadeUp}
          transition={{ ...fadeUp.transition, delay: 0.08 }}
          className="mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl"
        >
          Field teams upload photos and videos. Pramaan checks every one for copies, wrong locations
          and wrong dates, scores it transparently, and writes SDG-aligned reports where every
          sentence links back to the photo that proves it.
        </motion.p>
        <motion.div
          {...fadeUp}
          transition={{ ...fadeUp.transition, delay: 0.12 }}
          className="mt-10 flex flex-col gap-3 sm:flex-row"
        >
          <Button asChild size="lg">
            <Link to="/signup">
              Start verifying evidence <ArrowRight />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <a href="#how-it-works">See how it works</a>
          </Button>
        </motion.div>
        <StatsStrip />
      </div>
    </section>
  );
}

/** Real platform-wide totals. Hidden until there is something worth showing. */
function StatsStrip() {
  const { data } = useQuery(publicStatsQuery);
  if (!data || data.totalAssets === 0) return null;

  const stats = [
    { value: data.verifiedAssets, label: 'photos and videos verified' },
    { value: data.projects, label: data.projects === 1 ? 'project' : 'projects' },
    { value: data.sites, label: data.sites === 1 ? 'field site' : 'field sites' },
    { value: data.reports, label: data.reports === 1 ? 'evidence report' : 'evidence reports' },
  ];
  return (
    <motion.dl
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18 }}
      className="mt-16 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-border shadow-soft sm:grid-cols-4"
    >
      {stats.map((s) => (
        <div key={s.label} className="flex flex-col-reverse bg-card px-5 py-5">
          <dt className="mt-1 text-sm text-muted-foreground">{s.label}</dt>
          <dd className="font-display text-4xl tabular">{s.value.toLocaleString()}</dd>
        </div>
      ))}
    </motion.dl>
  );
}

const STEPS = [
  {
    icon: Camera,
    title: 'Capture',
    body: 'Field staff upload straight from their phone camera. Files go directly to secure cloud storage, organised by project, site and date.',
  },
  {
    icon: ShieldCheck,
    title: 'Verify',
    body: 'Every file gets a Trust Score with the reasons shown: copies, near-copies, wrong place, wrong date, missing metadata and late uploads.',
  },
  {
    icon: FileText,
    title: 'Report',
    body: 'Generate SDG- and CSR-aligned reports from verified evidence only. Click any sentence to see the photos behind it.',
  },
];

function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-20 border-t bg-card/40">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-24">
        <h2 className="font-display text-4xl tracking-tight sm:text-5xl">
          From the field to the funder, in three steps.
        </h2>
        <ol className="mt-12 grid gap-4 md:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, body }, i) => (
            <li key={title} className="rounded-2xl border bg-card p-6 shadow-soft">
              <div className="flex items-center justify-between">
                <span className="grid size-11 place-items-center rounded-xl bg-verified-soft text-verified">
                  <Icon className="size-5" aria-hidden />
                </span>
                <span className="font-display text-3xl text-muted-foreground/60 tabular">
                  0{i + 1}
                </span>
              </div>
              <h3 className="mt-6 text-lg font-semibold tracking-tight">{title}</h3>
              <p className="mt-2 text-muted-foreground">{body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

const CHECKS = [
  { icon: Copy, title: 'Exact copies', body: 'The same file reused in another project.' },
  {
    icon: ScanSearch,
    title: 'Near-copies',
    body: 'Cropped, resized or re-saved versions of an existing photo.',
  },
  {
    icon: MapPinOff,
    title: 'Wrong location',
    body: 'GPS that falls outside the site it claims to show.',
  },
  {
    icon: CalendarClock,
    title: 'Wrong date',
    body: 'Captured before the project started or after it ended.',
  },
  {
    icon: TagsIcon,
    title: 'Missing metadata',
    body: 'No GPS or capture date. Marked unverified, never “fake”.',
  },
  { icon: Hourglass, title: 'Late uploads', body: 'Uploaded long after it was taken.' },
];

function Checks() {
  return (
    <section className="border-t">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-[1fr_1.4fr]">
        <div>
          <h2 className="font-display text-4xl tracking-tight sm:text-5xl">
            Six checks. Every reason shown.
          </h2>
          <p className="mt-4 text-muted-foreground">
            No black box. Each asset starts at 100 and loses points only for checks it fails, with a
            plain-language reason for each. Your organisation sets the weights.
          </p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2">
          {CHECKS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex gap-4 rounded-2xl border bg-card p-5 shadow-soft">
              <Icon className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
              <div>
                <h3 className="font-medium">{title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function ClosingCta() {
  return (
    <section className="px-4 pb-20 sm:px-6">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-3xl bg-ink px-6 py-16 text-center text-white shadow-lift sm:px-12 dark:border">
        <div
          aria-hidden
          className="absolute -bottom-24 left-1/2 h-64 w-[36rem] -translate-x-1/2 rounded-full bg-emerald-400/20 blur-3xl"
        />
        <p className="relative mx-auto max-w-3xl font-display text-3xl leading-tight sm:text-5xl">
          We don’t just organise evidence. We prove it’s genuine, and every claim links back to a
          photo.
        </p>
        <Button asChild size="lg" className="relative mt-10">
          <Link to="/signup">
            Create your organisation <ArrowRight />
          </Link>
        </Button>
      </div>
    </section>
  );
}
