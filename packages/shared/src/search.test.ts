import { describe, expect, it } from 'vitest';
import { buildEmbeddingText } from './search.js';

describe('buildEmbeddingText', () => {
  it('combines caption, tags, project, site and date', () => {
    expect(
      buildEmbeddingText({
        caption: 'Women collecting water from a hand pump.',
        tags: ['water pump', 'women'],
        projectName: 'Borewell Project',
        siteName: 'Village Rampur',
        capturedAt: new Date('2024-03-15T10:00:00Z'),
      }),
    ).toBe(
      'Women collecting water from a hand pump. Tags: water pump, women. Project: Borewell Project. Site: Village Rampur. Captured: 15 Mar 2024',
    );
  });

  it('keeps words that end in "s"', () => {
    expect(
      buildEmbeddingText({
        caption: 'Two water pumps',
        tags: [],
        projectName: 'P',
        siteName: null,
        capturedAt: null,
      }),
    ).toBe('Two water pumps. Project: P');
  });

  it('leaves out whatever is missing', () => {
    expect(
      buildEmbeddingText({
        caption: null,
        tags: [],
        projectName: 'Borewell Project',
        siteName: null,
        capturedAt: null,
      }),
    ).toBe('Project: Borewell Project');
  });
});
