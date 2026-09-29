import type { CheckType, ResourceType, ReviewDecision, TrustBand } from './domain.js';
import { SDG_INFO } from './sdg.js';

/** A report-eligible asset, as the report generator sees it. */
export interface ReportFactAsset {
  id: string;
  siteName: string | null;
  resourceType: ResourceType;
  capturedAt: Date | null;
  uploadedAt: Date;
  caption: string | null;
  tags: readonly string[];
  trustScore: number;
  /** Eligible because an admin approved it, rather than because it verified. */
  approvedByAdmin: boolean;
}

export interface ReportFactsInput {
  project: {
    name: string;
    description: string;
    sdgGoals: readonly number[];
    csrCategory: string | null;
  };
  period: { start: string; end: string };
  assets: readonly ReportFactAsset[];
}

/** Upper bounds that keep the prompt a sensible size for large projects. */
export const REPORT_LIMITS = { assets: 150, idsPerGroup: 20, tagClusters: 12 } as const;

export const UNASSIGNED_SITE = 'Not at a registered site';

/** The evidence's day: when it was captured, or uploaded if the capture time is unknown. */
const dayOf = (a: ReportFactAsset) => (a.capturedAt ?? a.uploadedAt).toISOString().slice(0, 10);
const byDay = (a: ReportFactAsset, b: ReportFactAsset) =>
  dayOf(a).localeCompare(dayOf(b)) || a.id.localeCompare(b.id);

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = groups.get(k);
    if (list) list.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}

const ids = (list: readonly ReportFactAsset[]) =>
  list.slice(0, REPORT_LIMITS.idsPerGroup).map((a) => a.id);

const brief = (a: ReportFactAsset) => ({ asset_id: a.id, date: dayOf(a), caption: a.caption });

/**
 * The only facts the report model is given: counts per site, month and tag, before/after
 * pairs, the project's SDG goals and CSR category, and the citable assets with captions.
 * Everything is computed from eligible evidence, so any id in here may be cited.
 */
export function buildReportFacts({ project, period, assets }: ReportFactsInput) {
  const sorted = [...assets].sort(byDay);

  const tagGroups = new Map<string, ReportFactAsset[]>();
  for (const a of sorted) {
    for (const tag of new Set(a.tags)) {
      const list = tagGroups.get(tag);
      if (list) list.push(a);
      else tagGroups.set(tag, [a]);
    }
  }

  // Earliest and latest photo at each site, when they're from different days.
  const photosBySite = groupBy(
    sorted.filter((a) => a.resourceType === 'image' && a.siteName !== null),
    (a) => a.siteName!,
  );
  const beforeAfter = [...photosBySite].flatMap(([site, list]) => {
    const [first, last] = [list[0]!, list.at(-1)!];
    return dayOf(first) < dayOf(last) ? [{ site, before: brief(first), after: brief(last) }] : [];
  });

  // Before/after photos are always listed; the rest fill the remaining places by date.
  const pairIds = new Set(beforeAfter.flatMap((p) => [p.before.asset_id, p.after.asset_id]));
  const listed = [
    ...sorted.filter((a) => pairIds.has(a.id)),
    ...sorted.filter((a) => !pairIds.has(a.id)),
  ]
    .slice(0, REPORT_LIMITS.assets)
    .sort(byDay);

  return {
    project: {
      name: project.name,
      description: project.description || null,
      sdg_goals: project.sdgGoals.map((goal) => ({
        goal,
        name: SDG_INFO[goal]?.name ?? `Goal ${goal}`,
      })),
      csr_category: project.csrCategory,
    },
    period,
    totals: {
      evidence: sorted.length,
      photos: sorted.filter((a) => a.resourceType === 'image').length,
      videos: sorted.filter((a) => a.resourceType === 'video').length,
      sites_with_evidence: new Set(sorted.flatMap((a) => (a.siteName ? [a.siteName] : []))).size,
      approved_by_admin: sorted.filter((a) => a.approvedByAdmin).length,
      assets_listed_below: listed.length,
    },
    per_site: [...groupBy(sorted, (a) => a.siteName ?? UNASSIGNED_SITE)].map(([site, list]) => ({
      site,
      count: list.length,
      first_date: dayOf(list[0]!),
      last_date: dayOf(list.at(-1)!),
      asset_ids: ids(list),
    })),
    per_month: [...groupBy(sorted, (a) => dayOf(a).slice(0, 7))].map(([month, list]) => ({
      month,
      count: list.length,
      asset_ids: ids(list),
    })),
    tag_clusters: [...tagGroups]
      .sort(([ta, a], [tb, b]) => b.length - a.length || ta.localeCompare(tb))
      .slice(0, REPORT_LIMITS.tagClusters)
      .map(([tag, list]) => ({ tag, count: list.length, asset_ids: ids(list) })),
    before_after: beforeAfter,
    assets: listed.map((a) => ({
      id: a.id,
      date: dayOf(a),
      site: a.siteName ?? UNASSIGNED_SITE,
      type: a.resourceType === 'image' ? 'photo' : 'video',
      caption: a.caption,
      tags: a.tags.slice(0, 8),
      trust_score: a.trustScore,
      ...(a.approvedByAdmin ? { approved_by_admin: true } : {}),
    })),
  };
}
export type ReportFacts = ReturnType<typeof buildReportFacts>;

/** What the model returns (field names as in the brief's JSON). */
export interface ReportDraft {
  summary: string;
  sections: { heading: string; claims: { sentence: string; asset_ids: string[] }[] }[];
}

export type DropReason = 'empty' | 'uncited' | 'ineligible' | 'compliance';

/**
 * Reports say "aligned to" SDG and CSR categories; they never assert legal or regulatory
 * compliance, whatever the model writes.
 */
const COMPLIANCE_CLAIM =
  /\bcomplian(?:t|ce)\b|\bcompl(?:y|ies|ied|ying) with\b|\blegally\b|\bstatutory\b/i;

/** The sentences of a paragraph, split after . ! or ? */
const sentencesOf = (text: string) => text.split(/(?<=[.!?])\s+/);

export interface ValidatedClaim {
  position: number;
  section: string;
  sentence: string;
  assetIds: string[];
}

export interface DroppedClaim {
  section: string;
  sentence: string;
  assetIds: string[];
  reason: DropReason;
}

/**
 * Keep only claims that cite evidence, and only eligible evidence. A claim citing even
 * one id outside the eligible set is dropped whole: part of its support is unverified or
 * made up. So is any sentence claiming legal compliance. Positions are renumbered across
 * sections in reading order.
 */
export function validateReportDraft(draft: ReportDraft, eligibleIds: ReadonlySet<string>) {
  const claims: ValidatedClaim[] = [];
  const dropped: DroppedClaim[] = [];
  for (const section of draft.sections) {
    const heading = section.heading.trim() || 'Findings';
    for (const claim of section.claims) {
      const sentence = claim.sentence.trim().replace(/\s+/g, ' ');
      const assetIds = [
        ...new Set(claim.asset_ids.map((id) => id.trim().toLowerCase()).filter(Boolean)),
      ];
      const reason: DropReason | null = !sentence
        ? 'empty'
        : assetIds.length === 0
          ? 'uncited'
          : assetIds.some((id) => !eligibleIds.has(id))
            ? 'ineligible'
            : COMPLIANCE_CLAIM.test(sentence)
              ? 'compliance'
              : null;
      if (reason) dropped.push({ section: heading, sentence, assetIds, reason });
      else claims.push({ position: claims.length, section: heading, sentence, assetIds });
    }
  }
  // The summary has no citations of its own; it keeps only sentences that make no
  // compliance claim.
  const summary = sentencesOf(draft.summary.trim().replace(/\s+/g, ' '))
    .filter((s) => !COMPLIANCE_CLAIM.test(s))
    .join(' ');
  return { summary, claims, dropped };
}

/** Cited asset ids in order of first citation: E1 is the first photo the report cites. */
export function evidenceOrder(claims: readonly { assetIds: readonly string[] }[]): string[] {
  return [...new Set(claims.flatMap((c) => c.assetIds))];
}

export const ANNEX_CSV_COLUMNS = [
  'evidence_ref',
  'asset_id',
  'url',
  'project',
  'site',
  'captured_at',
  'uploaded_at',
  'latitude',
  'longitude',
  'trust_score',
  'trust_band',
  'eligible_because',
  'checks_passed',
  'failed_checks',
  'review_decision',
  'review_history',
  'cited_in_claims',
] as const;
export type AnnexCsvColumn = (typeof ANNEX_CSV_COLUMNS)[number];

export interface AnnexEntry {
  ref: string;
  asset: {
    id: string;
    secureUrl: string;
    projectName: string;
    siteName: string | null;
    capturedAt: string | null;
    uploadedAt: string;
    lat: number | null;
    lng: number | null;
    trustScore: number;
    trustBand: TrustBand;
    reviewDecision: ReviewDecision | null;
  };
  checks: readonly { type: CheckType; passed: boolean; deduction: number; reason: string }[];
  reviews: readonly {
    decision: ReviewDecision;
    note: string;
    reviewerName: string;
    trustScoreAtReview: number;
    createdAt: string;
  }[];
  /** Positions of the claims that cite this asset. */
  citedIn: readonly number[];
}

/** Spreadsheet apps run cells starting with these as formulas; a leading ' keeps them text. */
export function csvSafe(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** One evidence-annex row. Claim numbers are 1-based, as printed in the report. */
export function annexCsvRow(e: AnnexEntry): Record<AnnexCsvColumn, string> {
  const failed = e.checks.filter((c) => !c.passed);
  const history = [...e.reviews]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(
      (r) =>
        `${r.createdAt.slice(0, 10)} ${r.decision} by ${r.reviewerName} at score ${r.trustScoreAtReview}: ${r.note}`,
    );
  return {
    evidence_ref: e.ref,
    asset_id: e.asset.id,
    url: csvSafe(e.asset.secureUrl),
    project: csvSafe(e.asset.projectName),
    site: csvSafe(e.asset.siteName ?? ''),
    captured_at: e.asset.capturedAt ?? '',
    uploaded_at: e.asset.uploadedAt,
    latitude: e.asset.lat === null ? '' : String(e.asset.lat),
    longitude: e.asset.lng === null ? '' : String(e.asset.lng),
    trust_score: String(e.asset.trustScore),
    trust_band: e.asset.trustBand,
    eligible_because: e.asset.reviewDecision === 'approve' ? 'approved by admin' : 'verified',
    checks_passed: `${e.checks.length - failed.length}/${e.checks.length}`,
    failed_checks: csvSafe(
      failed.map((c) => `${c.type} (-${c.deduction}): ${c.reason}`).join('; '),
    ),
    review_decision: e.asset.reviewDecision ?? '',
    review_history: csvSafe(history.join(' | ')),
    cited_in_claims: e.citedIn.map((p) => p + 1).join(', '),
  };
}
