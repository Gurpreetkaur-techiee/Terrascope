// app/api/change/scenes/route.ts
// GET /api/change/scenes?bbox=minLon,minLat,maxLon,maxLat&start=YYYY-MM-DD&end=YYYY-MM-DD&maxCloud=20
// Returns real Sentinel-2 L2A scenes from the Planetary Computer STAC API.
import { COLLECTION, LIMITS, STAC_SEARCH_URL } from "@/lib/sentinel/config";
import { ValidationError, parseBbox, parseCloud, parseDateRange } from "@/lib/sentinel/validate";

type StacItem = {
  id: string;
  bbox: number[];
  properties: Record<string, unknown>;
};

const cache = new Map<string, { t: number; body: unknown }>();
const TTL_MS = 10 * 60 * 1000;

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;

  let bbox, range, maxCloud;
  try {
    bbox = parseBbox(q.get("bbox"));
    range = parseDateRange(q.get("start"), q.get("end"));
    maxCloud = parseCloud(q.get("maxCloud"));
  } catch (e) {
    if (e instanceof ValidationError) return json({ error: e.message }, 400);
    return json({ error: "Invalid request." }, 400);
  }

  const key = JSON.stringify([bbox, range, maxCloud]);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL_MS) return json(hit.body);

  try {
    const res = await fetch(STAC_SEARCH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(LIMITS.requestTimeoutMs),
      body: JSON.stringify({
        collections: [COLLECTION],
        bbox,
        datetime: `${range.start}T00:00:00Z/${range.end}T23:59:59Z`,
        query: { "eo:cloud_cover": { lte: maxCloud } },
        sortby: [{ field: "properties.eo:cloud_cover", direction: "asc" }],
        limit: 100,
      }),
    });

    if (res.status === 429)
      return json({ error: "The imagery service is rate limiting requests. Try again shortly." }, 429);
    if (!res.ok)
      return json({ error: `Imagery service error (HTTP ${res.status}).` }, 502);

    const data = (await res.json()) as { features?: StacItem[] };
    const items = data.features ?? [];

    const scenes = items
      .map((it) => {
        const p = it.properties;
        const [a, b, c, d] = it.bbox;
        // Approximate: does the scene footprint box contain the whole AOI box?
        const coversAoi = a <= bbox[0] && b <= bbox[1] && c >= bbox[2] && d >= bbox[3];
        return {
          id: it.id,
          datetime: p["datetime"] as string,
          satellite: p["platform"] as string,
          sensor: "MSI (MultiSpectral Instrument)",
          cloudCover: p["eo:cloud_cover"] as number,
          tile: p["s2:mgrs_tile"] as string | undefined,
          nodataPercent: p["s2:nodata_pixel_percentage"] as number | undefined,
          processingBaseline: p["s2:processing_baseline"] as string | undefined,
          relativeOrbit: p["sat:relative_orbit"] as number | undefined,
          coversAoi,
        };
      })
      .sort((x, y) => y.datetime.localeCompare(x.datetime));

    const body = {
      source: "Sentinel-2 L2A via Microsoft Planetary Computer",
      query: { bbox, ...range, maxCloud },
      count: scenes.length,
      scenes,
      message: scenes.length === 0 ? "No scenes found for this area, dates and cloud limit." : undefined,
    };
    cache.set(key, { t: Date.now(), body });
    return json(body);
  } catch (e) {
    if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError"))
      return json({ error: "The imagery service timed out. Try again." }, 504);
    return json({ error: "Could not reach the imagery service." }, 502);
  }
}