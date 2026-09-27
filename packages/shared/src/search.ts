import { formatDay } from './format.js';

/**
 * The text an asset is embedded from: what it shows, where, and when. Search queries are
 * embedded as-is and compared against this.
 */
export function buildEmbeddingText(input: {
  caption: string | null;
  tags: readonly string[];
  projectName: string;
  siteName: string | null;
  capturedAt: Date | null;
}): string {
  return [
    // The parts are joined with ". ", so drop the caption's own final full stop.
    input.caption?.replace(/[.\s]+$/, '') || null,
    input.tags.length > 0 ? `Tags: ${input.tags.join(', ')}` : null,
    `Project: ${input.projectName}`,
    input.siteName ? `Site: ${input.siteName}` : null,
    input.capturedAt ? `Captured: ${formatDay(input.capturedAt)}` : null,
  ]
    .filter((part): part is string => part !== null)
    .join('. ');
}
