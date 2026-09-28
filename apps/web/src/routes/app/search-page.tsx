import { thumbnailAspect, TRUST_BANDS, type SearchResult } from '@pramaan/shared';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Info, Search, SearchX } from 'lucide-react';
import { useId, useState } from 'react';
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
import { BAND_META } from '@/lib/bands';
import { projectsQuery, searchQueryOptions, searchSuggestionsQuery } from '@/lib/queries';
import { cn } from '@/lib/utils';
import { AssetDrawer } from './project/asset-drawer';

const PARAM_KEYS = ['q', 'projectId', 'band', 'from', 'to'] as const;
const ALL = 'all';

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const search = Object.fromEntries(
    PARAM_KEYS.flatMap((k) => (params.get(k) ? [[k, params.get(k)!]] : [])),
  );
  const q = params.get('q') ?? '';
  const [draft, setDraft] = useState(q);
  const results = useQuery({ ...searchQueryOptions(search), placeholderData: keepPreviousData });
  const { data: suggestions } = useQuery(searchSuggestionsQuery);
  const { data: projects } = useQuery(projectsQuery);
  const openAssetId = params.get('asset');
  const inputId = useId();

  const update = (changes: Record<string, string | null>, replace = false) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(changes)) {
          if (v && v !== ALL) next.set(k, v);
          else next.delete(k);
        }
        return next;
      },
      { replace },
    );

  function submit(e: React.FormEvent) {
    e.preventDefault();
    update({ q: draft.trim() || null });
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-4xl tracking-tight sm:text-5xl">Search evidence</h1>
        <p className="mt-1 text-muted-foreground">
          Describe what you’re looking for in your own words. Search understands meaning, not just
          exact tags.
        </p>
      </header>

      <form onSubmit={submit} role="search" className="space-y-3">
        <Label htmlFor={inputId} className="sr-only">
          Search evidence
        </Label>
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id={inputId}
            type="search"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. women collecting water from a new hand pump"
            className="h-14 rounded-2xl pr-28 pl-12 text-base md:text-base"
            autoFocus
          />
          <Button type="submit" className="absolute top-1/2 right-2 -translate-y-1/2">
            Search
          </Button>
        </div>
        {suggestions && suggestions.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Try:</span>
            {suggestions.slice(0, 8).map(({ tag }) => (
              <button
                key={tag}
                type="button"
                onClick={() => {
                  setDraft(tag);
                  update({ q: tag });
                }}
                className="rounded-full border bg-card px-3 py-1 transition-colors duration-150 hover:bg-accent"
              >
                {tag}
              </button>
            ))}
          </div>
        )}
      </form>

      <Filters
        params={params}
        projects={projects ?? []}
        onChange={(k, v) => update({ [k]: v }, true)}
      />

      {!q ? (
        <EmptyState icon={Search} title="Search across every project">
          Try what a funder would ask: “new classroom furniture”, “borewell being dug” or “women’s
          self-help group meeting”.
        </EmptyState>
      ) : results.isPending ? (
        <ResultsSkeleton />
      ) : results.error ? (
        <FormError message={`Search failed: ${results.error.message}`} />
      ) : results.data.results.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title={`Nothing matches “${q}”`}
          action={
            <Button
              variant="outline"
              onClick={() => update({ projectId: null, band: null, from: null, to: null })}
            >
              Clear filters
            </Button>
          }
        >
          Try different words, or widen the filters.
        </EmptyState>
      ) : (
        <section
          aria-label="Results"
          className={cn('space-y-3', results.isFetching && 'opacity-60')}
        >
          {results.data.mode === 'keyword' && (
            <p className="flex items-center gap-2 rounded-xl border bg-review-soft px-3.5 py-2.5 text-sm text-review">
              <Info className="size-4 shrink-0" aria-hidden />
              Meaning-based search is unavailable right now, so these are keyword matches on tags
              and captions.
            </p>
          )}
          <p className="text-sm text-muted-foreground">
            {results.data.results.length} {results.data.results.length === 1 ? 'result' : 'results'}
            , best match first
          </p>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {results.data.results.map((r) => (
              <li key={r.asset.id}>
                <ResultCard result={r} onOpen={() => update({ asset: r.asset.id })} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <AssetDrawer
        assetId={openAssetId}
        onOpenAsset={(id) => update({ asset: id })}
        onClose={() => update({ asset: null }, true)}
      />
    </div>
  );
}

function Filters({
  params,
  projects,
  onChange,
}: {
  params: URLSearchParams;
  projects: { id: string; name: string }[];
  onChange: (key: string, value: string | null) => void;
}) {
  const ids = { project: useId(), band: useId(), from: useId(), to: useId() };
  return (
    <div
      className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end"
      role="group"
      aria-label="Filter results"
    >
      <div className="grid gap-1.5">
        <Label id={ids.project} className="text-xs text-muted-foreground">
          Project
        </Label>
        <Select
          value={params.get('projectId') ?? ALL}
          onValueChange={(v) => onChange('projectId', v)}
        >
          <SelectTrigger aria-labelledby={ids.project} className="h-9 w-full sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All projects</SelectItem>
            {projects.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
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
          <SelectTrigger aria-labelledby={ids.band} className="h-9 w-full sm:w-40">
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
        <Label htmlFor={ids.from} className="text-xs text-muted-foreground">
          Captured from
        </Label>
        <Input
          id={ids.from}
          type="date"
          className="h-9 w-full sm:w-40"
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
          className="h-9 w-full sm:w-40"
          value={params.get('to') ?? ''}
          onChange={(e) => onChange('to', e.target.value || null)}
        />
      </div>
    </div>
  );
}

function ResultCard({ result, onOpen }: { result: SearchResult; onOpen: () => void }) {
  const { asset, score, match } = result;
  const matchLabel = match === 'semantic' ? `${Math.round(score * 100)}% match` : 'Keyword match';
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group block w-full overflow-hidden rounded-2xl border bg-card text-left shadow-soft transition-shadow duration-150 hover:shadow-lift"
      aria-label={`${altText(asset)}. ${matchLabel}. ${BAND_META[asset.trustBand].label}. Open details`}
    >
      <div
        className="relative bg-muted"
        style={{ aspectRatio: String(thumbnailAspect(asset.width, asset.height)) }}
      >
        <img src={asset.thumbnailUrl} alt="" loading="lazy" className="size-full object-cover" />
        <span className="absolute top-2 left-2 rounded-full bg-ink/75 px-2 py-0.5 text-xs font-medium text-white">
          {matchLabel}
        </span>
        <BandBadge band={asset.trustBand} className="absolute right-2 bottom-2 shadow-soft" />
      </div>
      <div className="space-y-0.5 px-3 py-2.5 text-xs">
        <p className="truncate font-medium">{asset.caption ?? asset.tags.slice(0, 3).join(', ')}</p>
        <p className="truncate text-muted-foreground">
          {asset.projectName}
          {asset.siteName ? ` · ${asset.siteName}` : ''}
        </p>
      </div>
    </button>
  );
}

function ResultsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-busy="true">
      <span className="sr-only">Searching…</span>
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="aspect-square rounded-2xl" />
      ))}
    </div>
  );
}
