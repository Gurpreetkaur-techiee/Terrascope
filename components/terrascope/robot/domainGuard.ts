
const SPACE_KEYWORDS = [
  // Space and astronomy
  "space",
  "universe",
  "galaxy",
  "solar system",
  "planet",
  "earth",
  "moon",
  "sun",
  "star",
  "astronomy",
  "astronomical",
  "orbit",
  "orbital",
  "constellation",
  "black hole",
  "asteroid",
  "comet",
  "meteor",
  "mars",
  "jupiter",
  "saturn",

  // Satellites and space agencies
  "satellite",
  "satellites",
  "satellite imagery",
  "satellite image",
  "satellite data",
  "satellite tracking",
  "satellite observation",
  "satellite mission",
  "sentinel",
  "landsat",
  "copernicus",
  "nasa",
  "isro",
  "esa",
  "noaa",
  "modis",
  "viirs",
  "iss",
  "space station",
  "remote sensing",

  // Earth observation and GIS
  "earth observation",
  "geospatial",
  "gis",
  "geographic",
  "latitude",
  "longitude",
  "coordinates",
  "ndvi",
  "ndwi",
  "ndbi",
  "vegetation index",
  "vegetation",
  "land cover",
  "land use",
  "land surface",
  "change detection",
  "deforestation",
  "forest cover",
  "crop health",
  "agriculture",
  "water body",
  "water bodies",
  "glacier",
  "glaciers",
  "terrain",
  "elevation",
  "mapping",
  "map layer",

  // Weather and atmosphere
  "weather",
  "climate",
  "cloud",
  "clouds",
  "cloud cover",
  "cloudy",
  "clearest",
  "clear sky",
  "clear skies",
  "sky",
  "skies",
  "atmosphere",
  "temperature",
  "rainfall",
  "precipitation",
  "cyclone",
  "storm",
  "drought",
  "flood",
  "flooding",
  "wildfire",
  "wildfires",
  "fire",
  "fires",
  "fire detection",
  "smoke",
  "air quality",

  // TerraScope features and actions
  "terrascope",
  "scan",
  "scanning",
  "analyze location",
  "analyse location",
  "location analysis",
  "compare dates",
  "compare images",
  "compare satellite",
  "historical imagery",
  "historical data",
  "imagery",
  "image layer",
  "3d globe",
  "globe",
  "live tracker",
  "gps",
  "telemetry",
  "hotspot",
  "hotspots",
  "frp",
  "burn area",
  "burn scar",
];

const OUT_OF_SCOPE_MESSAGE =
  "I’m Terra, your space and Earth observation assistant. I can help with satellites, astronomy, satellite imagery, NDVI, GIS, weather observations, fire detection, and TerraScope features. Please ask me something related to these topics.";

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
}

export function isSpaceRelated(text: string): boolean {
  const normalized = normalize(text);

  if (!normalized) return false;

  // Explicit TerraScope location commands, e.g. "Scan Ludhiana".
  if (
    /^(please\s+)?(scan|analyze|analyse|check|monitor|track|map|locate)\s+([a-z][a-z\s-]{1,60})$/.test(
      normalized
    )
  ) {
    return true;
  }

  // Explicit Earth observation questions and commands.
  if (
    /\b(what|which|where|how|show|find|check|detect|compare|explain|tell me|analyze|analyse)\b/.test(
      normalized
    ) &&
    /\b(sky|skies|cloud|clouds|fire|fires|satellite|space|earth|location|weather|orbit|ndvi|image|imagery|globe)\b/.test(
      normalized
    )
  ) {
    return true;
  }

  return SPACE_KEYWORDS.some((keyword) => {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`\\b${escaped}\\b`, "i").test(normalized);
  });
}

export function isContextualFollowUp(
  message: string,
  conversation: { role: string; content: string }[]
): boolean {
  const normalized = normalize(message);

  const followUpPatterns =
    /^(what about|and what about|how about|tell me more|explain more|why|how so|its|their|that|this|there|what is its|how does it|what does it|can you explain|more details)/;

  if (!followUpPatterns.test(normalized)) return false;

  const previousMessages = conversation.slice(-8);

  return previousMessages.some(
    (item) =>
      (item.role === "user" || item.role === "assistant") &&
      isSpaceRelated(item.content)
  );
}

export { OUT_OF_SCOPE_MESSAGE };
