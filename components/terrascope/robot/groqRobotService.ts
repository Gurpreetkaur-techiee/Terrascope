
import type {
  RobotChatRequest,
  RobotChatService,
  RobotStreamEvent,
} from "./types";

async function* streamGroqResponse(
  request: RobotChatRequest,
  signal: AbortSignal
): AsyncGenerator<RobotStreamEvent> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
    signal,
  });

  if (!response.ok) {
    let message = "Terra could not connect to the AI service.";

    try {
      const errorData = await response.json();
      if (typeof errorData.error === "string") {
        message = errorData.error;
      }
    } catch {
      // Keep the fallback message.
    }

    yield { type: "error", message };
    return;
  }

  if (!response.body) {
    yield { type: "error", message: "No response stream received." };
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { value, done } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const event of events) {
        const data = event
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("");

        if (!data) continue;

        if (data === "[DONE]") {
          yield { type: "done" };
          return;
        }

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;

          if (typeof delta === "string" && delta.length > 0) {
            yield { type: "text", delta };
          }
        } catch {
          // Ignore incomplete or non-JSON stream events.
        }
      }
    }

    yield { type: "done" };
  } finally {
    reader.releaseLock();
  }
}

export const groqRobotService: RobotChatService = {
  send(request, signal) {
    return streamGroqResponse(request, signal);
  },
};
