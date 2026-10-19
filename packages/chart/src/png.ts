/**
 * A picture as a PNG data: URI, with nothing but plain code (no canvas, no zlib): the colours of a map
 * are a picture the SVG stretches over its plot area, the same in the browser, in print and in node.
 * The data is stored, not compressed (deflate blocks of the "stored" kind).
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array, from: number, to: number): number {
  let c = 0xffffffff;
  for (let i = from; i < to; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b, c] = [bytes[i]!, bytes[i + 1], bytes[i + 2]];
    const n = (a << 16) | ((b ?? 0) << 8) | (c ?? 0);
    out += BASE64[(n >> 18) & 63]! + BASE64[(n >> 12) & 63]! + (b === undefined ? '=' : BASE64[(n >> 6) & 63]!) + (c === undefined ? '=' : BASE64[n & 63]!);
  }
  return out;
}

/** A width × height picture of RGBA pixels, row by row from the top, as a data: URI. */
export function pngDataUri(width: number, height: number, rgba: Uint8Array): string {
  // The rows, each after its filter byte (0: none).
  const row = width * 4;
  const raw = new Uint8Array((row + 1) * height);
  for (let y = 0; y < height; y++) raw.set(rgba.subarray(y * row, (y + 1) * row), y * (row + 1) + 1);
  // zlib: a header, stored blocks of at most 65535 bytes, the Adler-32 of the data.
  const blocks = Math.max(1, Math.ceil(raw.length / 65535));
  const zlib = new Uint8Array(2 + raw.length + blocks * 5 + 4);
  zlib[0] = 0x78;
  zlib[1] = 0x01;
  let at = 2;
  for (let k = 0; k < blocks; k++) {
    const part = raw.subarray(k * 65535, Math.min(raw.length, (k + 1) * 65535));
    zlib[at] = k === blocks - 1 ? 1 : 0;
    zlib[at + 1] = part.length & 0xff;
    zlib[at + 2] = part.length >> 8;
    zlib[at + 3] = ~part.length & 0xff;
    zlib[at + 4] = (~part.length >> 8) & 0xff;
    zlib.set(part, at + 5);
    at += 5 + part.length;
  }
  let [s1, s2] = [1, 0];
  for (const b of raw) {
    s1 = (s1 + b) % 65521;
    s2 = (s2 + s1) % 65521;
  }
  const adler = ((s2 << 16) | s1) >>> 0;
  zlib.set([adler >>> 24, (adler >>> 16) & 0xff, (adler >>> 8) & 0xff, adler & 0xff], at);
  // The chunks: IHDR (size, 8 bits, RGBA), IDAT, IEND.
  const chunk = (type: string, data: Uint8Array): Uint8Array => {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32(out, 4, 8 + data.length));
    return out;
  };
  const header = new Uint8Array(13);
  const hv = new DataView(header.buffer);
  hv.setUint32(0, width);
  hv.setUint32(4, height);
  header.set([8, 6, 0, 0, 0], 8);
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib), chunk('IEND', new Uint8Array(0))];
  const png = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    png.set(p, offset);
    offset += p.length;
  }
  return `data:image/png;base64,${base64(png)}`;
}
