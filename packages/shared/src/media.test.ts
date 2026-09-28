import { describe, expect, it } from 'vitest';
import { thumbnailAspect } from './media.js';

describe('thumbnailAspect', () => {
  it.each([
    [1600, 1200, 4 / 3],
    [1200, 1600, 3 / 4],
    [1000, 1000, 1],
    [4000, 1000, 4 / 3], // panorama clamps to landscape
    [1000, 4000, 3 / 4], // tall screenshot clamps to portrait
    [1100, 1000, 1.1],
    [null, 1000, 1],
    [1000, null, 1],
    [0, 0, 1],
  ])('%s×%s → %s', (w, h, expected) => {
    expect(thumbnailAspect(w, h)).toBeCloseTo(expected, 6);
  });
});
