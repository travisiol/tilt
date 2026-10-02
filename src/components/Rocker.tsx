"use client";

import { useState } from "react";

function Arrow({ down = false }: { down?: boolean }) {
  return (
    <svg width="34" height="24" viewBox="0 0 34 24" aria-hidden className={down ? "rotate-180" : ""}>
      <path d="M17 2 32 22H2Z" fill="currentColor" />
    </svg>
  );
}

/**
 * The hero object: a two-way rocker switch drawn in CSS (see .rocker in
 * globals.css). It is a real control with no effect on any round: pressing
 * it only tilts the paddle to the other side.
 */
export function Rocker({ className = "" }: { className?: string }) {
  const [side, setSide] = useState<"up" | "down">("up");
  return (
    <div className={`rocker ${className}`} data-side={side}>
      <div className="rocker-well">
        <button
          type="button"
          className="rocker-paddle"
          aria-label={`Rocker switch, set to ${side === "up" ? "UP" : "DOWN"}. Press to flip it.`}
          onClick={() => setSide((s) => (s === "up" ? "down" : "up"))}
        >
          <span className="rocker-half rocker-half-up">
            <span className="rocker-lamp" />
            <Arrow />
            <span>UP</span>
          </span>
          <span className="rocker-half rocker-half-down">
            <span>DOWN</span>
            <Arrow down />
            <span className="rocker-lamp" />
          </span>
        </button>
      </div>
    </div>
  );
}
