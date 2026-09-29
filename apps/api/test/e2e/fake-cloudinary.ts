/**
 * A stand-in for Cloudinary used ONLY by the e2e test server. It accepts real multipart
 * uploads from the browser on the app's own origin and derives what Cloudinary would report
 * from the file itself: md5 etag, a 64-bit average hash as the pHash, and EXIF read from the
 * JPEG. So duplicates, near-duplicates, off-site and no-EXIF photos behave realistically in
 * browser tests without Cloudinary credentials.
 */
import { createHash, randomUUID } from 'node:crypto';
import type { ResourceType, UploadSignatureResponse } from '@pramaan/shared';
import { Router } from 'express';
import jpeg from 'jpeg-js';
import multer from 'multer';
import piexif from 'piexifjs';
import type { CloudinaryResource, MediaStore } from '../../src/services/media.js';

const UPLOAD_PATH = '/__e2e/cloudinary/upload';
const COMPOSITE_PATH = '/__e2e/cloudinary/composite';
const THUMB_PATH = '/__e2e/cloudinary/thumb';
const THUMB_WIDTH = 480;

/** A JPEG scaled (nearest neighbour) to at most THUMB_WIDTH wide, like Cloudinary's grid thumbnails. */
function thumbnail(file: Buffer): Buffer {
  const img = jpeg.decode(file, { useTArray: true });
  if (img.width <= THUMB_WIDTH) return file;
  const w = THUMB_WIDTH;
  const h = Math.round((img.height * w) / img.width);
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src =
        (Math.floor((y * img.height) / h) * img.width + Math.floor((x * img.width) / w)) * 4;
      out.set(img.data.subarray(src, src + 4), (y * w + x) * 4);
    }
  }
  return jpeg.encode({ data: out, width: w, height: h }, 80).data;
}

const PHASH_SIZE = 32;
const COS = Array.from({ length: 8 }, (_, u) =>
  Array.from({ length: PHASH_SIZE }, (_, x) =>
    Math.cos(((2 * x + 1) * u * Math.PI) / (2 * PHASH_SIZE)),
  ),
);

/**
 * DCT perceptual hash of a JPEG, as 16 hex digits like Cloudinary's: greyscale at 32×32,
 * the 8×8 lowest frequencies, one bit each for above/below their median. Resizing and
 * re-compressing barely change it; different scenes differ by many bits.
 */
function perceptualHash(file: Buffer): string | null {
  try {
    const { data, width, height } = jpeg.decode(file, { useTArray: true });
    const grey: number[][] = [];
    for (let y = 0; y < PHASH_SIZE; y++) {
      const row: number[] = [];
      for (let x = 0; x < PHASH_SIZE; x++) {
        // Average the block of source pixels this cell covers.
        const [y0, y1] = [
          Math.floor((y * height) / PHASH_SIZE),
          Math.floor(((y + 1) * height) / PHASH_SIZE),
        ];
        const [x0, x1] = [
          Math.floor((x * width) / PHASH_SIZE),
          Math.floor(((x + 1) * width) / PHASH_SIZE),
        ];
        let sum = 0;
        let n = 0;
        for (let sy = y0; sy < Math.max(y1, y0 + 1); sy++) {
          for (let sx = x0; sx < Math.max(x1, x0 + 1); sx++) {
            const i = (sy * width + sx) * 4;
            sum += 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
            n++;
          }
        }
        row.push(sum / n);
      }
      grey.push(row);
    }
    const coefficients: number[] = [];
    for (let u = 0; u < 8; u++) {
      for (let v = 0; v < 8; v++) {
        let sum = 0;
        for (let y = 0; y < PHASH_SIZE; y++) {
          for (let x = 0; x < PHASH_SIZE; x++) sum += grey[y]![x]! * COS[u]![y]! * COS[v]![x]!;
        }
        coefficients.push(sum);
      }
    }
    // The DC term (overall brightness) would dominate the median; leave it out.
    const sorted = coefficients.slice(1).sort((a, b) => a - b);
    const median = (sorted[31]! + sorted[32]!) / 2;
    const bits = coefficients.map((c) => (c > median ? '1' : '0')).join('');
    return BigInt(`0b${bits}`).toString(16).padStart(16, '0');
  } catch {
    return null;
  }
}

/** EXIF from a JPEG in ExifTool's flat naming, like Cloudinary's media_metadata. */
function readExif(file: Buffer): Record<string, string> {
  try {
    const exif = piexif.load(file.toString('binary'));
    const out: Record<string, string> = {};
    const date = exif.Exif?.[piexif.ExifIFD.DateTimeOriginal];
    if (date) out.DateTimeOriginal = String(date);
    const dms = (v: [number, number][]) =>
      `${v[0]![0] / v[0]![1]} deg ${v[1]![0] / v[1]![1]}' ${(v[2]![0] / v[2]![1]).toFixed(2)}"`;
    const lat = exif.GPS?.[piexif.GPSIFD.GPSLatitude] as [number, number][] | undefined;
    const lng = exif.GPS?.[piexif.GPSIFD.GPSLongitude] as [number, number][] | undefined;
    if (lat && lng) {
      out.GPSLatitude = dms(lat);
      out.GPSLatitudeRef = String(exif.GPS?.[piexif.GPSIFD.GPSLatitudeRef] ?? 'N');
      out.GPSLongitude = dms(lng);
      out.GPSLongitudeRef = String(exif.GPS?.[piexif.GPSIFD.GPSLongitudeRef] ?? 'E');
    }
    return out;
  } catch {
    return {};
  }
}

/** Two JPEGs scaled (nearest neighbour) to 400×300 and placed side by side. */
function sideBySide(left: Buffer, right: Buffer): Buffer {
  const [w, h] = [400, 300];
  const out = Buffer.alloc(w * 2 * h * 4);
  [left, right].forEach((file, half) => {
    const img = jpeg.decode(file, { useTArray: true });
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const sx = Math.floor((x * img.width) / w);
        const sy = Math.floor((y * img.height) / h);
        const src = (sy * img.width + sx) * 4;
        const dst = (y * w * 2 + half * w + x) * 4;
        for (let c = 0; c < 4; c++) out[dst + c] = img.data[src + c]!;
      }
    }
  });
  return jpeg.encode({ data: out, width: w * 2, height: h }, 85).data;
}

export class FakeCloudinary implements MediaStore {
  private readonly resources = new Map<string, CloudinaryResource>();
  private readonly files = new Map<string, Buffer>();
  private readonly thumbs = new Map<string, Buffer>();

  constructor(private readonly baseUrl: string) {}

  /** The browser POSTs files here instead of api.cloudinary.com. */
  router() {
    const router = Router();
    const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50_000_000 } });
    router.post(UPLOAD_PATH, upload.single('file'), (req, res) => {
      const folder = String(req.body.folder ?? req.body.asset_folder ?? '');
      if (!req.file || !folder || !req.body.signature) {
        res.status(400).json({ error: { message: 'Missing file, folder or signature' } });
        return;
      }
      const publicId = `${folder}/${randomUUID()}`;
      const file = req.file.buffer;
      this.files.set(publicId, file);
      this.resources.set(publicId, {
        publicId,
        resourceType: 'image',
        format: 'jpg',
        width: null,
        height: null,
        bytes: file.length,
        secureUrl: `${this.baseUrl}/__e2e/cloudinary/file/${encodeURIComponent(publicId)}`,
        etag: createHash('md5').update(file).digest('hex'),
        phash: perceptualHash(file),
        createdAt: new Date(),
        originalFilename: req.file.originalname.replace(/\.[^.]+$/, ''),
        tags: [],
        metadata: readExif(file),
      });
      res.json({ public_id: publicId, resource_type: 'image' });
    });
    router.get(COMPOSITE_PATH, (req, res) => {
      const a = this.files.get(String(req.query.before));
      const b = this.files.get(String(req.query.after));
      if (!a || !b) {
        res.status(404).end();
        return;
      }
      res.type('image/jpeg').send(sideBySide(a, b));
    });
    router.get(`${THUMB_PATH}/:id`, (req, res) => {
      const id = decodeURIComponent(req.params.id);
      const file = this.files.get(id);
      if (!file) {
        res.status(404).end();
        return;
      }
      let thumb = this.thumbs.get(id);
      if (!thumb) {
        thumb = thumbnail(file);
        this.thumbs.set(id, thumb);
      }
      res.type('image/jpeg').set('Cache-Control', 'public, max-age=31536000').send(thumb);
    });
    router.get('/__e2e/cloudinary/file/:id', (req, res) => {
      const file = this.files.get(decodeURIComponent(req.params.id));
      if (!file) {
        res.status(404).end();
        return;
      }
      res.type('image/jpeg').send(file);
    });
    return router;
  }

  async signUpload(input: { folder: string; context: Record<string, string> }) {
    const response: UploadSignatureResponse = {
      uploadUrl: `${this.baseUrl}${UPLOAD_PATH}`,
      params: {
        folder: input.folder,
        context: Object.entries(input.context)
          .map(([k, v]) => `${k}=${v}`)
          .join('|'),
        timestamp: String(Math.round(Date.now() / 1000)),
        signature: 'e2e',
        api_key: 'e2e',
      },
    };
    return response;
  }

  async getResource(publicId: string, _resourceType: ResourceType) {
    return this.resources.get(publicId) ?? null;
  }

  /** The e2e account has no tagging add-on, so the Gemini fallback path runs. */
  async autoTag(): Promise<string[]> {
    throw new Error('Auto-tagging add-on not enabled (e2e)');
  }

  async writeBack() {}

  compositeUrl(before: { publicId: string }, after: { publicId: string }) {
    const qs = new URLSearchParams({ before: before.publicId, after: after.publicId });
    return `${this.baseUrl}${COMPOSITE_PATH}?${qs}`;
  }

  thumbnailUrl(publicId: string) {
    return this.resources.has(publicId)
      ? `${this.baseUrl}${THUMB_PATH}/${encodeURIComponent(publicId)}`
      : '';
  }

  previewUrl(publicId: string) {
    return this.resources.get(publicId)?.secureUrl ?? '';
  }

  /** The uploaded file itself, when it's a JPEG (all the e2e fixtures are). */
  async fetchStill(publicId: string) {
    const file = this.files.get(publicId);
    return file && file[0] === 0xff && file[1] === 0xd8 ? file : null;
  }

  async destroy(publicId: string) {
    this.resources.delete(publicId);
    this.files.delete(publicId);
  }
}
