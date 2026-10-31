
"use client";

import { useEffect, useRef, useState } from "react";
import Panel, { Row } from "./Panel";
import type { FireMarker, FiresState } from "./useFires";
import { fmtLat, fmtLon } from "@/lib/astro";

type Props = {
  state: FiresState & { retry: () => void };
  show: boolean;
  onToggle: () => void;
  selected: FireMarker | null;
  onClear: () => void;
  rendered: number | null;
  onFrame: () => void;
};

type PlaceInfo = {
  location: string;
  region: string | null;
  country: string | null;
};

const fmtTime = (f: FireMarker) =>
  f.acqDate && f.acqTime
    ? `${f.acqDate} ${f.acqTime.slice(0, 2)}:${f.acqTime.slice(2)} UTC`
    : f.acqDate || "—";

export default function FirePanel({
  state,
  show,
  onToggle,
  selected,
  onClear,
  rendered,
  onFrame,
}: Props) {
  const { status, meta, error, retry, fires } = state;

  const [place, setPlace] = useState<PlaceInfo | null>(null);
  const [placeLoading, setPlaceLoading] = useState(false);
  const [placeError, setPlaceError] = useState(false);

  const selectedLat = selected?.latitude ?? null;
  const selectedLon = selected?.longitude ?? null;

  // Prevent outdated location responses from replacing newer selections.
  const lastRequestRef = useRef(0);

  useEffect(() => {
    if (selectedLat === null || selectedLon === null) {
      setPlace(null);
      setPlaceLoading(false);
      setPlaceError(false);
      return;
    }

    const controller = new AbortController();

    setPlace(null);
    setPlaceLoading(true);
    setPlaceError(false);

    async function findLocation() {
      try {
        // Respect the public geocoding service's request interval.
        const wait = Math.max(
          0,
          1000 - (Date.now() - lastRequestRef.current)
        );

        if (wait > 0) {
          await new Promise((resolve) => setTimeout(resolve, wait));
        }

        if (controller.signal.aborted) return;

        lastRequestRef.current = Date.now();

        const params = new URLSearchParams({
          lat: String(selectedLat),
          lon: String(selectedLon),
        });

        const response = await fetch(
          `/api/geocode?${params.toString()}`,
          { signal: controller.signal }
        );

        if (!response.ok) {
          throw new Error("Location lookup failed");
        }

        const data: PlaceInfo = await response.json();

        if (!controller.signal.aborted) {
          setPlace(data);
        }
      } catch {
        if (!controller.signal.aborted) {
          setPlaceError(true);
        }
      } finally {
        if (!controller.signal.aborted) {
          setPlaceLoading(false);
        }
      }
    }

    findLocation();

    return () => controller.abort();
  }, [selectedLat, selectedLon]);

  const span = fires.length
    ? {
        w: Math.min(...fires.map((f) => f.longitude)),
        e: Math.max(...fires.map((f) => f.longitude)),
        s: Math.min(...fires.map((f) => f.latitude)),
        n: Math.max(...fires.map((f) => f.latitude)),
      }
    : null;

  return (
    <Panel
      title="Active fires"
      tag={meta ? `NASA FIRMS · ${meta.dataset} · ${meta.days} days` : "NASA FIRMS"}
    >
      {status === "loading" && (
        <p className="text-xs text-[#6f8cb3]" role="status">
          Loading detections…
        </p>
      )}

      {status === "error" && (
        <div role="alert" className="text-xs">
          <p className="text-amber-300">{error}</p>
          <button
            onClick={retry}
            className="mt-2 border border-cyan-400/30 px-3 py-1 text-cyan-100 hover:bg-cyan-400/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
          >
            Retry
          </button>
        </div>
      )}

      {status === "empty" && meta && (
        <p className="text-xs text-[#8fb0d8]">
          No fire detections in the last {meta.days} days for{" "}
          {meta.bbox.west}–{meta.bbox.east}°E,{" "}
          {meta.bbox.south}–{meta.bbox.north}°N.
        </p>
      )}

      {status === "ready" && meta && (
        <>
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-[#cfe8ff]">
              <span className="font-mono text-amber-300">
                {meta.count}
              </span>{" "}
              detections
              {meta.truncated && (
                <span className="text-[#6f8cb3]">
                  {" "}(of {meta.total})
                </span>
              )}
            </span>

            <button
              onClick={onToggle}
              aria-pressed={show}
              className={`border px-3 py-1 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 ${
                show
                  ? "border-amber-300/50 bg-amber-300/10 text-amber-200"
                  : "border-cyan-400/20 text-[#8fb0d8] hover:text-white"
              }`}
            >
              {show ? "Markers on" : "Markers off"}
            </button>
          </div>

          <p
            className="mt-2 font-mono text-[11px] text-cyan-200"
            data-testid="fire-counter"
          >
            {meta.count} detections · {rendered ?? "…"} markers rendered
          </p>

          {meta.received !== meta.count && (
            <p className="text-[11px] text-[#6f8cb3]">
              {meta.received - meta.count} duplicate or invalid rows removed
            </p>
          )}

          {span && (
            <p className="text-[11px] text-[#6f8cb3]">
              Spread {span.w.toFixed(2)}–{span.e.toFixed(2)}°E,{" "}
              {span.s.toFixed(2)}–{span.n.toFixed(2)}°N
            </p>
          )}

          <p className="text-[11px] text-[#6f8cb3]">
            Query area {meta.bbox.west}–{meta.bbox.east}°E,{" "}
            {meta.bbox.south}–{meta.bbox.north}°N
          </p>

          <button
            onClick={onFrame}
            className="mt-2 border border-cyan-400/30 px-3 py-1 text-xs text-cyan-100 hover:bg-cyan-400/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
          >
            Frame detections
          </button>

          <div className="mt-2 flex items-center gap-2 text-[11px] text-[#8fb0d8]">
            <span>Low FRP</span>
            <span className="h-1.5 flex-1 rounded-full bg-gradient-to-r from-[#ffd34d] to-[#ff2d16]" />
            <span>High FRP</span>
          </div>

          <div className="mt-3 border-t border-cyan-400/10 pt-3">
            {selected ? (
              <>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-xs font-medium text-white">
                    Selected hotspot
                  </p>

                  <button
                    onClick={onClear}
                    aria-label="Clear selected hotspot"
                    className="text-xs text-[#6f8cb3] hover:text-white"
                  >
                    Clear
                  </button>
                </div>

                {/* NEW: Geographical location details */}
                <div className="mb-3 rounded-lg border border-cyan-400/20 bg-cyan-400/5 p-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-cyan-300">
                    Geographical location
                  </p>

                  <dl>
                    <Row
                      k="Nearest place"
                      v={
                        placeLoading
                          ? "Finding location…"
                          : place?.location ?? (placeError ? "Unavailable" : "—")
                      }
                      accent
                    />

                    <Row
                      k="District / region"
                      v={place?.region ?? "—"}
                    />

                    <Row
                      k="Country"
                      v={place?.country ?? "—"}
                      accent
                    />
                  </dl>

                  {placeError && (
                    <p className="mt-2 text-[10px] text-amber-300">
                      Could not retrieve location. Try selecting the hotspot again.
                    </p>
                  )}
                </div>

                {/* Existing NASA FIRMS information */}
                <dl>
                  <Row k="Latitude" v={fmtLat(selected.latitude)} />
                  <Row k="Longitude" v={fmtLon(selected.longitude)} />

                  <Row
                    k="Confidence"
                    v={
                      selected.confidence
                        ? `${selected.confidence}${
                            selected.confidencePercent !== null
                              ? ` (${selected.confidencePercent}%)`
                              : ""
                          }`
                        : "—"
                    }
                    accent
                  />

                  <Row
                    k="Fire radiative power"
                    v={selected.frp !== null ? `${selected.frp} MW` : "—"}
                    accent
                  />

                  <Row
                    k="Brightness"
                    v={selected.brightness !== null ? `${selected.brightness} K` : "—"}
                  />

                  <Row k="Satellite" v={selected.satellite ?? "—"} />
                  <Row k="Instrument" v={selected.instrument ?? "—"} />
                  <Row k="Acquired" v={fmtTime(selected)} />
                  <Row k="Day / night" v={selected.dayNight ?? "—"} />
                </dl>

                <p className="mt-2 text-[10px] text-[#6f8cb3]">
                  Location data © OpenStreetMap contributors.
                </p>
              </>
            ) : (
              <p className="text-xs text-[#6f8cb3]">
                Select a marker on the globe to see its details.
              </p>
            )}
          </div>

          <p className="mt-3 text-[11px] leading-4 text-[#4d6a91]">
            Thermal-anomaly detections from satellites. They are not confirmed wildfires.
          </p>
        </>
      )}
    </Panel>
  );
}
