import { confirmUploadInput, uploadSignatureInput } from '@pramaan/shared';
import { Router, type Request } from 'express';
import { currentUser, requireAuth, requireRole } from '../auth/middleware.js';
import { requireProject } from '../services/access.js';
import { assetFilters, listProjectAssets, loadAssetDetail } from '../services/asset-views.js';
import {
  confirmUpload,
  requireSiteInProject,
  uploadFolder,
  type IngestDeps,
} from '../services/ingestion.js';

/** Field staff and admins upload; viewers only look. */
const canUpload = requireRole('admin', 'field');

/** `/api/uploads`: signed parameters for a direct browser-to-Cloudinary upload. */
export function uploadsRouter(deps: IngestDeps) {
  const router = Router();
  router.use(requireAuth);

  router.post('/signature', canUpload, async (req, res) => {
    const user = currentUser(req);
    const input = uploadSignatureInput.parse(req.body);
    const project = await requireProject(deps.db, user.orgId, input.projectId);
    const site = input.siteId
      ? await requireSiteInProject(deps.db, project.id, input.siteId)
      : null;
    res.json(
      await deps.media.signUpload({
        folder: uploadFolder(deps.env, user.orgId, project.id),
        context: {
          pramaan_org_id: user.orgId,
          pramaan_project_id: project.id,
          ...(site && { pramaan_site_id: site.id }),
          pramaan_uploaded_by: user.id,
        },
      }),
    );
  });

  return router;
}

/** `/api/assets`: confirm an upload, and read evidence. */
export function assetsRouter(deps: IngestDeps) {
  const router = Router();
  router.use(requireAuth);

  router.post('/confirm', canUpload, async (req, res) => {
    const input = confirmUploadInput.parse(req.body);
    const { assetId, created } = await confirmUpload(deps, currentUser(req), input);
    const asset = await loadAssetDetail(deps.db, deps.media, currentUser(req).orgId, assetId);
    res.status(created ? 201 : 200).json(asset);
  });

  router.get('/:id', async (req, res) => {
    res.json(await loadAssetDetail(deps.db, deps.media, currentUser(req).orgId, req.params.id));
  });

  return router;
}

const parentProjectId = (req: Request) =>
  (req.params as Record<string, string | undefined>).projectId;

/** `/api/projects/:projectId/assets`: the project's evidence, filtered. */
export function projectAssetsRouter(deps: IngestDeps) {
  const router = Router({ mergeParams: true });
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    const project = await requireProject(deps.db, currentUser(req).orgId, parentProjectId(req));
    const filters = assetFilters.parse(req.query);
    res.json({ assets: await listProjectAssets(deps.db, deps.media, project.id, filters) });
  });

  return router;
}
