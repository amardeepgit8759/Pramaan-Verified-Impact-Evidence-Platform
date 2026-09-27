import type { TrustBand } from '@pramaan/shared';
import { Badge } from '@/components/ui/badge';
import { BAND_META } from '@/lib/bands';

export function BandBadge({ band, className }: { band: TrustBand; className?: string }) {
  const { label, icon: Icon } = BAND_META[band];
  return (
    <Badge variant={band} className={className}>
      <Icon aria-hidden />
      {label}
    </Badge>
  );
}
