"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/*
  One Loop — a single fixed circuit for teaching, not building.
  Battery → copper wire → switch → light bulb.

  Everything runs in REAL TIME, always:
  - flip the switch and the light is instant (the push fills the wire at
    near light speed; the filament heats in ~50 ms)
  - the electrons themselves drift at their true speed — invisible when you
    see the whole loop, visibly creeping when you zoom deep into the wire

  The whole scene is one zoomable view (scroll = zoom, drag = pan). Zoom
  into any spot on the wire and the copper opens up: a lattice of atoms and
  the sea of free electrons, everywhere along the loop. One gold electron is
  "yours" to follow.

  To scale: the loop is one foot (30.5 cm) of 1 mm² copper wire, drawn as a
  10 cm × 5.7 cm rectangle. Drift speeds and lap times are the true numbers.
  Atom size and the jiggle rate are NOT to scale (atoms are ~a million times
  smaller and jiggle absurdly fast) — captions say so.
*/

// ——— logical canvas + loop geometry ———————————————————————————————

const W = 1180;
const H = 640;
const LOOP = { L: 150, R: 1030, T: 70, B: 570, r: 46 };

// Real-world story numbers (dead simple, fixed):
const WIRE_METERS = 0.3048; // the loop is one foot of wire
const BULB_OHMS = 10; // the bulb filament's resistance
const MAX_WATTS = 81 / BULB_OHMS; // brightness reference: 9 V into 10 Ω
// copper: free electrons per m³ × charge each × wire cross-section (1 mm²)
const DRIFT_DIVISOR = 8.5e28 * 1.602e-19 * 1e-6; // amps ÷ this = drift m/s

type PathPoint = { x: number; y: number; tx: number; ty: number; s: number };

function buildLoop(): { pts: PathPoint[]; total: number } {
  const { L, R, T, B, r } = LOOP;
  const raw: { x: number; y: number }[] = [];
  const arc = (cx: number, cy: number, a0: number, a1: number) => {
    const steps = 16;
    for (let i = 1; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps;
      raw.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
  };
  const D = Math.PI / 180;
  // Counterclockwise on screen = the direction electrons flow
  // (out of the battery's − terminal, around, back into +).
  raw.push({ x: L, y: 385 }); // battery − terminal (start, s = 0)
  raw.push({ x: L, y: B - r });
  arc(L + r, B - r, 180 * D, 90 * D); // bottom-left corner
  raw.push({ x: R - r, y: B });
  arc(R - r, B - r, 90 * D, 0); // bottom-right corner
  raw.push({ x: R, y: T + r });
  arc(R - r, T + r, 0, -90 * D); // top-right corner
  raw.push({ x: L + r, y: T });
  arc(L + r, T + r, 270 * D, 180 * D); // top-left corner
  raw.push({ x: L, y: 255 }); // battery + terminal
  raw.push({ x: L, y: 385 }); // close the loop through the battery

  // Resample into ~2 px steps with tangents and arc length.
  const pts: PathPoint[] = [];
  let s = 0;
  for (let i = 0; i < raw.length - 1; i++) {
    const a = raw[i];
    const b = raw[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) continue;
    const steps = Math.max(1, Math.round(len / 2));
    for (let k = 0; k < steps; k++) {
      const f = k / steps;
      pts.push({ x: a.x + dx * f, y: a.y + dy * f, tx: dx / len, ty: dy / len, s: s + len * f });
    }
    s += len;
  }
  return { pts, total: s };
}

const { pts: PATH, total: LOOP_LEN } = buildLoop();
const PX_PER_METER = LOOP_LEN / WIRE_METERS; // ≈ 8,800 world px per meter

function pointAt(s: number): PathPoint {
  let t = s % LOOP_LEN;
  if (t < 0) t += LOOP_LEN;
  let lo = 0;
  let hi = PATH.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (PATH[mid].s <= t) lo = mid;
    else hi = mid - 1;
  }
  return PATH[lo];
}

function nearestS(x: number, y: number): number {
  let best = 0;
  let bd = Infinity;
  for (const p of PATH) {
    const d = (p.x - x) ** 2 + (p.y - y) ** 2;
    if (d < bd) {
      bd = d;
      best = p.s;
    }
  }
  return best;
}

// ——— landmarks along the loop (arc-length positions) ————————————————

const S_BATT_PLUS = nearestS(LOOP.L, 255); // electrons enter the battery here
const S_BULB_IN = nearestS(LOOP.R, 368);
const S_BULB_OUT = nearestS(LOOP.R, 272);
const S_GAP_A = nearestS(625, LOOP.T); // switch contacts
const S_GAP_B = nearestS(555, LOOP.T);

const BULB_C = { x: LOOP.R, y: 320, r: 48 };

function inRange(s: number, a: number, b: number) {
  return s >= a && s <= b;
}
// s-ranges where a part sits instead of bare wire
function onGlyph(s: number, switchOpen: boolean) {
  if (s >= S_BATT_PLUS) return true; // inside the battery
  if (inRange(s, S_BULB_IN, S_BULB_OUT)) return true; // inside the bulb
  if (switchOpen && inRange(s, S_GAP_A - 4, S_GAP_B + 4)) return true;
  return false;
}

// ——— mutable simulation + camera state (refs, not React state) ————————

type Cam = { cx: number; cy: number; zoom: number };

type Sim = {
  heat: number; // 0..1 — how hot the filament is (vs 9 V max)
  drift: number; // world px every free electron has drifted (shared — they move together)
  lastT: number;
  cam: Cam;
  people: number; // how far the human line has shuffled
  flipT: number; // when the switch last flipped (for the "go!" ripple)
};

function makeSim(): Sim {
  return { heat: 0, drift: 0, lastT: 0, cam: { cx: W / 2, cy: H / 2, zoom: 1 }, people: 0, flipT: -1e9 };
}

type Scene = { on: boolean; volts: number };

// TRUE drift speed in world px per real second — this is the honest number
function driftWorldPxPerSec(scene: Scene): number {
  if (!scene.on) return 0;
  const amps = scene.volts / BULB_OHMS;
  return (amps / DRIFT_DIVISOR) * PX_PER_METER;
}

// ——— drawing ————————————————————————————————————————————————————————

const MONO = '"IBM Plex Mono", ui-monospace, monospace';
const C = {
  ink: "#e9ebf3",
  ink2: "#b7bdcd",
  ink3: "#828a9e",
  copper: "#c07a45",
  copperDark: "#7c4e2b",
  electron: "#7cc4ff",
  gold: "#ffd27a",
  plus: "#ff8a66",
  minus: "#6ea8ff",
  warm: "#ffd27a",
};

// deterministic pseudo-random phase per lattice site
function phaseOf(k: number, r: number): number {
  const h = Math.sin(k * 12.9898 + r * 78.233) * 43758.5453;
  return (h - Math.floor(h)) * Math.PI * 2;
}

function drawWire(ctx: CanvasRenderingContext2D, switchOpen: boolean) {
  ctx.lineCap = "round";
  for (const [width, color] of [
    [11, C.copperDark],
    [7, C.copper],
    [2.5, "#e0a06c"],
  ] as const) {
    ctx.lineWidth = width;
    ctx.strokeStyle = color;
    ctx.beginPath();
    let pen = false;
    for (const p of PATH) {
      if (onGlyph(p.s, switchOpen)) {
        pen = false;
        continue;
      }
      if (!pen) {
        ctx.moveTo(p.x, p.y);
        pen = true;
      } else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
}

function drawBattery(ctx: CanvasRenderingContext2D, scene: Scene, labelAlpha: number, zoom: number, now: number) {
  const x = LOOP.L;
  const top = 255;
  const bot = 385;
  ctx.save();
  ctx.fillStyle = "#1b1e29";
  ctx.strokeStyle = "#454c60";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x - 34, top - 12, 68, bot - top + 24, 8);
  ctx.fill();
  ctx.stroke();

  // cells: 1 for 1.5 V, 2 for 3 V, 6 for 9 V
  const cells = Math.round(scene.volts / 1.5);
  const span = bot - top - 20;
  for (let i = 0; i < cells; i++) {
    const cy = top + 14 + (span * (i + 0.5)) / cells;
    ctx.strokeStyle = C.warm;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x - 20, cy - 4);
    ctx.lineTo(x + 20, cy - 4); // long line = + plate
    ctx.stroke();
    ctx.strokeStyle = "#8a92a6";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x - 9, cy + 5);
    ctx.lineTo(x + 9, cy + 5); // short fat line = − plate
    ctx.stroke();
  }

  // the pump: electrons get lifted from + back to − inside (chemistry)
  if (scene.on) {
    ctx.fillStyle = C.electron;
    const t = (now / 900) % 1;
    for (let i = 0; i < 3; i++) {
      const f = (t + i / 3) % 1;
      ctx.beginPath();
      ctx.arc(x + 24, top + 10 + (bot - top - 20) * (1 - f), 2.8, 0, 7);
      ctx.fill();
    }
  }

  if (labelAlpha > 0.02) {
    ctx.globalAlpha = labelAlpha;
    const fs = 17 / Math.max(1, zoom * 0.8);
    ctx.font = `700 ${fs}px ${MONO}`;
    ctx.textAlign = "center";
    ctx.fillStyle = C.plus;
    ctx.fillText("+", x - 46, top + 6);
    ctx.fillStyle = C.minus;
    ctx.fillText("−", x - 46, bot + 6);
    ctx.fillStyle = C.ink3;
    ctx.font = `${10 / Math.max(1, zoom * 0.8)}px ${MONO}`;
    ctx.fillText(`${scene.volts} V`, x, bot + 32);
    ctx.fillText("the pump", x, bot + 45);
  }
  ctx.restore();
}

function drawSwitch(ctx: CanvasRenderingContext2D, on: boolean, labelAlpha: number, zoom: number) {
  const y = LOOP.T;
  const ax = 625;
  const bx = 555;
  ctx.save();
  ctx.fillStyle = "#9aa3b8";
  for (const cx of [ax, bx]) {
    ctx.beginPath();
    ctx.arc(cx, y, 5, 0, 7);
    ctx.fill();
  }
  const ang = on ? 0 : -0.62;
  ctx.strokeStyle = on ? "#d8dce8" : "#9aa3b8";
  ctx.lineWidth = 5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(ax, y);
  ctx.lineTo(ax - 70 * Math.cos(ang), y + 70 * Math.sin(ang));
  ctx.stroke();
  if (labelAlpha > 0.02) {
    ctx.globalAlpha = labelAlpha;
    ctx.fillStyle = C.ink3;
    ctx.font = `${10 / Math.max(1, zoom * 0.8)}px ${MONO}`;
    ctx.textAlign = "center";
    ctx.fillText(on ? "switch: closed — click to open" : "switch: open — click to close", 590, y - 34);
  }
  ctx.restore();
}

function drawBulb(ctx: CanvasRenderingContext2D, heat: number, labelAlpha: number, zoom: number) {
  const { x, y, r } = BULB_C;
  const b = heat < 0.001 ? 0 : Math.pow(heat, 0.35); // eyes are logarithmic
  ctx.save();
  if (b > 0.01) {
    const glowR = 60 + 190 * b;
    const g = ctx.createRadialGradient(x, y, 10, x, y, glowR);
    g.addColorStop(0, `rgba(255, 214, 130, ${0.6 * b})`);
    g.addColorStop(0.5, `rgba(255, 190, 90, ${0.2 * b})`);
    g.addColorStop(1, "rgba(255, 190, 90, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, glowR, 0, 7);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.arc(x, y, r, 0, 7);
  ctx.fillStyle = b > 0.05 ? `rgba(70, 58, 40, ${0.5 + b * 0.3})` : "rgba(34, 38, 50, 0.85)";
  ctx.fill();
  ctx.strokeStyle = "#565e74";
  ctx.lineWidth = 2;
  ctx.stroke();
  // filament: a zigzag between the two terminals
  const cold = { r: 120, g: 116, b: 120 };
  const hot = { r: 255, g: 230, b: 160 };
  const mix = (a: number, c: number) => Math.round(a + (c - a) * b);
  ctx.strokeStyle = `rgb(${mix(cold.r, hot.r)}, ${mix(cold.g, hot.g)}, ${mix(cold.b, hot.b)})`;
  ctx.lineWidth = 2.5;
  ctx.shadowColor = "#ffcf7d";
  ctx.shadowBlur = 22 * b;
  ctx.beginPath();
  ctx.moveTo(x, y + r - 4);
  const zig = 11;
  for (let i = 0; i < 6; i++) {
    ctx.lineTo(x + (i % 2 ? -zig : zig), y + r - 14 - i * 12);
  }
  ctx.lineTo(x, y - r + 4);
  ctx.stroke();
  ctx.shadowBlur = 0;
  if (labelAlpha > 0.02) {
    ctx.globalAlpha = labelAlpha;
    ctx.fillStyle = C.ink3;
    ctx.font = `${10 / Math.max(1, zoom * 0.8)}px ${MONO}`;
    ctx.textAlign = "center";
    ctx.fillText("the bulb", x, y + r + 18);
    ctx.fillText(`${BULB_OHMS} Ω filament`, x, y + r + 31);
  }
  ctx.restore();
}

// LOD A: whole-loop view — simple marker dots (each stands for a huge crowd)
function drawMarkerElectrons(ctx: CanvasRenderingContext2D, sim: Sim, scene: Scene, alpha: number) {
  if (alpha < 0.02) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  for (let i = 0; i < Math.floor(LOOP_LEN / 24); i++) {
    const s = (i * 24 + sim.drift) % LOOP_LEN;
    const gold = i === 0;
    if (onGlyph(s, !scene.on) && !inRange(s, S_BULB_IN, S_BULB_OUT)) continue;
    const p = pointAt(s);
    const inBulb = inRange(s, S_BULB_IN, S_BULB_OUT);
    ctx.fillStyle = gold ? C.gold : inBulb && sim.heat > 0.1 ? C.warm : C.electron;
    ctx.beginPath();
    ctx.arc(p.x, p.y, gold ? 4.2 : 3.2, 0, 7);
    ctx.fill();
  }
  ctx.restore();
}

// LOD B: zoomed in — the copper opens up into atoms + the electron sea,
// everywhere along the wire. Atoms stay put (jiggling); ALL the electrons
// share one drift offset, because they really do move together.
function drawInsideCopper(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
  scene: Scene,
  now: number,
  alpha: number,
  view: { x0: number; y0: number; x1: number; y1: number }
) {
  if (alpha < 0.02) return;
  const t = now / 1000;
  ctx.save();
  ctx.globalAlpha = alpha;

  // darker interior band so the lattice reads as "inside the metal"
  ctx.strokeStyle = "#4a2f1c";
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  ctx.beginPath();
  let pen = false;
  for (const p of PATH) {
    if (onGlyph(p.s, !scene.on) || p.x < view.x0 - 20 || p.x > view.x1 + 20 || p.y < view.y0 - 20 || p.y > view.y1 + 20) {
      pen = false;
      continue;
    }
    if (!pen) {
      ctx.moveTo(p.x, p.y);
      pen = true;
    } else ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();

  // copper atoms: fixed lattice, small thermal jiggle (drawn hugely oversized,
  // and slowed way down — the real jiggle is ~trillions of times per second)
  const colSp = 2.6;
  const cols = Math.floor(LOOP_LEN / colSp);
  for (let k = 0; k < cols; k++) {
    const s = k * colSp;
    if (onGlyph(s, !scene.on)) continue;
    const p = pointAt(s);
    if (p.x < view.x0 - 6 || p.x > view.x1 + 6 || p.y < view.y0 - 6 || p.y > view.y1 + 6) continue;
    const nx = -p.ty;
    const ny = p.tx;
    for (let r = -2; r <= 2; r++) {
      const ph = phaseOf(k, r);
      const off = r * 2.15 + (k % 2 ? 0.55 : -0.55);
      const jx = Math.sin(t * 5 + ph) * 0.22;
      const jy = Math.cos(t * 6 + ph * 2) * 0.22;
      ctx.fillStyle = "#a4653a";
      ctx.beginPath();
      ctx.arc(p.x + nx * off + jx, p.y + ny * off + jy, 0.82, 0, 7);
      ctx.fill();
    }
  }

  // the electron sea: jiggling everywhere + the shared TRUE drift
  const eSp = 4.1;
  const eCols = Math.floor(LOOP_LEN / eSp);
  for (let k = 0; k < eCols; k++) {
    const s = (k * eSp + sim.drift) % LOOP_LEN;
    if (onGlyph(s, !scene.on)) continue;
    const p = pointAt(s);
    if (p.x < view.x0 - 6 || p.x > view.x1 + 6 || p.y < view.y0 - 6 || p.y > view.y1 + 6) continue;
    const nx = -p.ty;
    const ny = p.tx;
    for (let r = -1; r <= 1; r++) {
      const ph = phaseOf(k, r + 7);
      const off = r * 2.15 + 1.05;
      const jx = Math.sin(t * 3.2 + ph) * 0.85;
      const jy = Math.cos(t * 2.7 + ph * 3) * 0.85;
      const gold = k === 0 && r === 0;
      ctx.fillStyle = gold ? C.gold : C.electron;
      ctx.beginPath();
      ctx.arc(p.x + nx * off + jx, p.y + ny * off + jy, gold ? 0.9 : 0.6, 0, 7);
      ctx.fill();
    }
  }
  ctx.restore();
}

// screen-space position of "your" gold electron (for its floating label)
function goldElectronPos(sim: Sim, scene: Scene, zoomed: boolean): { x: number; y: number } | null {
  const s = zoomed ? sim.drift % LOOP_LEN : sim.drift % LOOP_LEN;
  if (onGlyph(s, !scene.on) && !inRange(s, S_BULB_IN, S_BULB_OUT)) return null;
  const p = pointAt(s);
  return { x: p.x, y: p.y };
}

function drawScene(ctx: CanvasRenderingContext2D, sim: Sim, scene: Scene, now: number, dt: number, vw: number, vh: number) {
  const fit = Math.min(vw / W, vh / H);
  const { cx, cy, zoom } = sim.cam;
  const scale = fit * zoom;

  // physics (all real time)
  sim.drift = (sim.drift + driftWorldPxPerSec(scene) * dt) % LOOP_LEN;
  const target = scene.on ? scene.volts ** 2 / BULB_OHMS / MAX_WATTS : 0;
  const tau = target > sim.heat ? 0.05 : 0.15; // real filament heat-up/cool-down
  sim.heat += ((target - sim.heat) / tau) * Math.min(dt, tau);
  sim.heat = Math.max(0, Math.min(1, sim.heat));

  ctx.clearRect(0, 0, vw, vh);

  // world transform: camera (cx, cy) lands at the middle of the canvas
  ctx.save();
  ctx.translate(vw / 2, vh / 2);
  ctx.scale(scale, scale);
  ctx.translate(-cx, -cy);

  const view = {
    x0: cx - vw / 2 / scale,
    y0: cy - vh / 2 / scale,
    x1: cx + vw / 2 / scale,
    y1: cy + vh / 2 / scale,
  };

  // faint dot grid, only at loop scale
  if (zoom < 3) {
    ctx.fillStyle = `rgba(140, 150, 175, ${0.07 * (1 - (zoom - 1) / 2)})`;
    for (let gx = 20; gx < W; gx += 40) {
      for (let gy = 20; gy < H; gy += 40) {
        ctx.fillRect(gx, gy, 1.6, 1.6);
      }
    }
  }

  const labelAlpha = Math.max(0, Math.min(1, 1 - (zoom - 1.6) / 1.6));
  const insideAlpha = Math.max(0, Math.min(1, (zoom - 4) / 6));
  const markerAlpha = Math.max(0, Math.min(1, 1 - (zoom - 6) / 6));

  drawWire(ctx, !scene.on);
  drawInsideCopper(ctx, sim, scene, now, insideAlpha, view);
  drawMarkerElectrons(ctx, sim, scene, markerAlpha);
  drawBattery(ctx, scene, labelAlpha, zoom, now);
  drawSwitch(ctx, scene.on, labelAlpha, zoom);
  drawBulb(ctx, sim.heat, labelAlpha, zoom);

  ctx.restore();

  // ——— screen-space layer (fixed-size text) ———

  // "your electron" tag, once you're close enough to care
  if (zoom > 3) {
    const g = goldElectronPos(sim, scene, zoom > 6);
    if (g) {
      const sx = (g.x - cx) * scale + vw / 2;
      const sy = (g.y - cy) * scale + vh / 2;
      if (sx > -40 && sx < vw + 40 && sy > -40 && sy < vh + 40) {
        ctx.fillStyle = C.gold;
        ctx.font = `11px ${MONO}`;
        ctx.textAlign = "left";
        ctx.fillText("← your electron", sx + 14, sy - 10);
        const mmPerS = (driftWorldPxPerSec(scene) / PX_PER_METER) * 1000;
        ctx.fillStyle = C.ink3;
        ctx.font = `10px ${MONO}`;
        ctx.fillText(
          mmPerS > 0
            ? `real speed: ${mmPerS.toFixed(3)} mm/s (~${((mmPerS * 3600) / 10).toFixed(0)} cm per hour)`
            : "parked — jiggling, going nowhere",
          sx + 14,
          sy + 4
        );
      }
    }
  }

  // what-you're-looking-at caption
  const worldAcross = vw / scale; // world px across the screen
  const metersAcross = worldAcross / PX_PER_METER;
  const len =
    zoom < 1.3
      ? "the whole loop — one foot of wire (10 cm × 5.7 cm)"
      : metersAcross > 0.01
        ? `≈ ${(metersAcross * 100).toFixed(1)} cm of wire across the screen`
        : `≈ ${(metersAcross * 1000).toFixed(1)} mm of wire across the screen`;
  ctx.fillStyle = C.ink3;
  ctx.font = `10px ${MONO}`;
  ctx.textAlign = "left";
  ctx.fillText(`zoom ×${zoom < 10 ? zoom.toFixed(1) : Math.round(zoom)} · ${len}`, 12, vh - 30);
  ctx.fillText(
    zoom > 4
      ? "orange = copper atoms · blue = the electron sea (atoms drawn ~a million× too big, jiggle slowed — drift speed is REAL)"
      : "scroll to zoom into the wire · drag to pan · each dot stands for a huge crowd of electrons",
    12,
    vh - 16
  );
}

// ——— the human-line analogy strip (screen space, above the circuit) ————

function drawStickPerson(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  walk: number // 0 = standing, else leg-swing phase
) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(x, y - 15, 3.2, 0, 7); // head
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x, y - 11);
  ctx.lineTo(x, y - 2); // body
  const sw = walk === 0 ? 0 : Math.sin(walk) * 4;
  ctx.moveTo(x, y - 2);
  ctx.lineTo(x - 3 + sw, y + 6); // legs
  ctx.moveTo(x, y - 2);
  ctx.lineTo(x + 3 - sw, y + 6);
  ctx.moveTo(x, y - 9);
  ctx.lineTo(x - 3, y - 5); // arms
  ctx.moveTo(x, y - 9);
  ctx.lineTo(x + 3 + (walk === 0 ? 0 : sw * 0.5), y - 5);
  ctx.stroke();
}

// the people walk a full loop, just like the circuit: out of the battery,
// all the way around, back in
type StripPath = {
  total: number;
  at: (t: number) => { x: number; y: number };
  X0: number;
  X1: number;
  TOP: number;
  BOT: number;
  batTop: number;
  batBot: number;
};
let stripCache: { vw: number; p: StripPath } | null = null;

function stripPath(vw: number): StripPath {
  if (stripCache && stripCache.vw === vw) return stripCache.p;
  const X0 = 120;
  const X1 = Math.max(X0 + 320, vw - 50);
  const TOP = 46;
  const BOT = 146;
  const R = 22;
  const batTop = 66;
  const batBot = 126;
  type Seg = { len: number; at: (f: number) => { x: number; y: number } };
  const segs: Seg[] = [];
  const line = (ax: number, ay: number, bx: number, by: number) =>
    segs.push({ len: Math.hypot(bx - ax, by - ay), at: (f) => ({ x: ax + (bx - ax) * f, y: ay + (by - ay) * f }) });
  const arc = (cx: number, cy: number, a0: number, a1: number) =>
    segs.push({
      len: (Math.abs(a1 - a0) * Math.PI * R) / Math.PI,
      at: (f) => ({ x: cx + R * Math.cos(a0 + (a1 - a0) * f), y: cy + R * Math.sin(a0 + (a1 - a0) * f) }),
    });
  const D = Math.PI / 180;
  // counterclockwise, like the real loop: out of the battery's − (bottom)…
  line(X0, batBot, X0, BOT - R);
  arc(X0 + R, BOT - R, 180 * D, 90 * D);
  line(X0 + R, BOT, X1 - R, BOT);
  arc(X1 - R, BOT - R, 90 * D, 0);
  line(X1, BOT - R, X1, TOP + R);
  arc(X1 - R, TOP + R, 0, -90 * D);
  line(X1 - R, TOP, X0 + R, TOP);
  arc(X0 + R, TOP + R, 270 * D, 180 * D);
  line(X0, TOP + R, X0, batTop); // …and back into the + (top)
  line(X0, batTop, X0, batBot); // hidden stretch inside the battery
  const total = segs.reduce((a, s) => a + s.len, 0);
  const at = (t: number) => {
    let u = t % total;
    if (u < 0) u += total;
    for (const s of segs) {
      if (u <= s.len) return s.at(u / s.len);
      u -= s.len;
    }
    return segs[segs.length - 1].at(1);
  };
  const p = { total, at, X0, X1, TOP, BOT, batTop, batBot };
  stripCache = { vw, p };
  return p;
}

function drawPeople(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
  scene: Scene,
  now: number,
  dt: number,
  vw: number
) {
  ctx.clearRect(0, 0, vw, 220);
  const P = stripPath(vw);
  const amps = scene.on ? scene.volts / BULB_OHMS : 0;

  // harder push (more volts) → everyone walks faster → more pass per second
  sim.people = (sim.people + amps * 40 * dt) % P.total;

  ctx.font = `10px ${MONO}`;
  ctx.textAlign = "left";
  ctx.fillStyle = C.ink3;
  ctx.fillText("same idea, with people — a full loop, already packed:", 12, 16);

  // the walkway
  ctx.strokeStyle = "#2c3140";
  ctx.lineWidth = 22;
  ctx.lineCap = "round";
  ctx.beginPath();
  const steps = 140;
  for (let i = 0; i <= steps; i++) {
    const pt = P.at((i / steps) * P.total);
    if (i === 0) ctx.moveTo(pt.x, pt.y);
    else ctx.lineTo(pt.x, pt.y);
  }
  ctx.stroke();

  // the battery: people go in the top (+), get pushed out the bottom (−)
  ctx.fillStyle = "#1b1e29";
  ctx.strokeStyle = "#454c60";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(P.X0 - 26, P.batTop - 8, 52, P.batBot - P.batTop + 16, 6);
  ctx.fill();
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = C.plus;
  ctx.fillText("+ in", P.X0, P.batTop + 8);
  ctx.fillStyle = C.minus;
  ctx.fillText("− out", P.X0, P.batBot - 2);
  ctx.fillStyle = C.warm;
  ctx.fillText(`${scene.volts} V`, P.X0, P.batTop + 26);
  ctx.fillStyle = C.ink3;
  ctx.fillText("battery", P.X0, P.batTop + 40);

  // counting station (top middle): live amps as an actual count
  const doorX = (P.X0 + P.X1) / 2;
  ctx.strokeStyle = "#5a637a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(doorX, P.TOP - 14);
  ctx.lineTo(doorX, P.TOP - 5);
  ctx.moveTo(doorX, P.TOP + 5);
  ctx.lineTo(doorX, P.TOP + 14);
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = C.ink3;
  ctx.fillText("count them passing here = amps", doorX, 16);
  if (amps > 0) {
    ctx.fillStyle = C.electron;
    ctx.fillText(`in the real wire: ${electronsPerSecond(amps)} electrons/second = ${amps.toFixed(2)} A`, doorX, 30);
  } else {
    ctx.fillStyle = C.ink3;
    ctx.fillText("nobody passing = 0.00 A", doorX, 30);
  }

  // the people: always shaking (electrons jiggle!), walking only when pushed
  const count = Math.floor(P.total / 26);
  for (let i = 0; i < count; i++) {
    const t = (i * 26 + sim.people) % P.total;
    const pt = P.at(t);
    // hidden while inside the battery
    if (Math.abs(pt.x - P.X0) < 14 && pt.y > P.batTop - 10 && pt.y < P.batBot + 10) continue;
    const shakeX = Math.sin(now * 0.009 + i * 2.1) * 1.4;
    const shakeY = Math.cos(now * 0.011 + i * 1.3) * 1.2;
    const gold = i === 0;
    drawStickPerson(
      ctx,
      pt.x + shakeX,
      pt.y + 6 + shakeY,
      gold ? C.gold : C.electron,
      scene.on ? t * 0.35 + now * 0.011 : 0
    );
  }

  // the "go!" shove racing around the loop at (nearly) light speed
  const p = (now - sim.flipT) / 550;
  if (scene.on && p > 0 && p < 1) {
    const pt = P.at(p * P.total);
    const g = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, 30);
    g.addColorStop(0, "rgba(150, 226, 255, 0.8)");
    g.addColorStop(1, "rgba(150, 226, 255, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(pt.x - 32, pt.y - 32, 64, 64);
    ctx.fillStyle = "#96e2ff";
    ctx.textAlign = "center";
    ctx.fillText("“go!”", pt.x, pt.y - 34);
  }

  // the moral + the mapping
  ctx.textAlign = "left";
  ctx.fillStyle = scene.on ? C.ink2 : C.ink3;
  ctx.fillText(
    scene.on
      ? "everyone starts at the SAME moment, everywhere in the loop — more volts = harder push = faster walk = more amps"
      : "switch off — everyone stands in place, shaking (just like electrons jiggle), waiting for the push",
    12,
    176
  );
  ctx.fillStyle = C.ink3;
  ctx.fillText("person = electron · the push = volts · people passing per second = amps", 12, 190);
}

// electrons per second for a given current, rounded to 2 sig figs, with commas
function electronsPerSecond(amps: number): string {
  const n = amps / 1.602e-19;
  if (n <= 0) return "0";
  const pow = Math.pow(10, Math.floor(Math.log10(n)) - 1);
  return (Math.round(n / pow) * pow).toLocaleString("en-US");
}

// ——— component ————————————————————————————————————————————————————————

const ZOOM_MAX = 80;

export default function OneLoop() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const peopleRef = useRef<HTMLCanvasElement | null>(null);
  const simRef = useRef<Sim>(null as unknown as Sim);
  if (!simRef.current) simRef.current = makeSim();

  const [on, setOn] = useState(false);
  const [volts, setVolts] = useState(3);
  const [zoomUi, setZoomUi] = useState(1); // mirror of cam.zoom for the readout

  const sceneRef = useRef<Scene>({ on, volts });
  sceneRef.current = { on, volts };

  const toggleOn = useCallback(() => {
    simRef.current.flipT = performance.now();
    setOn((v) => !v);
  }, []);

  const drag = useRef<{ x: number; y: number; moved: boolean; active: boolean }>({
    x: 0,
    y: 0,
    moved: false,
    active: false,
  });

  const clampCam = useCallback((cam: Cam, vw: number, vh: number) => {
    const fit = Math.min(vw / W, vh / H);
    const halfW = vw / 2 / (fit * cam.zoom);
    const halfH = vh / 2 / (fit * cam.zoom);
    cam.cx = halfW >= W / 2 ? W / 2 : Math.max(halfW, Math.min(W - halfW, cam.cx));
    cam.cy = halfH >= H / 2 ? H / 2 : Math.max(halfH, Math.min(H - halfH, cam.cy));
    // when zoomed in, stay magnetically attached to the wire — otherwise you
    // can zoom into empty space and see nothing
    if (cam.zoom > 6) {
      const near = pointAt(nearestS(cam.cx, cam.cy));
      const dx = cam.cx - near.x;
      const dy = cam.cy - near.y;
      const d = Math.hypot(dx, dy);
      const allowed = Math.max(8, Math.min(halfW, halfH) * 0.8);
      if (d > allowed) {
        const f = allowed / d;
        cam.cx = near.x + dx * f;
        cam.cy = near.y + dy * f;
      }
    }
  }, []);

  // render loop (ref-driven on purpose — React state is only the UI mirror)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let disposed = false;

    const people = peopleRef.current;
    const pctx = people?.getContext("2d") ?? null;

    const fit = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      for (const c of [canvas, people]) {
        if (!c) continue;
        const box = c.parentElement!;
        c.width = box.clientWidth * dpr;
        c.height = box.clientHeight * dpr;
        c.style.width = `${box.clientWidth}px`;
        c.style.height = `${box.clientHeight}px`;
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(canvas.parentElement!);

    const tick = (now: number) => {
      if (disposed) return;
      const sim = simRef.current;
      const dt = Math.min(0.05, (now - (sim.lastT || now)) / 1000);
      sim.lastT = now;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const vw = canvas.width / dpr;
      const vh = canvas.height / dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawScene(ctx, sim, sceneRef.current, now, dt, vw, vh);
      if (people && pctx) {
        pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawPeople(pctx, sim, sceneRef.current, now, dt, people.width / dpr);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const screenToWorld = useCallback((px: number, py: number, rect: DOMRect) => {
    const cam = simRef.current.cam;
    const fit = Math.min(rect.width / W, rect.height / H);
    const scale = fit * cam.zoom;
    return {
      x: (px - rect.left - rect.width / 2) / scale + cam.cx,
      y: (py - rect.top - rect.height / 2) / scale + cam.cy,
    };
  }, []);

  const onWheel = useCallback(
    (ev: React.WheelEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const cam = simRef.current.cam;
      const before = screenToWorld(ev.clientX, ev.clientY, rect);
      cam.zoom = Math.max(1, Math.min(ZOOM_MAX, cam.zoom * Math.exp(-ev.deltaY * 0.0016)));
      // keep the world point under the cursor pinned while zooming
      const fit = Math.min(rect.width / W, rect.height / H);
      const scale = fit * cam.zoom;
      cam.cx = before.x - (ev.clientX - rect.left - rect.width / 2) / scale;
      cam.cy = before.y - (ev.clientY - rect.top - rect.height / 2) / scale;
      clampCam(cam, rect.width, rect.height);
      setZoomUi(cam.zoom);
    },
    [screenToWorld, clampCam]
  );

  const onPointerDown = useCallback((ev: React.PointerEvent<HTMLCanvasElement>) => {
    drag.current = { x: ev.clientX, y: ev.clientY, moved: false, active: true };
    (ev.target as HTMLElement).setPointerCapture(ev.pointerId);
  }, []);

  const onPointerMove = useCallback(
    (ev: React.PointerEvent<HTMLCanvasElement>) => {
      const d = drag.current;
      if (!d.active) return;
      const dx = ev.clientX - d.x;
      const dy = ev.clientY - d.y;
      if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
      if (!d.moved) return;
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const cam = simRef.current.cam;
      const scale = Math.min(rect.width / W, rect.height / H) * cam.zoom;
      cam.cx -= dx / scale;
      cam.cy -= dy / scale;
      clampCam(cam, rect.width, rect.height);
      d.x = ev.clientX;
      d.y = ev.clientY;
    },
    [clampCam]
  );

  const onPointerUp = useCallback(
    (ev: React.PointerEvent<HTMLCanvasElement>) => {
      const d = drag.current;
      d.active = false;
      if (d.moved) return; // it was a pan, not a click
      const rect = canvasRef.current!.getBoundingClientRect();
      const w = screenToWorld(ev.clientX, ev.clientY, rect);
      if (Math.hypot(w.x - 590, w.y - LOOP.T + 15) < 70) {
        toggleOn();
      } else if (Math.abs(w.x - LOOP.L) < 50 && w.y > 230 && w.y < 410) {
        setVolts((v) => (v === 3 ? 9 : 3));
      }
    },
    [screenToWorld, toggleOn]
  );

  const resetView = useCallback(() => {
    simRef.current.cam = { cx: W / 2, cy: H / 2, zoom: 1 };
    setZoomUi(1);
  }, []);

  const amps = on ? volts / BULB_OHMS : 0;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg text-ink">
      <div className="flex min-h-0 flex-1">
        {/* scene */}
        <main className="flex min-w-0 flex-1 flex-col">
          {/* the human-line analogy, above the real thing */}
          <div className="relative h-[198px] shrink-0 border-b border-line">
            <canvas ref={peopleRef} className="absolute inset-0" />
          </div>

          <div className="relative min-h-0 flex-1">
            <canvas
              ref={canvasRef}
              onWheel={onWheel}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing"
            />
            {/* meters, floating so the diagram stays the hero */}
            <div className="pointer-events-none absolute right-3 top-3 flex w-[230px] flex-col gap-1.5">
              {[
                {
                  label: "PUSH",
                  value: `${volts} V`,
                  hint: `each coulomb of charge gets ${volts} joules of energy (1 V = 1 joule per coulomb)`,
                  color: "text-accent",
                },
                {
                  label: "FLOW",
                  value: `${amps.toFixed(2)} A`,
                  hint:
                    amps > 0
                      ? `${electronsPerSecond(amps)} electrons cross any point each second`
                      : "switch open — no electrons crossing",
                  color: "text-[#7cc4ff]",
                },
                {
                  label: "RESISTANCE",
                  value: `${BULB_OHMS} Ω`,
                  hint: "how much the filament fights the flow",
                  color: "text-[#ff9a6b]",
                },
              ].map((m) => (
                <div key={m.label} className="rounded-sm border border-line bg-panel/85 px-2.5 py-1.5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[9px] tracking-widest text-ink-3">{m.label}</span>
                    <span className={`font-mono text-base ${m.color}`}>{m.value}</span>
                  </div>
                  <p className="text-[9px] leading-snug text-ink-3">{m.hint}</p>
                </div>
              ))}
            </div>
          </div>

          {/* controls */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line px-4 py-2.5">
            <button
              onClick={toggleOn}
              className={`rounded-sm border px-4 py-2 text-sm font-semibold transition-colors ${
                on
                  ? "border-accent/70 bg-accent/15 text-accent"
                  : "border-line bg-panel text-ink-2 hover:bg-panel-2"
              }`}
            >
              {on ? "⏻ ON" : "⏻ OFF"}
            </button>

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase tracking-widest text-ink-3">battery</span>
              {[3, 9].map((v) => (
                <button
                  key={v}
                  onClick={() => setVolts(v)}
                  className={`btn ${volts === v ? "border-accent/60 text-accent" : ""}`}
                >
                  {v} V
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-widest text-ink-3">
                zoom ×{zoomUi < 10 ? zoomUi.toFixed(1) : Math.round(zoomUi)}
              </span>
              {zoomUi > 1.05 && (
                <button className="btn" onClick={resetView}>
                  see the whole loop
                </button>
              )}
            </div>

          </div>
        </main>
      </div>
    </div>
  );
}
