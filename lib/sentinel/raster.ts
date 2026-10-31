// lib/sentinel/raster.ts
// Fetch real band crops (GeoTIFF) for an AOI, decode them, and encode PNGs.
import { fromArrayBuffer } from "geotiff";
import { deflateSync } from "node:zlib";
import { COLLECTION, DATA_BBOX_URL } from "./config";
import { DataError, fetchWithTimeout } from "./stac";
import type { Bbox } from "./validate";

export type Grid = { width: number; height: number; bbox: Bbox };

// Output grid with roughly square ground pixels; longest side = maxPixels.
export function gridFor(bbox: Bbox, maxPixels: number): Grid {
  const midLat = (bbox[1] + bbox[3]) / 2;
  const w = (bbox[2] - bbox[0]) * Math.cos((midLat * Math.PI) / 180);
  const h = bbox[3] - bbox[1];
  const s = maxPixels / Math.max(w, h);
  return { width: Math.max(2, Math.round(w * s)), height: Math.max(2, Math.round(h * s)), bbox };
}

export type Pixels = ArrayLike<number>;

// Returns one array per requested asset (same order) plus the validity mask
// band the API appends (null if absent).
export async function fetchBands(
  sceneId: string,
  assets: string[],
  grid: Grid,
  resampling: "nearest" | "bilinear"
): Promise<{ bands: Pixels[]; mask: Pixels | null }> {
  const url =
    `${DATA_BBOX_URL}/${grid.bbox.join(",")}/${grid.width}x${grid.height}.tif` +
    `?collection=${COLLECTION}&item=${encodeURIComponent(sceneId)}` +
    assets.map((a) => `&assets=${a}`).join("") +
    `&asset_as_band=true&resampling=${resampling}`;

  const res = await fetchWithTimeout(url);
  const buf = await res.arrayBuffer();

  try {
    const tiff = await fromArrayBuffer(buf);
    const img = await tiff.getImage();
    if (img.getWidth() !== grid.width || img.getHeight() !== grid.height)
      throw new Error("size mismatch");
    const n = img.getSamplesPerPixel();
    if (n !== assets.length && n !== assets.length + 1) throw new Error("band count mismatch");
    const r = (await img.readRasters()) as unknown as Pixels[];
    const bands: Pixels[] = [];
    for (let i = 0; i < assets.length; i++) bands.push(r[i]);
    return { bands, mask: n === assets.length + 1 ? r[n - 1] : null };
  } catch {
    throw new DataError("The imagery service returned a raster that could not be read.", 502);
  }
}

// ---- Minimal PNG encoder (RGBA, 8-bit) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

export function encodePngDataUrl(rgba: Uint8Array, w: number, h: number): string {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    raw[y * stride] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * stride + 1);
  }
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString("base64")}`;
}