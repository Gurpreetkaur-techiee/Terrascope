import { useId } from "react";
import type { RobotState } from "./types";

const LABELS: Record<RobotState, string> = {
  idle: "Terra the robot is ready",
  listening: "Terra the robot is listening",
  thinking: "Terra the robot is thinking",
  speaking: "Terra the robot is speaking",
  error: "Terra the robot has a problem",
};

// All avatar CSS lives here so the robot folder has no separate stylesheet.
// Class names start with "td-" so they cannot clash with the rest of the app.
const CSS = `
.td-root{display:block;overflow:visible}
.td-root *{transform-box:fill-box;transform-origin:center}
.td-root .td-orb{transform-box:view-box;transform-origin:80px 72px}
.td-fl{animation:td-fl 4s ease-in-out infinite}
.td-sh{animation:td-sh 4s ease-in-out infinite}
.td-eyes{animation:td-bl 4.5s infinite}
.td-thr{animation:td-thr .9s ease-in-out infinite alternate}
.td-tip{animation:td-tp 2.5s ease-in-out infinite}
.td-rg,.td-orb,.td-scan,.td-wv,.td-xx,.td-mo,.td-fr{opacity:0}
.td-root .td-r2{animation-delay:.6s!important}
.td-root .td-r3{animation-delay:1.2s!important}

.td-root[data-state=listening] .td-head{animation:td-tilt 2.4s ease-in-out infinite}
.td-root[data-state=listening] .td-eyes{animation:none;transform:scale(1.15)}
.td-root[data-state=listening] .td-rg{animation:td-rg 1.8s ease-out infinite}
.td-root[data-state=listening] .td-tip{animation:td-tp .8s ease-in-out infinite}

.td-root[data-state=thinking] .td-head{transform:rotate(-4deg)}
.td-root[data-state=thinking] .td-eyes{animation:td-look 2.2s ease-in-out infinite}
.td-root[data-state=thinking] .td-orb{opacity:1;animation:td-orb 2.4s linear infinite}
.td-root[data-state=thinking] .td-scan{opacity:.7;animation:td-scn 1.4s ease-in-out infinite}
.td-root[data-state=thinking] .td-cring{stroke-dasharray:5 4;animation:td-orb 3s linear infinite}

.td-root[data-state=speaking] .td-head{animation:td-nod .7s ease-in-out infinite}
.td-root[data-state=speaking] .td-sm{opacity:0}
.td-root[data-state=speaking] .td-mo{opacity:1;animation:td-tk .38s ease-in-out infinite}
.td-root[data-state=speaking] .td-core{animation:td-cp .45s ease-in-out infinite alternate}
.td-root[data-state=speaking] .td-wv{animation:td-wvp .9s ease-out infinite}
.td-root[data-state=speaking] .td-al{animation:td-aw .5s ease-in-out infinite alternate}
.td-root[data-state=speaking] .td-ar{animation:td-aw .5s ease-in-out .25s infinite alternate}

.td-root[data-state=error]{animation:td-shk .4s ease-in-out 2}
.td-root[data-state=error] .td-eyes,.td-root[data-state=error] .td-sm{opacity:0;animation:none}
.td-root[data-state=error] .td-xx,.td-root[data-state=error] .td-fr{opacity:1}
.td-root[data-state=error] .td-tip{fill:#f87171;animation:none}

@keyframes td-fl{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes td-sh{0%,100%{transform:scale(1);opacity:.35}50%{transform:scale(.8);opacity:.2}}
@keyframes td-bl{0%,92%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}
@keyframes td-thr{from{opacity:.25;transform:scale(1)}to{opacity:.55;transform:scale(1.25)}}
@keyframes td-tp{0%,100%{opacity:.55}50%{opacity:1}}
@keyframes td-tilt{0%,100%{transform:rotate(-3deg)}50%{transform:rotate(3deg)}}
@keyframes td-rg{0%{transform:scale(.9);opacity:.7}100%{transform:scale(1.5);opacity:0}}
@keyframes td-look{0%,100%{transform:translate(0,0)}30%{transform:translate(-4px,-3px)}70%{transform:translate(4px,-3px)}}
@keyframes td-orb{to{transform:rotate(360deg)}}
@keyframes td-scn{0%{transform:translateY(0)}50%{transform:translateY(38px)}100%{transform:translateY(0)}}
@keyframes td-nod{0%,100%{transform:translateY(0)}50%{transform:translateY(2.5px) rotate(1.5deg)}}
@keyframes td-tk{0%,100%{transform:scaleY(.35)}50%{transform:scaleY(1.2)}}
@keyframes td-cp{from{transform:scale(1)}to{transform:scale(1.8)}}
@keyframes td-wvp{0%{opacity:0;transform:scale(.9)}50%{opacity:.9}100%{opacity:0;transform:scale(1.15)}}
@keyframes td-aw{from{transform:translateY(0)}to{transform:translateY(-6px)}}
@keyframes td-shk{0%,100%{transform:translateX(0)}25%{transform:translateX(-3px)}75%{transform:translateX(3px)}}

/* Reduced motion: calms the constant loops. If the robot looks frozen on your PC,
   temporarily delete this whole block to test, then tell me what happened. */
@media (prefers-reduced-motion: reduce){
  .td-root[data-state] .td-fl,.td-root[data-state] .td-sh,.td-root[data-state] .td-thr,
  .td-root[data-state] .td-rg,.td-root[data-state] .td-orb,.td-root[data-state] .td-scan,
  .td-root[data-state] .td-wv,.td-root[data-state] .td-head,.td-root[data-state] .td-cring{animation:none}
  .td-root[data-state]{animation:none}
}
`;

export default function RobotAvatar({
  state,
  size = 96,
  className = "",
  decorative = false,
}: {
  state: RobotState;
  size?: number;
  className?: string;
  decorative?: boolean; // true when nearby text already describes the state
}) {
  const clipId = `td-visor-${useId().replace(/:/g, "")}`;

  return (
    <>
      <style>{CSS}</style>
      <svg
        className={`td-root ${className}`}
        data-state={state}
        width={size}
        height={Math.round((size * 184) / 160)}
        viewBox="0 0 160 184"
        role={decorative ? undefined : "img"}
        aria-label={decorative ? undefined : LABELS[state]}
        aria-hidden={decorative || undefined}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <clipPath id={clipId}>
            <rect x="42" y="50" width="76" height="44" rx="22" />
          </clipPath>
        </defs>

        <ellipse className="td-sh" cx="80" cy="176" rx="30" ry="5" fill="#000" />

        <g className="td-fl">
          <ellipse className="td-thr" cx="80" cy="162" rx="16" ry="6" fill="#22d3ee" opacity="0.4" />

          {/* listening: radar rings */}
          <circle className="td-rg" cx="80" cy="72" r="52" fill="none" stroke="#22d3ee" strokeWidth="1.5" />
          <circle className="td-rg td-r2" cx="80" cy="72" r="52" fill="none" stroke="#22d3ee" strokeWidth="1.5" />
          <circle className="td-rg td-r3" cx="80" cy="72" r="52" fill="none" stroke="#22d3ee" strokeWidth="1.5" />

          {/* thinking: orbiting dots */}
          <g className="td-orb">
            <circle cx="80" cy="6" r="3.5" fill="#67e8f9" />
            <circle cx="134" cy="103" r="3.5" fill="#67e8f9" />
            <circle cx="26" cy="103" r="3.5" fill="#67e8f9" />
          </g>

          {/* speaking: sound arcs */}
          <g className="td-wv" fill="none" stroke="#67e8f9" strokeWidth="2.5" strokeLinecap="round">
            <path d="M144 60 Q154 72 144 84" />
            <path d="M16 60 Q6 72 16 84" />
          </g>

          {/* body */}
          <g>
            <ellipse cx="80" cy="140" rx="26" ry="22" fill="#e8f1ff" stroke="#9cc4f5" strokeWidth="2" />
            <circle className="td-cring" cx="80" cy="140" r="10" fill="#06122b" stroke="#22d3ee" strokeWidth="2" />
            <circle className="td-core" cx="80" cy="140" r="4" fill="#67e8f9" />
            <circle className="td-al" cx="50" cy="136" r="7" fill="#e8f1ff" stroke="#9cc4f5" strokeWidth="2" />
            <circle className="td-ar" cx="110" cy="136" r="7" fill="#e8f1ff" stroke="#9cc4f5" strokeWidth="2" />
          </g>

          {/* head */}
          <g className="td-head">
            <line x1="80" y1="22" x2="80" y2="10" stroke="#9cc4f5" strokeWidth="3" strokeLinecap="round" />
            <circle className="td-tip" cx="80" cy="7" r="5" fill="#67e8f9" />
            <circle cx="29" cy="74" r="9" fill="#0e3a6b" stroke="#22d3ee" strokeWidth="1.5" />
            <circle cx="131" cy="74" r="9" fill="#0e3a6b" stroke="#22d3ee" strokeWidth="1.5" />
            <circle cx="80" cy="72" r="50" fill="#e8f1ff" stroke="#9cc4f5" strokeWidth="2" />
            <rect x="42" y="50" width="76" height="44" rx="22" fill="#06122b" stroke="#22d3ee" strokeWidth="1.5" />
            <g clipPath={`url(#${clipId})`}>
              <rect className="td-scan" x="42" y="50" width="76" height="4" fill="#67e8f9" />
            </g>
            <path d="M52 58 Q60 53 70 54" fill="none" stroke="#fff" strokeOpacity="0.35" strokeWidth="3" strokeLinecap="round" />

            <g className="td-eyes">
              <ellipse cx="66" cy="72" rx="6" ry="8" fill="#67e8f9" />
              <ellipse cx="94" cy="72" rx="6" ry="8" fill="#67e8f9" />
              <circle cx="68" cy="69" r="2" fill="#fff" />
              <circle cx="96" cy="69" r="2" fill="#fff" />
            </g>
            <g className="td-xx" fill="none" stroke="#f87171" strokeWidth="3" strokeLinecap="round">
              <path d="M61 67l10 10M71 67l-10 10" />
              <path d="M89 67l10 10M99 67l-10 10" />
            </g>

            <path className="td-sm" d="M72 85 Q80 92 88 85" fill="none" stroke="#67e8f9" strokeWidth="2.5" strokeLinecap="round" />
            <ellipse className="td-mo" cx="80" cy="87" rx="6" ry="4" fill="#67e8f9" />
            <path className="td-fr" d="M72 90 Q80 84 88 90" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round" />

            <circle cx="52" cy="84" r="4" fill="#f9a8d4" opacity="0.35" />
            <circle cx="108" cy="84" r="4" fill="#f9a8d4" opacity="0.35" />
          </g>
        </g>
      </svg>
    </>
  );
}