import type { Asset } from '@pramaan/shared';

/** Alt text: the caption if there is one, otherwise what the tags say. */
export function altText(asset: Pick<Asset, 'caption' | 'tags'>) {
  if (asset.caption) return asset.caption;
  if (asset.tags.length > 0) return `Photo tagged ${asset.tags.slice(0, 5).join(', ')}`;
  return 'Evidence photo without a description';
}
