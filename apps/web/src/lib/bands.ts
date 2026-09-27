import type { TrustBand } from '@pramaan/shared';
import { ShieldAlert, ShieldCheck, ShieldX, type LucideIcon } from 'lucide-react';

/** Colour is never the only signal: every band has an icon and a label too. */
export const BAND_META: Record<
  TrustBand,
  { label: string; icon: LucideIcon; solid: string; text: string }
> = {
  verified: {
    label: 'Verified',
    icon: ShieldCheck,
    solid: 'bg-verified-solid',
    text: 'text-verified',
  },
  review: {
    label: 'Needs review',
    icon: ShieldAlert,
    solid: 'bg-review-solid',
    text: 'text-review',
  },
  flagged: { label: 'Flagged', icon: ShieldX, solid: 'bg-flagged-solid', text: 'text-flagged' },
};
