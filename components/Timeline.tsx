"use client";

import { useMemo, useState } from "react";
import { passesFor, satellites } from "@/lib/terrascope-data";

const fmt = (h: number) => {
  const m = Math.round((h % 1) * 60);
  return `${String(Math.floor(h)).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
};

const statusStyle = {
  captured: "text-emerald-300",
  processing: "text-amber-300",
  scheduled: "text-sky-300",
};

export default function Timeline({ locationId }: { locationId: string }) {
  const [sat, setSat] = useState<string>("all");
  const passes = useMemo(
    () => passesFor(locationId).filter((p) => sat === "all" || p.satId === sat),
    [locationId, sat],
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by satellite">
        {[{ id: "all", name: "All satellites", color: "#94a3b8" }, ...satellites].map((s) => (
          <button
            key={s.id}
            aria-pressed={sat === s.id}
            onClick={() => setSat(s.id)}
            className={`flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 ${
              sat === s.id ? "border-slate-300 bg-[#12203a] text-slate-100" : "border-[#1b2a44] text-slate-400 hover:text-slate-200"
            }`}
          >
            <span className="size-2 rounded-full" style={{ background: s.color }} />
            {s.name}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="relative h-24 min-w-[640px] rounded-xl border border-[#1b2a44] bg-[#080f1d]">
          {[0, 4, 8, 12, 16, 20, 24].map((h) => (
            <div key={h} className="absolute inset-y-0 border-l border-[#14223a]" style={{ left: `${(h / 24) * 100}%` }}>
              <span className="absolute bottom-1 left-1 text-[10px] text-slate-500">{fmt(h)}</span>
            </div>
          ))}
          {passes.map((p, i) => {
            const s = satellites.find((x) => x.id === p.satId)!;
            return (
              <div
                key={p.id}
                title={`${s.name}, ${fmt(p.start)}`}
                className="absolute h-3 rounded-full"
                style={{
                  left: `${(p.start / 24) * 100}%`,
                  width: `${Math.max((p.duration / 24) * 100, 2)}%`,
                  top: 10 + (i % 3) * 18,
                  background: s.color,
                  opacity: p.status === "scheduled" ? 0.55 : 1,
                }}
              />
            );
          })}
        </div>
      </div>

      <ul className="mt-4 divide-y divide-[#14223a] text-sm">
        {passes.map((p) => {
          const s = satellites.find((x) => x.id === p.satId)!;
          return (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="flex items-center gap-2 text-slate-200">
                <span className="size-2 rounded-full" style={{ background: s.color }} />
                {s.name}
                <span className="text-slate-500">{s.sensor}</span>
              </span>
              <span className="text-slate-400">
                {fmt(p.start)} UTC · {p.resolution}
                <span className={`ml-3 ${statusStyle[p.status]}`}>{p.status}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
