"use client";

import { navItems } from "@/lib/terrascope-data";

export type DashboardView = "mission" | "knowledge";

export default function Sidebar({
  open,
  onClose,
  view = "mission",
  onViewChange,
}: {
  open: boolean;
  onClose: () => void;
  view?: DashboardView;
  onViewChange?: (v: DashboardView) => void;
}) {
  return (
    <>
      {open && <button aria-label="Close menu" onClick={onClose} className="fixed inset-0 z-30 bg-black/70 lg:hidden" />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-cyan-400/15 bg-[#050e24] px-4 py-5 transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-3 px-2">
          <svg width="30" height="30" viewBox="0 0 28 28" aria-hidden className="drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]">
            <circle cx="14" cy="14" r="7" fill="none" stroke="#38e8ff" strokeWidth="1.5" />
            <ellipse cx="14" cy="14" rx="13" ry="4.5" fill="none" stroke="#a5f3fc" strokeWidth="1" transform="rotate(-25 14 14)" />
          </svg>
          <div>
            <p className="text-lg font-semibold leading-5 tracking-tight text-white">TerraScope</p>
            <p className="text-[11px] text-[#6f8cb3]">Mission control</p>
          </div>
        </div>

        <nav className="mt-9 flex flex-col gap-1" aria-label="Sections">
          {navItems.map((n) => (
            <a
              key={n.id}
              href={`#${n.id}`}
              onClick={(e) => {
                // From the Knowledge AI view, return to mission control first, then scroll to the section.
                if (view === "knowledge" && onViewChange) {
                  e.preventDefault();
                  onViewChange("mission");
                  requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(n.id)?.scrollIntoView({ block: "start" })));
                }
                onClose();
              }}
              className="border-l-2 border-transparent px-3 py-2 text-sm text-[#8fb0d8] transition hover:border-cyan-300 hover:bg-cyan-400/5 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
            >
              {n.label}
            </a>
          ))}
          {onViewChange && (
            <>
              <div className="my-2 border-t border-cyan-400/10" />
              <button
                onClick={() => {
                  onViewChange("knowledge");
                  onClose();
                }}
                aria-current={view === "knowledge" ? "page" : undefined}
                className={`border-l-2 px-3 py-2 text-left text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300 ${
                  view === "knowledge" ? "border-cyan-300 bg-cyan-400/10 text-white" : "border-transparent text-[#8fb0d8] hover:border-cyan-300 hover:bg-cyan-400/5 hover:text-white"
                }`}
              >
                Knowledge AI
              </button>
            </>
          )}
        </nav>

        <div className="mt-auto border border-cyan-400/15 bg-[#06122b] p-3 text-xs leading-5 text-[#8fb0d8]">
          <p className="font-medium text-cyan-100">Data source</p>
          <p>Sample data. No live satellite feed is connected.</p>
        </div>
      </aside>
    </>
  );
}