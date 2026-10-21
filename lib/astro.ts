const RAD = Math.PI / 180;

/** Sun position computed from the real current time (low-precision solar formulae). */
export function solarState(date: Date = new Date()) {
  const n = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = (357.528 + 0.9856003 * n) * RAD;
  const lam = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const eps = (23.439 - 0.0000004 * n) * RAD;
  const decl = Math.asin(Math.sin(eps) * Math.sin(lam));
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lam), Math.cos(lam));
  const gmst = (280.46061837 + 360.98564736629 * n) % 360;
  const subLon = ((((ra / RAD - gmst) % 360) + 540) % 360) - 180;
  return { declDeg: decl / RAD, subLon };
}

export function sunElevation(lat: number, lon: number, s: { declDeg: number; subLon: number }) {
  const h = (lon - s.subLon) * RAD;
  const d = s.declDeg * RAD;
  const p = lat * RAD;
  return Math.asin(Math.sin(p) * Math.sin(d) + Math.cos(p) * Math.cos(d) * Math.cos(h)) / RAD;
}

export const localMeanSolarHours = (lon: number, date: Date) =>
  (date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600 + lon / 15 + 24) % 24;

export const fmtLat = (v: number) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? "N" : "S"}`;
export const fmtLon = (v: number) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? "E" : "W"}`;
export const fmtHM = (h: number) => {
  const t = Math.round(h * 60);
  return `${String(Math.floor(t / 60) % 24).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};
