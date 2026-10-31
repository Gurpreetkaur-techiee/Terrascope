/* eslint-disable @next/next/no-img-element */
"use client";

import { useRef, useState, type ReactNode } from "react";
import { DEFAULT_THRESHOLDS, INDEX_DEFS, LIMITS, type IndexType } from "@/lib/sentinel/config";

type SceneInfo = {
  targetDate: string; id: string; acquired: string; satellite: string; sensor: string;
  tile?: string; processingBaseline?: string; sceneCloudCover: number; aoiCloudPercent: number;
  imageUrl: string; indexUrl: string;
};
type Rgb = [number, number, number];
type Result = {
  source: string;
  index: { id: string; label: string; formula: string; bands: string[] };
  aoi: { bbox: number[]; widthKm: number; heightKm: number; areaKm2: number };
  grid: { width: number; height: number; pixelSizeM: { x: number; y: number } };
  before: SceneInfo;
  after: SceneInfo;
  change: { overlayUrl: string };
  stats: {
    totalPixels: number; validPixels: number; validPercent: number; maskedPercent: number;
    meanBefore: number; meanAfter: number; meanDifference: number;
    increaseHa: number; decreaseHa: number; unchangedHa: number; validAreaHa: number;
    thresholdUsed: number;
  };
  legend: {
    threshold: number;
    increase: { label: string; rgb: Rgb };
    decrease: { label: string; rgb: Rgb };
    unchanged: string;
    masked: string;
    indexRamp: { min: number; max: number; note: string };
    intensity: string;
  };
  notes: string[];
};
type Tf = { k: number; x: number; y: number };

const inputCls =
  "w-full border border-cyan-400/20 bg-[#030816] px-2 py-1.5 text-sm text-[#cfe8ff] outline-none focus:border-cyan-300";
const btnCls =
  "border border-cyan-400/30 bg-cyan-400/10 px-3 py-1.5 text-xs text-cyan-100 transition hover:bg-cyan-400/20 disabled:opacity-40";

function makeBbox(lat: number, lon: number, sizeKm: number): [number, number, number, number] {
  const h = sizeKm / 2;
  const dLat = h / 111.2;
  const dLon = h / (111.32 * Math.cos((lat * Math.PI) / 180));
  const r = (n: number) => Math.round(n * 1e4) / 1e4;
  return [r(lon - dLon), r(lat - dLat), r(lon + dLon), r(lat + dLat)];
}

const rgb = (c: Rgb) => `rgb(${c[0]},${c[1]},${c[2]})`;
const fmtArea = (ha: number) => `${ha.toLocaleString("en", { maximumFractionDigits: 1 })} ha (${(ha / 100).toLocaleString("en", { maximumFractionDigits: 2 })} km²)`;
const fmtVal = (v: number) => v.toFixed(3);

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs text-[#6f8cb3]">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function Layer({ src, alt }: { src: string; alt: string }) {
  return <img src={src} alt={alt} draggable={false} className="absolute inset-0 h-full w-full select-none" />;
}

function ZoomPane({ t, setT, aspect, children, labels }: {
  t: Tf; setT: (t: Tf) => void; aspect: number; children: ReactNode; labels?: ReactNode;
}) {
  const drag = useRef<{ x: number; y: number } | null>(null);
  return (
    <div
      className={`relative touch-none select-none overflow-hidden bg-black ${t.k > 1 ? "cursor-grab" : ""}`}
      style={{ aspectRatio: aspect }}
      onPointerDown={(e) => {
        if (t.k <= 1) return;
        drag.current = { x: e.clientX - t.x, y: e.clientY - t.y };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (drag.current) setT({ ...t, x: e.clientX - drag.current.x, y: e.clientY - drag.current.y });
      }}
      onPointerUp={() => { drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }}
    >
      <div
        className="absolute inset-0"
        style={{ transform: `translate(${t.x}px,${t.y}px) scale(${t.k})`, transformOrigin: "center" }}
      >
        {children}
      </div>
      {labels}
    </div>
  );
}

function SceneCard({ title, s }: { title: string; s: SceneInfo }) {
  return (
    <div className="border border-cyan-400/15 bg-[#06122b]/80 p-3 text-xs text-[#8fb0d8]">
      <p className="mb-1 font-medium text-white">{title}</p>
      <p>Requested: <span className="font-mono">{s.targetDate}</span></p>
      <p>Acquired: <span className="font-mono">{s.acquired.slice(0, 19).replace("T", " ")} UTC</span></p>
      <p>{s.satellite} · {s.sensor}</p>
      <p>Tile {s.tile ?? "n/a"} · baseline {s.processingBaseline ?? "n/a"}</p>
      <p>Cloud: scene {s.sceneCloudCover.toFixed(2)}% · AOI {s.aoiCloudPercent.toFixed(2)}%</p>
    </div>
  );
}

export default function ChangeDetection({ name, lat, lon }: { name: string; lat: number; lon: number }) {
  const [latS, setLatS] = useState(String(lat));
  const [lonS, setLonS] = useState(String(lon));
  const [sizeS, setSizeS] = useState("10");
  const [before, setBefore] = useState("");
  const [after, setAfter] = useState("");
  const [index, setIndex] = useState<IndexType>("ndvi");
  const [threshold, setThreshold] = useState(String(DEFAULT_THRESHOLDS.ndvi));
  const [maxCloud, setMaxCloud] = useState(String(LIMITS.maxSceneCloudCover));
  const [windowDays, setWindowDays] = useState("10");
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [error, setError] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const [view, setView] = useState<"slider" | "side">("slider");
  const [base, setBase] = useState<"image" | "index">("image");
  const [overlay, setOverlay] = useState(true);
  const [pos, setPos] = useState(50);
  const [t, setT] = useState<Tf>({ k: 1, x: 0, y: 0 });
  const ctl = useRef<AbortController | null>(null);

  function fillRecent() {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 15);
    setAfter(d.toISOString().slice(0, 10));
    d.setUTCFullYear(d.getUTCFullYear() - 1);
    setBefore(d.toISOString().slice(0, 10));
  }

  async function run() {
    const la = Number(latS), lo = Number(lonS), sz = Number(sizeS);
    const th = Number(threshold), mc = Number(maxCloud), wd = Number(windowDays);
    let err = "";
    if (!latS.trim() || !Number.isFinite(la) || la < -85 || la > 85) err = "Latitude must be a number between -85 and 85.";
    else if (!lonS.trim() || !Number.isFinite(lo) || lo < -180 || lo > 180) err = "Longitude must be a number between -180 and 180.";
    else if (!Number.isFinite(sz) || sz < LIMITS.minAoiSideKm || sz > LIMITS.maxAoiSideKm)
      err = `AOI size must be between ${LIMITS.minAoiSideKm} and ${LIMITS.maxAoiSideKm} km.`;
    else if (!before || !after) err = "Choose both a before date and an after date.";
    else if (before >= after) err = "The before date must be earlier than the after date.";
    else if (!Number.isFinite(th) || th < 0.01 || th > 1) err = "Threshold must be between 0.01 and 1.";
    else if (!Number.isFinite(mc) || mc < 0 || mc > 100) err = "Max cloud must be between 0 and 100.";
    else if (!Number.isInteger(wd) || wd < 1 || wd > 30) err = "Date window must be a whole number of days from 1 to 30.";
    if (err) { setStatus("error"); setError(err); return; }

    const bbox = makeBbox(la, lo, sz);
    ctl.current?.abort();
    const c = new AbortController();
    ctl.current = c;
    setStatus("loading");
    setError("");
    const qs = new URLSearchParams({
      bbox: bbox.join(","), before, after, index,
      maxCloud: String(mc), windowDays: String(wd), threshold: String(th),
    });
    try {
      const r = await fetch(`/api/change/analyze?${qs}`, { signal: c.signal });
      const data = await r.json().catch(() => null);
      if (!r.ok || !data) throw new Error(data?.error ?? `Request failed (HTTP ${r.status}).`);
      setRes(data as Result);
      setStatus("success");
      setPos(50);
      setT({ k: 1, x: 0, y: 0 });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setRes(null);
      setStatus("error");
      setError(e instanceof Error ? e.message : "Analysis failed.");
    }
  }

  const zoom = (f: number) => setT((p) => ({ k: Math.min(8, Math.max(1, p.k * f)), x: p.k * f <= 1 ? 0 : p.x, y: p.k * f <= 1 ? 0 : p.y }));
  const src = (s: SceneInfo) => (base === "image" ? s.imageUrl : s.indexUrl);
  const idLabel = res ? res.index.id.toUpperCase() : "";
  const aspect = res ? res.grid.width / res.grid.height : 1;

  return (
    <div className="space-y-4">
      <div className="border border-cyan-400/15 bg-[#06122b]/80 p-4">
        <p className="mb-3 text-xs text-[#6f8cb3]">
          Area: <span className="text-[#cfe8ff]">{name}</span> (follows the globe selection; edit the fields to adjust).
          Real Sentinel-2 L2A imagery, no demo data.
        </p>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Field label="Latitude"><input className={inputCls} value={latS} onChange={(e) => setLatS(e.target.value)} inputMode="decimal" /></Field>
          <Field label="Longitude"><input className={inputCls} value={lonS} onChange={(e) => setLonS(e.target.value)} inputMode="decimal" /></Field>
          <Field label="AOI side (km)"><input className={inputCls} value={sizeS} onChange={(e) => setSizeS(e.target.value)} inputMode="decimal" /></Field>
          <Field label="Before date"><input type="date" className={inputCls} value={before} onChange={(e) => setBefore(e.target.value)} /></Field>
          <Field label="After date"><input type="date" className={inputCls} value={after} onChange={(e) => setAfter(e.target.value)} /></Field>
          <Field label="Analysis">
            <select
              className={inputCls}
              value={index}
              onChange={(e) => {
                const v = e.target.value as IndexType;
                setIndex(v);
                setThreshold(String(DEFAULT_THRESHOLDS[v]));
              }}
            >
              {(Object.keys(INDEX_DEFS) as IndexType[]).map((k) => (
                <option key={k} value={k}>{INDEX_DEFS[k].label}</option>
              ))}
            </select>
          </Field>
        </div>
        <details className="mt-3 text-xs text-[#8fb0d8]">
          <summary className="cursor-pointer">Advanced: threshold, cloud limit, date window</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Field label="Change threshold (|index difference|)"><input className={inputCls} value={threshold} onChange={(e) => setThreshold(e.target.value)} inputMode="decimal" /></Field>
            <Field label="Max scene cloud cover (%)"><input className={inputCls} value={maxCloud} onChange={(e) => setMaxCloud(e.target.value)} inputMode="decimal" /></Field>
            <Field label="Date window (± days)"><input className={inputCls} value={windowDays} onChange={(e) => setWindowDays(e.target.value)} inputMode="numeric" /></Field>
          </div>
          <p className="mt-2 text-[#6f8cb3]">
            Each date is matched to the closest real acquisition inside the window. The threshold is a starting point, not a universal value; tune it per region and season.
          </p>
        </details>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button className={btnCls} onClick={run} disabled={status === "loading"}>
            {status === "loading" ? "Analysing…" : "Run analysis"}
          </button>
          <button className={btnCls} onClick={fillRecent} disabled={status === "loading"}>
            Fill recent dates, 1 year apart
          </button>
          {status === "loading" && (
            <button className={btnCls} onClick={() => { ctl.current?.abort(); setStatus("idle"); }}>Cancel</button>
          )}
        </div>
      </div>

      {status === "idle" && !res && (
        <p className="border border-dashed border-cyan-400/20 p-6 text-center text-sm text-[#6f8cb3]">
          No analysis yet. Choose two dates and run an analysis. Results appear only when real satellite imagery is retrieved.
        </p>
      )}
      {status === "loading" && (
        <p className="border border-cyan-400/20 bg-[#06122b]/80 p-6 text-center text-sm text-cyan-200">
          Searching Sentinel-2 scenes, downloading bands, masking clouds and computing {INDEX_DEFS[index].label}. This can take up to a minute.
        </p>
      )}
      {status === "error" && (
        <p role="alert" className="border border-amber-400/40 bg-amber-400/10 p-4 text-sm text-amber-200">
          {error} No result is shown because no verified data was produced.
        </p>
      )}

      {res && status === "success" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <SceneCard title="Before" s={res.before} />
            <SceneCard title="After" s={res.after} />
          </div>

          <div className="border border-cyan-400/15 bg-[#06122b]/80 p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
              <button className={btnCls} onClick={() => setView("slider")} aria-pressed={view === "slider"}>Slider</button>
              <button className={btnCls} onClick={() => setView("side")} aria-pressed={view === "side"}>Side by side</button>
              <span className="mx-1 text-[#6f8cb3]">|</span>
              <button className={btnCls} onClick={() => setBase(base === "image" ? "index" : "image")}>
                Showing: {base === "image" ? "true colour" : `${idLabel} map`}
              </button>
              <label className="flex items-center gap-1 text-[#8fb0d8]">
                <input type="checkbox" checked={overlay} onChange={(e) => setOverlay(e.target.checked)} /> Change overlay
              </label>
              <span className="mx-1 text-[#6f8cb3]">|</span>
              <button className={btnCls} onClick={() => zoom(1.5)} aria-label="Zoom in">+</button>
              <button className={btnCls} onClick={() => zoom(1 / 1.5)} aria-label="Zoom out">−</button>
              <button className={btnCls} onClick={() => setT({ k: 1, x: 0, y: 0 })}>Reset</button>
              <span className="text-[#6f8cb3]">Zoom ×{t.k.toFixed(1)} · drag to pan when zoomed</span>
            </div>

            {view === "slider" ? (
              <>
                <ZoomPane
                  t={t} setT={setT} aspect={aspect}
                  labels={
                    <>
                      <span className="pointer-events-none absolute left-2 top-2 bg-black/60 px-2 py-0.5 font-mono text-xs text-cyan-100">Before {res.before.acquired.slice(0, 10)}</span>
                      <span className="pointer-events-none absolute right-2 top-2 bg-black/60 px-2 py-0.5 font-mono text-xs text-cyan-100">After {res.after.acquired.slice(0, 10)}</span>
                    </>
                  }
                >
                  <Layer src={src(res.after)} alt={`After, ${res.after.acquired.slice(0, 10)}`} />
                  {overlay && <Layer src={res.change.overlayUrl} alt="Change overlay" />}
                  <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
                    <Layer src={src(res.before)} alt={`Before, ${res.before.acquired.slice(0, 10)}`} />
                  </div>
                  <div className="absolute inset-y-0 bg-cyan-200" style={{ left: `${pos}%`, width: `${2 / t.k}px` }} />
                </ZoomPane>
                <input
                  type="range" min={0} max={100} value={pos}
                  onChange={(e) => setPos(Number(e.target.value))}
                  aria-label="Before and after comparison position"
                  className="mt-2 w-full accent-cyan-300"
                />
                <p className="text-[11px] text-[#6f8cb3]">The change overlay is drawn on the after image (right side of the divider).</p>
              </>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                <ZoomPane t={t} setT={setT} aspect={aspect}
                  labels={<span className="pointer-events-none absolute left-2 top-2 bg-black/60 px-2 py-0.5 font-mono text-xs text-cyan-100">Before {res.before.acquired.slice(0, 10)}</span>}>
                  <Layer src={src(res.before)} alt="Before" />
                </ZoomPane>
                <ZoomPane t={t} setT={setT} aspect={aspect}
                  labels={<span className="pointer-events-none absolute left-2 top-2 bg-black/60 px-2 py-0.5 font-mono text-xs text-cyan-100">After {res.after.acquired.slice(0, 10)}</span>}>
                  <Layer src={src(res.after)} alt="After" />
                  {overlay && <Layer src={res.change.overlayUrl} alt="Change overlay" />}
                </ZoomPane>
              </div>
            )}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="border border-cyan-400/15 bg-[#06122b]/80 p-4 text-sm">
              <p className="mb-2 font-medium text-white">{res.index.label} statistics (valid pixels only)</p>
              <table className="w-full text-xs text-[#8fb0d8]">
                <tbody>
                  {[
                    [`Mean ${idLabel} before`, fmtVal(res.stats.meanBefore)],
                    [`Mean ${idLabel} after`, fmtVal(res.stats.meanAfter)],
                    [`Mean ${idLabel} difference`, (res.stats.meanDifference >= 0 ? "+" : "") + fmtVal(res.stats.meanDifference)],
                    [res.legend.increase.label, `${fmtArea(res.stats.increaseHa)} · ${((res.stats.increaseHa / res.stats.validAreaHa) * 100).toFixed(1)}%`],
                    [res.legend.decrease.label, `${fmtArea(res.stats.decreaseHa)} · ${((res.stats.decreaseHa / res.stats.validAreaHa) * 100).toFixed(1)}%`],
                    ["Unchanged", `${fmtArea(res.stats.unchangedHa)} · ${((res.stats.unchangedHa / res.stats.validAreaHa) * 100).toFixed(1)}%`],
                    ["Valid area analysed", fmtArea(res.stats.validAreaHa)],
                    ["Valid pixels", `${res.stats.validPixels.toLocaleString()} of ${res.stats.totalPixels.toLocaleString()} (${res.stats.validPercent.toFixed(2)}%)`],
                    ["Masked (cloud, shadow, no data)", `${res.stats.maskedPercent.toFixed(2)}%`],
                    ["Threshold used", `|Δ${idLabel}| > ${res.stats.thresholdUsed}`],
                  ].map(([k, v]) => (
                    <tr key={k} className="border-t border-cyan-400/10">
                      <td className="py-1 pr-3">{k}</td>
                      <td className="py-1 text-right font-mono text-[#cfe8ff]">{v}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border border-cyan-400/15 bg-[#06122b]/80 p-4 text-xs text-[#8fb0d8]">
              <p className="mb-2 text-sm font-medium text-white">Legend and data quality</p>
              <ul className="space-y-1">
                <li><span className="mr-2 inline-block h-3 w-3 align-middle" style={{ background: rgb(res.legend.increase.rgb) }} />{res.legend.increase.label} (Δ above +{res.legend.threshold})</li>
                <li><span className="mr-2 inline-block h-3 w-3 align-middle" style={{ background: rgb(res.legend.decrease.rgb) }} />{res.legend.decrease.label} (Δ below −{res.legend.threshold})</li>
                <li><span className="mr-2 inline-block h-3 w-3 border border-cyan-400/30 align-middle" />{res.legend.unchanged}</li>
                <li><span className="mr-2 inline-block h-3 w-3 bg-gray-500/60 align-middle" />{res.legend.masked}</li>
              </ul>
              <p className="mt-3">{idLabel} map colours ({res.legend.indexRamp.note}):</p>
              <div className="mt-1 h-3 w-full" style={{ background: "linear-gradient(to right, rgb(140,90,40), rgb(240,220,110), rgb(20,110,50))" }} />
              <div className="flex justify-between font-mono text-[10px]"><span>{res.legend.indexRamp.min}</span><span>{res.legend.indexRamp.max}</span></div>
              <p className="mt-3">{res.legend.intensity}.</p>
              <p className="mt-3">
                AOI: {res.aoi.widthKm.toFixed(2)} × {res.aoi.heightKm.toFixed(2)} km ({res.aoi.areaKm2.toFixed(2)} km²), bbox{" "}
                <span className="font-mono">{res.aoi.bbox.join(", ")}</span>
              </p>
              <p>Analysis grid {res.grid.width} × {res.grid.height} px, about {res.grid.pixelSizeM.x.toFixed(1)} × {res.grid.pixelSizeM.y.toFixed(1)} m per pixel.</p>
              <p>{res.index.label}: {res.index.formula}</p>
              <p className="mt-2 text-[#6f8cb3]">Source: {res.source}</p>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-[#6f8cb3]">
                {res.notes.map((n) => <li key={n}>{n}</li>)}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}