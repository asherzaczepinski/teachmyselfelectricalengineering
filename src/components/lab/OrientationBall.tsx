"use client";

/* eslint-disable react-hooks/refs -- reads the live camera ref during render;
   the parent re-renders every animation frame, so the ball always tracks. */

// The Unity-style axis ball in the board's corner: it mirrors the camera
// orientation, and dragging it orbits the view with no modifier key.

import { MutableRefObject } from "react";
import { CamState } from "./three/ThreeBoard";

export function OrientationBall({
  camRef,
  onGrab,
}: {
  camRef: MutableRefObject<CamState>;
  onGrab: (e: React.PointerEvent) => void;
}) {
  const cam = camRef.current;
  const cA = Math.cos(cam.azim);
  const sA = Math.sin(cam.azim);
  const cP = Math.cos(cam.polar);
  const sP = Math.sin(cam.polar);
  const right = [cA, sA, 0];
  const upV = [-cP * sA, cP * cA, sP];
  const fwd = [-sP * sA, sP * cA, -cP];
  const proj = (v: number[]) => ({
    x: 48 + (v[0] * right[0] + v[1] * right[1] + v[2] * right[2]) * 32,
    y: 48 - (v[0] * upV[0] + v[1] * upV[1] + v[2] * upV[2]) * 32,
    depth: v[0] * fwd[0] + v[1] * fwd[1] + v[2] * fwd[2],
  });
  const ends = [
    { v: [1, 0, 0], color: "#e4483c", label: "X" },
    { v: [-1, 0, 0], color: "#e4483c", label: "" },
    { v: [0, -1, 0], color: "#3a7bd5", label: "Y" },
    { v: [0, 1, 0], color: "#3a7bd5", label: "" },
    { v: [0, 0, 1], color: "#3aa065", label: "Z" },
    { v: [0, 0, -1], color: "#3aa065", label: "" },
  ]
    .map((a) => ({ ...a, p: proj(a.v) }))
    .sort((a, b) => a.p.depth - b.p.depth);
  return (
    <div
      className="absolute bottom-3 right-3 z-20 select-none"
      style={{ width: 96, height: 96, cursor: "grab", touchAction: "none" }}
      title="Drag to rotate the view"
      onPointerDown={(e) => {
        e.preventDefault();
        onGrab(e);
      }}
    >
      <svg width="96" height="96" aria-label="Rotate the view">
        <circle cx="48" cy="48" r="46" fill="rgba(10,16,28,0.5)" stroke="var(--line)" />
        {ends.map((a, i) => (
          <g key={i} opacity={a.label ? 1 : 0.45}>
            <line x1={48} y1={48} x2={a.p.x} y2={a.p.y} stroke={a.color} strokeWidth={a.label ? 2.5 : 1.5} />
            <circle cx={a.p.x} cy={a.p.y} r={a.label ? 9 : 5.5} fill={a.color} />
            {a.label && (
              <text x={a.p.x} y={a.p.y + 3} textAnchor="middle" fontSize="9" fontWeight="700" fill="#0b1220">
                {a.label}
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
