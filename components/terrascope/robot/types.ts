// Shared contract between the Terra robot UI and whatever answers its questions.
// The UI depends only on these types, so a real backend can replace the mock later.

export type RobotState = "idle" | "listening" | "thinking" | "speaking" | "error";

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  status: "streaming" | "complete" | "error";
}

export interface SuggestedMission {
  id: string;
  label: string; // text on the button
  prompt: string; // message sent when the button is clicked
}

// What the UI sends to the backend
export interface RobotChatRequest {
  messages: { role: ChatRole; content: string }[];
}

// What the backend streams back, one event at a time
export type RobotStreamEvent =
  | { type: "text"; delta: string }
  | { type: "done" }
  | { type: "error"; message: string };

// The one thing your teammate implements to replace the mock
export interface RobotChatService {
  send(request: RobotChatRequest, signal: AbortSignal): AsyncIterable<RobotStreamEvent>;
}

// Reads Terra's replies aloud. Separate from the chat service on purpose:
// the backend only streams text and never needs to know about voice.
export type SpeechStatus = "idle" | "speaking";

export interface RobotSpeechService {
  readonly isSupported: boolean;
  speak(text: string): void; // queue text to be read aloud
  cancel(): void; // stop immediately and clear the queue
  subscribe(listener: (status: SpeechStatus) => void): () => void;
}