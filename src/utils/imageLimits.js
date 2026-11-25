export const MAX_IMAGE_FILE_SIZE = 50 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 12000;
// A decoded 12 MP RGBA image uses about 48 MiB before Canvas and export copies.
export const MAX_IMAGE_PIXELS = 12_000_000;

export function getImageLimitError(width, height, fileSize) {
  if (fileSize > MAX_IMAGE_FILE_SIZE) {
    return 'File is too large. Maximum supported file size is 50 MB.';
  }
  if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
    return `Image dimensions (${width}×${height}px) exceed the safe browser limit of ${MAX_IMAGE_DIMENSION}px per side.`;
  }
  if (width * height > MAX_IMAGE_PIXELS) {
    return `This image has too many pixels (${(width * height / 1_000_000).toFixed(1)} MP). The current limit is 12 MP to help prevent browser memory issues.`;
  }
  return null;
}
