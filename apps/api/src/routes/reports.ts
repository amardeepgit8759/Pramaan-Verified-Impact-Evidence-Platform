import type { ReportDetail } from '@pramaan/shared';
import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { currentUser, requireAuth, requireRole } from '../auth/middleware.js';
import { HttpError } from '../http-error.js';
import { requireProject } from '../services/access.js';
import { annexCsv } from '../services/annex-csv.js';
import {
  buildReportPdf,
  deleteReport,
  listReports,
  loadReportDetail,
  reportFileName,
  startReport,
  type ReportDeps,
} from '../services/reports.js';
import type { MediaStore } from '../services/media.js';
import type { Db } from '../db/client.js';

const parentProjectId = (req: Request) =>
  (req.params as Record<string, string | undefined>).projectId;

/** A malformed id is just a report that doesn't exist. */
export function reportIdParam(value: unknown): string {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw new HttpError(404, 'Report not found');
  return parsed.data;
}

function readyOrConflict(report: ReportDetail) {
  if (report.status !== 'ready') {
    throw new HttpError(409, 'This report isn’t ready to download.');
  }
}

/** PDF and CSV downloads, shared by the app and the public share page. */
export async function sendReportFile(
  db: Db,
  media: MediaStore,
  res: Response,
  report: ReportDetail,
  kind: 'pdf' | 'csv',
) {
  readyOrConflict(report);
  const name = reportFileName(report);
  if (kind === 'pdf') {
    const pdf = await buildReportPdf(db, media, report);
    res
      .type('application/pdf')
      .setHeader('Content-Disposition', `attachment; filename="${name}.pdf"`)
      .send(pdf);
  } else {
    res
      .type('text/csv; charset=utf-8')
      .setHeader('Content-Disposition', `attachment; filename="${name}-evidence-annex.csv"`)
      .send(annexCsv(report));
  }
}

/** /api/projects/:projectId/reports */
export function projectReportsRouter(deps: ReportDeps) {
  const router = Router({ mergeParams: true });
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    const project = await requireProject(deps.db, currentUser(req).orgId, parentProjectId(req));
    res.json({ reports: await listReports(deps.db, project.id) });
  });

  // Generation runs in the background; the report.created event says when it's done.
  router.post('/', requireRole('admin'), async (req, res) => {
    const { report } = await startReport(deps, currentUser(req), parentProjectId(req), req.body);
    res.status(202).json(report);
  });

  return router;
}

/** /api/reports/:id */
export function reportsRouter({ db, media }: Pick<ReportDeps, 'db' | 'media'>) {
  const router = Router();
  router.use(requireAuth);

  const load = (req: Request) =>
    loadReportDetail(db, media, {
      reportId: reportIdParam(req.params.id),
      orgId: currentUser(req).orgId,
    });

  router.get('/:id', async (req, res) => {
    res.json(await load(req));
  });

  router.get('/:id/pdf', async (req, res) => {
    await sendReportFile(db, media, res, await load(req), 'pdf');
  });

  router.get('/:id/annex.csv', async (req, res) => {
    await sendReportFile(db, media, res, await load(req), 'csv');
  });

  router.delete('/:id', requireRole('admin'), async (req, res) => {
    await deleteReport(db, currentUser(req).orgId, reportIdParam(req.params.id));
    res.status(204).end();
  });

  return router;
}
