import {
  assetDetailSchema,
  uploadSignatureResponse,
  type AssetDetail,
  type ResourceType,
} from '@pramaan/shared';
import { api } from './api';

export type UploadStage = 'signing' | 'uploading' | 'verifying';

/** POST a file to Cloudinary with progress. Cloudinary replies with the stored asset. */
function sendToCloudinary(
  url: string,
  form: FormData,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<{ public_id: string; resource_type: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.responseType = 'json';
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      const body = xhr.response as {
        public_id?: string;
        resource_type?: string;
        error?: { message?: string };
      } | null;
      if (xhr.status >= 200 && xhr.status < 300 && body?.public_id) {
        resolve({ public_id: body.public_id, resource_type: body.resource_type ?? 'image' });
      } else {
        reject(new Error(body?.error?.message ?? `Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error while uploading. Check your connection.'));
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
    signal?.addEventListener('abort', () => xhr.abort());
    xhr.send(form);
  });
}

/**
 * Upload one file: get a signed request from the API, send the file straight to
 * Cloudinary, then ask the API to verify it. The API re-reads everything from
 * Cloudinary; nothing the browser reports is used for scoring.
 */
export async function uploadEvidence(
  file: File,
  target: { projectId: string; siteId: string | null },
  on: { stage: (s: UploadStage) => void; progress: (fraction: number) => void },
  signal?: AbortSignal,
): Promise<AssetDetail> {
  on.stage('signing');
  const { uploadUrl, params } = await api.post(
    '/uploads/signature',
    target,
    uploadSignatureResponse,
    {
      signal,
    },
  );

  on.stage('uploading');
  const form = new FormData();
  for (const [key, value] of Object.entries(params)) form.append(key, value);
  form.append('file', file);
  const uploaded = await sendToCloudinary(uploadUrl, form, on.progress, signal);

  on.stage('verifying');
  const resourceType: ResourceType = uploaded.resource_type === 'video' ? 'video' : 'image';
  return api.post(
    '/assets/confirm',
    {
      publicId: uploaded.public_id,
      projectId: target.projectId,
      siteId: target.siteId,
      resourceType,
    },
    assetDetailSchema,
    { signal },
  );
}
