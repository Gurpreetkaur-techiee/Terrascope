"use client";

import { useEffect, useMemo, useState } from "react";
import type { Location } from "@/lib/terrascope-data";

/** A place found through worldwide search. Shared by LocationSearch, Dashboard and Globe. */
export type SearchedPlace = {
  id: string;
  name: string;
  region: string;
  lat: number;
  lon: number;
};

type PhotonProperties = {
  osm_id?: number;
  osm_type?: string;
  name?: string;
  street?: string;
  district?: string;
  city?: string;
  county?: string;
  state?: string;
  country?: string;
};

type PhotonFeature = {
  geometry?: { type?: string; coordinates?: number[] };
  properties?: PhotonProperties;
};

type PhotonResponse = { features?: PhotonFeature[] };

type SearchStatus = "idle" | "loading" | "ready" | "error";

type Option =
  | { kind: "site"; key: string; loc: Location }
  | { kind: "place"; key: string; place: SearchedPlace };

const PHOTON_URL = "https://photon.komoot.io/api/";
const MIN_CHARS = 2;
const DEBOUNCE_MS = 350;
const MAX_RESULTS = 6;

const toPlaces = (data: PhotonResponse): SearchedPlace[] => {
  const out: SearchedPlace[] = [];
  const seen = new Set<string>();
  for (const f of data.features ?? []) {
    const c = f.geometry?.coordinates;
    const p = f.properties;
    if (!c || c.length < 2 || !p) continue;
    const lon = c[0];
    const lat = c[1];
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const name = (p.name ?? p.street ?? "").trim();
    if (!name) continue;
    const region = [p.city ?? p.district ?? p.county, p.state, p.country]
      .filter((x, i, arr): x is string => !!x && x.trim() !== "" && x !== name && arr.indexOf(x) === i)
      .join(", ");
    const id = `${p.osm_type ?? "x"}${p.osm_id ?? ""}:${lat.toFixed(5)},${lon.toFixed(5)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name, region, lat, lon });
  }
  return out;
};

export default function LocationSearch({
  locations,
  onSelect,
  onSelectPlace,
}: {
  locations: Location[];
  /** Called when one of the monitored sites is chosen. */
  onSelect: (id: string) => void;
  /** Called when a worldwide search result is chosen. */
  onSelectPlace: (place: SearchedPlace) => void;
}) {
  const [q, setQ] = useState("");
  const [term, setTerm] = useState(""); // trimmed text that drives the network search
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SearchedPlace[]>([]);
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [active, setActive] = useState(-1);

  // Debounced Photon request. Cleanup aborts the in-flight request, so an older response can never overwrite a newer one.
  useEffect(() => {
    if (term.length < MIN_CHARS) return;
    const ctrl = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const url = `${PHOTON_URL}?q=${encodeURIComponent(term)}&limit=${MAX_RESULTS}&lang=en`;
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as PhotonResponse;
        if (ctrl.signal.aborted) return;
        setItems(toPlaces(data));
        setStatus("ready");
        setActive(-1);
      } catch {
        if (ctrl.signal.aborted) return;
        setItems([]);
        setStatus("error");
      }
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      ctrl.abort();
    };
  }, [term]);

  // Monitored sites that match the text (or the first five when the box is empty, as before).
  const siteOptions = useMemo<Option[]>(() => {
    const t = q.trim().toLowerCase();
    const list = t
      ? locations.filter((l) => `${l.name} ${l.region}`.toLowerCase().includes(t)).slice(0, 3)
      : locations.slice(0, 5);
    return list.map((loc) => ({ kind: "site", key: `site-${loc.id}`, loc }));
  }, [q, locations]);

  const searching = term.length >= MIN_CHARS;
  const placeOptions: Option[] = searching
    ? items.map((place) => ({ kind: "place", key: `place-${place.id}`, place }))
    : [];
  const options: Option[] = [...siteOptions, ...placeOptions];

  const pick = (o: Option) => {
    if (o.kind === "site") {
      onSelect(o.loc.id);
      setQ(o.loc.name);
    } else {
      onSelectPlace(o.place);
      setQ(o.place.name);
    }
    setOpen(false);
    setActive(-1);
  };

  const renderOption = (o: Option, i: number) => {
    const name = o.kind === "site" ? o.loc.name : o.place.name;
    const sub = o.kind === "site" ? o.loc.region : o.place.region;
    return (
      <li
        key={o.key}
        id={`loc-opt-${i}`}
        role="option"
        aria-selected={i === active}
        onMouseDown={(e) => e.preventDefault()}
        onMouseEnter={() => setActive(i)}
        onClick={() => pick(o)}
        className={`flex cursor-pointer flex-col px-4 py-2.5 text-left ${i === active ? "bg-[#12203a]" : "hover:bg-[#12203a]"}`}
      >
        <span className="truncate text-sm text-slate-100">{name}</span>
        {sub && <span className="truncate text-xs text-slate-500">{sub}</span>}
      </li>
    );
  };

  const header = "px-4 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-slate-500";
  const note = "px-4 py-3 text-sm text-slate-400";

  return (
    <div className="relative w-full max-w-md">
      <label htmlFor="loc" className="sr-only">Search locations</label>
      <input
        id="loc"
        role="combobox"
        aria-expanded={open}
        aria-controls="loc-list"
        aria-autocomplete="list"
        aria-activedescendant={open && active >= 0 ? `loc-opt-${active}` : undefined}
        value={q}
        placeholder="Search any place in the world"
        autoComplete="off"
        onChange={(e) => {
          const v = e.target.value;
          const t = v.trim();
          setQ(v);
          setOpen(true);
          setActive(-1);
          if (t !== term) {
            setTerm(t);
            setItems([]);
            setStatus(t.length >= MIN_CHARS ? "loading" : "idle");
          }
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            if (options.length) setActive((a) => (a + 1) % options.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setOpen(true);
            if (options.length) setActive((a) => (a <= 0 ? options.length - 1 : a - 1));
          } else if (e.key === "Enter") {
            const o = options[active] ?? options[0];
            if (o) {
              e.preventDefault();
              pick(o);
            }
          } else if (e.key === "Escape") {
            setOpen(false);
            setActive(-1);
          }
        }}
        className="w-full rounded-xl border border-[#1b2a44] bg-[#0b1426] px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-300 focus:outline-none"
      />
      {open && (
        <ul
          id="loc-list"
          role="listbox"
          className="absolute z-20 mt-2 max-h-[70vh] w-full overflow-y-auto rounded-xl border border-[#1b2a44] bg-[#0b1426] shadow-xl"
        >
          {siteOptions.length > 0 && (
            <>
              <li role="presentation" className={header}>Monitored sites</li>
              {siteOptions.map((o, i) => renderOption(o, i))}
            </>
          )}

          {q.trim().length > 0 && !searching && (
            <li role="presentation" className={note}>Type at least {MIN_CHARS} characters to search worldwide.</li>
          )}

          {searching && (
            <>
              <li role="presentation" className={header}>Worldwide results</li>
              {status === "loading" && <li role="presentation" className={note}>Searching worldwide…</li>}
              {status === "error" && (
                <li role="presentation" className={note}>
                  Search is unavailable right now. Check your connection and try again.
                </li>
              )}
              {status === "ready" && placeOptions.length === 0 && (
                <li role="presentation" className={note}>No places found for “{term}”.</li>
              )}
              {placeOptions.map((o, i) => renderOption(o, siteOptions.length + i))}
              <li role="presentation" className="border-t border-[#1b2a44] px-4 py-2 text-[10px] text-slate-500">
                Search by Photon · Map data ©{" "}
                <a
                  href="https://www.openstreetmap.org/copyright"
                  target="_blank"
                  rel="noopener noreferrer"
                  onMouseDown={(e) => e.preventDefault()}
                  className="underline hover:text-sky-300"
                >
                  OpenStreetMap contributors
                </a>
              </li>
            </>
          )}
        </ul>
      )}
    </div>
  );
}