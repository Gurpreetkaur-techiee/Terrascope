"use client";

import { useEffect, useId, useRef, useState } from "react";
import Panel from "./Panel";

/** Edit these to match the documents in your knowledge base. */
const EXAMPLES = [
  "What is NASA FIRMS and how does it detect active fires?",
  "What does fire radiative power (FRP) tell us?",
  "How do VIIRS and MODIS differ for fire detection?",
  "What is the difference between optical and SAR satellite imagery?",
  "What are the limitations of satellite fire detections?",
  "How can satellites help monitor floods?",
];

const RAG_ENDPOINT = "/api/rag/ask";
const MAX_QUESTION_CHARS = 1000;
const TIMEOUT_MS = 60_000;

type Source = { title: string; source: string | null; similarity: number | null };
type Result = { question: string; answer: string; sources: Source[] };
type State =
  | { phase: "idle" }
  | { phase: "loading"; question: string }
  | { phase: "done"; result: Result }
  | { phase: "error"; question: string; message: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/** Validates the backend response ({ answer, sources[] }). Returns null if it is not usable. */
function parseResponse(body: unknown): { answer: string; sources: Source[] } | null {
  if (!isObj(body) || typeof body.answer !== "string" || !body.answer.trim()) return null;
  const raw = Array.isArray(body.sources) ? body.sources : [];
  const sources: Source[] = raw.filter(isObj).map((s) => ({
    title: typeof s.title === "string" && s.title.trim() ? s.title.trim() : typeof s.source === "string" && s.source.trim() ? s.source.trim() : "Untitled document",
    source: typeof s.source === "string" && s.source.trim() ? s.source.trim() : null,
    similarity: typeof s.similarity === "number" && Number.isFinite(s.similarity) ? s.similarity : null,
  }));
  return { answer: body.answer.trim(), sources };
}

function errorText(body: unknown, status: number): string {
  if (isObj(body)) {
    if (typeof body.error === "string" && body.error.trim()) return body.error.trim().slice(0, 300);
    if (isObj(body.error) && typeof body.error.message === "string") return body.error.message.slice(0, 300);
    if (typeof body.message === "string" && body.message.trim()) return body.message.trim().slice(0, 300);
  }
  return `The knowledge service returned an error (HTTP ${status}).`;
}

/** Accepts 0-1 (e.g. 0.85) or 0-100 values and returns a whole percent, or null. */
const toPercent = (v: number | null) => (v === null ? null : Math.round(Math.min(100, Math.max(0, v <= 1 ? v * 100 : v))));

const isWebUrl = (s: string) => /^https?:\/\//i.test(s);

function SourceCard({ s, index }: { s: Source; index: number }) {
  const pct = toPercent(s.similarity);
  return (
    <li className="border border-cyan-400/15 bg-[#08183a]/60 p-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid size-5 shrink-0 place-items-center border border-cyan-400/30 font-mono text-[11px] text-cyan-200">{index + 1}</span>
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-medium text-white">{s.title}</p>
          {s.source && s.source !== s.title && (
            <p className="mt-0.5 break-all text-xs text-[#6f8cb3]">
              {isWebUrl(s.source) ? (
                <a href={s.source} target="_blank" rel="noopener noreferrer" className="text-cyan-300 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">
                  {s.source}
                </a>
              ) : (
                s.source
              )}
            </p>
          )}
          <div className="mt-2 flex items-center gap-2" title="Retrieval similarity: how closely this document matched the question. It does not measure whether the content is correct.">
            {pct === null ? (
              <span className="text-xs text-[#6f8cb3]">Similarity not provided</span>
            ) : (
              <>
                <div role="meter" aria-label="Retrieval similarity" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} className="h-1.5 flex-1 bg-[#10234a]">
                  <div className="h-full bg-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.7)]" style={{ width: `${pct}%` }} />
                </div>
                <span className="w-24 shrink-0 text-right font-mono text-xs text-cyan-200">{pct}% match</span>
              </>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

export default function KnowledgePanel() {
  const [question, setQuestion] = useState("");
  const [state, setState] = useState<State>({ phase: "idle" });
  const busyRef = useRef(false); // blocks double-submits before React re-renders
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const uid = useId();

  useEffect(() => () => abortRef.current?.abort(), []);

  const busy = state.phase === "loading";
  const trimmed = question.trim();

  const ask = async (raw: string) => {
    const q = raw.trim();
    if (!q || busyRef.current) return;
    busyRef.current = true;
    setState({ phase: "loading", question: q });

    const ac = new AbortController();
    abortRef.current = ac;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ac.abort();
    }, TIMEOUT_MS);

    try {
      const res = await fetch(RAG_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
        signal: ac.signal,
      });
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        setState({ phase: "error", question: q, message: errorText(body, res.status) });
        return;
      }
      const parsed = parseResponse(body);
      setState(
        parsed
          ? { phase: "done", result: { question: q, ...parsed } }
          : { phase: "error", question: q, message: "The knowledge service returned an empty or unreadable answer. Try rephrasing your question." },
      );
    } catch {
      if (ac.signal.aborted && !timedOut) return; // unmounted: nothing to show
      setState({
        phase: "error",
        question: q,
        message: timedOut ? "The request timed out after 60 seconds. Please try again." : "Could not reach the knowledge service. Check your connection and that the server is running.",
      });
    } finally {
      clearTimeout(timer);
      busyRef.current = false;
    }
  };

  const pickExample = (q: string) => {
    if (busy) return;
    setQuestion(q);
    inputRef.current?.focus();
  };

  const result = state.phase === "done" ? state.result : null;
  const noSources = result !== null && result.sources.length === 0;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl [text-shadow:0_0_24px_rgba(34,211,238,0.35)]">Knowledge AI</h1>
        <p className="mt-1 max-w-2xl text-sm text-[#6f8cb3]">Ask an Earth-observation question. TerraScope retrieves relevant documents from its knowledge base and writes an answer from them, with the sources it used.</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <Panel title="Ask a question" tag="Retrieval-augmented answer">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void ask(question);
              }}
            >
              <label htmlFor={`${uid}-q`} className="sr-only">Your question</label>
              <textarea
                id={`${uid}-q`}
                ref={inputRef}
                value={question}
                rows={3}
                maxLength={MAX_QUESTION_CHARS}
                placeholder="e.g. What does fire radiative power (FRP) tell us?"
                aria-describedby={`${uid}-hint`}
                onChange={(e) => setQuestion(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void ask(question);
                  }
                }}
                className="w-full resize-y border border-cyan-400/20 bg-[#040b1d] px-3 py-2 text-sm text-[#cfe8ff] placeholder:text-[#4d6a91] focus:border-cyan-300 focus:shadow-[0_0_16px_rgba(34,211,238,0.2)] focus:outline-none"
              />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <p id={`${uid}-hint`} className="text-[11px] text-[#6f8cb3]">
                  Enter to ask, Shift+Enter for a new line · {question.length}/{MAX_QUESTION_CHARS}
                </p>
                <button
                  type="submit"
                  disabled={busy || !trimmed}
                  className="border border-cyan-300/50 bg-cyan-400/15 px-5 py-2 text-sm font-medium text-cyan-100 shadow-[0_0_16px_rgba(34,211,238,0.15)] transition hover:bg-cyan-400/25 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                >
                  {busy ? "Asking…" : "Ask"}
                </button>
              </div>
            </form>

            <div className="mt-4 border-t border-cyan-400/10 pt-3">
              <p className="mb-2 text-[11px] uppercase tracking-wider text-[#6f8cb3]">Try an example</p>
              <ul className="flex flex-wrap gap-2">
                {EXAMPLES.map((q) => (
                  <li key={q}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => pickExample(q)}
                      className="border border-cyan-400/20 bg-[#08183a]/70 px-3 py-1.5 text-left text-xs text-[#cfe8ff] transition hover:border-cyan-300/50 hover:bg-cyan-400/10 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
                    >
                      {q}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </Panel>

          <Panel title="Answer" tag={noSources ? "No sources retrieved" : result ? "Generated from retrieved documents" : undefined}>
            <div aria-live="polite" aria-busy={busy}>
              {state.phase === "idle" && (
                <div className="flex items-start gap-4 py-2">
                  <svg viewBox="0 0 28 28" aria-hidden className="size-10 shrink-0 text-cyan-300/70">
                    <circle cx="14" cy="14" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
                    <ellipse cx="14" cy="14" rx="13" ry="4.6" fill="none" stroke="currentColor" strokeWidth="1" transform="rotate(-25 14 14)" />
                    <circle cx="24.2" cy="8.6" r="1.6" fill="currentColor" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-white">Ask your first question</p>
                    <p className="mt-1 text-sm text-[#8fb0d8]">Choose an example above or type your own. The answer and the documents it was built from will appear here.</p>
                  </div>
                </div>
              )}

              {state.phase === "loading" && (
                <div role="status">
                  <p className="text-xs text-[#8fb0d8]">Searching the knowledge base and writing an answer for “{state.question}”…</p>
                  <div className="mt-3 space-y-2" aria-hidden>
                    {["w-full", "w-11/12", "w-4/5", "w-2/3"].map((w) => (
                      <div key={w} className={`h-3 ${w} bg-cyan-400/10 motion-safe:animate-pulse`} />
                    ))}
                  </div>
                </div>
              )}

              {state.phase === "error" && (
                <div role="alert" className="border border-amber-300/35 bg-amber-300/5 p-3 text-sm">
                  <p className="font-medium text-amber-200">Couldn’t get an answer</p>
                  <p className="mt-1 text-amber-100/90">{state.message}</p>
                  <button
                    type="button"
                    onClick={() => void ask(state.question)}
                    className="mt-3 border border-amber-300/40 px-3 py-1 text-xs text-amber-100 hover:bg-amber-300/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-300"
                  >
                    Try again
                  </button>
                </div>
              )}

              {result && (
                <div>
                  <p className="text-xs text-[#6f8cb3]">Question: {result.question}</p>
                  {noSources && (
                    <p role="note" className="mt-3 border border-amber-300/35 bg-amber-300/5 p-3 text-xs leading-5 text-amber-100">
                      No supporting documents were retrieved for this question, so this answer is not backed by any source shown here. Treat it with extra caution.
                    </p>
                  )}
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-[#dcecff]">{result.answer}</p>
                </div>
              )}
            </div>
          </Panel>
        </div>

        <Panel title="Retrieved sources" tag={result ? `${result.sources.length} found` : undefined}>
          {state.phase === "idle" && <p className="text-sm text-[#6f8cb3]">Sources appear here after you ask a question.</p>}
          {state.phase === "loading" && <p className="text-sm text-[#6f8cb3]" aria-hidden>Retrieving documents…</p>}
          {state.phase === "error" && <p className="text-sm text-[#6f8cb3]">No sources, because the request did not complete.</p>}
          {noSources && (
            <p className="text-sm text-[#8fb0d8]">
              No documents matched this question. Try rephrasing it, or ask about a topic covered by the knowledge base.
            </p>
          )}
          {result && result.sources.length > 0 && (
            <>
              <ul className="space-y-2" aria-label="Retrieved source documents">
                {result.sources.map((s, i) => (
                  <SourceCard key={`${i}-${s.title}`} s={s} index={i} />
                ))}
              </ul>
              <p className="mt-3 text-[11px] leading-4 text-[#6f8cb3]">Listed in the order returned. Match % shows how closely a document resembled your question, not whether it is accurate.</p>
            </>
          )}
        </Panel>
      </div>

      <p className="text-[11px] leading-4 text-[#4d6a91]">
        Answers are AI-generated from retrieved documents and can be incomplete or wrong, so check important details against the sources. Satellite fire detections are thermal anomalies, not confirmed wildfires.
      </p>
    </div>
  );
}