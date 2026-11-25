import { processBackgroundRemoval, rgbToHex, hexToRgb } from './bgRemovalCore';
import { getImageLimitError } from './imageLimits';

let activeWorker = null;
let workerMsgId = 0;

function getBgWorker() {
  if (typeof Worker === 'undefined') return null;
  if (!activeWorker) {
    try {
      activeWorker = new Worker(new URL('./bgRemovalWorker.js', import.meta.url), { type: 'module' });
    } catch {
      activeWorker = null;
    }
  }
  return activeWorker;
}

/**
 * Format bytes into human-readable string (e.g. 1.2 MB, 450 KB)
 */
export function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Helper to download a Blob or DataURL to the user's filesystem
 */
export function downloadBlob(blobOrUrl, filename) {
  const url = typeof blobOrUrl === 'string' ? blobOrUrl : URL.createObjectURL(blobOrUrl);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  if (typeof blobOrUrl !== 'string') {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/**
 * Load an Image element from a File or ObjectURL
 */
export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = (err) => reject(new Error('Failed to load image: ' + err));
    img.src = src;
  });
}

/**
 * 1. RESIZE IMAGE
 */
export async function resizeImage(img, targetWidth, targetHeight, mimeType = 'image/jpeg', quality = 0.92) {
  const width = Math.max(1, Math.round(targetWidth));
  const height = Math.max(1, Math.round(targetHeight));
  const limitError = getImageLimitError(width, height, 0);
  if (limitError) throw new Error(limitError);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve({
        blob,
        url: URL.createObjectURL(blob),
        width: canvas.width,
        height: canvas.height,
        size: blob ? blob.size : 0
      });
    }, mimeType, quality);
  });
}

/**
 * 2. COMPRESS IMAGE
 */
export async function compressImage(img, mimeType = 'image/jpeg', quality = 0.8) {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve({
        blob,
        url: URL.createObjectURL(blob),
        width: canvas.width,
        height: canvas.height,
        size: blob ? blob.size : 0,
        quality
      });
    }, mimeType, quality);
  });
}

export async function compressToTargetSize(img, mimeType = 'image/jpeg', targetBytes = 380 * 1024) {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0);

  let low = 0.05;
  let high = 0.98;
  let bestBlob = null;
  let bestQuality = 0.8;

  for (let i = 0; i < 6; i++) {
    const mid = (low + high) / 2;
    const blob = await new Promise((r) => canvas.toBlob(r, mimeType, mid));
    if (!blob) break;
    bestBlob = blob;
    bestQuality = mid;

    if (Math.abs(blob.size - targetBytes) < targetBytes * 0.05) break;
    if (blob.size > targetBytes) high = mid;
    else low = mid;
  }

  return {
    blob: bestBlob,
    url: bestBlob ? URL.createObjectURL(bestBlob) : null,
    width: canvas.width,
    height: canvas.height,
    size: bestBlob ? bestBlob.size : 0,
    quality: bestQuality
  };
}

/**
 * 3. CROP IMAGE
 */
export async function cropImage(img, cropBox, mimeType = 'image/png', quality = 0.95) {
  const { x, y, width, height } = cropBox;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(
    img,
    Math.round(x),
    Math.round(y),
    Math.round(width),
    Math.round(height),
    0,
    0,
    canvas.width,
    canvas.height
  );

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve({
        blob,
        url: URL.createObjectURL(blob),
        width: canvas.width,
        height: canvas.height,
        size: blob ? blob.size : 0
      });
    }, mimeType, quality);
  });
}

/**
 * 4. ROTATE & FLIP
 */
export async function rotateFlipImage(img, rotationDeg = 0, flipH = false, flipV = false, mimeType = 'image/png') {
  const normalizedDeg = ((rotationDeg % 360) + 360) % 360;
  const isPerpendicular = normalizedDeg === 90 || normalizedDeg === 270;
  const originalW = img.naturalWidth || img.width;
  const originalH = img.naturalHeight || img.height;

  const canvas = document.createElement('canvas');
  canvas.width = isPerpendicular ? originalH : originalW;
  canvas.height = isPerpendicular ? originalW : originalH;
  const ctx = canvas.getContext('2d');

  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((normalizedDeg * Math.PI) / 180);
  ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
  ctx.drawImage(img, -originalW / 2, -originalH / 2);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve({
        blob,
        url: URL.createObjectURL(blob),
        width: canvas.width,
        height: canvas.height,
        size: blob ? blob.size : 0
      });
    }, mimeType, 0.95);
  });
}

/**
 * 5. FORMAT CONVERSION
 */
export async function convertFormat(img, targetFormat = 'image/png', quality = 0.92, bgColor = '#ffffff') {
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Fill background if target format lacks alpha channel support
  if (targetFormat === 'image/jpeg' || targetFormat === 'image/bmp') {
    if (bgColor && bgColor !== 'transparent') {
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, width, height);
    }
  }

  ctx.drawImage(img, 0, 0);

  // 1. BMP Format (Pure in-browser binary 24-bit bitmap)
  if (targetFormat === 'image/bmp') {
    const blob = encodeBmp(canvas, bgColor);
    return {
      blob,
      url: URL.createObjectURL(blob),
      width,
      height,
      size: blob.size,
      format: targetFormat
    };
  }

  // 2. TIFF Format (Pure in-browser binary Little-Endian TIFF)
  if (targetFormat === 'image/tiff') {
    const blob = encodeTiff(canvas);
    return {
      blob,
      url: URL.createObjectURL(blob),
      width,
      height,
      size: blob.size,
      format: targetFormat
    };
  }

  // 3. ICO Format (Windows Icon single/multi size)
  if (targetFormat === 'image/x-icon') {
    const iconDim = Math.min(256, Math.max(16, Math.min(width, height)));
    const iconCanvas = document.createElement('canvas');
    iconCanvas.width = iconDim;
    iconCanvas.height = iconDim;
    const iconCtx = iconCanvas.getContext('2d');
    iconCtx.imageSmoothingEnabled = true;
    iconCtx.imageSmoothingQuality = 'high';
    iconCtx.drawImage(canvas, 0, 0, iconDim, iconDim);

    const blob = await encodeIcoFromCanvases([iconCanvas]);
    const previewBlob = await new Promise((r) => iconCanvas.toBlob(r, 'image/png'));
    return {
      blob,
      url: URL.createObjectURL(previewBlob),
      width: iconDim,
      height: iconDim,
      size: blob.size,
      format: targetFormat
    };
  }

  // 4. Native Canvas Formats: PNG, JPEG, WebP, AVIF
  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      // Graceful fallback to WebP if AVIF is unsupported by the browser
      if (!blob && targetFormat === 'image/avif') {
        canvas.toBlob((fallbackBlob) => {
          resolve({
            blob: fallbackBlob,
            url: URL.createObjectURL(fallbackBlob),
            width,
            height,
            size: fallbackBlob ? fallbackBlob.size : 0,
            format: 'image/webp',
            fallback: true
          });
        }, 'image/webp', quality);
        return;
      }

      resolve({
        blob,
        url: blob ? URL.createObjectURL(blob) : '',
        width,
        height,
        size: blob ? blob.size : 0,
        format: targetFormat
      });
    }, targetFormat, quality);
  });
}

/**
 * 6. CIRCLE CROP
 */
export async function circleCropImage(img, centerX, centerY, radius, zoom = 1) {
  const diameter = Math.max(1, Math.round(radius * 2));
  const canvas = document.createElement('canvas');
  canvas.width = diameter;
  canvas.height = diameter;
  const ctx = canvas.getContext('2d');

  ctx.beginPath();
  ctx.arc(diameter / 2, diameter / 2, diameter / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  const effectiveZoom = Math.max(0.1, zoom || 1);
  const sourceW = (radius * 2) / effectiveZoom;
  const sourceH = (radius * 2) / effectiveZoom;
  const sourceX = centerX - sourceW / 2;
  const sourceY = centerY - sourceH / 2;

  ctx.drawImage(img, sourceX, sourceY, sourceW, sourceH, 0, 0, diameter, diameter);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve({
        blob,
        url: URL.createObjectURL(blob),
        width: diameter,
        height: diameter,
        size: blob ? blob.size : 0
      });
    }, 'image/png');
  });
}

/**
 * 7. ADD BORDER & CORNER RADIUS
 */
export function hasImageTransparency(img) {
  try {
    const testCanvas = document.createElement('canvas');
    testCanvas.width = 32;
    testCanvas.height = 32;
    const ctx = testCanvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, 32, 32);
    const data = ctx.getImageData(0, 0, 32, 32).data;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 240) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function addBorderImage(img, {
  borderWidth = 16,
  borderColor = '#c65d21',
  radius = 12,
  mode = 'auto' // 'auto' | 'contour' | 'frame'
} = {}) {
  const origW = img.naturalWidth || img.width;
  const origH = img.naturalHeight || img.height;
  const b = Math.max(0, parseInt(borderWidth, 10) || 0);

  const canvas = document.createElement('canvas');
  canvas.width = origW + b * 2;
  canvas.height = origH + b * 2;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (b === 0) {
    ctx.drawImage(img, 0, 0);
    return new Promise((resolve) => {
      canvas.toBlob((blob) => {
        resolve({
          blob,
          url: URL.createObjectURL(blob),
          width: origW,
          height: origH,
          size: blob ? blob.size : 0
        });
      }, 'image/png');
    });
  }

  // Determine whether to outline the shape contour (circle, cutout, sticker) or draw a rectangular frame
  const isTransparent = hasImageTransparency(img);
  const useContour = mode === 'contour' || (mode === 'auto' && isTransparent);

  if (useContour) {
    // 1. Create a solid silhouette of the image in borderColor
    const silhouetteCanvas = document.createElement('canvas');
    silhouetteCanvas.width = canvas.width;
    silhouetteCanvas.height = canvas.height;
    const sCtx = silhouetteCanvas.getContext('2d');
    sCtx.imageSmoothingEnabled = true;
    sCtx.imageSmoothingQuality = 'high';

    // Draw image centered at (b, b)
    sCtx.drawImage(img, b, b, origW, origH);

    // Turn all visible pixels into solid borderColor
    sCtx.globalCompositeOperation = 'source-in';
    sCtx.fillStyle = borderColor;
    sCtx.fillRect(0, 0, silhouetteCanvas.width, silhouetteCanvas.height);

    // 2. Expand silhouette in all directions by b pixels (radial dilation)
    const step = Math.max(1, Math.min(2.5, b / 8));
    for (let r = step; r <= b; r += step) {
      const count = Math.max(12, Math.ceil((2 * Math.PI * r) / step));
      for (let i = 0; i < count; i++) {
        const angle = (i * 2 * Math.PI) / count;
        ctx.drawImage(silhouetteCanvas, Math.cos(angle) * r, Math.sin(angle) * r);
      }
    }

    // Exact outer perimeter pass to ensure crisp continuous edge
    const perimeterCount = Math.max(16, Math.ceil((2 * Math.PI * b) / 1.5));
    for (let i = 0; i < perimeterCount; i++) {
      const angle = (i * 2 * Math.PI) / perimeterCount;
      ctx.drawImage(silhouetteCanvas, Math.cos(angle) * b, Math.sin(angle) * b);
    }

    // Ensure center is solid
    ctx.drawImage(silhouetteCanvas, 0, 0);

    // 3. Draw original image on top in center
    ctx.drawImage(img, b, b, origW, origH);
  } else {
    // Standard rectangle / rounded photo frame
    if (b > 0) {
      ctx.fillStyle = borderColor;
      if (ctx.roundRect && radius > 0) {
        ctx.beginPath();
        ctx.roundRect(0, 0, canvas.width, canvas.height, radius + b);
        ctx.fill();
      } else {
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }

    ctx.save();
    if (ctx.roundRect && radius > 0) {
      ctx.beginPath();
      ctx.roundRect(b, b, origW, origH, radius);
      ctx.clip();
    }
    ctx.drawImage(img, b, b, origW, origH);
    ctx.restore();
  }

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve({
        blob,
        url: URL.createObjectURL(blob),
        width: canvas.width,
        height: canvas.height,
        size: blob ? blob.size : 0
      });
    }, 'image/png');
  });
}

export async function cornerRadiusImage(img, options = 24) {
  const radius = typeof options === 'object' ? (options.radius ?? 24) : options;
  const bgColor = typeof options === 'object' ? (options.bgColor || 'transparent') : 'transparent';

  const origW = img.naturalWidth || img.width;
  const origH = img.naturalHeight || img.height;
  const maxR = Math.round(Math.min(origW, origH) / 2);
  const r = Math.max(0, Math.min(maxR, parseInt(radius, 10) || 0));

  const canvas = document.createElement('canvas');
  canvas.width = origW;
  canvas.height = origH;
  const ctx = canvas.getContext('2d');

  if (bgColor && bgColor !== 'transparent') {
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, origW, origH);
  }

  ctx.save();
  if (ctx.roundRect && r > 0) {
    ctx.beginPath();
    ctx.roundRect(0, 0, origW, origH, r);
    ctx.clip();
  } else if (r > 0) {
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(origW - r, 0);
    ctx.quadraticCurveTo(origW, 0, origW, r);
    ctx.lineTo(origW, origH - r);
    ctx.quadraticCurveTo(origW, origH, origW - r, origH);
    ctx.lineTo(r, origH);
    ctx.quadraticCurveTo(0, origH, 0, origH - r);
    ctx.lineTo(0, r);
    ctx.quadraticCurveTo(0, 0, r, 0);
    ctx.closePath();
    ctx.clip();
  }
  ctx.drawImage(img, 0, 0);
  ctx.restore();

  const isTransparent = !bgColor || bgColor === 'transparent';
  const mimeType = isTransparent ? 'image/png' : 'image/jpeg';

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve({
        blob,
        url: URL.createObjectURL(blob),
        width: canvas.width,
        height: canvas.height,
        size: blob ? blob.size : 0
      });
    }, mimeType, 0.95);
  });
}

/**
 * 8. WATERMARK
 */
export async function watermarkImage(img, { text = '© Image Utility', opacity = 0.7, position = 'bottom-right', color = '#ffffff', fontSize = 28 }) {
  const origW = img.naturalWidth || img.width;
  const origH = img.naturalHeight || img.height;
  const canvas = document.createElement('canvas');
  canvas.width = origW;
  canvas.height = origH;
  const ctx = canvas.getContext('2d');

  ctx.drawImage(img, 0, 0);

  ctx.save();
  ctx.globalAlpha = Math.max(0.05, Math.min(1, opacity));
  ctx.fillStyle = color;
  ctx.font = `600 ${fontSize}px Inter, sans-serif`;
  ctx.textBaseline = 'middle';

  const metrics = ctx.measureText(text);
  const textW = metrics.width;
  const padding = 30;

  let x = origW - textW - padding;
  let y = origH - padding - fontSize / 2;

  if (position === 'center') {
    x = (origW - textW) / 2;
    y = origH / 2;
  } else if (position === 'top-left') {
    x = padding;
    y = padding + fontSize / 2;
  } else if (position === 'top-right') {
    x = origW - textW - padding;
    y = padding + fontSize / 2;
  } else if (position === 'bottom-left') {
    x = padding;
    y = origH - padding - fontSize / 2;
  }

  // Drop shadow for legibility
  ctx.shadowColor = 'rgba(0, 0, 0, 0.6)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;
  ctx.fillText(text, x, y);
  ctx.restore();

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve({
        blob,
        url: URL.createObjectURL(blob),
        width: canvas.width,
        height: canvas.height,
        size: blob ? blob.size : 0
      });
    }, 'image/png');
  });
}

/**
 * 9. ADJUST (Full Mobile-Grade Filter Suite)
 */
export async function adjustImage(img, {
  brightness = 100,
  contrast = 100,
  saturation = 100,
  warmth = 0,
  blur = 0,
  sepia = 0,
  grayscale = 0,
  hueRotate = 0,
  invert = 0,
  vignette = 0
} = {}) {
  const origW = img.naturalWidth || img.width;
  const origH = img.naturalHeight || img.height;
  const canvas = document.createElement('canvas');
  canvas.width = origW;
  canvas.height = origH;
  const ctx = canvas.getContext('2d');

  // Build composite CSS filter string
  const filters = [];
  if (brightness !== 100) filters.push(`brightness(${brightness}%)`);
  if (contrast !== 100) filters.push(`contrast(${contrast}%)`);
  if (saturation !== 100) filters.push(`saturate(${saturation}%)`);
  if (blur > 0) filters.push(`blur(${blur}px)`);
  if (sepia > 0) filters.push(`sepia(${sepia}%)`);
  if (grayscale > 0) filters.push(`grayscale(${grayscale}%)`);
  if (hueRotate !== 0) filters.push(`hue-rotate(${hueRotate}deg)`);
  if (invert > 0) filters.push(`invert(${invert}%)`);

  ctx.filter = filters.length > 0 ? filters.join(' ') : 'none';
  ctx.drawImage(img, 0, 0);

  // Apply Warmth / Temperature overlay if non-zero (-50 cool blue to +50 warm amber)
  if (warmth !== 0) {
    ctx.save();
    if (warmth > 0) {
      const alpha = Math.min(0.35, (warmth / 100) * 0.45);
      ctx.fillStyle = `rgba(245, 140, 30, ${alpha})`;
      ctx.globalCompositeOperation = 'color';
    } else {
      const alpha = Math.min(0.35, (Math.abs(warmth) / 100) * 0.45);
      ctx.fillStyle = `rgba(30, 144, 255, ${alpha})`;
      ctx.globalCompositeOperation = 'color';
    }
    ctx.fillRect(0, 0, origW, origH);
    ctx.restore();
  }

  // Apply Vignette if > 0 (radial dark gradient towards borders)
  if (vignette > 0) {
    ctx.save();
    const radius = Math.sqrt(Math.pow(origW / 2, 2) + Math.pow(origH / 2, 2));
    const gradient = ctx.createRadialGradient(
      origW / 2, origH / 2, radius * 0.4,
      origW / 2, origH / 2, radius
    );
    const intensity = Math.min(0.9, (vignette / 100) * 0.85);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(1, `rgba(0, 0, 0, ${intensity})`);
    ctx.fillStyle = gradient;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillRect(0, 0, origW, origH);
    ctx.restore();
  }

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve({
        blob,
        url: URL.createObjectURL(blob),
        width: canvas.width,
        height: canvas.height,
        size: blob ? blob.size : 0
      });
    }, 'image/jpeg', 0.95);
  });
}

/**
 * 10. IMAGE TO PDF
 */
export async function generatePdf(img, { pageSize = 'a4', orientation = 'auto', margin = 'normal', fitMode = 'contain' }) {
  const { jsPDF } = await import('jspdf');
  const imgW = img.naturalWidth || img.width;
  const imgH = img.naturalHeight || img.height;
  const imgAspect = imgW / imgH;

  let chosenOrientation = orientation;
  if (chosenOrientation === 'auto') {
    chosenOrientation = imgAspect > 1 ? 'landscape' : 'portrait';
  }

  const margins = { none: 0, small: 8, normal: 16 };
  const m = margins[margin] ?? 16;

  let doc;
  if (pageSize === 'fit') {
    const dpi = 150;
    const mmPerInch = 25.4;
    const pW = (imgW / dpi) * mmPerInch;
    const pH = (imgH / dpi) * mmPerInch;
    doc = new jsPDF({
      orientation: imgAspect > 1 ? 'landscape' : 'portrait',
      unit: 'mm',
      format: [pW, pH]
    });
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = imgW;
    tempCanvas.height = imgH;
    const tCtx = tempCanvas.getContext('2d');
    tCtx.fillStyle = '#ffffff';
    tCtx.fillRect(0, 0, imgW, imgH);
    tCtx.drawImage(img, 0, 0);
    const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.95);
    doc.addImage(dataUrl, 'JPEG', 0, 0, pW, pH);
  } else {
    doc = new jsPDF({
      orientation: chosenOrientation,
      unit: 'mm',
      format: pageSize
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const availW = pageWidth - m * 2;
    const availH = pageHeight - m * 2;

    let targetW, targetH;
    if (fitMode === 'contain') {
      const pageAspect = availW / availH;
      if (imgAspect > pageAspect) {
        targetW = availW;
        targetH = targetW / imgAspect;
      } else {
        targetH = availH;
        targetW = targetH * imgAspect;
      }
    } else {
      targetW = availW;
      targetH = targetW / imgAspect;
    }

    const posX = m + (availW - targetW) / 2;
    const posY = m + (availH - targetH) / 2;

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = imgW;
    tempCanvas.height = imgH;
    const tCtx = tempCanvas.getContext('2d');
    tCtx.fillStyle = '#ffffff';
    tCtx.fillRect(0, 0, imgW, imgH);
    tCtx.drawImage(img, 0, 0);
    const dataUrl = tempCanvas.toDataURL('image/jpeg', 0.95);

    doc.addImage(dataUrl, 'JPEG', posX, posY, targetW, targetH);
  }

  const pdfBlob = doc.output('blob');
  return {
    blob: pdfBlob,
    url: URL.createObjectURL(pdfBlob),
    size: pdfBlob.size
  };
}

/**
 * 11. REMOVE METADATA
 */
export async function stripMetadata(img, mimeType = 'image/jpeg', quality = 0.95) {
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (mimeType === 'image/jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(img, 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error(`The browser could not export this image as ${mimeType}. Choose PNG, JPEG, or WebP.`));
        return;
      }
      resolve({
        blob,
        url: URL.createObjectURL(blob),
        width,
        height,
        size: blob.size,
        format: blob.type,
        sanitized: true
      });
    }, mimeType, quality);
  });
}

/**
 * Read EXIF markers from supported image containers without loading the full
 * image file into another large ArrayBuffer.
 */
function readTiffExif(bytes, tiffStart = 0) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const result = { hasExif: true, hasGps: false, cameraModel: null, dateTime: null };
  if (tiffStart + 8 > view.byteLength) return result;

  const byteOrder = view.getUint16(tiffStart, false);
  if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) return result;
  const littleEndian = byteOrder === 0x4949;
  const get16 = (offset) => offset + 2 <= view.byteLength ? view.getUint16(offset, littleEndian) : null;
  const get32 = (offset) => offset + 4 <= view.byteLength ? view.getUint32(offset, littleEndian) : null;
  if (get16(tiffStart + 2) !== 42) return result;

  const ifdOffset = get32(tiffStart + 4);
  const ifdStart = ifdOffset == null ? null : tiffStart + ifdOffset;
  const entryCount = ifdStart == null ? null : get16(ifdStart);
  if (entryCount == null || entryCount > 4096 || ifdStart + 2 + entryCount * 12 > view.byteLength) return result;

  for (let i = 0; i < entryCount; i++) {
    const entry = ifdStart + 2 + i * 12;
    const tag = get16(entry);
    const type = get16(entry + 2);
    const count = get32(entry + 4);
    if (tag === 0x8825) result.hasGps = true;

    if ((tag === 0x0110 || tag === 0x0132) && type === 2 && count > 0 && count <= 1024) {
      const valueStart = count <= 4 ? entry + 8 : tiffStart + (get32(entry + 8) ?? view.byteLength);
      if (valueStart + count <= view.byteLength) {
        const value = new TextDecoder('latin1').decode(new Uint8Array(bytes.buffer, bytes.byteOffset + valueStart, count)).replace(/\0+$/, '').trim();
        if (tag === 0x0110) result.cameraModel = value || null;
        if (tag === 0x0132) result.dateTime = value || null;
      }
    }
  }
  return result;
}

async function readBlobBytes(file, start, length) {
  return new Uint8Array(await file.slice(start, start + length).arrayBuffer());
}

function emptyFileMetadata(file, supported = true) {
  return {
    hasExif: false,
    hasGps: false,
    cameraModel: null,
    dateTime: null,
    inspectionSupported: supported,
    fileType: file?.type || 'unknown',
    fileSize: file?.size || 0,
    fileName: file?.name || undefined
  };
}

export async function inspectFileMetadata(file) {
  if (!file) return { ...emptyFileMetadata(null), isSample: true };

  const supported = ['image/jpeg', 'image/png', 'image/webp'].includes(file.type);
  const metadata = emptyFileMetadata(file, supported);
  if (!supported || file.size < 8) return metadata;

  try {
    const header = await readBlobBytes(file, 0, 12);
    const signature = new TextDecoder('latin1').decode(header);

    if (header[0] === 0xff && header[1] === 0xd8) {
      let offset = 2;
      while (offset + 4 <= file.size) {
        const markerHeader = await readBlobBytes(file, offset, 4);
        if (markerHeader[0] !== 0xff) break;
        let markerIndex = 1;
        while (markerHeader[markerIndex] === 0xff) markerIndex++;
        const marker = markerHeader[markerIndex];
        if (marker === 0xda || marker === 0xd9) break;
        const lengthIndex = markerIndex + 1;
        if (lengthIndex + 1 >= markerHeader.length) break;
        const segmentLength = (markerHeader[lengthIndex] << 8) | markerHeader[lengthIndex + 1];
        if (segmentLength < 2 || offset + markerIndex + 1 + segmentLength > file.size) break;
        const segmentStart = offset + markerIndex + 3;
        if (marker === 0xe1 && segmentLength >= 8) {
          const segment = await readBlobBytes(file, segmentStart, segmentLength - 2);
          if (new TextDecoder('latin1').decode(segment.subarray(0, 6)) === 'Exif\0\0') {
            const exif = readTiffExif(segment, 6);
            Object.assign(metadata, exif);
          }
        }
        offset += markerIndex + 1 + segmentLength;
      }
      return metadata;
    }

    if (header[0] === 0x89 && signature.slice(1, 4) === 'PNG' && header[4] === 13 && header[5] === 10 && header[6] === 26 && header[7] === 10) {
      let offset = 8;
      while (offset + 12 <= file.size) {
        const chunkHeader = await readBlobBytes(file, offset, 8);
        const chunkLength = new DataView(chunkHeader.buffer).getUint32(0, false);
        const chunkType = new TextDecoder('latin1').decode(chunkHeader.subarray(4, 8));
        const dataStart = offset + 8;
        if (chunkLength > file.size - dataStart - 4) break;
        if (chunkType === 'eXIf') {
          const exifBytes = await readBlobBytes(file, dataStart, chunkLength);
          Object.assign(metadata, readTiffExif(exifBytes));
        }
        if (chunkType === 'IEND') break;
        offset = dataStart + chunkLength + 4;
      }
      return metadata;
    }

    if (signature.startsWith('RIFF') && signature.slice(8, 12) === 'WEBP') {
      let offset = 12;
      while (offset + 8 <= file.size) {
        const chunkHeader = await readBlobBytes(file, offset, 8);
        const chunkType = new TextDecoder('latin1').decode(chunkHeader.subarray(0, 4));
        const chunkLength = new DataView(chunkHeader.buffer).getUint32(4, true);
        const dataStart = offset + 8;
        if (chunkLength > file.size - dataStart) break;
        if (chunkType === 'EXIF') {
          const chunk = await readBlobBytes(file, dataStart, chunkLength);
          const hasExifPrefix = new TextDecoder('latin1').decode(chunk.subarray(0, 6)) === 'Exif\0\0';
          Object.assign(metadata, readTiffExif(chunk, hasExifPrefix ? 6 : 0));
        }
        offset = dataStart + chunkLength + (chunkLength % 2);
      }
    }
  } catch (error) {
    console.warn('Metadata inspection could not complete:', error);
    metadata.inspectionSupported = false;
  }
  return metadata;
}

/**
 * 12. PURE CLIENT-SIDE BINARY ENCODERS (BMP, ICO, TIFF) & FAVICON GENERATOR
 */

export function isAvifSupported() {
  try {
    const c = document.createElement('canvas');
    c.width = 1;
    c.height = 1;
    return c.toDataURL('image/avif').startsWith('data:image/avif');
  } catch {
    return false;
  }
}

export function encodeBmp(canvas, bgColor = 'transparent') {
  const width = canvas.width;
  const height = canvas.height;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  const rowSize = Math.floor((24 * width + 31) / 32) * 4;
  const pixelArraySize = rowSize * height;
  const fileHeaderSize = 14;
  const dibHeaderSize = 40;
  const fileSize = fileHeaderSize + dibHeaderSize + pixelArraySize;

  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);

  // File Header ('BM')
  view.setUint8(0, 0x42);
  view.setUint8(1, 0x4d);
  view.setUint32(2, fileSize, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, 0, true);
  view.setUint32(10, fileHeaderSize + dibHeaderSize, true);

  // DIB Header (BITMAPINFOHEADER)
  view.setUint32(14, dibHeaderSize, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true);
  view.setUint16(26, 1, true);
  view.setUint16(28, 24, true);
  view.setUint32(30, 0, true);
  view.setUint32(34, pixelArraySize, true);
  view.setInt32(38, 2835, true);
  view.setInt32(42, 2835, true);
  view.setUint32(46, 0, true);
  view.setUint32(50, 0, true);

  let offset = 54;
  for (let y = height - 1; y >= 0; y--) {
    const rowStart = offset;
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const a = data[idx + 3] / 255;

      const finalR = Math.round(r * a + 255 * (1 - a));
      const finalG = Math.round(g * a + 255 * (1 - a));
      const finalB = Math.round(b * a + 255 * (1 - a));

      view.setUint8(offset++, finalB);
      view.setUint8(offset++, finalG);
      view.setUint8(offset++, finalR);
    }
    while ((offset - rowStart) % 4 !== 0) {
      view.setUint8(offset++, 0);
    }
  }

  return new Blob([buffer], { type: 'image/bmp' });
}

export async function encodeIcoFromCanvases(canvases) {
  const pngEntries = [];
  for (const canvas of canvases) {
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    const arrayBuffer = await blob.arrayBuffer();
    pngEntries.push({
      width: canvas.width,
      height: canvas.height,
      data: new Uint8Array(arrayBuffer),
      size: arrayBuffer.byteLength
    });
  }

  const numImages = pngEntries.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  const dirSize = numImages * dirEntrySize;
  let totalSize = headerSize + dirSize;
  for (const entry of pngEntries) {
    totalSize += entry.size;
  }

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  // ICONDIR Header
  view.setUint16(0, 0, true);
  view.setUint16(2, 1, true);
  view.setUint16(4, numImages, true);

  let currentOffset = headerSize + dirSize;

  for (let i = 0; i < numImages; i++) {
    const entry = pngEntries[i];
    const entryOffset = headerSize + i * dirEntrySize;

    view.setUint8(entryOffset, entry.width >= 256 ? 0 : entry.width);
    view.setUint8(entryOffset + 1, entry.height >= 256 ? 0 : entry.height);
    view.setUint8(entryOffset + 2, 0);
    view.setUint8(entryOffset + 3, 0);
    view.setUint16(entryOffset + 4, 1, true);
    view.setUint16(entryOffset + 6, 32, true);
    view.setUint32(entryOffset + 8, entry.size, true);
    view.setUint32(entryOffset + 12, currentOffset, true);

    new Uint8Array(buffer, currentOffset, entry.size).set(entry.data);
    currentOffset += entry.size;
  }

  return new Blob([buffer], { type: 'image/x-icon' });
}

export function encodeTiff(canvas) {
  const width = canvas.width;
  const height = canvas.height;
  const ctx = canvas.getContext('2d');
  const imgData = ctx.getImageData(0, 0, width, height);
  const data = imgData.data;

  const numTags = 11;
  const ifdOffset = 8;
  const ifdSize = 2 + numTags * 12 + 4;
  const valuesOffset = ifdOffset + ifdSize;
  const extraValuesSize = 24;
  const pixelOffset = valuesOffset + extraValuesSize;
  const pixelSize = width * height * 4;
  const fileSize = pixelOffset + pixelSize;

  const buffer = new ArrayBuffer(fileSize);
  const view = new DataView(buffer);
  const u8 = new Uint8Array(buffer);

  // TIFF Header (Little Endian "II", 42)
  view.setUint8(0, 0x49);
  view.setUint8(1, 0x49);
  view.setUint16(2, 42, true);
  view.setUint32(4, ifdOffset, true);

  view.setUint16(ifdOffset, numTags, true);

  const bitsPerSampleOffset = valuesOffset;
  const xResOffset = valuesOffset + 8;
  const yResOffset = valuesOffset + 16;

  view.setUint16(bitsPerSampleOffset, 8, true);
  view.setUint16(bitsPerSampleOffset + 2, 8, true);
  view.setUint16(bitsPerSampleOffset + 4, 8, true);
  view.setUint16(bitsPerSampleOffset + 6, 8, true);

  view.setUint32(xResOffset, 72, true);
  view.setUint32(xResOffset + 4, 1, true);

  view.setUint32(yResOffset, 72, true);
  view.setUint32(yResOffset + 4, 1, true);

  let tagPos = ifdOffset + 2;
  const writeTag = (tag, type, count, valOrOffset) => {
    view.setUint16(tagPos, tag, true);
    view.setUint16(tagPos + 2, type, true);
    view.setUint32(tagPos + 4, count, true);
    view.setUint32(tagPos + 8, valOrOffset, true);
    tagPos += 12;
  };

  writeTag(256, 3, 1, width);
  writeTag(257, 3, 1, height);
  writeTag(258, 3, 4, bitsPerSampleOffset);
  writeTag(259, 3, 1, 1);
  writeTag(262, 3, 1, 2);
  writeTag(273, 4, 1, pixelOffset);
  writeTag(277, 3, 1, 4);
  writeTag(278, 3, 1, height);
  writeTag(279, 4, 1, pixelSize);
  writeTag(282, 5, 1, xResOffset);
  writeTag(283, 5, 1, yResOffset);

  view.setUint32(tagPos, 0, true);
  u8.set(data, pixelOffset);

  return new Blob([buffer], { type: 'image/tiff' });
}

export async function generateFavicon(img, {
  preset = 'package',
  bgColor = 'transparent',
  radius = 0
} = {}) {
  const makeIconCanvas = (targetDim) => {
    const c = document.createElement('canvas');
    c.width = targetDim;
    c.height = targetDim;
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    if (bgColor && bgColor !== 'transparent') {
      ctx.fillStyle = bgColor;
      if (radius > 0 && ctx.roundRect) {
        const scaledR = (radius / 100) * (targetDim / 2);
        ctx.beginPath();
        ctx.roundRect(0, 0, targetDim, targetDim, scaledR);
        ctx.fill();
        ctx.clip();
      } else {
        ctx.fillRect(0, 0, targetDim, targetDim);
      }
    } else if (radius > 0 && ctx.roundRect) {
      const scaledR = (radius / 100) * (targetDim / 2);
      ctx.beginPath();
      ctx.roundRect(0, 0, targetDim, targetDim, scaledR);
      ctx.clip();
    }

    const imgW = img.naturalWidth || img.width;
    const imgH = img.naturalHeight || img.height;
    const minD = Math.min(imgW, imgH);
    const srcX = (imgW - minD) / 2;
    const srcY = (imgH - minD) / 2;

    ctx.drawImage(img, srcX, srcY, minD, minD, 0, 0, targetDim, targetDim);
    return c;
  };

  const makeManifest = () => JSON.stringify({
    name: 'My Web App',
    short_name: 'App',
    icons: [
      {
        src: '/android-chrome-192x192.png',
        sizes: '192x192',
        type: 'image/png'
      },
      {
        src: '/android-chrome-512x512.png',
        sizes: '512x512',
        type: 'image/png'
      }
    ],
    theme_color: bgColor === 'transparent' ? '#ffffff' : bgColor,
    background_color: bgColor === 'transparent' ? '#ffffff' : bgColor,
    display: 'standalone'
  }, null, 2);

  // 1. Complete Favicon Package (ZIP with 7 files)
  if (preset === 'package') {
    const c16 = makeIconCanvas(16);
    const c32 = makeIconCanvas(32);
    const c48 = makeIconCanvas(48);
    const c180 = makeIconCanvas(180);
    const c192 = makeIconCanvas(192);
    const c512 = makeIconCanvas(512);

    const [icoBlob, png16, png32, png180, png192, png512] = await Promise.all([
      encodeIcoFromCanvases([c16, c32, c48]),
      new Promise((r) => c16.toBlob(r, 'image/png')),
      new Promise((r) => c32.toBlob(r, 'image/png')),
      new Promise((r) => c180.toBlob(r, 'image/png')),
      new Promise((r) => c192.toBlob(r, 'image/png')),
      new Promise((r) => c512.toBlob(r, 'image/png'))
    ]);

    const manifestContent = makeManifest();

    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    zip.file('favicon.ico', icoBlob);
    zip.file('favicon-16x16.png', png16);
    zip.file('favicon-32x32.png', png32);
    zip.file('apple-touch-icon.png', png180);
    zip.file('android-chrome-192x192.png', png192);
    zip.file('android-chrome-512x512.png', png512);
    zip.file('site.webmanifest', manifestContent);

    const zipBlob = await zip.generateAsync({ type: 'blob' });

    return {
      blob: zipBlob,
      url: URL.createObjectURL(png180),
      width: 512,
      height: 512,
      size: zipBlob.size,
      filename: 'favicon_package.zip',
      isZip: true,
      fileCount: 7,
      previewUrls: {
        16: URL.createObjectURL(png16),
        32: URL.createObjectURL(png32),
        48: URL.createObjectURL(png32),
        180: URL.createObjectURL(png180),
        192: URL.createObjectURL(png192),
        512: URL.createObjectURL(png512)
      }
    };
  }

  // 2. Multi-size ICO (16x16, 32x32, 48x48)
  if (preset === 'ico') {
    const c16 = makeIconCanvas(16);
    const c32 = makeIconCanvas(32);
    const c48 = makeIconCanvas(48);
    const icoBlob = await encodeIcoFromCanvases([c16, c32, c48]);
    const previewBlob = await new Promise((r) => c48.toBlob(r, 'image/png'));
    return {
      blob: icoBlob,
      url: URL.createObjectURL(previewBlob),
      width: 48,
      height: 48,
      size: icoBlob.size,
      filename: 'favicon.ico',
      isIco: true
    };
  }

  // 3. Individual PNG formats (16, 32, 180, 192, 512)
  const dim = parseInt(preset, 10) || 32;
  const c = makeIconCanvas(dim);
  const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
  const filename = dim === 180
    ? 'apple-touch-icon.png'
    : (dim === 192 || dim === 512)
    ? `android-chrome-${dim}x${dim}.png`
    : `favicon-${dim}x${dim}.png`;

  return {
    blob,
    url: URL.createObjectURL(blob),
    width: dim,
    height: dim,
    size: blob.size,
    filename,
    isIco: false
  };
}

/**
 * 14. REMOVE BACKGROUND
 * Hybrid 4-step pipeline: border median estimation -> color distance map -> border flood-fill -> soft alpha unmixing
 */
export async function removeBackgroundImage(img, options = {}) {
  const width = Math.max(1, img.naturalWidth || img.width);
  const height = Math.max(1, img.naturalHeight || img.height);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, width, height);

  const imgData = ctx.getImageData(0, 0, width, height);
  const worker = getBgWorker();

  let processedImgData = null;
  let estimatedBg = null;

  if (worker) {
    const id = ++workerMsgId;
    processedImgData = await new Promise((resolve) => {
      const handler = (e) => {
        if (e.data && e.data.id === id) {
          worker.removeEventListener('message', handler);
          if (e.data.success && e.data.buffer) {
            estimatedBg = e.data.estimatedBg;
            const clamped = new Uint8ClampedArray(e.data.buffer);
            resolve(new ImageData(clamped, width, height));
          } else {
            // Fallback to local synchronous execution
            const res = processBackgroundRemoval(imgData, options);
            estimatedBg = res.estimatedBg;
            resolve(res.imgData);
          }
        }
      };
      worker.addEventListener('message', handler);
      // Transfer the buffer for zero-copy high speed
      worker.postMessage(
        { id, width, height, buffer: imgData.data.buffer, options },
        [imgData.data.buffer]
      );
    });
  } else {
    const res = processBackgroundRemoval(imgData, options);
    processedImgData = res.imgData;
    estimatedBg = res.estimatedBg;
  }

  ctx.putImageData(processedImgData, 0, 0);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve({
        blob,
        url: URL.createObjectURL(blob),
        width,
        height,
        size: blob ? blob.size : 0,
        estimatedBg,
        estimatedBgHex: estimatedBg ? rgbToHex(estimatedBg) : null
      });
    }, 'image/png');
  });
}

export { rgbToHex, hexToRgb };

