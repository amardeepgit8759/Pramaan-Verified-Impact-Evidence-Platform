import type { CheckType } from '@pramaan/shared';
import {
  CalendarClock,
  Copy,
  Hourglass,
  MapPinOff,
  ScanSearch,
  TagsIcon,
  type LucideIcon,
} from 'lucide-react';

/** Short names and icons for the six Trust Score checks. */
export const CHECK_META: Record<CheckType, { label: string; icon: LucideIcon }> = {
  exact_duplicate: { label: 'Exact copy', icon: Copy },
  near_duplicate: { label: 'Near-copy', icon: ScanSearch },
  wrong_location: { label: 'Location', icon: MapPinOff },
  wrong_time: { label: 'Capture date', icon: CalendarClock },
  missing_metadata: { label: 'Metadata', icon: TagsIcon },
  late_upload: { label: 'Upload timing', icon: Hourglass },
};
