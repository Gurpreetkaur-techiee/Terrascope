"use client";

import Panel, { Row } from "./Panel";
import type { FireMarker, FiresState } from "./useFires";
import { fmtLat, fmtLon } from "@/lib/astro";

type Props = {
  state: FiresState & { retry: () => void };
  show: boolean;
  onToggle: () => void;
  selected: FireMarker | null;
  onClear: () => void;
  rendered: number | null; // markers actually added to the 3D scene
  onFrame: () => void;
};

const fmtTime = (f: FireMarker) =>
  f.acqDate && f.acqTime ? `${f.acqDate} ${f.acqTime.slice(0, 2)}:${f.acqTime.slice(2)} UTC` : f.acqDate || "—";

export default function FirePanel({ state, show, onToggle, selected, onClear, rendered, onFrame }: Props) {
  const { status, meta, error, retry, fires } = state;
  const span = fires.length
    ? {
        w: Math.min(...fires.map((f) => f.longitude)), e: Math.max(...fires.map((f) => f.longitude)),
        s: Math.min(...fires.map((f) => f.latitude)), n: Math.max(...fires.map((f) => f.latitude)),
      }
    : null;
  return (
    <Panel title="Active fires" tag={meta ? `NASA FIRMS · ${meta.dataset} · ${meta.days} days` : "NASA FIRMS"}>
      {status === "loading" && <p className="text-xs text-[#6f8cb3]" role="status">Loading detections…</p>}

      {status === "error" && (
        <div role="alert" className="text-xs">
          <p className="text-amber-300">{error}</p>
          <button onClick={retry} className="mt-2 border border-cyan-400/30 px-3 py-1 text-cyan-100 hover:bg-cyan-400/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">
            Retry
          </button>
        </div>
      )}

      {status === "empty" && meta && (
        <p className="text-xs text-[#8fb0d8]">
          No fire detections in the last {meta.days} days for {meta.bbox.west}–{meta.bbox.east}°E, {meta.bbox.south}–{meta.bbox.north}°N.
        </p>
      )}

      {status === "ready" && meta && (
        <>
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="text-[#cfe8ff]">
              <span className="font-mono text-amber-300">{meta.count}</span> detections
              {meta.truncated && <span className="text-[#6f8cb3]"> (of {meta.total})</span>}
            </span>
            <button
              onClick={onToggle}
              aria-pressed={show}
              className={`border px-3 py-1 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 ${show ? "border-amber-300/50 bg-amber-300/10 text-amber-200" : "border-cyan-400/20 text-[#8fb0d8] hover:text-white"}`}
            >
              {show ? "Markers on" : "Markers off"}
            </button>
          </div>
          <p className="mt-2 font-mono text-[11px] text-cyan-200" data-testid="fire-counter">
            {meta.count} detections · {rendered ?? "…"} markers rendered
          </p>
          {meta.received !== meta.count && (
            <p className="text-[11px] text-[#6f8cb3]">{meta.received - meta.count} duplicate or invalid rows removed</p>
          )}
          {span && (
            <p className="text-[11px] text-[#6f8cb3]">
              Spread {span.w.toFixed(2)}–{span.e.toFixed(2)}°E, {span.s.toFixed(2)}–{span.n.toFixed(2)}°N
            </p>
          )}
          <p className="text-[11px] text-[#6f8cb3]">
            Query area {meta.bbox.west}–{meta.bbox.east}°E, {meta.bbox.south}–{meta.bbox.north}°N
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
                <div className="mb-1 flex items-center justify-between">
                  <p className="text-xs font-medium text-white">Selected hotspot</p>
                  <button onClick={onClear} aria-label="Clear selected hotspot" className="text-xs text-[#6f8cb3] hover:text-white">Clear</button>
                </div>
                <dl>
                  <Row k="Latitude" v={fmtLat(selected.latitude)} />
                  <Row k="Longitude" v={fmtLon(selected.longitude)} />
                  <Row k="Confidence" v={selected.confidence ? `${selected.confidence}${selected.confidencePercent !== null ? ` (${selected.confidencePercent}%)` : ""}` : "—"} accent />
                  <Row k="Fire radiative power" v={selected.frp !== null ? `${selected.frp} MW` : "—"} accent />
                  <Row k="Brightness" v={selected.brightness !== null ? `${selected.brightness} K` : "—"} />
                  <Row k="Satellite" v={selected.satellite ?? "—"} />
                  <Row k="Instrument" v={selected.instrument ?? "—"} />
                  <Row k="Acquired" v={fmtTime(selected)} />
                  <Row k="Day / night" v={selected.dayNight ?? "—"} />
                </dl>
              </>
            ) : (
              <p className="text-xs text-[#6f8cb3]">Select a marker on the globe to see its details.</p>
            )}
          </div>
          <p className="mt-3 text-[11px] leading-4 text-[#4d6a91]">Thermal-anomaly detections from satellites. They are not confirmed wildfires.</p>
        </>
      )}
    </Panel>
  );
}