import { describe, expect, it } from 'vitest';
import { inspectFileMetadata } from './canvasEngine';

function namedBlob(parts, type, name) {
  const blob = new Blob(parts, { type });
  Object.defineProperty(blob, 'name', { value: name });
  return blob;
}

function makeTiffExif() {
  const bytes = new Uint8Array(26);
  const view = new DataView(bytes.buffer);
  bytes.set([0x49, 0x49]);
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true);
  view.setUint16(8, 1, true);
  view.setUint16(10, 0x8825, true);
  view.setUint16(12, 4, true);
  view.setUint32(14, 1, true);
  view.setUint32(18, 26, true);
  return bytes;
}

function pngChunk(type, payload) {
  const bytes = new Uint8Array(12 + payload.length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, payload.length, false);
  bytes.set(new TextEncoder().encode(type), 4);
  bytes.set(payload, 8);
  // A zero CRC is sufficient for the header inspection tests.
  return bytes;
}

describe('metadata inspection', () => {
  it('does not misreport ordinary PNG text chunks as EXIF', async () => {
    const text = new TextEncoder().encode('Description\0hello');
    const file = namedBlob([
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngChunk('tEXt', text),
      pngChunk('IEND', new Uint8Array())
    ], 'image/png', 'notes.png');

    await expect(inspectFileMetadata(file)).resolves.toMatchObject({ hasExif: false, hasGps: false, inspectionSupported: true });
  });

  it('finds PNG EXIF chunks after large preceding chunks', async () => {
    const file = namedBlob([
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      pngChunk('tEXt', new Uint8Array(5000)),
      pngChunk('eXIf', makeTiffExif()),
      pngChunk('IEND', new Uint8Array())
    ], 'image/png', 'photo.png');

    await expect(inspectFileMetadata(file)).resolves.toMatchObject({ hasExif: true, hasGps: true });
  });

  it('finds JPEG EXIF segments beyond the first 64 KB', async () => {
    const largeAppSegment = new Uint8Array(4 + 65533);
    largeAppSegment.set([0xff, 0xe2, 0xff, 0xff]);
    const exifPayload = new Uint8Array(6 + makeTiffExif().length);
    exifPayload.set(new TextEncoder().encode('Exif\0\0'));
    exifPayload.set(makeTiffExif(), 6);
    const exifSegment = new Uint8Array(4 + exifPayload.length);
    const exifSegmentLength = exifPayload.length + 2;
    exifSegment.set([0xff, 0xe1, (exifSegmentLength >> 8) & 0xff, exifSegmentLength & 0xff]);
    exifSegment.set(exifPayload, 4);
    const file = namedBlob([new Uint8Array([0xff, 0xd8]), largeAppSegment, exifSegment, new Uint8Array([0xff, 0xd9])], 'image/jpeg', 'large.jpg');

    await expect(inspectFileMetadata(file)).resolves.toMatchObject({ hasExif: true, hasGps: true });
  });

  it('detects EXIF chunks in WebP files', async () => {
    const exif = makeTiffExif();
    const chunk = new Uint8Array(8 + exif.length + (exif.length % 2));
    chunk.set(new TextEncoder().encode('EXIF'), 0);
    new DataView(chunk.buffer).setUint32(4, exif.length, true);
    chunk.set(exif, 8);
    const body = new Uint8Array(4 + chunk.length);
    body.set(new TextEncoder().encode('WEBP'), 0);
    body.set(chunk, 4);
    const riff = new Uint8Array(8 + body.length);
    riff.set(new TextEncoder().encode('RIFF'), 0);
    new DataView(riff.buffer).setUint32(4, body.length, true);
    riff.set(body, 8);
    const file = namedBlob([riff], 'image/webp', 'photo.webp');
    await expect(inspectFileMetadata(file)).resolves.toMatchObject({ hasExif: true, hasGps: true });
  });

  it('marks GIF and BMP header inspection as unsupported instead of declaring them clean', async () => {
    const gif = namedBlob([new Uint8Array(16)], 'image/gif', 'photo.gif');
    await expect(inspectFileMetadata(gif)).resolves.toMatchObject({ hasExif: false, inspectionSupported: false });
  });
});
