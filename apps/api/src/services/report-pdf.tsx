import {
  Document,
  Font,
  Image,
  Link,
  Page,
  renderToBuffer,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer';
import {
  formatDay,
  isReportEligible,
  SDG_INFO,
  type ReportDetail,
  type ReportEvidence,
  type TrustBand,
} from '@pramaan/shared';

// Built-in PDF fonts (Helvetica, Times): nothing to download at render time.
// Whole words only: hyphenated line breaks read badly in a report and break copied text.
Font.registerHyphenationCallback((word) => [word]);

const COLOR = {
  ink: '#1b1d33',
  muted: '#5b6078',
  border: '#e2e4ee',
  soft: '#f5f6fa',
  accent: '#00704b',
};
/** Band colours darkened for text on white paper. */
const BAND: Record<TrustBand, { label: string; color: string }> = {
  verified: { label: 'Verified', color: '#00704b' },
  review: { label: 'Needs review', color: '#8a5300' },
  flagged: { label: 'Flagged', color: '#b3163e' },
};
const CHECK_LABEL: Record<string, string> = {
  exact_duplicate: 'Exact duplicate',
  near_duplicate: 'Near duplicate',
  wrong_location: 'Location',
  wrong_time: 'Capture date',
  missing_metadata: 'Metadata',
  late_upload: 'Upload delay',
};
/** Thumbnails shown after each section; the annex lists everything. */
const THUMBS_PER_SECTION = 6;

const s = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 48,
    fontFamily: 'Helvetica',
    fontSize: 10.5,
    color: COLOR.ink,
    lineHeight: 1.45,
  },
  cover: {
    padding: 0,
    fontFamily: 'Helvetica',
    fontSize: 10.5,
    lineHeight: 1.45,
    color: COLOR.ink,
  },
  url: { fontFamily: 'Courier', fontSize: 7, color: COLOR.accent, lineHeight: 1.3 },
  coverBand: {
    backgroundColor: COLOR.ink,
    color: 'white',
    paddingHorizontal: 48,
    paddingVertical: 40,
  },
  brand: { fontSize: 11, letterSpacing: 2, color: '#b9f0d8' },
  coverTitle: { fontFamily: 'Times-Roman', fontSize: 34, marginTop: 64, lineHeight: 1.1 },
  coverSub: { fontSize: 13, marginTop: 10, color: '#d6d8e6' },
  coverBody: { paddingHorizontal: 48, paddingTop: 32 },
  h1: { fontFamily: 'Times-Roman', fontSize: 22, marginBottom: 10 },
  h2: { fontFamily: 'Times-Roman', fontSize: 16, marginTop: 18, marginBottom: 6 },
  muted: { color: COLOR.muted },
  small: { fontSize: 8.5 },
  row: { flexDirection: 'row' },
  chip: {
    lineHeight: 1.3,
    fontSize: 8.5,
    color: 'white',
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 3,
    marginRight: 6,
    marginBottom: 6,
  },
  box: {
    borderWidth: 1,
    borderColor: COLOR.border,
    borderRadius: 6,
    backgroundColor: COLOR.soft,
    padding: 12,
    marginTop: 16,
  },
  stat: { marginRight: 28 },
  statValue: { fontFamily: 'Times-Roman', fontSize: 22, lineHeight: 1.15 },
  claim: { flexDirection: 'row', marginBottom: 6 },
  claimNo: { width: 22, color: COLOR.muted },
  ref: { color: COLOR.accent, fontSize: 9 },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  thumb: { width: 156, marginRight: 8, marginBottom: 8 },
  thumbImg: { width: 156, height: 117, borderRadius: 4, objectFit: 'cover' },
  thumbMissing: {
    width: 156,
    height: 117,
    borderRadius: 4,
    backgroundColor: COLOR.soft,
    justifyContent: 'center',
    alignItems: 'center',
  },
  annexRow: { borderBottomWidth: 1, borderBottomColor: COLOR.border, paddingVertical: 8 },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 48,
    right: 48,
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: COLOR.muted,
  },
});

const day = (iso: string) => formatDay(new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso));
const period = (r: ReportDetail) => `${day(r.periodStart)} – ${day(r.periodEnd)}`;

function Footer({ report }: { report: ReportDetail }) {
  return (
    <View style={s.footer} fixed>
      <Text>Pramaan · {report.projectName}</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}

function Thumb({ e, image }: { e: ReportEvidence; image: Buffer | null | undefined }) {
  const band = BAND[e.asset.trustBand];
  return (
    <View style={s.thumb} wrap={false}>
      {image ? (
        <Image style={s.thumbImg} src={{ data: image, format: 'jpg' }} />
      ) : (
        <View style={s.thumbMissing}>
          <Text style={[s.small, s.muted]}>Image unavailable</Text>
        </View>
      )}
      <Text style={s.small}>
        <Text style={{ fontFamily: 'Helvetica-Bold' }}>{e.ref}</Text>
        <Text style={{ color: band.color }}>
          {'  '}
          {band.label} · {e.asset.trustScore}
        </Text>
      </Text>
      {e.asset.caption ? <Text style={[s.small, s.muted]}>{e.asset.caption}</Text> : null}
    </View>
  );
}

function AnnexEntry({ e }: { e: ReportEvidence }) {
  const band = BAND[e.asset.trustBand];
  const failed = e.checks.filter((c) => !c.passed);
  const eligibleNow = isReportEligible(e.asset.trustBand, e.asset.reviewDecision);
  return (
    <View style={s.annexRow} wrap={false}>
      <View style={[s.row, { justifyContent: 'space-between' }]}>
        <Text style={{ fontFamily: 'Helvetica-Bold' }}>
          {e.ref} · {e.asset.siteName ?? 'No site'} ·{' '}
          {e.asset.capturedAt ? day(e.asset.capturedAt) : `uploaded ${day(e.asset.uploadedAt)}`}
        </Text>
        <Text style={{ color: band.color, fontFamily: 'Helvetica-Bold' }}>
          {band.label} · Trust Score {e.asset.trustScore}
        </Text>
      </View>
      <Text style={[s.small, s.muted]}>Asset {e.asset.id}</Text>
      {/* Text only wraps at spaces, so long URLs are split into fixed-width lines. */}
      <Link src={e.asset.secureUrl} style={s.url}>
        {(e.asset.secureUrl.match(/.{1,110}/g) ?? []).map((line, i) => (
          <Text key={i}>{line}</Text>
        ))}
      </Link>
      {e.asset.caption ? <Text style={s.small}>{e.asset.caption}</Text> : null}
      <Text style={[s.small, { marginTop: 3 }]}>
        {failed.length === 0
          ? `All ${e.checks.length} checks passed.`
          : failed
              .map((c) => `${CHECK_LABEL[c.type] ?? c.type} (-${c.deduction}): ${c.reason}`)
              .join('  ·  ')}
      </Text>
      {e.reviews.map((r) => (
        <Text key={r.id} style={s.small}>
          {r.decision === 'approve' ? 'Approved' : 'Rejected'} by {r.reviewerName} on{' '}
          {day(r.createdAt)} at score {r.trustScoreAtReview}: “{r.note}”
        </Text>
      ))}
      {!eligibleNow ? (
        <Text style={[s.small, { color: BAND.flagged.color }]}>
          No longer counts as verified evidence (changed after this report was generated).
        </Text>
      ) : null}
      <Text style={[s.small, s.muted]}>
        Cited in statement{e.citedIn.length === 1 ? '' : 's'}{' '}
        {e.citedIn.map((p) => p + 1).join(', ')}
      </Text>
    </View>
  );
}

export function ReportPdf({
  report,
  images,
}: {
  report: ReportDetail;
  images: ReadonlyMap<string, Buffer | null>;
}) {
  const refOf = new Map(report.evidence.map((e) => [e.asset.id, e]));
  return (
    <Document
      title={`${report.projectName}: impact report, ${period(report)}`}
      author={report.organisationName}
      subject="Verified impact evidence report"
      creator="Pramaan"
      producer="Pramaan"
      language="en"
    >
      <Page size="A4" style={s.cover}>
        <View style={s.coverBand}>
          <Text style={s.brand}>PRAMAAN · VERIFIED IMPACT EVIDENCE</Text>
          <Text style={s.coverTitle}>{report.projectName}</Text>
          <Text style={s.coverSub}>Impact report · {period(report)}</Text>
          <Text style={[s.coverSub, { fontSize: 11 }]}>{report.organisationName}</Text>
        </View>
        <View style={s.coverBody}>
          <View style={[s.row, { flexWrap: 'wrap' }]}>
            {report.sdgGoals.map((g) => (
              <Text key={g} style={[s.chip, { backgroundColor: SDG_INFO[g]?.color ?? COLOR.ink }]}>
                SDG {g} · {SDG_INFO[g]?.name ?? `Goal ${g}`}
              </Text>
            ))}
            {report.csrCategory ? (
              <Text style={[s.chip, { backgroundColor: COLOR.muted }]}>
                CSR · {report.csrCategory}
              </Text>
            ) : null}
          </View>
          <View style={[s.row, { marginTop: 16 }]}>
            <View style={s.stat}>
              <Text style={s.statValue}>{report.claimCount}</Text>
              <Text style={[s.small, s.muted]}>cited statements</Text>
            </View>
            <View style={s.stat}>
              <Text style={s.statValue}>{report.citedAssetCount}</Text>
              <Text style={[s.small, s.muted]}>pieces of evidence</Text>
            </View>
            <View style={s.stat}>
              <Text style={s.statValue}>{report.droppedClaims}</Text>
              <Text style={[s.small, s.muted]}>uncited statements removed</Text>
            </View>
          </View>
          <View style={s.box}>
            <Text>
              Every statement in this report cites photos or videos that passed Pramaan’s
              verification checks, or that an administrator reviewed and approved. References such
              as E1 point to the evidence annex, which lists each file’s link, Trust Score, checks
              and review decisions.
            </Text>
            <Text style={[s.muted, { marginTop: 6 }]}>
              The work described is aligned to the SDG and CSR categories shown. This report does
              not assert legal or regulatory compliance.
            </Text>
          </View>
          <Text style={[s.small, s.muted, { marginTop: 16 }]}>
            Generated {day(report.createdAt)}
            {report.generatedBy ? ` by ${report.generatedBy}` : ''} with Pramaan.
          </Text>
        </View>
      </Page>

      <Page size="A4" style={s.page}>
        {report.summary ? (
          <>
            <Text style={s.h1}>Summary</Text>
            <Text>{report.summary}</Text>
          </>
        ) : null}
        {report.sections.map((section) => {
          const cited = [...new Set(section.claims.flatMap((c) => c.assetIds))].flatMap(
            (id) => refOf.get(id) ?? [],
          );
          return (
            <View key={section.heading}>
              <Text style={s.h2} minPresenceAhead={60}>
                {section.heading}
              </Text>
              {section.claims.map((claim) => (
                <View key={claim.id} style={s.claim} wrap={false}>
                  <Text style={s.claimNo}>{claim.position + 1}.</Text>
                  <Text style={{ flex: 1 }}>
                    {claim.sentence}{' '}
                    <Text style={s.ref}>
                      [{claim.assetIds.map((id) => refOf.get(id)?.ref ?? '?').join(', ')}]
                    </Text>
                  </Text>
                </View>
              ))}
              <View style={s.thumbs}>
                {cited.slice(0, THUMBS_PER_SECTION).map((e) => (
                  <Thumb key={e.ref} e={e} image={images.get(e.asset.id)} />
                ))}
              </View>
            </View>
          );
        })}
        <Footer report={report} />
      </Page>

      <Page size="A4" style={s.page}>
        <Text style={s.h1}>Evidence annex</Text>
        <Text style={[s.muted, { marginBottom: 8 }]}>
          Each cited file with its current Trust Score, the checks it failed (all others passed) and
          every review decision.
        </Text>
        {report.evidence.map((e) => (
          <AnnexEntry key={e.ref} e={e} />
        ))}
        <Footer report={report} />
      </Page>
    </Document>
  );
}

/** Assets whose thumbnails the PDF shows (up to a few per section). */
export function assetsShownInPdf(report: ReportDetail): string[] {
  return [
    ...new Set(
      report.sections.flatMap((section) =>
        [...new Set(section.claims.flatMap((c) => c.assetIds))].slice(0, THUMBS_PER_SECTION),
      ),
    ),
  ];
}

/** Render the report; `images` holds JPEG stills by asset id (missing ones show a placeholder). */
export function renderReportPdf(
  report: ReportDetail,
  images: ReadonlyMap<string, Buffer | null>,
): Promise<Buffer> {
  return renderToBuffer(<ReportPdf report={report} images={images} />);
}
