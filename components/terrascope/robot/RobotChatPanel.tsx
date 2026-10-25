import { useEffect, useRef, useState, type FormEvent } from "react";
import Panel from "../Panel";
import RobotAvatar from "./RobotAvatar";
import type { useRobotChat } from "./useRobotChat";
import type { RobotState, SuggestedMission } from "./types";

export type RobotChat = ReturnType<typeof useRobotChat>;

const MISSIONS: SuggestedMission[] = [
  { id: "clear-skies", label: "Find the clearest skies", prompt: "Which location has the clearest skies?" },
  { id: "ludhiana", label: "Scan Ludhiana", prompt: "Scan Ludhiana" },
  { id: "dubai", label: "Scan Dubai", prompt: "Scan Dubai" },
  { id: "fires", label: "Fire check", prompt: "Check for fires" },
];

const STATUS: Record<RobotState, string> = {
  idle: "Standing by",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Transmitting",
  error: "Signal lost",
};

const focusRing =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300";

const barButton = `border border-cyan-400/20 px-2 py-0.5 text-xs text-[#8fb0d8] hover:text-white ${focusRing}`;

function Missions({
  onPick,
  disabled,
  compact,
}: {
  onPick: (prompt: string) => void;
  disabled: boolean;
  compact?: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Suggested missions"
      className={compact ? "flex flex-nowrap gap-1.5 overflow-x-auto pb-1" : "grid grid-cols-2 gap-2"}
    >
      {MISSIONS.map((m) => (
        <button
          key={m.id}
          type="button"
          disabled={disabled}
          onClick={() => onPick(m.prompt)}
          className={`border border-cyan-400/25 bg-[#06122b]/70 px-3 py-1.5 text-left text-xs text-[#8fb0d8] transition hover:text-white hover:shadow-[0_0_12px_rgba(34,211,238,0.3)] disabled:cursor-not-allowed disabled:opacity-50 ${focusRing} ${compact ? "shrink-0 whitespace-nowrap" : ""}`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

export default function RobotChatPanel({
  id,
  chat,
  onClose,
  expanded,
  onToggleExpand,
}: {
  id: string;
  chat: RobotChat;
  onClose: () => void;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const {
    messages, robotState, isBusy, error, send, retry, stop, setListening,
    voiceEnabled, setVoiceEnabled, speechSupported, isSpeaking,
  } = chat;
  const [draft, setDraft] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Move focus to the input when the panel opens.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // When expanded, the panel starts just below the dashboard's sticky top bar.
  // The bar is found in the page and measured, so no other file is touched.
  // If it can't be found the offset is 0 and Terra simply covers the top bar.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const bar = Array.from(document.querySelectorAll("header")).find(
      (h) => getComputedStyle(h).position === "sticky",
    );
    const apply = () =>
      root.style.setProperty("--terra-top", `${bar ? bar.offsetHeight : 0}px`);
    apply();
    window.addEventListener("resize", apply);
    const observer = bar ? new ResizeObserver(apply) : null;
    if (bar && observer) observer.observe(bar);
    return () => {
      window.removeEventListener("resize", apply);
      observer?.disconnect();
    };
  }, []);

  // Keep the newest message in view.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, error]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text || isBusy) return;
    send(text);
    setDraft("");
  };

  return (
    <div
      ref={rootRef}
      id={id}
      role="dialog"
      aria-label="Terra mission assistant"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          if (expanded) onToggleExpand();
          else onClose();
        }
      }}
      className={
        expanded
          ? "fixed inset-x-0 bottom-0 top-[var(--terra-top,0px)] z-30 bg-[#030816] lg:left-60"
          : "fixed bottom-36 right-6 z-40 h-[min(34rem,calc(100vh-10rem))] w-[24rem] max-w-[calc(100vw-3rem)] bg-[#030816] shadow-[0_0_60px_rgba(34,211,238,0.15)]"
      }
    >
      <Panel title="Terra" className="flex h-full min-h-0 flex-col">
        <div className="absolute right-3 top-3 flex gap-2">
          {speechSupported && (
            <button
              type="button"
              onClick={() => setVoiceEnabled(!voiceEnabled)}
              className={`border px-2 py-0.5 text-xs hover:text-white ${focusRing} ${
                voiceEnabled ? "border-cyan-400/40 text-cyan-200" : "border-cyan-400/20 text-[#6f8cb3]"
              }`}
            >
              {voiceEnabled ? "Voice on" : "Voice off"}
            </button>
          )}
          <button
            type="button"
            onClick={onToggleExpand}
            aria-label={expanded ? "Shrink Terra to a small window" : "Expand Terra to fill the page"}
            className={barButton}
          >
            {expanded ? "Shrink" : "Expand"}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Terra assistant"
            className={barButton}
          >
            Close
          </button>
        </div>

        <div className={`flex min-h-0 flex-1 ${expanded ? "flex-row gap-6" : "flex-col gap-3"}`}>
          <div
            className={
              expanded
                ? "flex w-48 shrink-0 flex-col items-center gap-3 pt-2 text-center"
                : "mt-1 flex items-center gap-3"
            }
          >
            <RobotAvatar state={robotState} size={expanded ? 150 : 96} decorative />
            <div className="min-w-0">
              <p className="text-xs text-[#6f8cb3]">Mission assistant</p>
              <p className="mt-1 font-mono text-xs tracking-wider text-cyan-300 [text-shadow:0_0_10px_rgba(34,211,238,0.6)]">
                {STATUS[robotState]}
              </p>
            </div>
            {expanded && isSpeaking && (
              <button
                type="button"
                onClick={stop}
                className={`border border-cyan-400/30 px-3 py-1 text-xs text-cyan-200 hover:text-white ${focusRing}`}
              >
                Stop voice
              </button>
            )}
          </div>

          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            <div
              ref={listRef}
              role="log"
              aria-label="Conversation with Terra"
              aria-busy={isBusy}
              tabIndex={0}
              className={`min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 ${focusRing}`}
            >
              {messages.length === 0 && (
                <div className="space-y-3">
                  <div className="border border-cyan-400/15 bg-[#020611] px-3 py-2 text-sm text-[#cfe8ff]">
                    Hi, I&apos;m Terra, your TerraScope mission assistant. Pick a mission below or ask me about a location.
                  </div>
                  <Missions onPick={send} disabled={isBusy} />
                </div>
              )}

              {messages.map((m) => (
                <div key={m.id} className={m.role === "user" ? "text-right" : "text-left"}>
                  <p className="mb-0.5 font-mono text-[10px] uppercase tracking-wider text-[#6f8cb3]">
                    {m.role === "user" ? "You" : "Terra"}
                  </p>
                  <div
                    className={`inline-block max-w-[90%] whitespace-pre-wrap border px-3 py-2 text-left text-sm ${
                      m.role === "user"
                        ? "border-cyan-400/30 bg-cyan-400/10 text-white"
                        : m.status === "error"
                          ? "border-red-400/40 bg-[#020611] text-[#cfe8ff]"
                          : "border-cyan-400/15 bg-[#020611] text-[#cfe8ff]"
                    }`}
                  >
                    {m.status === "streaming" && m.content === "" ? (
                      <span className="animate-pulse text-[#6f8cb3]">Thinking...</span>
                    ) : (
                      m.content
                    )}
                    {m.status === "streaming" && m.content !== "" && (
                      <span
                        aria-hidden="true"
                        className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-cyan-300 align-middle"
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>

            {error && (
              <div
                role="alert"
                className="flex items-center justify-between gap-3 border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs text-red-200"
              >
                <span>{error}</span>
                <button
                  type="button"
                  onClick={retry}
                  className={`border border-red-300/40 px-2 py-0.5 hover:text-white ${focusRing}`}
                >
                  Retry
                </button>
              </div>
            )}

            {messages.length > 0 && <Missions compact onPick={send} disabled={isBusy} />}

            <form onSubmit={submit} className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={draft}
                maxLength={500}
                onChange={(e) => setDraft(e.target.value)}
                onFocus={() => setListening(true)}
                onBlur={() => setListening(false)}
                aria-label="Message Terra"
                placeholder="Ask Terra..."
                className={`min-w-0 flex-1 border border-cyan-400/20 bg-[#020611] px-3 py-2 text-sm text-white placeholder:text-[#6f8cb3] ${focusRing}`}
              />
              {isBusy ? (
                <button
                  type="button"
                  onClick={stop}
                  className={`border border-cyan-400/30 px-3 text-sm text-cyan-200 hover:text-white ${focusRing}`}
                >
                  Stop
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!draft.trim()}
                  className={`border border-cyan-400/30 bg-cyan-400/10 px-3 text-sm text-cyan-100 hover:text-white disabled:cursor-not-allowed disabled:opacity-50 ${focusRing}`}
                >
                  Send
                </button>
              )}
            </form>

            <p className="text-[11px] text-[#6f8cb3]">Sample replies only - not live data.</p>
          </div>
        </div>
      </Panel>
    </div>
  );
}