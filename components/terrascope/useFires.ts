"use client";

import { useCallback, useEffect, useState } from "react";
import type { Fire } from "@/app/api/fires/route"; // type-only import, erased at build time

export type FireMarker = Fire & { id: string };

export type FiresMeta = {
  dataset: string;
  days: number;
  fetchedAt: string;
  total: number;
  count: number;
  received: number; // detections in the API response, before validation/de-duplication
  truncated: boolean;
  bbox: { west: number; south: number; east: number; north: number };
};

export type FiresState = {
  status: "loading" | "ready" | "empty" | "error";
  fires: FireMarker[];
  meta: FiresMeta | null;
  error: string | null;
};

const FIRES_URL = "/api/fires?days=3";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;
const numOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strOrNull = (v: unknown) => (typeof v === "string" && v !== "" ? v : null);

/** Validates the API response and drops malformed or duplicate detections. */
function parseResponse(body: unknown): { fires: FireMarker[]; meta: FiresMeta } | null {
  if (!isObj(body) || !Array.isArray(body.fires) || !isObj(body.bbox)) return null;
  const seen = new Map<string, FireMarker>();
  for (const raw of body.fires) {
    if (!isObj(raw)) continue;
    const latitude = numOrNull(raw.latitude);
    const longitude = numOrNull(raw.longitude);
    if (latitude === null || longitude === null || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) continue;
    const conf = raw.confidence;
    const f: Fire = {
      latitude,
      longitude,
      acqDate: strOrNull(raw.acqDate) ?? "",
      acqTime: strOrNull(raw.acqTime) ?? "",
      acquiredAt: strOrNull(raw.acquiredAt),
      confidence: conf === "low" || conf === "nominal" || conf === "high" ? conf : null,
      confidencePercent: numOrNull(raw.confidencePercent),
      frp: numOrNull(raw.frp),
      brightness: numOrNull(raw.brightness),
      satellite: strOrNull(raw.satellite),
      instrument: strOrNull(raw.instrument),
      dayNight: raw.dayNight === "day" || raw.dayNight === "night" ? raw.dayNight : null,
    };
    // Identical position + acquisition time + satellite = the same detection.
    const id = `${latitude.toFixed(4)}_${longitude.toFixed(4)}_${f.acqDate}_${f.acqTime}_${f.satellite ?? "x"}`;
    if (!seen.has(id)) seen.set(id, { ...f, id });
  }
  const b = body.bbox;
  const meta: FiresMeta = {
    dataset: strOrNull(body.dataset) ?? "FIRMS",
    days: numOrNull(body.days) ?? 3,
    fetchedAt: strOrNull(body.fetchedAt) ?? "",
    total: numOrNull(body.total) ?? seen.size,
    count: seen.size,
    received: body.fires.length,
    truncated: body.truncated === true,
    bbox: { west: numOrNull(b.west) ?? 0, south: numOrNull(b.south) ?? 0, east: numOrNull(b.east) ?? 0, north: numOrNull(b.north) ?? 0 },
  };
  return { fires: [...seen.values()], meta };
}

export function useFires() {
  const [state, setState] = useState<FiresState>({ status: "loading", fires: [], meta: null, error: null });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    const ac = new AbortController();
    (async () => {
      try {
        const res = await fetch(FIRES_URL, { signal: ac.signal });
        let body: unknown = null;
        try {
          body = await res.json();
        } catch {
          /* non-JSON body: handled below */
        }
        if (ac.signal.aborted) return;
        if (!res.ok) {
          const msg = isObj(body) && isObj(body.error) && typeof body.error.message === "string" ? body.error.message : `Request failed (HTTP ${res.status}).`;
          setState({ status: "error", fires: [], meta: null, error: msg });
          return;
        }
        const parsed = parseResponse(body);
        if (!parsed) {
          setState({ status: "error", fires: [], meta: null, error: "The fire data response was not in the expected format." });
          return;
        }
        setState({ status: parsed.fires.length ? "ready" : "empty", fires: parsed.fires, meta: parsed.meta, error: null });
      } catch {
        if (ac.signal.aborted) return;
        setState({ status: "error", fires: [], meta: null, error: "Could not reach the server. Check that the dev server is running." });
      }
    })();
    return () => ac.abort();
  }, [nonce]);

  const retry = useCallback(() => {
    setState((s) => ({ ...s, status: "loading", error: null }));
    setNonce((n) => n + 1);
  }, []);

  return { ...state, retry };
}