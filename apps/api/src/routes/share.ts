import { Router, type Request } from 'express';
import { currentUser, requireAuth, requireRole } from '../auth/middleware.js';
import type { Db } from '../db/client.js';
import { HttpError } from '../http-error.js';
import type { MediaStore } from '../services/media.js';
import { loadReportDetail } from '../services/reports.js';
import {
  createShareLink,
  listShareLinks,
  loadSharedProject,
  resolveShareToken,
  revokeShareLink,
} from '../services/share.js';
import { reportIdParam, sendReportFile } from './reports.js';

const parentProjectId = (req: Request) =>
  (req.params as Record<string, string | undefined>).projectId;

/** /api/projects/:projectId/share-links: admins manage funder links. */
export function projectShareLinksRouter(db: Db) {
  const router = Router({ mergeParams: true });
  router.use(requireAuth, requireRole('admin'));

  router.get('/', async (req, res) => {
    res.json({ links: await listShareLinks(db, currentUser(req).orgId, parentProjectId(req)) });
  });

  router.post('/', async (req, res) => {
    res
      .status(201)
      .json(await createShareLink(db, currentUser(req), parentProjectId(req), req.body));
  });

  return router;
}

/** /api/share-links/:id */
export function shareLinksRouter(db: Db) {
  const router = Router();
  router.use(requireAuth, requireRole('admin'));

  router.delete('/:id', async (req, res) => {
    await revokeShareLink(db, currentUser(req).orgId, req.params.id);
    res.status(204).end();
  });

  return router;
}

/**
 * /api/share/:token: the public, read-only funder view. No session is used or needed; the
 * token alone opens one project until it expires. Nothing here can change data.
 */
export function sharedRouter({ db, media }: { db: Db; media: MediaStore }) {
  const router = Router({ mergeParams: true });

  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      return next(new HttpError(405, 'Share links are read-only.'));
    }
    next();
  });

  const token = (req: Request) => (req.params as Record<string, string | undefined>).token;

  router.get('/', async (req, res) => {
    const shared = await resolveShareToken(db, token(req));
    res.json(await loadSharedProject(db, media, shared));
  });

  const loadReport = async (req: Request) => {
    const { project } = await resolveShareToken(db, token(req));
    return loadReportDetail(
      db,
      media,
      { reportId: reportIdParam(req.params.reportId), projectId: project.id, readyOnly: true },
      { publicView: true },
    );
  };

  router.get('/reports/:reportId', async (req, res) => {
    res.json(await loadReport(req));
  });

  router.get('/reports/:reportId/pdf', async (req, res) => {
    await sendReportFile(db, media, res, await loadReport(req), 'pdf');
  });

  router.get('/reports/:reportId/annex.csv', async (req, res) => {
    await sendReportFile(db, media, res, await loadReport(req), 'csv');
  });

  return router;
}
