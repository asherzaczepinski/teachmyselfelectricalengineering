"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/*
  One Loop — the human version, full page.

  The circuit is a loop of people, already packed shoulder to shoulder:
  - the battery is a box that pushes everyone around the loop (volts = how hard)
  - flip it on and a "go!" wave sweeps the loop at (cartoon) light speed —
    each person stands still until the wave reaches them, then walks
  - when it's off, everyone shakes in place, like electrons jiggle
  - the counting station shows the real number: electrons passing per second = amps

  person = electron · the push = volts · people passing per second = amps
*/

const OHMS = 10; // the loop's resistance
// free electrons in one real foot of 1 mm² copper wire:
// 8.5×10²⁸ per m³ × 1×10⁻⁶ m² × 0.3048 m
const LOOP_ELECTRONS = 8.5e28 * 1e-6 * 0.3048;

// ——— mutable simulation state (refs, not React state) ————————————————

type Sim = {
  peopleT: number[] | null; // each person's position along the loop
  stripTotal: number; // loop length the positions were built for
  flipT: number; // when the switch last flipped (for the "go!" wave)
  lastT: number;
};

function makeSim(): Sim {
  return { peopleT: null, stripTotal: 0, flipT: -1e9, lastT: 0 };
}

type Scene = { on: boolean; volts: number };

// ——— drawing ————————————————————————————————————————————————————————

const MONO = '"IBM Plex Mono", ui-monospace, monospace';
const C = {
  ink: "#e9ebf3",
  ink2: "#b7bdcd",
  ink3: "#828a9e",
  electron: "#7cc4ff",
  plus: "#ff8a66",
  minus: "#6ea8ff",
  warm: "#ffd27a",
};

function drawStickPerson(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  walk: number, // 0 = standing, else leg-swing phase
  k = 1 // size
) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.6 * k;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(x, y - 15 * k, 3.2 * k, 0, 7); // head
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(x, y - 11 * k);
  ctx.lineTo(x, y - 2 * k); // body
  const sw = walk === 0 ? 0 : Math.sin(walk) * 4 * k;
  ctx.moveTo(x, y - 2 * k);
  ctx.lineTo(x - 3 * k + sw, y + 6 * k); // legs
  ctx.moveTo(x, y - 2 * k);
  ctx.lineTo(x + 3 * k - sw, y + 6 * k);
  ctx.moveTo(x, y - 9 * k);
  ctx.lineTo(x - 3 * k, y - 5 * k); // arms
  ctx.moveTo(x, y - 9 * k);
  ctx.lineTo(x + 3 * k + (walk === 0 ? 0 : sw * 0.5), y - 5 * k);
  ctx.stroke();
}

// the loop the people walk: a rounded rectangle with the battery on the left
type LoopPath = {
  total: number;
  at: (t: number) => { x: number; y: number };
  X0: number;
  X1: number;
  TOP: number;
  BOT: number;
  batTop: number;
  batBot: number;
};
let pathCache: { vw: number; vh: number; p: LoopPath } | null = null;

function loopPath(vw: number, vh: number): LoopPath {
  if (pathCache && pathCache.vw === vw && pathCache.vh === vh) return pathCache.p;
  const X0 = 150;
  const X1 = Math.max(X0 + 400, vw - 110);
  const TOP = 92;
  const BOT = Math.max(TOP + 260, vh - 110);
  const R = 44;
  const mid = (TOP + BOT) / 2;
  const batTop = mid - 62;
  const batBot = mid + 62;
  type Seg = { len: number; at: (f: number) => { x: number; y: number } };
  const segs: Seg[] = [];
  const line = (ax: number, ay: number, bx: number, by: number) =>
    segs.push({ len: Math.hypot(bx - ax, by - ay), at: (f) => ({ x: ax + (bx - ax) * f, y: ay + (by - ay) * f }) });
  const arc = (cx: number, cy: number, a0: number, a1: number) =>
    segs.push({
      len: Math.abs(a1 - a0) * R,
      at: (f) => ({ x: cx + R * Math.cos(a0 + (a1 - a0) * f), y: cy + R * Math.sin(a0 + (a1 - a0) * f) }),
    });
  const D = Math.PI / 180;
  // counterclockwise: out of the battery's − (bottom), around, into + (top)
  line(X0, batBot, X0, BOT - R);
  arc(X0 + R, BOT - R, 180 * D, 90 * D);
  line(X0 + R, BOT, X1 - R, BOT);
  arc(X1 - R, BOT - R, 90 * D, 0);
  line(X1, BOT - R, X1, TOP + R);
  arc(X1 - R, TOP + R, 0, -90 * D);
  line(X1 - R, TOP, X0 + R, TOP);
  arc(X0 + R, TOP + R, 270 * D, 180 * D);
  line(X0, TOP + R, X0, batTop);
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
  pathCache = { vw, vh, p };
  return p;
}

// a huge count, rounded to 2 sig figs, written out with commas
function fmtBig(n: number): string {
  if (n <= 0) return "0";
  const pow = Math.pow(10, Math.floor(Math.log10(n)) - 1);
  return (Math.round(n / pow) * pow).toLocaleString("en-US");
}

function electronsPerSecond(amps: number): string {
  return fmtBig(amps / 1.602e-19);
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  sim: Sim,
  scene: Scene,
  now: number,
  dt: number,
  vw: number,
  vh: number
) {
  ctx.clearRect(0, 0, vw, vh);
  const P = loopPath(vw, vh);
  const amps = scene.on ? scene.volts / OHMS : 0;

  // one entry per person, so each can wait for the "go!" wave to reach them
  if (!sim.peopleT || sim.stripTotal !== P.total) {
    const n = Math.floor(P.total / 26);
    sim.peopleT = Array.from({ length: n }, (_, i) => (i * P.total) / n);
    sim.stripTotal = P.total;
  }
  const ppl = sim.peopleT;

  // the "go!" wave sweeps the loop after a flip; people freeze until it hits them
  const sweep = (now - sim.flipT) / 700;
  const frontT = scene.on ? (sweep < 1 ? sweep * P.total : Infinity) : -Infinity;

  // harder push (more volts) → everyone walks faster → more pass per second
  const speed = amps * 55;

  // the walkway
  ctx.strokeStyle = "#2c3140";
  ctx.lineWidth = 30;
  ctx.lineCap = "round";
  ctx.beginPath();
  const steps = 160;
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
  ctx.roundRect(P.X0 - 34, P.batTop - 10, 68, P.batBot - P.batTop + 20, 8);
  ctx.fill();
  ctx.stroke();
  const midY = (P.batTop + P.batBot) / 2;
  ctx.font = `12px ${MONO}`;
  ctx.textAlign = "center";
  ctx.fillStyle = C.plus;
  ctx.fillText("+ in", P.X0, P.batTop + 12);
  ctx.fillStyle = C.minus;
  ctx.fillText("− out", P.X0, P.batBot - 4);

  // the on/off switch lives on the battery — click it
  const swY = midY - 14;
  ctx.fillStyle = scene.on ? "rgba(232, 176, 75, 0.22)" : "#2a2f3d";
  ctx.strokeStyle = scene.on ? "#e8b04b" : "#5a637a";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(P.X0 - 21, swY - 11, 42, 22, 11);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = scene.on ? "#e8b04b" : "#8a92a6";
  ctx.beginPath();
  ctx.arc(P.X0 + (scene.on ? 10 : -10), swY, 7, 0, 7);
  ctx.fill();
  ctx.font = `10px ${MONO}`;
  ctx.fillStyle = scene.on ? "#e8b04b" : C.ink3;
  ctx.fillText(scene.on ? "ON" : "OFF", P.X0, swY + 25);
  ctx.fillStyle = C.ink3;
  ctx.font = `11px ${MONO}`;
  ctx.fillText("battery", P.X0, midY + 28);

  // pick the push, right next to the battery
  const chipX = P.X0 + 64;
  for (const [v, cy] of [
    [3, midY - 14],
    [9, midY + 14],
  ] as const) {
    const active = scene.volts === v;
    ctx.strokeStyle = active ? "#e8b04b" : "#454c60";
    ctx.fillStyle = active ? "rgba(232, 176, 75, 0.14)" : "rgba(27, 30, 41, 0.9)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(chipX - 23, cy - 11, 46, 22, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = active ? "#e8b04b" : C.ink3;
    ctx.font = `11px ${MONO}`;
    ctx.fillText(`${v} V`, chipX, cy + 4);
  }

  // counting station (top middle): live amps as an actual count
  const doorX = (P.X0 + P.X1) / 2;
  ctx.strokeStyle = "#5a637a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(doorX, P.TOP - 20);
  ctx.lineTo(doorX, P.TOP - 8);
  ctx.moveTo(doorX, P.TOP + 8);
  ctx.lineTo(doorX, P.TOP + 20);
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.fillStyle = C.ink3;
  ctx.font = `11px ${MONO}`;
  ctx.fillText("count them passing here = amps", doorX, P.TOP - 44);
  if (amps > 0) {
    ctx.fillStyle = C.electron;
    ctx.fillText(`in the real wire: ${electronsPerSecond(amps)} electrons/second = ${amps.toFixed(2)} A`, doorX, P.TOP - 30);
  } else {
    ctx.fillStyle = C.ink3;
    ctx.fillText("nobody passing = 0.00 A", doorX, P.TOP - 30);
  }

  // the people: always shaking (electrons jiggle!), each one walking only
  // once the "go!" wave has reached their spot
  for (let i = 0; i < ppl.length; i++) {
    const active = ppl[i] <= frontT;
    if (active) ppl[i] = (ppl[i] + speed * dt) % P.total;
    const t = ppl[i];
    const pt = P.at(t);
    // hidden while inside the battery
    if (Math.abs(pt.x - P.X0) < 18 && pt.y > P.batTop - 12 && pt.y < P.batBot + 12) continue;
    const shakeX = Math.sin(now * 0.009 + i * 2.1) * 1.4;
    const shakeY = Math.cos(now * 0.011 + i * 1.3) * 1.2;
    drawStickPerson(
      ctx,
      pt.x + shakeX,
      pt.y + 5 + shakeY,
      C.electron,
      active ? t * 0.35 + now * 0.011 : 0,
      0.9
    );
  }

  // the "go!" shove racing around the loop at (nearly) light speed
  if (scene.on && sweep > 0 && sweep < 1) {
    const pt = P.at(sweep * P.total);
    const g = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, 40);
    g.addColorStop(0, "rgba(150, 226, 255, 0.8)");
    g.addColorStop(1, "rgba(150, 226, 255, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(pt.x - 42, pt.y - 42, 84, 84);
    ctx.fillStyle = "#96e2ff";
    ctx.font = `12px ${MONO}`;
    ctx.textAlign = "center";
    ctx.fillText("“go!”", pt.x, pt.y - 42);
  }

  // the key: one drawn person stands for a staggering number of electrons
  drawStickPerson(ctx, 24, vh - 26, C.electron, 0, 0.9);
  ctx.textAlign = "left";
  ctx.font = `11px ${MONO}`;
  ctx.fillStyle = C.ink2;
  ctx.fillText(`= about ${fmtBig(LOOP_ELECTRONS / ppl.length)} electrons`, 40, vh - 24);
}

// ——— component ————————————————————————————————————————————————————————

export default function OneLoop() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const simRef = useRef<Sim>(null as unknown as Sim);
  if (!simRef.current) simRef.current = makeSim();

  const [on, setOn] = useState(false);
  const [volts, setVolts] = useState(3);

  const sceneRef = useRef<Scene>({ on, volts });
  sceneRef.current = { on, volts };

  const toggleOn = useCallback(() => {
    simRef.current.flipT = performance.now();
    setOn((v) => !v);
  }, []);

  // the switch and the voltage chips are drawn on/next to the battery
  const onCanvasClick = useCallback(
    (ev: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = ev.currentTarget.getBoundingClientRect();
      const P = loopPath(rect.width, rect.height);
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      const mid = (P.batTop + P.batBot) / 2;
      const chipX = P.X0 + 64;
      if (Math.abs(x - chipX) < 25 && Math.abs(y - (mid - 14)) < 13) setVolts(3);
      else if (Math.abs(x - chipX) < 25 && Math.abs(y - (mid + 14)) < 13) setVolts(9);
      else if (Math.abs(x - P.X0) < 36 && y > P.batTop - 12 && y < P.batBot + 12) toggleOn();
    },
    [toggleOn]
  );

  // render loop (ref-driven on purpose — React state is only the UI mirror)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let disposed = false;

    const fit = () => {
      const box = canvas.parentElement!;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = box.clientWidth * dpr;
      canvas.height = box.clientHeight * dpr;
      canvas.style.width = `${box.clientWidth}px`;
      canvas.style.height = `${box.clientHeight}px`;
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
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawScene(ctx, sim, sceneRef.current, now, dt, canvas.width / dpr, canvas.height / dpr);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const amps = on ? volts / OHMS : 0;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg text-ink">
      <main className="flex min-h-0 flex-1 flex-col">
        <div className="relative min-h-0 flex-1">
          <canvas ref={canvasRef} onClick={onCanvasClick} className="absolute inset-0" />
          {/* meters, in the empty middle of the loop */}
          <div className="pointer-events-none absolute left-1/2 top-1/2 flex w-[240px] -translate-x-1/2 -translate-y-1/2 flex-col gap-2">
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
                    : "off — no electrons crossing",
                color: "text-[#7cc4ff]",
              },
              {
                label: "RESISTANCE",
                value: `${OHMS} Ω`,
                hint: "how much the path fights the flow",
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
      </main>
    </div>
  );
}
