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
        className="w-full  border border-cyan-400/20 bg-[#06122b] px-4 py-2.5 text-sm text-[#cfe8ff] placeholder:text-[#4d6a91] focus:border-cyan-300 focus:shadow-[0_0_16px_rgba(34,211,238,0.25)] focus:outline-none"
      />
      {open && (
        <ul className="absolute z-20 mt-2 w-full overflow-hidden border border-cyan-400/20 bg-[#06122b] shadow-xl">
          {results.length === 0 && (
            <li className="px-4 py-3 text-sm text-[#8fb0d8]">No match. Try Dubai or Nairobi.</li>
          )}
          {results.map((l) => (
            <li key={l.id}>
              <button
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(l)}
                className="flex w-full flex-col px-4 py-2.5 text-left hover:bg-cyan-400/10 focus-visible:bg-cyan-400/10 focus-visible:outline-none"
              >
                <span className="text-sm text-white">{l.name}</span>
                <span className="text-xs text-[#6f8cb3]">{l.region}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
