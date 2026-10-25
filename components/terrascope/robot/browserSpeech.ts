import type { RobotSpeechService, SpeechStatus } from "./types";

// Browsers can cut off very long utterances, so each piece stays short.
const MAX_CHUNK = 220;

function splitLong(text: string): string[] {
  if (text.length <= MAX_CHUNK) return [text];
  const parts: string[] = [];
  let rest = text;
  while (rest.length > MAX_CHUNK) {
    let cut = rest.lastIndexOf(" ", MAX_CHUNK);
    if (cut <= 0) cut = MAX_CHUNK;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) parts.push(rest);
  return parts;
}

// Uses the browser's built-in text-to-speech. Nothing here runs until a
// method is called, so it is safe to import during server rendering.
export class BrowserSpeechService implements RobotSpeechService {
  private listeners = new Set<(status: SpeechStatus) => void>();
  private pending = 0;
  private generation = 0; // bumps on cancel so late browser events are ignored
  private status: SpeechStatus = "idle";

  get isSupported(): boolean {
    return (
      typeof window !== "undefined" &&
      "speechSynthesis" in window &&
      typeof SpeechSynthesisUtterance !== "undefined"
    );
  }

  private setStatus(next: SpeechStatus) {
    if (next === this.status) return;
    this.status = next;
    this.listeners.forEach((listener) => listener(next));
  }

  speak(text: string): void {
    if (!this.isSupported) return;
    const clean = text.replace(/\s+/g, " ").trim();
    if (!clean) return;
    const gen = this.generation;

    for (const piece of splitLong(clean)) {
      const utterance = new SpeechSynthesisUtterance(piece);
      utterance.lang = "en-US";
      const finished = () => {
        if (gen !== this.generation) return;
        this.pending = Math.max(0, this.pending - 1);
        if (this.pending === 0) this.setStatus("idle");
      };
      utterance.onstart = () => {
        if (gen === this.generation) this.setStatus("speaking");
      };
      utterance.onend = finished;
      utterance.onerror = finished;
      this.pending += 1;
      window.speechSynthesis.speak(utterance);
    }
  }

  cancel(): void {
    this.generation += 1;
    this.pending = 0;
    if (this.isSupported) window.speechSynthesis.cancel();
    this.setStatus("idle");
  }

  subscribe(listener: (status: SpeechStatus) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const browserSpeechService = new BrowserSpeechService();