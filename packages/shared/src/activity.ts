import type { EventType, TrustBand } from './domain.js';
import { plural } from './format.js';

const BAND_WORD: Record<TrustBand, string> = {
  verified: 'verified',
  review: 'needing review',
  flagged: 'flagged',
};

interface DescribableEvent {
  type: EventType;
  payload: Record<string, unknown>;
}

const str = (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : null);

/**
 * One plain sentence for the activity feed and live toasts, e.g.
 * "New asset flagged in Borewell Project – Phase 1".
 */
export function describeEvent({ type, payload }: DescribableEvent): string {
  const project = str(payload.projectName);
  const inProject = project ? ` in ${project}` : '';
  const band = str(payload.band) as TrustBand | null;
  const actor = str(payload.actorName);

  switch (type) {
    case 'asset.created':
      return band ? `New asset ${BAND_WORD[band]}${inProject}` : `New asset uploaded${inProject}`;
    case 'asset.rescored': {
      const previous = str(payload.previousBand) as TrustBand | null;
      if (band && previous && band !== previous) {
        return `An asset${inProject} moved from ${BAND_WORD[previous]} to ${BAND_WORD[band]}`;
      }
      return `An asset${inProject} was re-scored`;
    }
    case 'asset.reviewed': {
      const verb = payload.decision === 'reject' ? 'rejected' : 'approved';
      return `${actor ?? 'An admin'} ${verb} an asset${inProject}`;
    }
    case 'asset.enriched':
      return `A photo${inProject} was tagged and described`;
    case 'report.created':
      return payload.status === 'failed'
        ? `A report couldn’t be generated${inProject}`
        : `New report generated${inProject}`;
    case 'settings.updated': {
      const changed = typeof payload.bandChanged === 'number' ? payload.bandChanged : 0;
      return changed > 0
        ? `Trust settings changed; ${plural(changed, 'asset')} changed band`
        : 'Trust settings changed';
    }
    case 'site.gap_changed': {
      const site = str(payload.siteName) ?? 'A site';
      return payload.gap === true
        ? `${site}${inProject} has a documentation gap`
        : `${site}${inProject} has fresh verified evidence`;
    }
  }
}
