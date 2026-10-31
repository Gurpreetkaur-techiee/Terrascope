// lib/sentinel/analyze.ts
// Real change detection: index maths, cloud masking, statistics, rendering.
import {
  BOA_ADD_OFFSET, INDEX_DEFS, LIMITS, OFFSET_MIN_BASELINE, QUANTIFICATION,
  VALID_SCL_CLASSES, type IndexType,
} from "./config";
import { DataError, pickScene, type Scene } from "./stac";
import { encodePngDataUrl, fetchBands, gridFor, type Pixels } from "./raster";
import type { Bbox } from "./validate";

export type AnalysisParams = {
  bbox: Bbox;
  beforeDate: string;
  afterDate: string;
  index: IndexType;
  maxCloud: number;
  windowDays: number;
  threshold: number;
};

type Loaded = { scene: Scene; bands: Pixels[]; mask: Pixels | null; scl: Pixels; offset: number };

const VALID = new Set(VALID_SCL_CLASSES);
const CLOUDISH = new Set([3, 8, 9, 10]); // shadow, cloud medium/high, cirrus
const M_LAT = 111132; // metres per degree latitude (approx)
const M_LON = 111320; // metres per degree longitude at the equator
const RAMP_MIN = -0.2;
const RAMP_MAX = 0.8;

const LEGEND_COLORS: Record<IndexType, { up: [number, number, number]; upLabel: string; downLabel: string }> = {
  ndvi: { up: [34, 197, 94], upLabel: "Vegetation increase", downLabel: "Vegetation decrease" },
  ndwi: { up: [56, 189, 248], upLabel: "Water increase", downLabel: "Water decrease" },
  ndbi: { up: [251, 146, 60], upLabel: "Built-up increase", downLabel: "Built-up decrease" },
};
const DOWN_COLOR: [number, number, number] = [239, 68, 68];

function offsetFor(s: Scene) {
  const v = parseFloat(s.processingBaseline ?? "");
  if (!Number.isFinite(v))
    throw new DataError("Scene has no processing-baseline metadata, so reflectance cannot be scaled safely.", 502);
  return v >= OFFSET_MIN_BASELINE ? BOA_ADD_OFFSET : 0;
}

function ramp(v: number): [number, number, number] {
  const stops = [[140, 90, 40], [240, 220, 110], [20, 110, 50]];
  const t = Math.min(1, Math.max(0, (v - RAMP_MIN) / (RAMP_MAX - RAMP_MIN)));
  const s = t * 2;
  const k = Math.min(1, Math.floor(s));
  const f = s - k;
  const a = stops[k], b = stops[k + 1];
  return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
}

export async function runAnalysis(p: AnalysisParams) {
  const [sb, sa] = await Promise.all([
    pickScene(p.bbox, p.beforeDate, p.windowDays, p.maxCloud),
    pickScene(p.bbox, p.afterDate, p.windowDays, p.maxCloud),
  ]);
  if (sb.id === sa.id || sb.datetime === sa.datetime)
    throw new DataError("Both dates resolved to the same satellite acquisition. Choose dates further apart.", 422);

  const grid = gridFor(p.bbox, LIMITS.outputPixels);
  const { width: W, height: H } = grid;
  const N = W * H;
  const def = INDEX_DEFS[p.index];
  const names = Array.from(new Set([def.a, def.b, "B04", "B03", "B02"]));
  const ia = names.indexOf(def.a), ib = names.indexOf(def.b);
  const ir = names.indexOf("B04"), ig = names.indexOf("B03"), iB = names.indexOf("B02");

  const load = async (scene: Scene): Promise<Loaded> => {
    const [b, s] = await Promise.all([
      fetchBands(scene.id, names, grid, "bilinear"),
      fetchBands(scene.id, ["SCL"], grid, "nearest"), // class codes: never blend
    ]);
    return { scene, bands: b.bands, mask: b.mask, scl: s.bands[0], offset: offsetFor(scene) };
  };
  const [B, A] = await Promise.all([load(sb), load(sa)]);

  const okPx = (d: Loaded, i: number) =>
    VALID.has(d.scl[i]) && (d.mask === null || d.mask[i] !== 0);

  const indexAt = (d: Loaded, i: number) => {
    const va = d.bands[ia][i], vb = d.bands[ib][i];
    if (va === 0 || vb === 0) return NaN; // nodata
    const ra = (va + d.offset) / QUANTIFICATION;
    const rb = (vb + d.offset) / QUANTIFICATION;
    const s = ra + rb;
    return s <= 0 ? NaN : (ra - rb) / s;
  };

  const idxB = new Float32Array(N).fill(NaN);
  const idxA = new Float32Array(N).fill(NaN);
  const overlay = new Uint8Array(N * 4);
  const up = LEGEND_COLORS[p.index].up;

  const [minLon, minLat, maxLon, maxLat] = p.bbox;
  const dLon = (maxLon - minLon) / W;
  const dLat = (maxLat - minLat) / H;

  let nValid = 0, sumB = 0, sumA = 0, sumD = 0;
  let aInc = 0, aDec = 0, aUnch = 0, aValid = 0, aTotal = 0;
  let cloudB = 0, cloudA = 0;

  for (let y = 0; y < H; y++) {
    const lat = maxLat - (y + 0.5) * dLat;
    const areaPx = dLon * M_LON * Math.cos((lat * Math.PI) / 180) * (dLat * M_LAT);
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      aTotal += areaPx;
      if (CLOUDISH.has(B.scl[i])) cloudB++;
      if (CLOUDISH.has(A.scl[i])) cloudA++;

      const vb = okPx(B, i) ? indexAt(B, i) : NaN;
      const va = okPx(A, i) ? indexAt(A, i) : NaN;
      idxB[i] = vb;
      idxA[i] = va;

      const o = i * 4;
      if (Number.isNaN(vb) || Number.isNaN(va)) {
        overlay[o] = 128; overlay[o + 1] = 128; overlay[o + 2] = 128; overlay[o + 3] = 70; // masked
        continue;
      }
      const d = va - vb;
      nValid++; sumB += vb; sumA += va; sumD += d; aValid += areaPx;
      if (d > p.threshold) {
        aInc += areaPx;
        const a = Math.round(110 + 145 * Math.min(1, Math.abs(d) / 0.5));
        overlay[o] = up[0]; overlay[o + 1] = up[1]; overlay[o + 2] = up[2]; overlay[o + 3] = a;
      } else if (d < -p.threshold) {
        aDec += areaPx;
        const a = Math.round(110 + 145 * Math.min(1, Math.abs(d) / 0.5));
        overlay[o] = DOWN_COLOR[0]; overlay[o + 1] = DOWN_COLOR[1]; overlay[o + 2] = DOWN_COLOR[2]; overlay[o + 3] = a;
      } else {
        aUnch += areaPx; // transparent overlay
      }
    }
  }

  const validFraction = nValid / N;
  if (nValid === 0 || validFraction < LIMITS.minValidFraction)
    throw new DataError(
      `Only ${(validFraction * 100).toFixed(1)}% of the AOI has valid pixels on both dates (cloud, shadow or missing data), below the ${(LIMITS.minValidFraction * 100).toFixed(0)}% minimum. No result was produced.`,
      422
    );

  const trueColor = (d: Loaded) => {
    const out = new Uint8Array(N * 4);
    for (let i = 0; i < N; i++) {
      const r = d.bands[ir][i], g = d.bands[ig][i], b = d.bands[iB][i];
      if (r === 0 && g === 0 && b === 0) continue; // nodata stays transparent
      const o = i * 4;
      const ch = (dn: number) =>
        Math.round(255 * Math.pow(Math.min(1, Math.max(0, (dn + d.offset) / QUANTIFICATION / 0.3)), 1 / 2.2));
      out[o] = ch(r); out[o + 1] = ch(g); out[o + 2] = ch(b); out[o + 3] = 255;
    }
    return out;
  };

  const indexImage = (arr: Float32Array) => {
    const out = new Uint8Array(N * 4);
    for (let i = 0; i < N; i++) {
      if (Number.isNaN(arr[i])) continue;
      const [r, g, b] = ramp(arr[i]);
      const o = i * 4;
      out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = 255;
    }
    return out;
  };

  const midLat = (minLat + maxLat) / 2;
  const sideKm = (W * dLon * M_LON * Math.cos((midLat * Math.PI) / 180)) / 1000;
  const sideKmY = (H * dLat * M_LAT) / 1000;
  const ha = (m2: number) => m2 / 10000;
  const sceneInfo = (d: Loaded, cloudPx: number, target: string) => ({
    targetDate: target,
    id: d.scene.id,
    acquired: d.scene.datetime,
    satellite: d.scene.satellite,
    sensor: d.scene.sensor,
    tile: d.scene.tile,
    processingBaseline: d.scene.processingBaseline,
    sceneCloudCover: d.scene.cloudCover,
    aoiCloudPercent: (cloudPx / N) * 100,
    reflectanceOffsetApplied: d.offset,
  });

  return {
    source: "Sentinel-2 L2A via Microsoft Planetary Computer",
    index: { id: p.index, label: def.label, formula: def.formula, bands: [def.a, def.b] },
    aoi: { bbox: p.bbox, widthKm: sideKm, heightKm: sideKmY, areaKm2: aTotal / 1e6 },
    grid: {
      width: W, height: H,
      pixelSizeM: { x: (dLon * M_LON * Math.cos((midLat * Math.PI) / 180)), y: dLat * M_LAT },
    },
    before: { ...sceneInfo(B, cloudB, p.beforeDate), imageUrl: encodePngDataUrl(trueColor(B), W, H), indexUrl: encodePngDataUrl(indexImage(idxB), W, H) },
    after: { ...sceneInfo(A, cloudA, p.afterDate), imageUrl: encodePngDataUrl(trueColor(A), W, H), indexUrl: encodePngDataUrl(indexImage(idxA), W, H) },
    change: { overlayUrl: encodePngDataUrl(overlay, W, H) },
    stats: {
      totalPixels: N,
      validPixels: nValid,
      validPercent: validFraction * 100,
      maskedPercent: (1 - validFraction) * 100,
      meanBefore: sumB / nValid,
      meanAfter: sumA / nValid,
      meanDifference: sumD / nValid,
      increaseHa: ha(aInc),
      decreaseHa: ha(aDec),
      unchangedHa: ha(aUnch),
      validAreaHa: ha(aValid),
      thresholdUsed: p.threshold,
    },
    legend: {
      threshold: p.threshold,
      increase: { label: LEGEND_COLORS[p.index].upLabel, rgb: up },
      decrease: { label: LEGEND_COLORS[p.index].downLabel, rgb: DOWN_COLOR },
      unchanged: "Transparent (|difference| <= threshold)",
      masked: "Gray (cloud, shadow, nodata or invalid on either date)",
      indexRamp: { min: RAMP_MIN, max: RAMP_MAX, note: "brown (low) to yellow to green (high)" },
      intensity: "Overlay opacity rises with |difference|, saturating at 0.5",
    },
    notes: [
      "Index values use surface reflectance = (DN + offset) / 10000; the -1000 offset is applied for processing baseline >= 04.00.",
      "Pixels count only if the SCL class is vegetation, not-vegetated or water on BOTH dates.",
      "Reflectance bands are bilinear-resampled to the output grid; SCL is nearest-neighbour. B11 is natively 20 m.",
      "True-color preview stretches reflectance 0 to 0.3 with gamma 2.2 (display only).",
    ],
  };
}