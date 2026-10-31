"use client";

import { useState } from "react";
import { locations, satellites } from "@/lib/terrascope-data";
import Sidebar from "./Sidebar";
import LocationSearch from "./LocationSearch";
import type { SearchedPlace } from "./LocationSearch";
import Globe from "./Globe";
import Timeline from "./Timeline";
import ComparisonCards from "./ComparisonCards";

const panel = "rounded-2xl border border-[#1b2a44] bg-[#0a1222] p-4 sm:p-6";

type ActiveView = {
  name: string;
  region: string;
  lat: number;
  lon: number;
  cloud: number | null; // null = no real data (searched places)
};

export default function Dashboard() {
  const [menu, setMenu] = useState(false);
  const [selectedId, setSelectedId] = useState("ludhiana");
  const [place, setPlace] = useState<SearchedPlace | null>(null);

  const monitored = locations.find((l) => l.id === selectedId) ?? locations[0];
  const view: ActiveView = place
    ? { name: place.name, region: place.region, lat: place.lat, lon: place.lon, cloud: null }
    : { name: monitored.name, region: monitored.region, lat: monitored.lat, lon: monitored.lon, cloud: monitored.cloud };

  // Choosing a monitored site (list, pin or search) clears any searched place.
  const selectSite = (id: string) => {
    setSelectedId(id);
    setPlace(null);
  };
  const selectPlace = (p: SearchedPlace) => setPlace(p);

  return (
    <div className="flex min-h-screen bg-[#04070f] text-slate-200">
      <Sidebar open={menu} onClose={() => setMenu(false)} />
      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-[#1b2a44] bg-[#04070f]/90 px-4 py-3 backdrop-blur sm:px-8">
          <button
            onClick={() => setMenu(true)}
            aria-label="Open menu"
            className="rounded-lg border border-[#1b2a44] px-3 py-2 text-sm lg:hidden"
          >
            Menu
          </button>
          <LocationSearch locations={locations} onSelect={selectSite} onSelectPlace={selectPlace} />
        </header>

        <main className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-8">
          <section id="overview" className="scroll-mt-20">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">{view.name}</h1>
            {view.region && <p className="text-slate-500">{view.region}</p>}
            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Latitude", `${view.lat.toFixed(2)}°`],
                ["Longitude", `${view.lon.toFixed(2)}°`],
                ["Cloud cover", view.cloud === null ? "Not available" : `${view.cloud}%`],
                ["Next pass", place ? "Not available" : "in 2 h 14 m"],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl border border-[#1b2a44] bg-[#0a1222] px-4 py-3">
                  <dt className="text-xs text-slate-500">{k}</dt>
                  <dd className="mt-1 text-lg font-medium text-slate-100">{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section id="globe" className={`${panel} scroll-mt-20`}>
            <div className="grid items-center gap-6 md:grid-cols-[minmax(0,1fr)_260px]">
              <div className="mx-auto aspect-square w-full max-w-[520px]">
                <Globe
                  locations={locations}
                  satellites={satellites}
                  selectedId={place ? null : selectedId}
                  onSelect={selectSite}
                  searchTarget={place}
                />
              </div>
              <div>
                <h2 className="font-medium text-slate-100">Monitored sites</h2>
                <p className="mb-3 text-sm text-slate-500">Drag to rotate, or pick a pin.</p>
                {place && (
                  <p className="mb-3 rounded-lg border border-emerald-400/30 bg-emerald-400/5 px-3 py-2 text-xs text-emerald-200">
                    Showing search result: {place.name}. Pick a site to return to monitored data.
                  </p>
                )}
                <ul className="grid gap-1 sm:grid-cols-2 md:grid-cols-1">
                  {locations.map((l) => {
                    const on = !place && l.id === selectedId;
                    return (
                      <li key={l.id}>
                        <button
                          onClick={() => selectSite(l.id)}
                          aria-pressed={on}
                          className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 ${
                            on ? "bg-[#14233f] text-amber-200" : "text-slate-400 hover:bg-[#0f1a30]"
                          }`}
                        >
                          {l.name}
                          <span className="text-xs text-slate-500">{l.cloud}% cloud</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </section>

          <section id="timeline" className={`${panel} scroll-mt-20`}>
            <h2 className="mb-4 font-medium text-slate-100">Satellite passes, next 24 hours</h2>
            {place ? (
              <p className="text-sm text-slate-500">
                Satellite pass data is not available for searched locations. Select a monitored site to see its schedule.
              </p>
            ) : (
              <Timeline locationId={selectedId} />
            )}
          </section>

          <section id="compare" className="scroll-mt-20">
            <h2 className="mb-4 font-medium text-slate-100">Change detection</h2>
            <ComparisonCards />
          </section>
        </main>
      </div>
    </div>
  );
}