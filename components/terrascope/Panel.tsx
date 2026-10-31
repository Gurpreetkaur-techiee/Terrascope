import type { ReactNode } from "react";

const tick = "pointer-events-none absolute size-2.5 border-cyan-300/70";

export default function Panel({
  title,
  tag,
  children,
  className = "",
}: {
  title: string;
  tag?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`relative border border-cyan-400/15 bg-[#06122b]/80 p-4 shadow-[0_0_32px_rgba(34,211,238,0.06)] backdrop-blur ${className}`}>
      <i className={`${tick} -left-px -top-px border-l-2 border-t-2`} />
      <i className={`${tick} -right-px -top-px border-r-2 border-t-2`} />
      <i className={`${tick} -bottom-px -left-px border-b-2 border-l-2`} />
      <i className={`${tick} -bottom-px -right-px border-b-2 border-r-2`} />
      <header className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium text-cyan-100">{title}</h2>
        {tag && <span className="text-[11px] text-[#6f8cb3]">{tag}</span>}
      </header>
      {children}
    </section>
  );
}

export function Row({ k, v, accent }: { k: string; v: ReactNode; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-cyan-400/10 py-1.5 text-xs last:border-0">
      <dt className="text-[#6f8cb3]">{k}</dt>
      <dd className={`font-mono ${accent ? "text-cyan-300 [text-shadow:0_0_10px_rgba(34,211,238,0.6)]" : "text-[#cfe8ff]"}`}>{v}</dd>
    </div>
  );
}