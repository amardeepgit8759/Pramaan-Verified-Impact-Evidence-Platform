import { thumbnailAspect, TRUST_BANDS, type Asset } from '@pramaan/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Film, FilterX, Images, SearchX } from 'lucide-react';
import { useId } from 'react';
import { useSearchParams } from 'react-router';
import { BandBadge } from '@/components/band-badge';
import { EmptyState } from '@/components/empty-state';
import { FormError } from '@/components/field';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { useSession } from '@/lib/auth';
import { BAND_META } from '@/lib/bands';
import { assetsQuery, sitesQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { useProject } from './project-layout';
import { Uploader } from './uploader';

const FILTER_KEYS = ['siteId', 'band', 'tag', 'from', 'to'] as const;
const ALL = 'all';

export function ProjectEvidence() {
  const { project, openAsset } = useProject();
  const { data: session } = useSession();
  const canUpload = session?.user.role === 'admin' || session?.user.role === 'field';
  const [params, setParams] = useSearchParams();
  const filters = Object.fromEntries(
    FILTER_KEYS.flatMap((k) => (params.get(k) ? [[k, params.get(k)!]] : [])),
  );
  const filtered = Object.keys(filters).length > 0;

  const { data: sites = [] } = useQuery(sitesQuery(project.id));
  const {
    data: assets,
    isPending,
    isFetching,
    error,
  } = useQuery({ ...assetsQuery(project.id, filters), placeholderData: keepPreviousData });

  const setFilter = (key: (typeof FILTER_KEYS)[number], value: string | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value && value !== ALL) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  return (
    <div className="space-y-6">
      {canUpload && <Uploader projectId={project.id} sites={sites} />}

      <Filters
        sites={sites}
        params={params}
        onChange={setFilter}
        onClear={() => setParams({}, { replace: true })}
      />

      {isPending ? (
        <div className="columns-2 gap-3 sm:columns-3 lg:columns-4" aria-busy="true">
          <span className="sr-only">Loading evidence…</span>
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton
              key={i}
              className="mb-3 break-inside-avoid rounded-2xl"
              style={{ aspectRatio: i % 3 === 0 ? '3 / 4' : i % 3 === 1 ? '4 / 3' : '1' }}
            />
          ))}
        </div>
      ) : error ? (
        <FormError message={`Couldn’t load evidence: ${error.message}`} />
      ) : assets.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={SearchX}
            title="Nothing matches these filters"
            action={
              <Button variant="outline" onClick={() => setParams({}, { replace: true })}>
                <FilterX /> Clear filters
              </Button>
            }
          >
            Try a wider date range, another site or band, or a different tag.
          </EmptyState>
        ) : (
          !canUpload && (
            <EmptyState icon={Images} title="No evidence yet">
              Field staff haven’t uploaded anything to this project yet.
            </EmptyState>
          )
        )
      ) : (
        <section
          aria-label="Evidence"
          className={cn('space-y-3 transition-opacity duration-150', isFetching && 'opacity-60')}
        >
          <h2 className="text-sm font-medium text-muted-foreground">
            {assets.length} {assets.length === 1 ? 'file' : 'files'}
            {filtered && ' match'}
          </h2>
          <ul className="columns-2 gap-3 sm:columns-3 lg:columns-4">
            {assets.map((a) => (
              <li key={a.id} className="mb-3 break-inside-avoid">
                <EvidenceCard asset={a} onOpen={() => openAsset(a.id)} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Filters({
  sites,
  params,
  onChange,
  onClear,
}: {
  sites: { id: string; name: string }[];
  params: URLSearchParams;
  onChange: (key: (typeof FILTER_KEYS)[number], value: string | null) => void;
  onClear: () => void;
}) {
  const ids = { site: useId(), band: useId(), tag: useId(), from: useId(), to: useId() };
  const active = FILTER_KEYS.some((k) => params.get(k));
  return (
    <div className="flex flex-wrap items-end gap-3" role="group" aria-label="Filter evidence">
      <div className="grid gap-1.5">
        <Label htmlFor={ids.from} className="text-xs text-muted-foreground">
          Captured from
        </Label>
        <Input
          id={ids.from}
          type="date"
          className="h-9 w-40"
          value={params.get('from') ?? ''}
          onChange={(e) => onChange('from', e.target.value || null)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={ids.to} className="text-xs text-muted-foreground">
          to
        </Label>
        <Input
          id={ids.to}
          type="date"
          className="h-9 w-40"
          value={params.get('to') ?? ''}
          onChange={(e) => onChange('to', e.target.value || null)}
        />
      </div>
      <div className="grid gap-1.5">
        <Label id={ids.site} className="text-xs text-muted-foreground">
          Site
        </Label>
        <Select value={params.get('siteId') ?? ALL} onValueChange={(v) => onChange('siteId', v)}>
          <SelectTrigger aria-labelledby={ids.site} className="h-9 w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All sites</SelectItem>
            {sites.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label id={ids.band} className="text-xs text-muted-foreground">
          Trust band
        </Label>
        <Select value={params.get('band') ?? ALL} onValueChange={(v) => onChange('band', v)}>
          <SelectTrigger aria-labelledby={ids.band} className="h-9 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All bands</SelectItem>
            {TRUST_BANDS.map((b) => (
              <SelectItem key={b} value={b}>
                {BAND_META[b].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={ids.tag} className="text-xs text-muted-foreground">
          Tag
        </Label>
        <Input
          id={ids.tag}
          className="h-9 w-40"
          placeholder="e.g. water pump"
          defaultValue={params.get('tag') ?? ''}
          onKeyDown={(e) =>
            e.key === 'Enter' && onChange('tag', e.currentTarget.value.trim() || null)
          }
          onBlur={(e) => onChange('tag', e.currentTarget.value.trim() || null)}
        />
      </div>
      {active && (
        <Button variant="ghost" size="sm" onClick={onClear} className="mb-0.5">
          <FilterX /> Clear
        </Button>
      )}
    </div>
  );
}

function EvidenceCard({ asset, onOpen }: { asset: Asset; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group block w-full overflow-hidden rounded-2xl border bg-card text-left shadow-soft transition-shadow duration-150 hover:shadow-lift"
      aria-label={`${altText(asset)}. ${BAND_META[asset.trustBand].label}, score ${asset.trustScore}. Open details`}
    >
      <div
        className="relative bg-muted"
        style={{ aspectRatio: String(thumbnailAspect(asset.width, asset.height)) }}
      >
        <img
          src={asset.thumbnailUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
        />
        {asset.resourceType === 'video' && (
          <span className="absolute top-2 left-2 rounded-full bg-ink/70 p-1.5 text-white">
            <Film className="size-3.5" aria-hidden />
          </span>
        )}
        <BandBadge band={asset.trustBand} className="absolute right-2 bottom-2 shadow-soft" />
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 text-xs">
        <span className="truncate text-muted-foreground">{asset.siteName ?? 'No site'}</span>
        <span className="font-semibold tabular">{asset.trustScore}</span>
      </div>
    </button>
  );
}
