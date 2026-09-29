import type { ReportClaim, ReportDetail, ReportEvidence } from '@pramaan/shared';
import { FileSpreadsheet, FileText, Info } from 'lucide-react';
import { useState } from 'react';
import { BandBadge } from '@/components/band-badge';
import { SdgChip } from '@/components/sdg-chip';
import { Button } from '@/components/ui/button';
import { altText } from '@/lib/assets';
import { formatIsoDate, relativeTime } from '@/lib/format';
import { EvidenceSheet, type EvidenceItem } from './evidence-sheet';

interface Selection {
  title: string;
  description: string;
  items: EvidenceItem[];
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * A finished report as a document. Every statement is a button: selecting it opens the
 * photos it cites, with their Trust Scores and checks. Used in the app and on the public
 * share page.
 */
export function ReportDocument({
  report,
  downloads,
  onOpenAsset,
  asPageTitle = false,
}: {
  report: ReportDetail;
  downloads: { pdf: string; csv: string };
  onOpenAsset?: (id: string) => void;
  /** On its own page the title is the h1; inside the project page it's an h2. */
  asPageTitle?: boolean;
}) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [open, setOpen] = useState(false);
  const byId = new Map(report.evidence.map((e) => [e.asset.id, e]));
  const Title = asPageTitle ? 'h1' : 'h2';
  const Heading = asPageTitle ? 'h2' : 'h3';

  const show = (next: Selection) => {
    setSelection(next);
    setOpen(true);
  };
  const showClaim = (claim: ReportClaim) => {
    const items = claim.assetIds.flatMap((id) => byId.get(id) ?? []);
    show({
      title: `“${claim.sentence}”`,
      description: `Statement ${claim.position + 1} cites ${plural(items.length, 'evidence file')}.`,
      items,
    });
  };
  const showEvidence = (e: ReportEvidence) =>
    show({
      title: `Evidence ${e.ref}`,
      description: `Cited in statement${e.citedIn.length === 1 ? '' : 's'} ${e.citedIn
        .map((p) => p + 1)
        .join(', ')}.`,
      items: [e],
    });

  return (
    <article className="mx-auto max-w-3xl space-y-10">
      <header className="space-y-5 border-b pb-8">
        <p className="text-sm font-semibold tracking-wider text-verified uppercase">
          Impact report
        </p>
        <Title className="font-display text-4xl leading-tight tracking-tight sm:text-5xl">
          {report.projectName}
        </Title>
        <p className="text-muted-foreground">
          {formatIsoDate(report.periodStart)} – {formatIsoDate(report.periodEnd)} ·{' '}
          {report.organisationName}
        </p>
        {(report.sdgGoals.length > 0 || report.csrCategory) && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Aligned to">
            {report.sdgGoals.map((g) => (
              <li key={g}>
                <SdgChip goal={g} />
              </li>
            ))}
            {report.csrCategory && (
              <li className="rounded-full border bg-card px-2.5 py-0.5 text-xs font-medium">
                CSR · {report.csrCategory}
              </li>
            )}
          </ul>
        )}
        <dl className="grid grid-cols-3 gap-3 text-sm">
          <Stat label="cited statements" value={report.claimCount} />
          <Stat label="evidence files" value={report.citedAssetCount} />
          <Stat label="uncited statements removed" value={report.droppedClaims} />
        </dl>
        <p className="flex items-start gap-2 rounded-2xl border bg-card px-4 py-3 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0 text-verified" aria-hidden />
          <span>
            Every statement cites photos or videos that passed verification or were approved by an
            admin. Select a statement to see its evidence. Aligned to the SDG and CSR categories
            shown; this report doesn’t assert legal or regulatory compliance.
          </span>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild>
            <a href={downloads.pdf} download>
              <FileText /> Download PDF
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href={downloads.csv} download>
              <FileSpreadsheet /> Evidence annex (CSV)
            </a>
          </Button>
          <span className="text-xs text-muted-foreground">
            Generated {relativeTime(report.createdAt)}
            {report.generatedBy ? ` by ${report.generatedBy}` : ''}
          </span>
        </div>
      </header>

      {report.summary && (
        <section aria-labelledby="report-summary" className="space-y-3">
          <Heading id="report-summary" className="font-display text-2xl">
            Summary
          </Heading>
          <p className="text-lg leading-relaxed">{report.summary}</p>
        </section>
      )}

      {report.sections.map((section, i) => (
        <section key={`${section.heading}-${i}`} className="space-y-3">
          <Heading className="font-display text-2xl">{section.heading}</Heading>
          <ol className="space-y-1">
            {section.claims.map((claim) => (
              <li key={claim.id}>
                <button
                  type="button"
                  aria-haspopup="dialog"
                  onClick={() => showClaim(claim)}
                  className="group flex w-full gap-3 rounded-xl px-3 py-2 text-left leading-relaxed transition-colors duration-150 hover:bg-accent"
                >
                  <span className="w-6 shrink-0 text-muted-foreground tabular-nums">
                    {claim.position + 1}.
                  </span>
                  <span>
                    {claim.sentence}{' '}
                    {claim.assetIds.map((id) => (
                      <span
                        key={id}
                        className="mr-1 inline-block rounded-md bg-verified-soft px-1.5 text-xs font-semibold text-verified"
                      >
                        {byId.get(id)?.ref ?? '?'}
                      </span>
                    ))}
                    <span className="sr-only">. Show the cited evidence.</span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      ))}

      {report.droppedClaims > 0 && (
        <p className="text-sm text-muted-foreground">
          {plural(report.droppedClaims, 'statement')} the AI drafted{' '}
          {report.droppedClaims === 1 ? 'was' : 'were'} removed because{' '}
          {report.droppedClaims === 1 ? 'it' : 'they'} didn’t cite verified evidence.
        </p>
      )}

      <section aria-labelledby="report-annex" className="space-y-3">
        <Heading id="report-annex" className="font-display text-2xl">
          Evidence annex
        </Heading>
        <ul className="grid gap-2 sm:grid-cols-2">
          {report.evidence.map((e) => (
            <li key={e.ref}>
              <button
                type="button"
                aria-haspopup="dialog"
                onClick={() => showEvidence(e)}
                className="flex w-full items-center gap-3 rounded-2xl border bg-card p-2.5 text-left transition-shadow duration-150 hover:shadow-lift"
              >
                <img
                  src={e.asset.thumbnailUrl}
                  alt=""
                  loading="lazy"
                  className="size-14 shrink-0 rounded-xl bg-muted object-cover"
                />
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-verified">{e.ref}</span>
                    <BandBadge band={e.asset.trustBand} />
                    <span className="text-xs text-muted-foreground">{e.asset.trustScore}</span>
                  </span>
                  <span className="block truncate text-sm">{altText(e.asset)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {selection && (
        <EvidenceSheet
          open={open}
          onOpenChange={setOpen}
          title={selection.title}
          description={selection.description}
          items={selection.items}
          onOpenAsset={
            onOpenAsset &&
            ((id) => {
              setOpen(false);
              onOpenAsset(id);
            })
          }
        />
      )}
    </article>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col-reverse rounded-2xl border bg-card px-4 py-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-display text-3xl">{value}</dd>
    </div>
  );
}
