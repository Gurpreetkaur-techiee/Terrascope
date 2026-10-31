// lib/sentinel/stac.ts
// Scene search + selection against the Planetary Computer STAC API.
import { COLLECTION, LIMITS, STAC_SEARCH_URL } from "./config";
import type { Bbox } from "./validate";

export class DataError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}

export async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  try {
    const res = await fetch(url, { ...init, signal: AbortSignal.timeout(LIMITS.requestTimeoutMs) });
    if (res.status === 429)
      throw new DataError("The imagery service is rate limiting requests. Try again shortly.", 429);
    if (!res.ok) throw new DataError(`Imagery service error (HTTP ${res.status}).`, 502);
    return res;
  } catch (e) {
    if (e instanceof DataError) throw e;
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError"))
      throw new DataError("The imagery service timed out. Try again.", 504);
    throw new DataError("Could not reach the imagery service.", 502);
  }
}

export type Scene = {
  id: string;
  datetime: string;
  satellite: string;
  sensor: string;
  cloudCover: number;
  tile?: string;
  processingBaseline?: string;
  coversAoi: boolean;
};

type StacItem = { id: string; bbox: number[]; properties: Record<string, unknown> };

export const DEFAULT_WINDOW_DAYS = 10;

function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

// Picks the real scene acquired closest to `target` (within +/- windowDays)
// that meets the cloud limit and covers the AOI. Ties go to lower cloud cover.
export async function pickScene(
  bbox: Bbox,
  target: string,
  windowDays: number,
  maxCloud: number
): Promise<Scene> {
  const res = await fetchWithTimeout(STAC_SEARCH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      collections: [COLLECTION],
      bbox,
      datetime: `${addDays(target, -windowDays)}T00:00:00Z/${addDays(target, windowDays)}T23:59:59Z`,
      query: { "eo:cloud_cover": { lte: maxCloud } },
      limit: 100,
    }),
  });
  const data = (await res.json()) as { features?: StacItem[] };
  const t0 = Date.parse(`${target}T12:00:00Z`);

  const scenes: Scene[] = (data.features ?? []).map((it) => {
    const p = it.properties;
    const [a, b, c, d] = it.bbox;
    return {
      id: it.id,
      datetime: p["datetime"] as string,
      satellite: p["platform"] as string,
      sensor: "MSI (MultiSpectral Instrument)",
      cloudCover: p["eo:cloud_cover"] as number,
      tile: p["s2:mgrs_tile"] as string | undefined,
      processingBaseline: p["s2:processing_baseline"] as string | undefined,
      coversAoi: a <= bbox[0] && b <= bbox[1] && c >= bbox[2] && d >= bbox[3],
    };
  });

  if (scenes.length === 0)
    throw new DataError(
      `No Sentinel-2 scenes within +/- ${windowDays} days of ${target} with cloud cover <= ${maxCloud}%. Try a wider window or a higher cloud limit.`,
      404
    );
  const candidates = scenes.filter((s) => s.coversAoi);
  if (candidates.length === 0)
    throw new DataError(
      `Scenes exist near ${target}, but none fully covers the AOI (it may straddle two tiles). Shrink or shift the AOI.`,
      404
    );
  candidates.sort(
    (x, y) =>
      Math.abs(Date.parse(x.datetime) - t0) - Math.abs(Date.parse(y.datetime) - t0) ||
      x.cloudCover - y.cloudCover
  );
  return candidates[0];
}