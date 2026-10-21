"use client";

import { navItems } from "@/lib/terrascope-data";

export default function Sidebar({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <>
      {open && (
        <button
          aria-label="Close menu"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
        />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-[#1b2a44] bg-[#070d1a] px-4 py-5 transition-transform lg:static lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center gap-3 px-2">
          <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
            <circle cx="14" cy="14" r="8" fill="none" stroke="#7dd3fc" strokeWidth="1.5" />
            <ellipse cx="14" cy="14" rx="13" ry="4.5" fill="none" stroke="#fbbf24" strokeWidth="1.5" transform="rotate(-25 14 14)" />
          </svg>
          <span className="text-lg font-semibold tracking-tight text-slate-100">TerraScope</span>
        </div>

        <nav className="mt-8 flex flex-col gap-1" aria-label="Sections">
          {navItems.map((n) => (
            <a
              key={n.id}
              href={`#${n.id}`}
              onClick={onClose}
              className="rounded-lg px-3 py-2 text-sm text-slate-400 transition hover:bg-[#0f1a30] hover:text-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300"
            >
              {n.label}
            </a>
          ))}
        </nav>

        <div className="mt-auto rounded-xl border border-[#1b2a44] bg-[#0b1426] p-4 text-sm">
          <p className="font-medium text-slate-200">Tasking quota</p>
          <p className="mt-1 text-slate-400">42 of 60 captures used this month</p>
          <div className="mt-3 h-1.5 rounded-full bg-[#16233b]">
            <div className="h-full w-[70%] rounded-full bg-amber-300" />
          </div>
        </div>
      </aside>
    </>
  );
}
