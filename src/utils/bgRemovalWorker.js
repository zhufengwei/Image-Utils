/**
 * bgRemovalWorker.js
 *
 * Web Worker for running background removal off the main browser thread.
 */
import { processBackgroundRemoval } from './bgRemovalCore';

self.onmessage = function (e) {
  const { id, width, height, buffer, options } = e.data;
  try {
    const clampedArray = new Uint8ClampedArray(buffer);
    const imgData = new ImageData(clampedArray, width, height);

    const { estimatedBg } = processBackgroundRemoval(imgData, options);

    // Post back the modified buffer as a transferable object for zero-copy performance
    self.postMessage(
      {
        id,
        success: true,
        buffer: imgData.data.buffer,
        width,
        height,
        estimatedBg
      },
      [imgData.data.buffer]
    );
  } catch (err) {
    self.postMessage({
      id,
      success: false,
      error: err.message || 'Background removal processing failed'
    });
  }
};

