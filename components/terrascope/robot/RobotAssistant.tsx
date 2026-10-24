"use client";

import { useCallback, useRef, useState } from "react";
import RobotAvatar from "./RobotAvatar";
import RobotChatPanel from "./RobotChatPanel";
import { mockRobotService } from "./mockRobotService";
import { useRobotChat } from "./useRobotChat";

const PANEL_ID = "terra-chat-panel";

export default function RobotAssistant() {
  // To connect the real backend later, replace mockRobotService with a
  // RobotChatService implementation. Nothing else in the UI needs to change.
  const chat = useRobotChat(mockRobotService);
  const { setListening } = chat;
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setListening(false);
    buttonRef.current?.focus();
  }, [setListening]);

  return (
    <>
      {open && <RobotChatPanel id={PANEL_ID} chat={chat} onClose={close} />}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-expanded={open}
        aria-controls={PANEL_ID}
        aria-label={open ? "Close Terra assistant" : "Open Terra assistant"}
        title="Ask Terra"
        className="fixed bottom-6 right-6 z-40 grid size-[100px] place-items-center rounded-full border border-cyan-400/40 bg-[#06122b] shadow-[0_0_32px_rgba(34,211,238,0.3)] transition hover:border-cyan-300/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-full border border-cyan-300/60 animate-ping [animation-duration:2.4s] motion-reduce:hidden"
        />
        <RobotAvatar state={chat.robotState} size={80} decorative />
      </button>
    </>
  );
}