import jpeg from 'jpeg-js';
import piexif from 'piexifjs';

/** Degrees as the EXIF rational triple [[d,1],[m,1],[s*100,100]]. */
function toDmsRational(value: number): [number, number][] {
  // Work in hundredths of an arc-second so rounding carries into minutes and degrees
  // (77.1° must become 77° 6′ 0″, not 77° 5′ 60″).
  const total = Math.round(Math.abs(value) * 3600 * 100);
  const d = Math.floor(total / 360_000);
  const m = Math.floor((total % 360_000) / 6_000);
  const s = total % 6_000;
  return [
    [d, 1],
    [m, 1],
    [s, 100],
  ];
}

/**
 * A real JPEG with a patterned image (so it has a meaningful perceptual hash) and EXIF
 * capture time and GPS, for the live Cloudinary test.
 */
export function makeJpegWithExif(opts: {
  lat: number;
  lng: number;
  capturedAt: string; // "YYYY:MM:DD HH:MM:SS"
  seed?: number;
  size?: number;
}): Buffer {
  const size = opts.size ?? 320;
  const seed = opts.seed ?? 1;
  const data = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      data[i] = (x * 255) / size;
      data[i + 1] = (Math.sin((x + y) / (12 + seed)) * 0.5 + 0.5) * 255;
      data[i + 2] = (x * y + seed * 997) % 256;
      data[i + 3] = 255;
    }
  }
  const encoded = jpeg.encode({ data, width: size, height: size }, 90).data;

  const exif = {
    '0th': { [piexif.ImageIFD.Make]: 'Pramaan test', [piexif.ImageIFD.Model]: 'Live test' },
    Exif: { [piexif.ExifIFD.DateTimeOriginal]: opts.capturedAt },
    GPS: {
      [piexif.GPSIFD.GPSLatitudeRef]: opts.lat >= 0 ? 'N' : 'S',
      [piexif.GPSIFD.GPSLatitude]: toDmsRational(opts.lat),
      [piexif.GPSIFD.GPSLongitudeRef]: opts.lng >= 0 ? 'E' : 'W',
      [piexif.GPSIFD.GPSLongitude]: toDmsRational(opts.lng),
    },
  };
  const withExif = piexif.insert(piexif.dump(exif), encoded.toString('binary'));
  return Buffer.from(withExif, 'binary');
}
