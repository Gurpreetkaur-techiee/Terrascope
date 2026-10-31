// app/api/change/analyze/route.ts
// GET /api/change/analyze?bbox=...&before=YYYY-MM-DD&after=YYYY-MM-DD&index=ndvi
//     &maxCloud=20&windowDays=10&threshold=0.1
import { DEFAULT_THRESHOLDS, INDEX_DEFS, type IndexType } from "@/lib/sentinel/config";
import { runAnalysis } from "@/lib/sentinel/analyze";
import { DEFAULT_WINDOW_DAYS, DataError } from "@/lib/sentinel/stac";
import { ValidationError, parseBbox, parseCloud, parseDate } from "@/lib/sentinel/validate";

const cache = new Map<string, { t: number; body: unknown }>();
const TTL_MS = 30 * 60 * 1000;
const MAX_ENTRIES = 6;

function json(body: unknown, status = 200) {
  return Response.json(body, { status });
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  let params;
  try {
    const bbox = parseBbox(q.get("bbox"));
    const beforeDate = parseDate(q.get("before"), "before");
    const afterDate = parseDate(q.get("after"), "after");
    if (beforeDate >= afterDate) throw new ValidationError("before must be earlier than after.");

    const idx = (q.get("index") ?? "ndvi").toLowerCase();
    if (!(idx in INDEX_DEFS)) throw new ValidationError("index must be one of: ndvi, ndwi, ndbi.");
    const index = idx as IndexType;

    const maxCloud = parseCloud(q.get("maxCloud"));

    const wRaw = q.get("windowDays");
    const windowDays = wRaw ? Number(wRaw) : DEFAULT_WINDOW_DAYS;
    if (!Number.isInteger(windowDays) || windowDays < 1 || windowDays > 30)
      throw new ValidationError("windowDays must be a whole number from 1 to 30.");

    const tRaw = q.get("threshold");
    const threshold = tRaw ? Number(tRaw) : DEFAULT_THRESHOLDS[index];
    if (!Number.isFinite(threshold) || threshold < 0.01 || threshold > 1)
      throw new ValidationError("threshold must be a number from 0.01 to 1.");

    params = { bbox, beforeDate, afterDate, index, maxCloud, windowDays, threshold };
  } catch (e) {
    if (e instanceof ValidationError) return json({ error: e.message }, 400);
    return json({ error: "Invalid request." }, 400);
  }

  const key = JSON.stringify(params);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < TTL_MS) return json(hit.body);

  try {
    const body = await runAnalysis(params);
    if (cache.size >= MAX_ENTRIES) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(key, { t: Date.now(), body });
    return json(body);
  } catch (e) {
    if (e instanceof DataError) return json({ error: e.message }, e.status);
    console.error("analyze failed:", e);
    return json({ error: "Processing failed unexpectedly." }, 500);
  }
}