
"use client";

import { useState } from "react";

const suggestions = [
  "How do satellites detect wildfires?",
  "What is the James Webb telescope?",
  "Explain fire confidence and FRP",
];


export default function OrbitAssistant({
  selectedFire,
}: {
  selectedFire?: {
    latitude?: number;
    longitude?: number;
    confidence?: "low" | "nominal" | "high" | null;
    frp?: number | null;
    satellite?: string | null;
  } | null;
}) {

  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<
    { role: "user" | "assistant"; content: string }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function sendMessage(text = input) {
    const question = text.trim();
    if (!question || loading) return;

    const updated = [...messages, { role: "user" as const, content: question }];
    setMessages(updated);
    setInput("");
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: updated.slice(-12),
          selectedFire,
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Chat request failed.");

      setMessages((current) => [
        ...current,
        { role: "assistant", content: data.reply },
      ]);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to connect to ORBIT."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-[100] font-sans">
      {open && (
        <section className="mb-4 flex h-[min(570px,75dvh)] w-[min(370px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-cyan-400/25 bg-[#061020] text-white shadow-[0_0_45px_rgba(34,211,238,0.16)]">
          <header className="flex items-center gap-3 border-b border-cyan-400/15 bg-[#09182b] p-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-full border border-cyan-300/40 text-2xl text-cyan-200">
              ◎
            </div>
            <div className="flex-1">
              <h2 className="font-semibold tracking-widest">ORBIT</h2>
              <p className="text-[10px] tracking-wider text-cyan-300">
                AI SPACE & EARTH ASSISTANT
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Explore beyond what you see.
              </p>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Close ORBIT">
              ✕
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            <div className="rounded-xl border border-cyan-400/10 bg-[#0b1a2e] p-3 text-sm leading-6 text-slate-200">
              Hey, explorer! 🌍 Ask me about space, satellites, NASA missions,
              or Earth observations.
            </div>

            {messages.map((message, index) => (
              <div
                key={index}
                className={`max-w-[90%] whitespace-pre-wrap break-words rounded-xl p-3 text-sm leading-6 ${
                  message.role === "user"
                    ? "ml-auto bg-cyan-500/15 text-cyan-50"
                    : "border border-white/10 bg-[#0b1a2e] text-slate-200"
                }`}
              >
                {message.content}
              </div>
            ))}

            {messages.length === 0 && (
              <div className="space-y-2">
                <p className="text-[10px] tracking-widest text-slate-500">
                  TRY ASKING
                </p>
                {suggestions.map((item) => (
                  <button
                    key={item}
                    onClick={() => void sendMessage(item)}
                    className="w-full rounded-lg border border-cyan-300/10 bg-[#0b1a2e] p-3 text-left text-xs text-cyan-100 hover:border-cyan-300/40"
                  >
                    {item} <span className="float-right">↗</span>
                  </button>
                ))}
              </div>
            )}

            {loading && (
              <p className="text-xs text-cyan-300">ORBIT is thinking...</p>
            )}
            {error && (
              <p role="alert" className="text-xs text-red-300">{error}</p>
            )}
          </div>

          <form
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage();
            }}
            className="border-t border-cyan-400/15 p-3"
          >
            {selectedFire && (
              <p className="mb-2 text-xs text-cyan-300">
                Selected fire context available
              </p>
            )}
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Ask ORBIT anything..."
                maxLength={4000}
                className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-[#030b17] px-3 py-3 text-sm outline-none focus:border-cyan-400"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="rounded-lg bg-cyan-400 px-4 text-sm font-semibold text-slate-950 disabled:opacity-40"
              >
                ↑
              </button>
            </div>
            <p className="mt-2 text-center text-[10px] text-slate-500">
              AI can make mistakes. Verify important information.
            </p>
          </form>
        </section>
      )}

      <div className="flex items-center justify-end gap-3">
        {!open && (
          <span className="rounded-lg border border-cyan-400/15 bg-[#071426] px-3 py-2 text-xs text-cyan-100">
            Ask ORBIT
          </span>
        )}
        <button
          onClick={() => setOpen((value) => !value)}
          aria-label={open ? "Close ORBIT" : "Open ORBIT"}
          aria-expanded={open}
          className="flex h-14 w-14 items-center justify-center rounded-full border border-cyan-200/60 bg-[#0b2942] text-3xl text-cyan-200 shadow-[0_0_25px_rgba(34,211,238,0.25)] transition hover:scale-105 hover:bg-[#103957]"
        >
          {open ? "×" : "◎"}
        </button>
      </div>
    </div>
  );
}
