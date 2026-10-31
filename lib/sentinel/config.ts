// lib/sentinel/config.ts
// Shared constants for real Sentinel-2 L2A change detection.
// Data source: Microsoft Planetary Computer (no API key required).

export const STAC_SEARCH_URL =
  "https://planetarycomputer.microsoft.com/api/stac/v1/search";
export const DATA_BBOX_URL =
  "https://planetarycomputer.microsoft.com/api/data/v1/item/bbox";
export const COLLECTION = "sentinel-2-l2a";

export type IndexType = "ndvi" | "ndwi" | "ndbi";

// Index = (a - b) / (a + b), using Sentinel-2 L2A bands.
export const INDEX_DEFS: Record<
  IndexType,
  { a: string; b: string; label: string; formula: string }
> = {
  ndvi: { a: "B08", b: "B04", label: "Vegetation (NDVI)", formula: "(B08 - B04) / (B08 + B04)" },
  ndwi: { a: "B03", b: "B08", label: "Water (NDWI)", formula: "(B03 - B08) / (B03 + B08)" },
  ndbi: { a: "B11", b: "B08", label: "Built-up (NDBI)", formula: "(B11 - B08) / (B11 + B08)" },
};

// SCL classes treated as valid land/water observations.
// 4 vegetation, 5 not vegetated, 6 water. Everything else is masked.
export const VALID_SCL_CLASSES = [4, 5, 6];

// L2A reflectance = (DN + BOA_ADD_OFFSET) / QUANTIFICATION.
// The offset applies to processing baseline >= 04.00 (ESA convention).
export const QUANTIFICATION = 10000;
export const BOA_ADD_OFFSET = -1000;
export const OFFSET_MIN_BASELINE = 4.0;

// Change thresholds (absolute index difference, unitless).
// A |difference| of 0.10 is a commonly used starting point for separating
// real change from sensor noise and seasonal variation. It is NOT universal:
// tune it per region and season. Users can override it in the UI/request.
export const DEFAULT_THRESHOLDS: Record<IndexType, number> = {
  ndvi: 0.1,
  ndwi: 0.1,
  ndbi: 0.1,
};

// Limits that keep downloads small and requests safe.
export const LIMITS = {
  maxSceneCloudCover: 20, // % - default scene filter
  maxAoiSideKm: 25, // largest allowed AOI side length
  minAoiSideKm: 0.5,
  outputPixels: 512, // raster size requested per band
  minValidFraction: 0.5, // refuse results if < 50% of pixels are valid
  requestTimeoutMs: 45000,
};