import type { Asset } from '@pramaan/shared';
import { useQuery } from '@tanstack/react-query';
import { Film, ImageOff, Images } from 'lucide-react';
import { BandBadge } from '@/components/band-badge';
import { EmptyState } from '@/components/empty-state';
import { FormError } from '@/components/field';
import { Skeleton } from '@/components/ui/skeleton';
import { altText } from '@/lib/assets';
import { useSession } from '@/lib/auth';
import { assetsQuery, sitesQuery } from '@/lib/queries';
import { useProject } from './project-layout';
import { Uploader } from './uploader';

export function ProjectEvidence() {
  const { project } = useProject();
  const { data: session } = useSession();
  const canUpload = session?.user.role === 'admin' || session?.user.role === 'field';
  const { data: sites = [] } = useQuery(sitesQuery(project.id));
  const { data: assets, isPending, error } = useQuery(assetsQuery(project.id));

  return (
    <div className="space-y-6">
      {canUpload && <Uploader projectId={project.id} sites={sites} />}

      {isPending ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-busy="true">
          <span className="sr-only">Loading evidence…</span>
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="aspect-square rounded-2xl" />
          ))}
        </div>
      ) : error ? (
        <FormError message={`Couldn’t load evidence: ${error.message}`} />
      ) : assets.length === 0 ? (
        !canUpload && (
          <EmptyState icon={Images} title="No evidence yet">
            Field staff haven’t uploaded anything to this project yet.
          </EmptyState>
        )
      ) : (
        <section aria-label="Evidence" className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground">
            {assets.length} {assets.length === 1 ? 'file' : 'files'}
          </h2>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {assets.map((a) => (
              <li key={a.id}>
                <EvidenceCard asset={a} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function EvidenceCard({ asset }: { asset: Asset }) {
  return (
    <figure className="group overflow-hidden rounded-2xl border bg-card shadow-soft">
      <div className="relative aspect-square bg-muted">
        <img
          src={asset.thumbnailUrl}
          alt={altText(asset)}
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
          onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
        />
        <ImageOff
          className="absolute inset-0 m-auto size-6 text-muted-foreground -z-0"
          aria-hidden
        />
        {asset.resourceType === 'video' && (
          <span className="absolute top-2 left-2 rounded-full bg-ink/70 p-1.5 text-white">
            <Film className="size-3.5" aria-label="Video" />
          </span>
        )}
        <BandBadge band={asset.trustBand} className="absolute right-2 bottom-2 shadow-soft" />
      </div>
      <figcaption className="flex items-center justify-between gap-2 px-3 py-2.5 text-xs">
        <span className="truncate text-muted-foreground">{asset.siteName ?? 'No site'}</span>
        <span className="font-semibold tabular">{asset.trustScore}</span>
      </figcaption>
    </figure>
  );
}
