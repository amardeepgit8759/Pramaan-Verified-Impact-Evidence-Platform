/**
 * Perceptual hashes are stored as 64-character bit strings ("0101…"), which is how
 * Postgres returns a `bit(64)` column. Cloudinary reports them as 16 hex digits.
 */
export function phashFromHex(hex: string): string | null {
  const clean = hex.trim().toLowerCase();
  if (!/^[0-9a-f]{1,16}$/.test(clean)) return null;
  return BigInt(`0x${clean}`).toString(2).padStart(64, '0');
}

export function isPhashBits(value: string): boolean {
  return /^[01]{64}$/.test(value);
}

/** Number of differing bits between two 64-bit hashes. */
export function hammingDistance(a: string, b: string): number {
  if (!isPhashBits(a) || !isPhashBits(b)) {
    throw new Error('hammingDistance expects two 64-character bit strings');
  }
  let distance = 0;
  for (let i = 0; i < 64; i++) if (a[i] !== b[i]) distance++;
  return distance;
}
