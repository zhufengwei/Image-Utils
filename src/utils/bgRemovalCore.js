/**
 * bgRemovalCore.js
 *
 * High-performance 4-step background removal algorithm:
 * 1. Border-median background color estimation
 * 2. Fast Euclidean RGB distance field
 * 3. Contiguous border flood fill (protects foreground subjects) or global color mask
 * 4. Soft alpha feathering + color unmixing (halo eliminator)
 */

/**
 * Auto-estimates background color by taking the median of border pixels
 */
export function estimateBg(data, w, h) {
  const ch = [[], [], []];
  const step = Math.max(1, Math.floor((w + h) / 1000));
  const add = (x, y) => {
    const p = (y * w + x) * 4;
    if (data[p + 3] > 20) {
      for (let c = 0; c < 3; c++) ch[c].push(data[p + c]);
    }
  };

  for (let x = 0; x < w; x += step) {
    add(x, 0);
    add(x, h - 1);
  }
  for (let y = 0; y < h; y += step) {
    add(0, y);
    add(w - 1, y);
  }

  if (ch[0].length === 0) return [255, 255, 255];

  return ch.map((a) => {
    a.sort((p, q) => p - q);
    return a[a.length >> 1];
  });
}

/**
 * Convert RGB array [r, g, b] to hex string #rrggbb
 */
export function rgbToHex([r, g, b]) {
  return (
    '#' +
    [r, g, b]
      .map((x) => {
        const hex = Math.max(0, Math.min(255, Math.round(x))).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
      })
      .join('')
  );
}

/**
 * Convert hex string #rrggbb or #rgb to RGB array [r, g, b]
 */
export function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return null;
  const clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16),
      parseInt(clean[1] + clean[1], 16),
      parseInt(clean[2] + clean[2], 16)
    ];
  }
  if (clean.length === 6) {
    return [
      parseInt(clean.slice(0, 2), 16),
      parseInt(clean.slice(2, 4), 16),
      parseInt(clean.slice(4, 6), 16)
    ];
  }
  return null;
}

/**
 * Process ImageData to remove background
 */
export function processBackgroundRemoval(imgData, options = {}) {
  const {
    tolerance = 40,
    feather = 0.5,
    mode = 'contiguous', // 'contiguous' | 'global'
    bg = null,           // [r, g, b] | null
    seed = null,         // { x, y } | null
    colorUnmix = true
  } = options;

  const { width: w, height: h, data } = imgData;
  const n = w * h;
  const targetBg = Array.isArray(bg) && bg.length === 3 ? bg : estimateBg(data, w, h);

  const high = Math.max(1, tolerance);
  const low = Math.max(0, high * (1 - Math.max(0, Math.min(1, feather))));

  // 1. Distance map
  const dist = new Float32Array(n);
  const bgR = targetBg[0];
  const bgG = targetBg[1];
  const bgB = targetBg[2];

  for (let i = 0; i < n; i++) {
    const p = i * 4;
    if (data[p + 3] === 0) {
      dist[i] = 0;
      continue;
    }
    const dr = data[p] - bgR;
    const dg = data[p + 1] - bgG;
    const db = data[p + 2] - bgB;
    dist[i] = Math.sqrt(dr * dr + dg * dg + db * db);
  }

  // 2. Determine background pixels
  const isBg = new Uint8Array(n);

  if (mode === 'global') {
    for (let i = 0; i < n; i++) {
      if (dist[i] < high) isBg[i] = 1;
    }
  } else {
    // Contiguous border flood fill
    const stack = new Int32Array(n);
    let sp = 0;
    const push = (i) => {
      if (!isBg[i] && dist[i] < high) {
        isBg[i] = 1;
        stack[sp++] = i;
      }
    };

    // Push all border pixels
    for (let x = 0; x < w; x++) {
      push(x);
      push((h - 1) * w + x);
    }
    for (let y = 0; y < h; y++) {
      push(y * w);
      push(y * w + w - 1);
    }

    // Optional user seed point
    if (seed && seed.x >= 0 && seed.x < w && seed.y >= 0 && seed.y < h) {
      push(Math.floor(seed.y) * w + Math.floor(seed.x));
    }

    while (sp > 0) {
      const i = stack[--sp];
      const x = i % w;
      if (x > 0) push(i - 1);
      if (x < w - 1) push(i + 1);
      if (i >= w) push(i - w);
      if (i < n - w) push(i + w);
    }
  }

  // 3. Soft alpha + anti-halo color unmixing
  const range = high - low;

  for (let i = 0; i < n; i++) {
    if (!isBg[i]) continue;
    const p = i * 4;
    const origAlpha = data[p + 3] / 255;
    if (origAlpha <= 0) continue;

    let a;
    if (range <= 0.001) {
      a = dist[i] < high ? 0 : 1;
    } else {
      a = (dist[i] - low) / range;
      a = a < 0 ? 0 : a > 1 ? 1 : a;
    }

    if (a > 0 && a < 1 && colorUnmix) {
      for (let c = 0; c < 3; c++) {
        const f = (data[p + c] - (1 - a) * targetBg[c]) / a;
        data[p + c] = f < 0 ? 0 : f > 255 ? 255 : Math.round(f);
      }
    }

    data[p + 3] = Math.round(a * origAlpha * 255);
  }

  return { imgData, estimatedBg: targetBg };
}

