"use client";

import { useMemo, useState } from "react";
import type { Location } from "@/lib/terrascope-data";

export default function LocationSearch({
  locations,
  onSelect,
}: {
  locations: Location[];
  onSelect: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const results = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t
      ? locations.filter((l) => `${l.name} ${l.region}`.toLowerCase().includes(t))
      : locations.slice(0, 5);
  }, [q, locations]);

  const pick = (l: Location) => {
    onSelect(l.id);
    setQ(l.name);
    setOpen(false);
  };

  return (
    <div className="relative w-full max-w-md">
      <label htmlFor="loc" className="sr-only">Search locations</label>
      <input
        id="loc"
        value={q}
        placeholder="Search a city or region"
        autoComplete="off"
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && results[0]) pick(results[0]);
          if (e.key === "Escape") setOpen(false);
        }}
        className="w-full rounded-xl border border-[#1b2a44] bg-[#0b1426] px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-300 focus:outline-none"
      />
      {open && (
        <ul className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-[#1b2a44] bg-[#0b1426] shadow-xl">
          {results.length === 0 && (
            <li className="px-4 py-3 text-sm text-slate-400">No match. Try Dubai or Nairobi.</li>
          )}
          {results.map((l) => (
            <li key={l.id}>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(l)}
                className="flex w-full flex-col px-4 py-2.5 text-left hover:bg-[#12203a] focus-visible:bg-[#12203a] focus-visible:outline-none"
              >
                <span className="text-sm text-slate-100">{l.name}</span>
                <span className="text-xs text-slate-500">{l.region}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
