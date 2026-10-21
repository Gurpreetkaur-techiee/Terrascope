"use client";

import { useState } from "react";
import { comparisons, type Comparison } from "@/lib/terrascope-data";

function Card({ c }: { c: Comparison }) {
  const [pos, setPos] = useState(50);
  const layer = (side: Comparison["before"]) => ({
    background: `radial-gradient(circle at 30% 30%, ${side.tint}, transparent 55%), repeating-linear-gradient(115deg, rgba(255,255,255,0.04) 0 2px, transparent 2px 14px), linear-gradient(135deg, ${side.from}, ${side.to})`,
  });
  return (
    <article className="overflow-hidden rounded-2xl border border-[#1b2a44] bg-[#0a1222]">
      <div className="relative aspect-[4/3] select-none">
        <div className="absolute inset-0" style={layer(c.after)} />
        <div className="absolute inset-0" style={{ ...layer(c.before), clipPath: `inset(0 ${100 - pos}% 0 0)` }} />
        <div className="absolute inset-y-0 w-px bg-white/80" style={{ left: `${pos}%` }} />
        <span className="absolute left-3 top-3 rounded bg-black/50 px-2 py-0.5 text-xs text-slate-200">{c.before.label}</span>
        <span className="absolute right-3 top-3 rounded bg-black/50 px-2 py-0.5 text-xs text-slate-200">{c.after.label}</span>
        <input
          type="range"
          min={0}
          max={100}
          value={pos}
          onChange={(e) => setPos(Number(e.target.value))}
          aria-label={`Compare ${c.title}: before and after`}
          className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
        />
      </div>
      <div className="p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="font-medium text-slate-100">{c.title}</h3>
          <span className={`text-lg font-semibold ${c.trend === "down" ? "text-amber-300" : "text-sky-300"}`}>{c.delta}</span>
        </div>
        <p className="text-xs text-slate-500">{c.metric}</p>
        <p className="mt-2 text-sm text-slate-400">{c.note}</p>
      </div>
    </article>
  );
}

export default function ComparisonCards() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {comparisons.map((c) => <Card key={c.id} c={c} />)}
    </div>
  );
}
