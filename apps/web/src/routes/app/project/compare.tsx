import type { Asset } from '@pramaan/shared';
import { useQuery } from '@tanstack/react-query';
import { Check, Copy, Download, Images, MapPin, Wand2 } from 'lucide-react';
import { useId, useState } from 'react';
import { Link } from 'react-router';
import { BandBadge } from '@/components/band-badge';
import { CompareSlider } from '@/components/compare-slider';
import { EmptyState } from '@/components/empty-state';
import { FormError } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { altText } from '@/lib/assets';
import { BAND_META } from '@/lib/bands';
import { formatIsoDate } from '@/lib/format';
import { compareQuery, sitesQuery } from '@/lib/queries';
import { useProject } from './project-layout';

const when = (a: Asset) => (a.capturedAt ?? a.uploadedAt).slice(0, 10);

export function ProjectCompare() {
  const { project } = useProject();
  const sites = useQuery(sitesQuery(project.id));
  const [siteId, setSiteId] = useState<string | null>(null);
  const [picks, setPicks] = useState<{ before?: string; after?: string }>({});
  const ids = { site: useId(), before: useId(), after: useId() };

  const activeSite =
    siteId ?? sites.data?.find((s) => s.assetCount >= 2)?.id ?? sites.data?.[0]?.id ?? null;
  const compare = useQuery({
    ...compareQuery(activeSite ?? '', picks),
    enabled: Boolean(activeSite),
  });

  if (sites.isPending) return <Skeleton className="aspect-[4/3] max-w-3xl rounded-2xl" />;
  if (sites.error) return <FormError message={`Couldn’t load sites: ${sites.error.message}`} />;
  if (sites.data.length === 0) {
    return (
      <EmptyState
        icon={MapPin}
        title="Add a site to compare"
        action={
          <Button asChild variant="outline">
            <Link to="../sites">Add a site</Link>
          </Button>
        }
      >
        Before/after pairs come from the same site, so the project needs at least one.
      </EmptyState>
    );
  }

  const data = compare.data;
  const choose = (which: 'before' | 'after', id: string) =>
    setPicks((p) => ({
      before: which === 'before' ? id : (p.before ?? data?.before?.id),
      after: which === 'after' ? id : (p.after ?? data?.after?.id),
    }));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-4">
        {compare.isPending ? (
          <Skeleton className="aspect-[4/3] rounded-2xl" />
        ) : compare.error ? (
          <FormError message={`Couldn’t load the comparison: ${compare.error.message}`} />
        ) : data && data.before && data.after ? (
          <>
            <CompareSlider
              before={{
                src: data.before.previewUrl,
                alt: altText(data.before),
                label: `Before · ${formatIsoDate(when(data.before))}`,
              }}
              after={{
                src: data.after.previewUrl,
                alt: altText(data.after),
                label: `After · ${formatIsoDate(when(data.after))}`,
              }}
            />
            {data.suggested && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Wand2 className="size-4" aria-hidden /> Suggested: the earliest and latest verified
                photos at this site.
              </p>
            )}
            {data.compositeUrl && <CompositeActions url={data.compositeUrl} />}
          </>
        ) : (
          <EmptyState icon={Images} title="Pick two photos to compare">
            {data && data.candidates.length < 2
              ? 'This site needs at least two photos for a before/after.'
              : 'There aren’t two verified photos to suggest yet. Choose a before and an after on the right.'}
          </EmptyState>
        )}
      </div>

      <aside className="space-y-5 rounded-2xl border bg-card p-5 shadow-soft">
        <div className="grid gap-2">
          <Label id={ids.site}>Site</Label>
          <Select
            value={activeSite ?? undefined}
            onValueChange={(v) => {
              setSiteId(v);
              setPicks({});
            }}
          >
            <SelectTrigger aria-labelledby={ids.site}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sites.data.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name} · {s.assetCount} {s.assetCount === 1 ? 'file' : 'files'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {data && data.candidates.length >= 2 && (
          <>
            <PhotoPicker
              labelId={ids.before}
              label="Before"
              value={data.before?.id}
              candidates={data.candidates}
              onChange={(id) => choose('before', id)}
            />
            <PhotoPicker
              labelId={ids.after}
              label="After"
              value={data.after?.id}
              candidates={data.candidates}
              onChange={(id) => choose('after', id)}
            />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setPicks({})}
              disabled={data.suggested}
            >
              <Wand2 /> Suggest a pair
            </Button>
          </>
        )}
      </aside>
    </div>
  );
}

function PhotoPicker({
  labelId,
  label,
  value,
  candidates,
  onChange,
}: {
  labelId: string;
  label: string;
  value: string | undefined;
  candidates: Asset[];
  onChange: (id: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <Label id={labelId}>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger aria-labelledby={labelId}>
          <SelectValue placeholder="Choose a photo" />
        </SelectTrigger>
        <SelectContent>
          {candidates.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {formatIsoDate(when(c))} · {BAND_META[c.trustBand].label} · {c.trustScore}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value && (
        <div className="flex items-center gap-2">
          <img
            src={candidates.find((c) => c.id === value)?.thumbnailUrl}
            alt=""
            className="size-10 rounded-lg bg-muted object-cover"
          />
          <BandBadge band={candidates.find((c) => c.id === value)!.trustBand} />
        </div>
      )}
    </div>
  );
}

/** The CDN-built side-by-side: download it, or copy its link to embed in a report. */
function CompositeActions({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-wrap gap-2">
      <Button asChild variant="outline">
        <a href={url} target="_blank" rel="noreferrer" download>
          <Download /> Side-by-side image
        </a>
      </Button>
      <Button
        variant="ghost"
        onClick={async () => {
          await navigator.clipboard.writeText(url).catch(() => undefined);
          setCopied(true);
        }}
      >
        {copied ? <Check /> : <Copy />} {copied ? 'Link copied' : 'Copy image link'}
      </Button>
    </div>
  );
}
