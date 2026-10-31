// lib/sentinel/validate.ts
// Input validation for coordinates, AOI size and dates.
import { LIMITS } from "./config";

export class ValidationError extends Error {}

export type Bbox = [number, number, number, number]; // minLon,minLat,maxLon,maxLat

// Approximate AOI size in km (good enough for limit checks only;
// area statistics later use the real raster geometry).
export function bboxSizeKm(b: Bbox) {
  const midLat = (b[1] + b[3]) / 2;
  return {
    widthKm: (b[2] - b[0]) * 111.32 * Math.cos((midLat * Math.PI) / 180),
    heightKm: (b[3] - b[1]) * 111.2,
  };
}

export function parseBbox(raw: string | null): Bbox {
  if (!raw) throw new ValidationError("bbox is required: minLon,minLat,maxLon,maxLat");
  const p = raw.split(",").map((s) => Number(s.trim()));
  if (p.length !== 4 || p.some((n) => !Number.isFinite(n)))
    throw new ValidationError("bbox must be four numbers: minLon,minLat,maxLon,maxLat");
  const [minLon, minLat, maxLon, maxLat] = p;
  if (minLon < -180 || maxLon > 180) throw new ValidationError("Longitude must be between -180 and 180.");
  if (minLat < -90 || maxLat > 90) throw new ValidationError("Latitude must be between -90 and 90.");
  if (minLon >= maxLon || minLat >= maxLat)
    throw new ValidationError("bbox minimums must be smaller than maximums.");
  const b: Bbox = [minLon, minLat, maxLon, maxLat];
  const { widthKm, heightKm } = bboxSizeKm(b);
  if (Math.max(widthKm, heightKm) > LIMITS.maxAoiSideKm)
    throw new ValidationError(`AOI is too large (max ${LIMITS.maxAoiSideKm} km per side).`);
  if (Math.min(widthKm, heightKm) < LIMITS.minAoiSideKm)
    throw new ValidationError(`AOI is too small (min ${LIMITS.minAoiSideKm} km per side).`);
  return b;
}

// Sentinel-2A launched 2015-06-23; no L2A data can exist before this.
const EARLIEST = Date.UTC(2015, 5, 23);

export function parseDate(raw: string | null, name: string): string {
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw))
    throw new ValidationError(`${name} must be a date in YYYY-MM-DD format.`);
  const [y, m, d] = raw.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d);
  const dt = new Date(t);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d)
    throw new ValidationError(`${name} is not a real calendar date.`);
  if (t < EARLIEST) throw new ValidationError(`${name} is before Sentinel-2 operations began (2015-06-23).`);
  if (t > Date.now()) throw new ValidationError(`${name} is in the future.`);
  return raw;
}

export function parseDateRange(start: string | null, end: string | null) {
  const s = parseDate(start, "start");
  const e = parseDate(end, "end");
  if (s > e) throw new ValidationError("start must not be after end.");
  const days = (Date.parse(e) - Date.parse(s)) / 86400000;
  if (days > 366) throw new ValidationError("Date range is too long (max 366 days).");
  return { start: s, end: e };
}

export function parseCloud(raw: string | null): number {
  if (raw === null || raw === "") return LIMITS.maxSceneCloudCover;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100)
    throw new ValidationError("maxCloud must be a number from 0 to 100.");
  return n;
}