export type Location = {
  id: string;
  name: string;
  region: string;
  lat: number;
  lon: number;
  cloud: number; // % cloud cover (mock)
};

export type Satellite = {
  id: string;
  name: string;
  sensor: string;
  color: string;
};

export type Pass = {
  id: string;
  satId: string;
  start: number; // hours from 0-24
  duration: number; // hours
  resolution: string;
  status: "captured" | "scheduled" | "processing";
};

export type Comparison = {
  id: string;
  title: string;
  before: { label: string; from: string; to: string; tint: string };
  after: { label: string; from: string; to: string; tint: string };
  metric: string;
  delta: string;
  trend: "up" | "down";
  note: string;
};

export const locations: Location[] = [
  { id: "ludhiana", name: "Ludhiana", region: "Punjab, India", lat: 30.9, lon: 75.85, cloud: 12 },
  { id: "rotterdam", name: "Rotterdam", region: "South Holland, Netherlands", lat: 51.92, lon: 4.48, cloud: 58 },
  { id: "manaus", name: "Manaus", region: "Amazonas, Brazil", lat: -3.12, lon: -60.02, cloud: 71 },
  { id: "dubai", name: "Dubai", region: "United Arab Emirates", lat: 25.2, lon: 55.27, cloud: 4 },
  { id: "reykjavik", name: "Reykjavík", region: "Capital Region, Iceland", lat: 64.15, lon: -21.94, cloud: 66 },
  { id: "nairobi", name: "Nairobi", region: "Nairobi County, Kenya", lat: -1.29, lon: 36.82, cloud: 34 },
  { id: "tahoe", name: "Lake Tahoe", region: "California, USA", lat: 39.1, lon: -120.04, cloud: 9 },
  { id: "jakarta", name: "Jakarta", region: "Java, Indonesia", lat: -6.2, lon: 106.85, cloud: 63 },
];

export const satellites: Satellite[] = [
  { id: "ts1", name: "TerraScope-1", sensor: "Optical 0.5 m", color: "#7dd3fc" },
  { id: "ts2", name: "TerraScope-2", sensor: "SAR 1 m", color: "#fbbf24" },
  { id: "ts3", name: "Helio-3", sensor: "Multispectral 3 m", color: "#c4b5fd" },
];

export function passesFor(locationId: string): Pass[] {
  // Deterministic mock schedule derived from the location id
  let seed = 0;
  for (const c of locationId) seed = (seed * 31 + c.charCodeAt(0)) % 997;
  const rand = (n: number) => {
    seed = (seed * 9301 + 49297) % 233280;
    return (seed / 233280) * n;
  };
  const res = ["0.5 m", "1 m", "3 m"];
  return Array.from({ length: 7 }, (_, i) => {
    const start = Math.round((i * 3.2 + rand(1.6)) * 10) / 10;
    return {
      id: `${locationId}-${i}`,
      satId: satellites[i % 3].id,
      start: Math.min(start, 22.5),
      duration: Math.round((0.6 + rand(0.9)) * 10) / 10,
      resolution: res[i % 3],
      status: start < 9 ? "captured" : start < 12 ? "processing" : "scheduled",
    } as Pass;
  });
}

export const comparisons: Comparison[] = [
  {
    id: "c1",
    title: "Reservoir water level",
    before: { label: "Mar 2024", from: "#0e3a4f", to: "#1f6b7a", tint: "rgba(56,189,248,0.35)" },
    after: { label: "Mar 2026", from: "#3b2f22", to: "#6b5238", tint: "rgba(251,191,36,0.25)" },
    metric: "Surface area",
    delta: "−38%",
    trend: "down",
    note: "Shoreline retreated about 1.2 km on the northern basin.",
  },
  {
    id: "c2",
    title: "Urban expansion",
    before: { label: "Jan 2023", from: "#16222f", to: "#26394d", tint: "rgba(148,163,184,0.25)" },
    after: { label: "Jan 2026", from: "#2a2a3d", to: "#5b4b7a", tint: "rgba(196,181,253,0.35)" },
    metric: "Built-up area",
    delta: "+14%",
    trend: "up",
    note: "New industrial parcels detected along the eastern ring road.",
  },
  {
    id: "c3",
    title: "Forest canopy",
    before: { label: "Jun 2022", from: "#0f3b2a", to: "#1d6b43", tint: "rgba(74,222,128,0.3)" },
    after: { label: "Jun 2026", from: "#2d3a1f", to: "#5c6b34", tint: "rgba(250,204,21,0.2)" },
    metric: "Canopy cover",
    delta: "−9%",
    trend: "down",
    note: "Clearing clusters appear along the new access road.",
  },
];

export const navItems = [
  { id: "overview", label: "Overview" },
  { id: "globe", label: "Globe" },
  { id: "timeline", label: "Passes" },
  { id: "compare", label: "Change detection" },
];