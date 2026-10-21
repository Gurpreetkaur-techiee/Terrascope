"use client";

import { useEffect, useMemo, useState } from "react";
import Panel, { Row } from "./Panel";
import { passesFor, type Location, type Satellite } from "@/lib/terrascope-data";
import { fmtHM, fmtLat, fmtLon, localMeanSolarHours, solarState, sunElevation } from "@/lib/astro";

export default function Telemetry({ loc, satellites }: { loc: Location; satellites: Satellite[] }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const t0 = window.setTimeout(() => setNow(new Date()), 0);
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => { clearTimeout(t0); clearInterval(t); };
  }, []);

  const sun = now ? solarState(now) : null;
  const el = now && sun ? sunElevation(loc.lat, loc.lon, sun) : null;
  const light = el === null ? "—" : el > 0 ? "Daylight" : el > -6 ? "Civil twilight" : el > -18 ? "Twilight" : "Night";

  const next = useMemo(() => {
    if (!now) return null;
    const h = now.getUTCHours() + now.getUTCMinutes() / 60;
    const all = passesFor(loc.id);
    const up = all.filter((p) => p.start > h).sort((a, b) => a.start - b.start)[0];
    const p = up ?? [...all].sort((a, b) => a.start - b.start)[0];
    const mins = Math.round(((p.start - h + 24) % 24) * 60);
    return { p, mins };
  }, [now, loc.id]);

  const sat = next ? satellites.find((s) => s.id === next.p.satId) : null;

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
      <Panel title="Target" tag="Computed from selection">
        <dl>
          <Row k="Site" v={loc.name} accent />
          <Row k="Region" v={loc.region} />
          <Row k="Latitude" v={fmtLat(loc.lat)} />
          <Row k="Longitude" v={fmtLon(loc.lon)} />
          <Row k="Local solar time" v={now ? fmtHM(localMeanSolarHours(loc.lon, now)) : "—"} />
          <Row k="Sun elevation" v={el === null ? "—" : `${el.toFixed(1)}°`} />
          <Row k="Illumination" v={light} accent />
        </dl>
      </Panel>

      <Panel title="Sun" tag="Computed from UTC">
        <dl>
          <Row k="Subsolar latitude" v={sun ? fmtLat(sun.declDeg) : "—"} />
          <Row k="Subsolar longitude" v={sun ? fmtLon(sun.subLon) : "—"} />
        </dl>
      </Panel>

      <Panel title="Next scheduled pass" tag="Sample schedule">
        {next && sat ? (
          <dl>
            <Row k="Satellite" v={sat.name} accent />
            <Row k="Start" v={`${fmtHM(next.p.start)} UTC`} />
            <Row k="Countdown" v={`${Math.floor(next.mins / 60)} h ${next.mins % 60} m`} />
            <Row k="Resolution" v={next.p.resolution} />
          </dl>
        ) : (
          <p className="text-xs text-[#6f8cb3]">Reading the clock…</p>
        )}
      </Panel>

      <Panel title="Constellation" tag="Sample parameters">
        <ul className="space-y-2.5 text-xs">
          {satellites.map((s) => (
            <li key={s.id}>
              <p className="flex items-center gap-2 text-[#cfe8ff]">
                <span className="size-2 rounded-full" style={{ background: s.color, boxShadow: `0 0 8px ${s.color}` }} />
                {s.name}
                <span className="text-[#6f8cb3]">{s.sensor}</span>
              </p>
              <p className="ml-4 font-mono text-[#8fb0d8]">
                {s.altKm} km · {s.incDeg}° incl · {s.periodMin} min
              </p>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
