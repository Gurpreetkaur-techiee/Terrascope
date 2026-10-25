import { useCallback, useEffect, useRef, useState } from "react";
import { mockRobotService } from "./mockRobotService";
import { browserSpeechService } from "./browserSpeech";
import type {
  ChatMessage,
  RobotChatService,
  RobotSpeechService,
  RobotState,
  SpeechStatus,
} from "./types";

let idCounter = 0;
const makeId = () => `msg-${++idCounter}`;

// Pulls whole sentences out of streamed text so the voice can start early.
function takeSentences(buffer: string): { sentences: string[]; rest: string } {
  const sentences: string[] = [];
  let rest = buffer;
  for (;;) {
    const m = /^([\s\S]*?[.!?])\s+([\s\S]*)$/.exec(rest);
    if (!m) break;
    sentences.push(m[1]);
    rest = m[2];
  }
  return { sentences, rest };
}

// Holds Terra's conversation and works out which animation state she is in.
// Pass a different `service` later to connect a real backend.
export function useRobotChat(
  service: RobotChatService = mockRobotService,
  speech: RobotSpeechService = browserSpeechService,
) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [voiceEnabled, setVoiceEnabledState] = useState(true);
  const [speechStatus, setSpeechStatus] = useState<SpeechStatus>("idle");
  const abortRef = useRef<AbortController | null>(null);
  const voiceRef = useRef(true); // latest voice setting, readable inside async code

  // Follow the voice's status, and go quiet when the component goes away.
  useEffect(() => {
    const unsubscribe = speech.subscribe(setSpeechStatus);
    return () => {
      unsubscribe();
      speech.cancel();
    };
  }, [speech]);

  const setVoiceEnabled = useCallback(
    (on: boolean) => {
      voiceRef.current = on;
      setVoiceEnabledState(on);
      if (!on) speech.cancel();
    },
    [speech],
  );

  // Streams a reply for the given conversation into a new assistant message.
  const run = useCallback(
    async (base: ChatMessage[]) => {
      const botId = makeId();
      setMessages([
        ...base,
        { id: botId, role: "assistant", content: "", status: "streaming" },
      ]);
      setError(null);
      setIsBusy(true);
      speech.cancel(); // a new question silences the previous answer

      const controller = new AbortController();
      abortRef.current = controller;

      // Only finished messages are sent to the service.
      const request = {
        messages: base
          .filter((m) => m.status === "complete")
          .map((m) => ({ role: m.role, content: m.content })),
      };

      // Marks Terra's message finished; drops it if it ended up empty.
      const finish = (status: "complete" | "error") =>
        setMessages((prev) =>
          prev
            .filter((m) => !(m.id === botId && m.content === ""))
            .map((m) => (m.id === botId ? { ...m, status } : m)),
        );

      const say = (text: string) => {
        if (voiceRef.current && text.trim()) speech.speak(text);
      };
      let unspoken = ""; // streamed text not yet read aloud

      try {
        for await (const event of service.send(request, controller.signal)) {
          if (controller.signal.aborted) break;
          if (event.type === "text") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === botId ? { ...m, content: m.content + event.delta } : m,
              ),
            );
            const { sentences, rest } = takeSentences(unspoken + event.delta);
            sentences.forEach(say);
            unspoken = rest;
          } else if (event.type === "error") {
            speech.cancel();
            setError(event.message);
            finish("error");
            return;
          } else {
            break; // "done"
          }
        }
        if (!controller.signal.aborted) say(unspoken);
        finish("complete");
      } catch (e) {
        speech.cancel();
        if (controller.signal.aborted) {
          finish("complete"); // user pressed Stop: keep what was streamed
        } else {
          setError(e instanceof Error ? e.message : "Something went wrong.");
          finish("error");
        }
      } finally {
        abortRef.current = null;
        setIsBusy(false);
      }
    },
    [service, speech],
  );

  const send = useCallback(
    (text: string) => {
      const content = text.trim();
      if (!content || abortRef.current) return;
      void run([
        ...messages,
        { id: makeId(), role: "user", content, status: "complete" },
      ]);
    },
    [messages, run],
  );

  // Re-asks the last user message after an error.
  const retry = useCallback(() => {
    if (abortRef.current) return;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "user") {
        void run(messages.slice(0, i + 1));
        return;
      }
    }
  }, [messages, run]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    speech.cancel();
  }, [speech]);

  const last = messages[messages.length - 1];
  let robotState: RobotState = "idle";
  if (error) robotState = "error";
  else if (isBusy)
    robotState = last?.role === "assistant" && last.content ? "speaking" : "thinking";
  else if (speechStatus === "speaking") robotState = "speaking";
  else if (isListening) robotState = "listening";

  return {
    messages,
    robotState,
    isBusy,
    error,
    send,
    retry,
    stop,
    setListening: setIsListening,
    voiceEnabled,
    setVoiceEnabled,
    speechSupported: speech.isSupported,
    isSpeaking: speechStatus === "speaking",
  };
}