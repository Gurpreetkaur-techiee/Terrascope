import { locations } from "@/lib/terrascope-data";
import type { RobotChatRequest, RobotChatService, RobotStreamEvent } from "./types";

const THINK_DELAY_MS = 700;
const WORD_DELAY_MS = 40;

// Resolves after `ms`, or immediately if the request is cancelled.
function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

// Lowercase and remove accents so "reykjavik" matches "Reykjavík".
const strip = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

function buildReply(text: string): string {
  const q = strip(text);

  if (/\b(fire|fires|wildfire|smoke|burn)\b/.test(q)) {
    return "Fire scanning isn't connected to me yet, so I can't show real detections. Once my backend is linked, I'll scan for you. For now, ask me about any sample location on the globe!";
  }

  const place = locations.find((l) => q.includes(strip(l.name)));
  if (place) {
    const mood =
      place.cloud <= 20
        ? "Skies look clear for imaging."
        : place.cloud >= 50
          ? "Imaging could be tricky there."
          : "Conditions look fair.";
    return `Copy that! ${place.name}, ${place.region}. Sample cloud cover is ${place.cloud}%. ${mood} This is sample data, not a live reading.`;
  }

  if (/\b(clear|cloud|cloudy|sky|skies)\b/.test(q)) {
    const sorted = [...locations].sort((a, b) => a.cloud - b.cloud);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    return `In my sample data, ${best.name} has the clearest skies at ${best.cloud}% cloud cover. ${worst.name} is the cloudiest at ${worst.cloud}%. These are sample numbers, not live readings.`;
  }

  if (/\b(hi|hello|hey)\b/.test(q)) {
    return "Hi, I'm Terra, your TerraScope mission assistant. Pick a mission or ask about a location!";
  }

  return "I'm in training mode, so my replies are samples for now. Try asking about a location like Ludhiana or Dubai, or about cloud cover.";
}

export class MockRobotService implements RobotChatService {
  async *send(
    request: RobotChatRequest,
    signal: AbortSignal,
  ): AsyncIterable<RobotStreamEvent> {
    const lastUser =
      [...request.messages].reverse().find((m) => m.role === "user")?.content ?? "";

    await sleep(THINK_DELAY_MS, signal); // lets the "thinking" state show
    if (signal.aborted) return;

    // Test hook: type "simulate error" to see the error UI.
    if (strip(lastUser).includes("simulate error")) {
      yield { type: "error", message: "Terra lost signal. Please try again." };
      return;
    }

    for (const piece of buildReply(lastUser).split(/(\s+)/)) {
      if (signal.aborted) return;
      yield { type: "text", delta: piece };
      await sleep(WORD_DELAY_MS, signal);
    }
    yield { type: "done" };
  }
}

export const mockRobotService = new MockRobotService();