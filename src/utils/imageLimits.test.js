import { describe, expect, it } from 'vitest';
import { getImageLimitError, MAX_IMAGE_PIXELS } from './imageLimits';
import { resizeImage } from './canvasEngine';

describe('image safety limits', () => {
  it('accepts common image dimensions within the pixel budget', () => {
    expect(getImageLimitError(4000, 3000, 1024)).toBeNull();
  });

  it('rejects images that exceed the decoded pixel budget', () => {
    expect(MAX_IMAGE_PIXELS).toBe(12_000_000);
    expect(getImageLimitError(12000, 12000, 1024)).toMatch(/12 MP/);
  });

  it('keeps file size and per-side dimension checks', () => {
    expect(getImageLimitError(100, 100, 51 * 1024 * 1024)).toMatch(/50 MB/);
    expect(getImageLimitError(12001, 100, 1024)).toMatch(/per side/);
  });

  it('blocks oversized resize outputs before allocating a canvas', async () => {
    await expect(resizeImage(null, 10000, 10000)).rejects.toThrow(/12 MP/);
  });
});
