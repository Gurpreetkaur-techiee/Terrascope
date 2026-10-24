/**
 * GET /api/fires
 *
 * Server-side proxy for NASA FIRMS active-fire detections (CSV -> validated JSON).
 * - The MAP_KEY is read from process.env.FIRMS_MAP_KEY on the server only. It is never
 *   returned to the client, never put in an error message and never logged.
 * - Network calls live in a `'use cache'` helper (this project enables `cacheComponents`),
 *   so identical requests are served from Next's cache instead of hitting NASA again.
 *
 * Query parameters (all optional):
 *   bbox   "west,south,east,north" in degrees, max 10° x 10°   (default: Punjab, India test box)
 *   source VIIRS_SNPP_NRT | VIIRS_NOAA20_NRT | MODIS_NRT        (default: VIIRS_SNPP_NRT)
 *   days   1-3                                                  (default: 1)
 *   limit  1-2000, most intense (highest FRP) detections first  (default: 500)
 */
import { cacheLife } from "next/cache";

const FIRMS_BASE = "https://firms.modaps.eosdis.nasa.gov/api/area/csv";
const SOURCES = ["VIIRS_SNPP_NRT", "VIIRS_NOAA20_NRT", "MODIS_NRT"] as const;
type Source = (typeof SOURCES)[number];

const DEFAULT_BBOX = "73.8,29.5,76.9,32.5";
const MAX_SPAN_DEG = 10;
const MAX_DAYS = 3;
const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 2000;
const MAX_PARSED_ROWS = 20000;
const MAX_BODY_CHARS = 8_000_000;
const UPSTREAM_TIMEOUT_MS = 10_000;

export type Fire = {
  latitude: number;
  longitude: number;
  acqDate: string; // YYYY-MM-DD (UTC)
  acqTime: string; // HHMM (UTC)
  acquiredAt: string | null; // ISO 8601, UTC
  confidence: "low" | "nominal" | "high" | null;
  confidencePercent: number | null; // MODIS only
  frp: number | null; // fire radiative power, MW
  brightness: number | null; // Kelvin (VIIRS bright_ti4 / MODIS brightness)
  satellite: string | null;
  instrument: string | null;
  dayNight: "day" | "night" | null;
};

type FiresPayload = {
  fetchedAt: string;
  total: number; // valid detections found
  skippedRows: number; // malformed rows ignored
  fires: Fire[]; // sorted by FRP, highest first
};

type Params = { source: Source; bbox: [number, number, number, number]; days: number; limit: number };

const json = (body: unknown, status = 200, cache = "no-store") =>
  Response.json(body, { status, headers: { "Cache-Control": cache } });

const errorBody = (code: string, message: string, details?: string[]) => ({
  error: { code, message, ...(details ? { details } : {}) },
});

/* ------------------------------ input validation ------------------------------ */

function parseParams(sp: URLSearchParams): { ok: true; value: Params } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  const source = (sp.get("source") ?? "VIIRS_SNPP_NRT") as Source;
  if (!SOURCES.includes(source)) errors.push(`source must be one of: ${SOURCES.join(", ")}`);

  const rawBbox = sp.get("bbox") ?? DEFAULT_BBOX;
  const parts = rawBbox.split(",").map((p) => p.trim());
  const nums = parts.map((p) => (p === "" ? NaN : Number(p)));
  let bbox: [number, number, number, number] = [0, 0, 0, 0];
  if (nums.length !== 4 || nums.some((n) => !Number.isFinite(n))) {
    errors.push("bbox must be four numbers: west,south,east,north");
  } else {
    const [w, s, e, n] = nums.map((x) => Math.round(x * 1000) / 1000); // rounding keeps cache keys tidy
    if (w < -180 || e > 180 || s < -90 || n > 90) errors.push("bbox is outside valid ranges (lon -180..180, lat -90..90)");
    else if (w >= e || s >= n) errors.push("bbox must satisfy west < east and south < north");
    else if (e - w > MAX_SPAN_DEG || n - s > MAX_SPAN_DEG) errors.push(`bbox may span at most ${MAX_SPAN_DEG}° in each direction`);
    else bbox = [w, s, e, n];
  }

  const rawDays = sp.get("days") ?? "1";
  const days = Number(rawDays);
  if (!/^\d+$/.test(rawDays) || days < 1 || days > MAX_DAYS) errors.push(`days must be an integer from 1 to ${MAX_DAYS}`);

  const rawLimit = sp.get("limit") ?? String(DEFAULT_LIMIT);
  const limit = Number(rawLimit);
  if (!/^\d+$/.test(rawLimit) || limit < 1 || limit > MAX_LIMIT) errors.push(`limit must be an integer from 1 to ${MAX_LIMIT}`);

  return errors.length ? { ok: false, errors } : { ok: true, value: { source, bbox, days, limit } };
}

/* ------------------------------ key handling (server only) ------------------------------ */

const KEY_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
const readKey = () => (process.env.FIRMS_MAP_KEY ?? "").trim();

// Test hook: only a local mock server may replace the official NASA host, so the key can never be sent elsewhere.
function baseUrl(): string {
  const override = process.env.FIRMS_BASE_URL;
  if (override) {
    try {
      const u = new URL(override);
      if (u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "localhost")) return override.replace(/\/$/, "");
    } catch {
      /* fall through to the official host */
    }
  }
  return FIRMS_BASE;
}

/* ------------------------------ CSV parsing ------------------------------ */

const num = (v: string | undefined): number | null => {
  if (v === undefined || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function parseCsv(text: string): { fires: Fire[]; skipped: number } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  const header = lines[0]?.split(",").map((h) => h.trim().toLowerCase()) ?? [];
  const col = (name: string) => header.indexOf(name);
  const iLat = col("latitude"), iLon = col("longitude");
  if (iLat < 0 || iLon < 0) throw new Error("upstream_unexpected");

  const iDate = col("acq_date"), iTime = col("acq_time"), iConf = col("confidence"), iFrp = col("frp");
  const iBright = col("bright_ti4") >= 0 ? col("bright_ti4") : col("brightness");
  const iSat = col("satellite"), iInst = col("instrument"), iDn = col("daynight");

  const fires: Fire[] = [];
  let skipped = 0;
  for (const line of lines.slice(1)) {
    const c = line.split(","); // FIRMS CSV has no quoted fields
    const lat = num(c[iLat]), lon = num(c[iLon]);
    if (c.length !== header.length || lat === null || lon === null || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      skipped++;
      continue;
    }
    const acqDate = iDate >= 0 && /^\d{4}-\d{2}-\d{2}$/.test(c[iDate]) ? c[iDate] : "";
    const rawTime = iTime >= 0 ? c[iTime].trim().padStart(4, "0") : "";
    const acqTime = /^([01]\d|2[0-3])[0-5]\d$/.test(rawTime) ? rawTime : "";

    const rawConf = iConf >= 0 ? c[iConf].trim().toLowerCase() : "";
    let confidence: Fire["confidence"] = null;
    let confidencePercent: number | null = null;
    if (rawConf === "l" || rawConf === "low") confidence = "low";
    else if (rawConf === "n" || rawConf === "nominal") confidence = "nominal";
    else if (rawConf === "h" || rawConf === "high") confidence = "high";
    else if (/^\d{1,3}$/.test(rawConf) && Number(rawConf) <= 100) {
      confidencePercent = Number(rawConf); // MODIS: 0-100 %
      confidence = confidencePercent >= 80 ? "high" : confidencePercent >= 30 ? "nominal" : "low";
    }

    const dn = iDn >= 0 ? c[iDn].trim().toUpperCase() : "";
    fires.push({
      latitude: lat,
      longitude: lon,
      acqDate,
      acqTime,
      acquiredAt: acqDate && acqTime ? `${acqDate}T${acqTime.slice(0, 2)}:${acqTime.slice(2)}:00Z` : null,
      confidence,
      confidencePercent,
      frp: iFrp >= 0 ? num(c[iFrp]) : null,
      brightness: iBright >= 0 ? num(c[iBright]) : null,
      satellite: iSat >= 0 && c[iSat].trim() ? c[iSat].trim() : null,
      instrument: iInst >= 0 && c[iInst].trim() ? c[iInst].trim() : null,
      dayNight: dn === "D" ? "day" : dn === "N" ? "night" : null,
    });
    if (fires.length >= MAX_PARSED_ROWS) break;
  }
  // If there were data rows but none were usable, the upstream body was malformed.
  if (fires.length === 0 && skipped > 0) throw new Error("upstream_malformed");
  fires.sort((a, b) => (b.frp ?? -1) - (a.frp ?? -1));
  return { fires, skipped };
}

/* ------------------------------ cached upstream call ------------------------------ */

// Does the real work and throws coded Errors (message = error code) on any failure.
async function loadFires(source: Source, west: number, south: number, east: number, north: number, days: number): Promise<FiresPayload> {
  const key = readKey();
  if (!KEY_PATTERN.test(key)) throw new Error("not_configured");

  let res: Response;
  try {
    res = await fetch(`${baseUrl()}/${key}/${source}/${west},${south},${east},${north}/${days}`, {
      headers: { Accept: "text/csv" },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    throw new Error(name === "TimeoutError" || name === "AbortError" ? "upstream_timeout" : "upstream_unreachable");
  }

  if (res.status === 401 || res.status === 403) throw new Error("upstream_auth");
  if (res.status === 429) throw new Error("upstream_rate_limited");
  if (!res.ok) throw new Error("upstream_error");

  const text = await res.text();
  if (text.length > MAX_BODY_CHARS) throw new Error("upstream_too_large");
  // FIRMS can answer 200 with a plain-text error (bad key, quota). A real response starts with a CSV header.
  const firstLine = (text.split(/\r?\n/).find((l) => l.trim() !== "") ?? "").toLowerCase();
  if (!firstLine.includes("latitude") || !firstLine.includes("longitude")) throw new Error("upstream_unexpected");

  const { fires, skipped } = parseCsv(text);
  return { fetchedAt: new Date().toISOString(), total: fires.length, skippedRows: skipped, fires };
}

type FetchResult = { ok: true; data: FiresPayload } | { ok: false; code: string };

// Cached wrapper. Takes only plain arguments (they form the cache key). Next.js strips the message from errors
// thrown across a cache boundary, so failures are returned as data instead, with a much shorter cache life.
async function fetchFires(source: Source, west: number, south: number, east: number, north: number, days: number): Promise<FetchResult> {
  "use cache";
  let result: FetchResult;
  try {
    result = { ok: true, data: await loadFires(source, west, south, east, north, days) };
  } catch (e) {
    result = { ok: false, code: e instanceof Error ? e.message : "internal_error" };
  }
  if (result.ok) cacheLife({ stale: 300, revalidate: 600, expire: 3600 }); // NRT data: refresh every 10 min, keep at most 1 h
  else cacheLife({ stale: 0, revalidate: 30, expire: 60 }); // failures: retry soon, but don't hammer NASA
  return result;
}

/* ------------------------------ handler ------------------------------ */

const UPSTREAM_ERRORS: Record<string, [number, string]> = {
  not_configured: [500, "FIRMS_MAP_KEY is missing or malformed on the server. Check .env.local and restart the dev server."],
  upstream_auth: [502, "NASA FIRMS rejected the API key (invalid, expired or over its request quota)."],
  upstream_rate_limited: [503, "NASA FIRMS is rate-limiting requests. Try again in a few minutes."],
  upstream_timeout: [504, "NASA FIRMS did not respond in time."],
  upstream_unreachable: [502, "Could not reach NASA FIRMS."],
  upstream_error: [502, "NASA FIRMS returned an error."],
  upstream_unexpected: [502, "NASA FIRMS returned an unexpected response (not CSV)."],
  upstream_malformed: [502, "NASA FIRMS returned data that could not be parsed."],
  upstream_too_large: [502, "NASA FIRMS returned more data than expected. Use a smaller bbox."],
};

export async function GET(request: Request) {
  const parsed = parseParams(new URL(request.url).searchParams);
  if (!parsed.ok) return json(errorBody("invalid_request", "Invalid query parameters.", parsed.errors), 400);
  const { source, bbox, days, limit } = parsed.value;

  if (!KEY_PATTERN.test(readKey())) {
    return json(errorBody("not_configured", UPSTREAM_ERRORS.not_configured[1]), 500);
  }

  try {
    const result = await fetchFires(source, bbox[0], bbox[1], bbox[2], bbox[3], days);
    if (!result.ok) {
      const known = UPSTREAM_ERRORS[result.code];
      return known ? json(errorBody(result.code, known[1]), known[0]) : json(errorBody("internal_error", "Unexpected server error."), 500);
    }
    const data = result.data;
    const fires = data.fires.slice(0, limit);
    return json(
      {
        source: "NASA FIRMS",
        dataset: source,
        bbox: { west: bbox[0], south: bbox[1], east: bbox[2], north: bbox[3] },
        days,
        fetchedAt: data.fetchedAt,
        total: data.total,
        count: fires.length,
        truncated: data.total > fires.length,
        skippedRows: data.skippedRows,
        fires,
      },
      200,
      "public, max-age=60, stale-while-revalidate=300",
    );
  } catch {
    // never echo raw error text
    return json(errorBody("internal_error", "Unexpected server error."), 500);
  }
}