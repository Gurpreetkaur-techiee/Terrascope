"use client";

import { useEffect, useState } from "react";
import { locations, satellites } from "@/lib/terrascope-data";
import Sidebar from "./Sidebar";
import LocationSearch from "./LocationSearch";
import Globe from "./Globe";
import Telemetry from "./Telemetry";
import Timeline from "./Timeline";
import ComparisonCards from "./ComparisonCards";
import Panel from "./Panel";
import FirePanel from "./FirePanel";
import { useFires } from "./useFires";
import { fmtLat, fmtLon } from "@/lib/astro";


function UtcClock() {
  const [t, setT] = useState<Date | null>(null);
  useEffect(() => {
    const t0 = window.setTimeout(() => setT(new Date()), 0);
    const i = window.setInterval(() => setT(new Date()), 1000);
    return () => { clearTimeout(t0); clearInterval(i); };
  }, []);
  return (
    <div className="ml-auto text-right font-mono leading-tight">
      <p className="text-sm text-cyan-200 [text-shadow:0_0_10px_rgba(34,211,238,0.6)]">{t ? t.toISOString().slice(11, 19) : "--:--:--"} UTC</p>
      <p className="text-[11px] text-[#6f8cb3]">{t ? t.toISOString().slice(0, 10) : "----------"}</p>
    </div>
  );
}

export default function Dashboard() {
  const [menu, setMenu] = useState(false);
  const [selectedId, setSelectedId] = useState("ludhiana");
  const loc = locations.find((l) => l.id === selectedId)!;
  const fireState = useFires();
  const [showFires, setShowFires] = useState(true);
  const [selectedFireId, setSelectedFireId] = useState<string | null>(null);
  const [fireStats, setFireStats] = useState<{ rendered: number; skipped: number } | null>(null);
  const [frameTick, setFrameTick] = useState(0);
  const selectedFire = fireState.fires.find((f) => f.id === selectedFireId) ?? null;

  return (
    <div className="flex min-h-screen bg-[#030816] bg-[radial-gradient(ellipse_at_top,rgba(14,60,120,0.35),transparent_60%)] text-[#cfe8ff]">
      <Sidebar open={menu} onClose={() => setMenu(false)} />
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-cyan-400/15 bg-[#030816]/85 px-4 py-3 backdrop-blur sm:px-8">
          <button onClick={() => setMenu(true)} aria-label="Open menu" className="border border-cyan-400/20 px-3 py-2 text-sm lg:hidden">Menu</button>
          <LocationSearch locations={locations} onSelect={setSelectedId} />
          <UtcClock />
        </header>

        <main className="mx-auto max-w-[1400px] space-y-6 px-4 py-6 sm:px-8">
          <section id="overview" className="scroll-mt-20">
            <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl [text-shadow:0_0_24px_rgba(34,211,238,0.35)]">{loc.name}</h1>
            <p className="mt-1 text-sm text-[#6f8cb3]">{loc.region} · <span className="font-mono text-[#8fb0d8]">{fmtLat(loc.lat)}, {fmtLon(loc.lon)}</span></p>
          </section>

          <section id="globe" className="grid scroll-mt-20 gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <div className="relative border border-cyan-400/15 bg-[#020611] shadow-[0_0_60px_rgba(34,211,238,0.08)]">
              <div className="h-[420px] sm:h-[560px] xl:h-[680px]">
                <Globe
                  locations={locations}
                  satellites={satellites}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  fires={fireState.fires}
                  showFires={showFires}
                  selectedFireId={selectedFireId}
                  onFireSelect={setSelectedFireId}
                  onFireStats={setFireStats}
                  frameSignal={frameTick}
                />
              </div>
              <p className="pointer-events-none absolute bottom-3 left-4 text-[11px] leading-4 text-[#6f8cb3]">
                Drag to rotate · +/− or Ctrl+scroll to zoom · select a pin or fire marker<br />Orbit paths are illustrative and not to scale
              </p>
              <ul className="absolute right-3 top-3 hidden max-h-[60%] gap-1 overflow-auto sm:grid">
                {locations.map((l) => (
                  <li key={l.id}>
                    <button
                      onClick={() => setSelectedId(l.id)}
                      aria-pressed={l.id === selectedId}
                      className={`w-full px-3 py-1 text-left text-xs transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 ${l.id === selectedId ? "bg-cyan-400/15 text-white shadow-[0_0_12px_rgba(34,211,238,0.3)]" : "bg-[#06122b]/70 text-[#8fb0d8] hover:text-white"}`}
                    >
                      {l.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            <div className="space-y-4">
              <FirePanel state={fireState} show={showFires} onToggle={() => setShowFires((v) => !v)} selected={selectedFire} onClear={() => setSelectedFireId(null)} rendered={fireStats?.rendered ?? null} onFrame={() => setFrameTick((n) => n + 1)} />
              <Telemetry loc={loc} satellites={satellites} />
            </div>
          </section>

          <section id="timeline" className="scroll-mt-20">
            <Panel title="Satellite passes, 24 hours UTC" tag="Sample schedule">
              <Timeline locationId={selectedId} />
            </Panel>
          </section>

          <section id="compare" className="scroll-mt-20">
            <h2 className="mb-4 font-medium text-white">Change detection</h2>
            <ComparisonCards />
          </section>
        </main>
        
      </div>
       
    </div>
  );
}
