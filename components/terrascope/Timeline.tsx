"use client";

import { useEffect, useMemo, useState } from "react";
import { passesFor, satellites } from "@/lib/terrascope-data";
import { fmtHM } from "@/lib/astro";

const statusStyle = { captured: "text-emerald-300", processing: "text-amber-300", scheduled: "text-cyan-300" };

export default function Timeline({ locationId }: { locationId: string }) {
  const [sat, setSat] = useState("all");
  const [nowH, setNowH] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => { const d = new Date(); setNowH(d.getUTCHours() + d.getUTCMinutes() / 60); };
    const t0 = window.setTimeout(tick, 0);
    const t = window.setInterval(tick, 30000);
    return () => { clearTimeout(t0); clearInterval(t); };
  }, []);
  const passes = useMemo(() => passesFor(locationId).filter((p) => sat === "all" || p.satId === sat), [locationId, sat]);

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter by satellite">
        {[{ id: "all", name: "All satellites", color: "#8fb0d8" }, ...satellites].map((s) => (
          <button
            key={s.id}
            aria-pressed={sat === s.id}
            onClick={() => setSat(s.id)}
            className={`flex items-center gap-2 border px-3 py-1 text-xs transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 ${
              sat === s.id ? "border-cyan-300/60 bg-cyan-400/10 text-white shadow-[0_0_14px_rgba(34,211,238,0.2)]" : "border-cyan-400/15 text-[#8fb0d8] hover:text-white"
            }`}
          >
            <span className="size-2 rounded-full" style={{ background: s.color }} />
            {s.name}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="relative h-24 min-w-[640px] border border-cyan-400/15 bg-[#040b1d]">
          {[0, 4, 8, 12, 16, 20, 24].map((h) => (
            <div key={h} className="absolute inset-y-0 border-l border-cyan-400/10" style={{ left: `${(h / 24) * 100}%` }}>
              <span className="absolute bottom-1 left-1 font-mono text-[10px] text-[#4d6a91]">{fmtHM(h === 24 ? 23.99 : h)}</span>
            </div>
          ))}
          {passes.map((p, i) => {
            const s = satellites.find((x) => x.id === p.satId)!;
            return (
              <div
                key={p.id}
                title={`${s.name}, ${fmtHM(p.start)} UTC`}
                className="absolute h-3 rounded-full"
                style={{ left: `${(p.start / 24) * 100}%`, width: `${Math.max((p.duration / 24) * 100, 2)}%`, top: 10 + (i % 3) * 18, background: s.color, boxShadow: `0 0 10px ${s.color}`, opacity: p.status === "scheduled" ? 0.6 : 1 }}
              />
            );
          })}
          {nowH !== null && (
            <div className="absolute inset-y-0 w-px bg-white/80 shadow-[0_0_8px_#fff]" style={{ left: `${(nowH / 24) * 100}%` }} title="Current UTC time" />
          )}
        </div>
      </div>
      <p className="mt-1 text-[11px] text-[#6f8cb3]">White line marks the current UTC time. Passes are a sample schedule.</p>

      <ul className="mt-3 divide-y divide-cyan-400/10 text-sm">
        {passes.map((p) => {
          const s = satellites.find((x) => x.id === p.satId)!;
          return (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
              <span className="flex items-center gap-2 text-[#cfe8ff]">
                <span className="size-2 rounded-full" style={{ background: s.color }} />
                {s.name}
                <span className="text-[#6f8cb3]">{s.sensor}</span>
              </span>
              <span className="font-mono text-xs text-[#8fb0d8]">
                {fmtHM(p.start)} UTC · {p.resolution}
                <span className={`ml-3 ${statusStyle[p.status]}`}>{p.status}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
