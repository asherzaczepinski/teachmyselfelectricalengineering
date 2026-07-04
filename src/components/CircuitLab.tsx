"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CATALOG,
  Circuit,
  Part,
  PartType,
  Vertex,
  bumpIdsPast,
  createPart,
  enforceLengths,
  partsAtVertex,
  ROOM_TEMP,
  stepCircuit,
  uid,
  vertexById,
} from "../lib/sim";

const SNAP = 20; // how close two end dots must get before they connect
const SAVE_KEY = "circuit-lab-v1";
const COPPER = "#d98e32";

const TOOLBOX: { title: string; items: PartType[] }[] = [
  {
    title: "Build",
    items: [
      "wire",
      "battery",
      "switch",
      "resistor",
      "bulb",
      "led",
      "capacitor",
      "fuse",
      "speaker",
      "motor",
    ],
  },
  { title: "Measure", items: ["ammeter", "voltmeter"] },
  { title: "Real things", items: ["heater", "hairdryer", "coin", "eraser", "hand"] },
];

// width of the drawn body in the middle of each part — current dots are
// hidden under this span so they only run along the exposed lead wires
const BODY_W: Record<PartType, number> = {
  wire: 0,
  battery: 60,
  resistor: 60,
  bulb: 44,
  switch: 56,
  fuse: 50,
  capacitor: 22,
  led: 38,
  speaker: 48,
  motor: 48,
  heater: 82,
  hairdryer: 84,
  ammeter: 42,
  voltmeter: 42,
  coin: 0,
  eraser: 50,
  hand: 40,
};

type Drag =
  | { kind: "body"; partId: string; verts: string[]; lastX: number; lastY: number; moved: number }
  | { kind: "vertex"; vertexId: string; moved: number };

// ——— little formatting helpers (plain words, no shorthand) ———

function fmtAmps(i: number): string {
  const a = Math.abs(i);
  if (a < 0.0005) return "0 amps";
  if (a < 0.0995) return `${(a * 1000).toFixed(0)} milliamps`;
  return `${a.toFixed(a >= 10 ? 1 : 2)} amps`;
}
function fmtVolts(v: number): string {
  const a = Math.abs(v);
  if (a < 0.0005) return "0 volts";
  if (a < 0.0995) return `${(a * 1000).toFixed(0)} millivolts`;
  return `${a.toFixed(a >= 10 ? 1 : 2)} volts`;
}
function shortA(i: number): string {
  const a = Math.abs(i);
  if (a < 0.0005) return "0 A";
  if (a < 0.0995) return `${(a * 1000).toFixed(0)} mA`;
  return `${a.toFixed(a >= 10 ? 1 : 2)} A`;
}
function shortV(v: number): string {
  const a = Math.abs(v);
  if (a < 0.0005) return "0 V";
  if (a < 0.0995) return `${(a * 1000).toFixed(0)} mV`;
  return `${a.toFixed(a >= 10 ? 1 : 2)} V`;
}

function heatColor(t: number): string | null {
  const f = Math.max(0, Math.min(1, (t - 45) / 350));
  if (f <= 0.01) return null;
  const r = Math.round(120 + f * 135);
  const g = Math.round(90 - f * 40);
  const b = Math.round(70 - f * 55);
  return `rgb(${r},${g},${b})`;
}

function zigzag(x0: number, w: number, amp: number, n = 5): string {
  const half = w / (n * 2);
  let d = `M ${x0.toFixed(1)} 0`;
  let x = x0;
  let dir = -1;
  for (let k = 0; k < n * 2; k++) {
    x += half;
    const y = k === n * 2 - 1 ? 0 : dir * amp;
    if (k < n * 2 - 1) dir = -dir;
    d += ` L ${x.toFixed(1)} ${y}`;
  }
  return d;
}

function previewPart(type: PartType): Part {
  const def = CATALOG[type];
  return {
    id: `preview-${type}`,
    type,
    a: "pa",
    b: "pb",
    resistance: def.resistance,
    voltage: def.voltage ?? 0,
    capacitance: def.capacitance ?? 0,
    maxAmps: def.maxAmps ?? 0,
    closed: false,
    blown: false,
    ledOn: false,
    temp: ROOM_TEMP,
    capV: 0,
    flow: 0,
    spin: 0,
    current: 0,
    volts: 0,
  };
}

// ——— the drawn artwork for each part, in local coordinates (0,0) → (L,0) ———

function Glyph({ p, L }: { p: Part; L: number }) {
  const cx = L / 2;
  const bodyW = BODY_W[p.type];
  const pad = Math.max(0, (L - bodyW) / 2);
  const hot = heatColor(p.temp);

  const leads = p.type !== "wire" && (
    <>
      <line x1={0} y1={0} x2={pad + 2} y2={0} stroke={COPPER} strokeWidth={5} strokeLinecap="round" />
      <line x1={L - pad - 2} y1={0} x2={L} y2={0} stroke={COPPER} strokeWidth={5} strokeLinecap="round" />
    </>
  );

  switch (p.type) {
    case "wire":
      return (
        <>
          <line x1={0} y1={0} x2={L} y2={0} stroke={COPPER} strokeWidth={6} strokeLinecap="round" />
          {hot && (
            <line x1={0} y1={0} x2={L} y2={0} stroke={hot} strokeWidth={6} strokeLinecap="round" opacity={0.75} />
          )}
        </>
      );

    case "battery":
      return (
        <>
          {leads}
          <rect x={cx - 30} y={-14} width={60} height={28} rx={4} fill="#292524" stroke="#57534e" />
          <rect x={cx - 30} y={-14} width={42} height={28} rx={4} fill="#ea8c1e" />
          <text x={cx - 16} y={1} textAnchor="middle" dominantBaseline="middle" fontSize={15} fontWeight={700} fill="#3b2004">
            −
          </text>
          <text x={cx + 21} y={1.5} textAnchor="middle" dominantBaseline="middle" fontSize={14} fontWeight={700} fill="#fbbf24">
            +
          </text>
          <rect x={cx + 30} y={-5} width={4} height={10} fill="#a8a29e" />
        </>
      );

    case "resistor":
      return (
        <>
          {leads}
          <path d={zigzag(pad, bodyW, 9)} fill="none" stroke={hot ?? "#f59e0b"} strokeWidth={3.5} strokeLinejoin="round" />
        </>
      );

    case "bulb": {
      const watts = Math.abs(p.current * p.volts);
      const bright = Math.min(1, Math.sqrt(watts / 40));
      return (
        <>
          {leads}
          {bright > 0.02 && (
            <circle cx={cx} cy={0} r={26 + bright * 26} fill="url(#bulbGlow)" opacity={bright} />
          )}
          <circle cx={cx} cy={0} r={17} fill="#fefce8" fillOpacity={0.16 + bright * 0.7} stroke="#a8a29e" strokeWidth={1.5} />
          <path
            d={`M ${cx - 9} 5 L ${cx - 4} -5 L ${cx} 5 L ${cx + 4} -5 L ${cx + 9} 5`}
            fill="none"
            stroke={bright > 0.05 ? "#fbbf24" : "#78716c"}
            strokeWidth={2}
          />
        </>
      );
    }

    case "led": {
      const on = p.ledOn && Math.abs(p.current) > 0.001;
      const glow = on ? Math.min(1, 0.3 + Math.abs(p.current) / 0.4) : 0;
      return (
        <>
          {leads}
          {on && <circle cx={cx} cy={0} r={16 + glow * 14} fill="url(#ledGlow)" opacity={glow} />}
          <polygon
            points={`${cx - 9},-10 ${cx - 9},10 ${cx + 7},0`}
            fill={on ? "#f87171" : "#7f1d1d"}
            stroke="#fca5a5"
            strokeWidth={1.2}
          />
          <line x1={cx + 8} y1={-10} x2={cx + 8} y2={10} stroke="#fca5a5" strokeWidth={2.5} />
        </>
      );
    }

    case "switch": {
      const pivotX = cx - 22;
      const endX = p.closed ? cx + 22 : pivotX + 44 * Math.cos(-0.62);
      const endY = p.closed ? 0 : 44 * Math.sin(-0.62);
      return (
        <>
          {leads}
          <line x1={pad} y1={0} x2={pivotX} y2={0} stroke={COPPER} strokeWidth={5} strokeLinecap="round" />
          <line x1={cx + 22} y1={0} x2={L - pad} y2={0} stroke={COPPER} strokeWidth={5} strokeLinecap="round" />
          <line x1={pivotX} y1={0} x2={endX} y2={endY} stroke="#e5e7eb" strokeWidth={4} strokeLinecap="round" />
          <circle cx={pivotX} cy={0} r={4} fill="#e5e7eb" />
          <circle cx={cx + 22} cy={0} r={4} fill="#e5e7eb" />
        </>
      );
    }

    case "fuse":
      return (
        <>
          {leads}
          <rect
            x={pad}
            y={-10}
            width={bodyW}
            height={20}
            rx={9}
            fill={p.blown ? "rgba(87,83,78,0.5)" : "rgba(148,163,184,0.2)"}
            stroke="#94a3b8"
            strokeWidth={1.5}
          />
          {p.blown ? (
            <>
              <line x1={pad + 4} y1={0} x2={cx - 9} y2={0} stroke="#a8a29e" strokeWidth={2} />
              <line x1={cx + 9} y1={0} x2={L - pad - 4} y2={0} stroke="#a8a29e" strokeWidth={2} />
              <path d={`M ${cx - 9} 0 l 4 -5 M ${cx + 9} 0 l -4 5`} stroke="#a8a29e" strokeWidth={2} fill="none" />
              <text x={cx} y={-16} textAnchor="middle" fontSize={12}>
                💨
              </text>
            </>
          ) : (
            <line x1={pad + 4} y1={0} x2={L - pad - 4} y2={0} stroke="#fbbf24" strokeWidth={2} />
          )}
        </>
      );

    case "capacitor": {
      const charge = Math.min(1, Math.abs(p.capV) / 20);
      return (
        <>
          {leads}
          <line x1={pad + 2} y1={0} x2={cx - 6} y2={0} stroke={COPPER} strokeWidth={5} strokeLinecap="round" />
          <line x1={cx + 6} y1={0} x2={L - pad - 2} y2={0} stroke={COPPER} strokeWidth={5} strokeLinecap="round" />
          <line x1={cx - 6} y1={-15} x2={cx - 6} y2={15} stroke={p.capV > 0.3 ? "#fbbf24" : "#e2e8f0"} strokeWidth={4} opacity={0.5 + charge * 0.5} />
          <line x1={cx + 6} y1={-15} x2={cx + 6} y2={15} stroke={p.capV < -0.3 ? "#fbbf24" : "#e2e8f0"} strokeWidth={4} opacity={0.5 + charge * 0.5} />
        </>
      );
    }

    case "speaker": {
      const loud = Math.min(1, Math.abs(p.current) / 1.5);
      return (
        <>
          {leads}
          <rect x={cx - 17} y={-11} width={12} height={22} rx={2} fill="#475569" stroke="#64748b" />
          <polygon
            points={`${cx - 5},-7 ${cx - 5},7 ${cx + 13},15 ${cx + 13},-15`}
            fill="#94a3b8"
            stroke="#cbd5e1"
            strokeWidth={1.2}
          />
          {loud > 0.03 && (
            <>
              <path d={`M ${cx + 17} -8 q 7 8 0 16`} fill="none" stroke="#7dd3fc" strokeWidth={2} opacity={loud} />
              <path d={`M ${cx + 22} -13 q 11 13 0 26`} fill="none" stroke="#7dd3fc" strokeWidth={2} opacity={loud * 0.7} />
              <text x={cx + 30} y={-14} fontSize={12} fill="#7dd3fc" opacity={loud}>
                ♪
              </text>
            </>
          )}
        </>
      );
    }

    case "motor":
      return (
        <>
          {leads}
          <circle cx={cx} cy={0} r={22} fill="#1e293b" stroke="#64748b" strokeWidth={2} />
          <g transform={`rotate(${p.spin.toFixed(1)} ${cx} 0)`}>
            {[0, 120, 240].map((a) => (
              <ellipse key={a} cx={cx + 11} cy={0} rx={10} ry={4.5} fill="#7dd3fc" opacity={0.85} transform={`rotate(${a} ${cx} 0)`} />
            ))}
          </g>
          <circle cx={cx} cy={0} r={4} fill="#e2e8f0" />
        </>
      );

    case "heater": {
      const glow = Math.max(0, Math.min(1, (p.temp - 50) / 350));
      return (
        <>
          {leads}
          <rect x={pad} y={-18} width={bodyW} height={36} rx={5} fill="#292524" stroke="#57534e" strokeWidth={1.5} />
          <path
            d={zigzag(pad + 8, bodyW - 16, 11, 7)}
            fill="none"
            stroke={hot ?? "#525252"}
            strokeWidth={3.5}
            strokeLinejoin="round"
          />
          {glow > 0.1 &&
            [-18, 0, 18].map((dx, k) => (
              <path
                key={k}
                d={`M ${cx + dx} -22 q 4 -6 0 -12 q -4 -6 0 -11`}
                fill="none"
                stroke="#fca5a5"
                strokeWidth={2}
                opacity={glow * (k === 1 ? 0.9 : 0.6)}
              />
            ))}
        </>
      );
    }

    case "hairdryer": {
      const glow = Math.max(0, Math.min(1, (p.temp - 50) / 350));
      const blowing = Math.abs(p.current) > 0.05;
      return (
        <>
          {leads}
          <rect x={cx - 32} y={-13} width={54} height={26} rx={9} fill="#0ea5e9" stroke="#0369a1" strokeWidth={1.5} />
          <rect x={cx - 18} y={9} width={12} height={20} rx={4} fill="#0284c7" transform={`rotate(14 ${cx - 12} 9)`} />
          <rect x={cx + 21} y={-8} width={11} height={16} rx={2} fill="#0369a1" />
          <circle cx={cx - 12} cy={0} r={9} fill="#0c4a6e" />
          <g transform={`rotate(${p.spin.toFixed(1)} ${cx - 12} 0)`}>
            {[0, 120, 240].map((a) => (
              <ellipse key={a} cx={cx - 7} cy={0} rx={5} ry={2.2} fill="#7dd3fc" transform={`rotate(${a} ${cx - 12} 0)`} />
            ))}
          </g>
          {blowing &&
            [-6, 0, 6].map((dy, k) => (
              <path
                key={k}
                d={`M ${cx + 33} ${dy} q 5 ${dy >= 0 ? 2 : -2} 15 ${dy / 2}`}
                fill="none"
                stroke={glow > 0.15 ? "#fb923c" : "#93c5fd"}
                strokeWidth={2}
                opacity={0.4 + Math.min(0.5, Math.abs(p.current) / 12)}
              />
            ))}
        </>
      );
    }

    case "ammeter":
      return (
        <>
          {leads}
          <circle cx={cx} cy={0} r={20} fill="#0f172a" stroke="#7dd3fc" strokeWidth={2.5} />
          <text x={cx} y={1} textAnchor="middle" dominantBaseline="middle" fontSize={15} fontWeight={700} fill="#7dd3fc">
            A
          </text>
        </>
      );

    case "voltmeter":
      return (
        <>
          {leads}
          <circle cx={cx} cy={0} r={20} fill="#0f172a" stroke="#f0abfc" strokeWidth={2.5} />
          <text x={cx} y={1} textAnchor="middle" dominantBaseline="middle" fontSize={15} fontWeight={700} fill="#f0abfc">
            V
          </text>
        </>
      );

    case "coin":
      return (
        <>
          <line x1={0} y1={0} x2={L} y2={0} stroke={COPPER} strokeWidth={5} strokeLinecap="round" />
          <circle cx={cx} cy={0} r={15} fill="#eab308" stroke="#a16207" strokeWidth={2} />
          <text x={cx} y={1.5} textAnchor="middle" dominantBaseline="middle" fontSize={13} fontWeight={700} fill="#713f12">
            ¢
          </text>
        </>
      );

    case "eraser":
      return (
        <>
          {leads}
          <rect x={pad} y={-11} width={bodyW} height={22} rx={5} fill="#f472b6" stroke="#be185d" strokeWidth={1.5} />
        </>
      );

    case "hand":
      return (
        <>
          {leads}
          <text x={cx} y={3} textAnchor="middle" dominantBaseline="middle" fontSize={30}>
            ✋
          </text>
        </>
      );
  }
}

// current dots that run along the part while current flows
function FlowDots({ p, L }: { p: Part; L: number }) {
  if (Math.abs(p.current) < 0.002) return null;
  const bodyW = BODY_W[p.type];
  const pad = Math.max(0, (L - bodyW) / 2);
  const SP = 16;
  const offset = ((p.flow % SP) + SP) % SP;
  const dots: number[] = [];
  for (let x = offset; x <= L; x += SP) {
    if (bodyW > 0 && x > pad - 3 && x < L - pad + 3) continue;
    dots.push(x);
  }
  return (
    <>
      {dots.map((x, k) => (
        <circle key={k} cx={x} cy={0} r={2.7} fill="#ffd83d" opacity={0.95} />
      ))}
    </>
  );
}

export default function CircuitLab() {
  const circuitRef = useRef<Circuit>({ vertices: [], parts: [] });
  const dragRef = useRef<Drag | null>(null);
  const snapHintRef = useRef<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const audioRef = useRef<{
    ctx: AudioContext | null;
    nodes: Map<string, { osc: OscillatorNode; gain: GainNode }>;
  }>({ ctx: null, nodes: new Map() });

  const [, setFrame] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showValues, setShowValues] = useState(true);
  const [heatView, setHeatView] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [showHelp, setShowHelp] = useState(false);

  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;

  const previews = useMemo(() => {
    const m = new Map<PartType, Part>();
    for (const group of TOOLBOX) for (const t of group.items) m.set(t, previewPart(t));
    return m;
  }, []);

  // ——— load a saved circuit (or build the starter one) ———
  useEffect(() => {
    const circ = circuitRef.current;
    let loaded = false;
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Circuit;
        if (Array.isArray(saved.vertices) && Array.isArray(saved.parts) && saved.parts.length > 0) {
          const fresh = previewPart("wire");
          for (const p of saved.parts) {
            for (const key of Object.keys(fresh) as (keyof Part)[]) {
              if (p[key] === undefined) (p as unknown as Record<string, unknown>)[key] = fresh[key];
            }
          }
          circuitRef.current = saved;
          bumpIdsPast(saved);
          loaded = true;
        }
      }
    } catch {
      // corrupted save — start fresh
    }
    if (!loaded) {
      const rect = svgRef.current?.getBoundingClientRect();
      buildStarter(circ, (rect?.width ?? 900) / 2, (rect?.height ?? 600) / 2);
    }
    setFrame((f) => f + 1);
  }, []);

  // ——— the live simulation loop ———
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let saveTimer = 0;
    const tick = (t: number) => {
      const dt = Math.min((t - last) / 1000, 0.05);
      last = t;
      stepCircuit(circuitRef.current, dt);
      updateAudio();
      saveTimer += dt;
      if (saveTimer > 3) {
        saveTimer = 0;
        try {
          localStorage.setItem(SAVE_KEY, JSON.stringify(circuitRef.current));
        } catch {
          // storage full or blocked — skip saving
        }
      }
      setFrame((f) => (f + 1) % 1e9);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updateAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio.ctx) return;
    const t = audio.ctx.currentTime;
    const alive = new Set<string>();
    for (const p of circuitRef.current.parts) {
      if (p.type !== "speaker") continue;
      alive.add(p.id);
      let node = audio.nodes.get(p.id);
      if (!node) {
        const osc = audio.ctx.createOscillator();
        osc.type = "sawtooth";
        const gain = audio.ctx.createGain();
        gain.gain.value = 0;
        osc.connect(gain);
        gain.connect(audio.ctx.destination);
        osc.start();
        node = { osc, gain };
        audio.nodes.set(p.id, node);
      }
      const amps = Math.abs(p.current);
      const vol = soundOnRef.current && amps > 0.02 ? Math.min(amps * 0.12, 0.22) : 0;
      const freq = 110 + Math.min(Math.abs(p.volts), 130) * 14;
      node.gain.gain.setTargetAtTime(vol, t, 0.04);
      node.osc.frequency.setTargetAtTime(freq, t, 0.04);
    }
    for (const [id, node] of audio.nodes) {
      if (!alive.has(id)) {
        node.osc.stop();
        node.gain.disconnect();
        audio.nodes.delete(id);
      }
    }
  }, []);

  const ensureAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio.ctx) {
      try {
        audio.ctx = new AudioContext();
      } catch {
        return;
      }
    }
    if (audio.ctx.state === "suspended") void audio.ctx.resume();
  }, []);

  // ——— pointer plumbing ———

  const toCanvas = useCallback((e: { clientX: number; clientY: number }) => {
    const rect = svgRef.current?.getBoundingClientRect();
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
  }, []);

  const findSnapTarget = useCallback((circ: Circuit, v: Vertex): Vertex | null => {
    let best: Vertex | null = null;
    let bestD = SNAP;
    const attached = partsAtVertex(circ, v.id);
    for (const other of circ.vertices) {
      if (other.id === v.id) continue;
      // never connect a part's two ends to each other
      if (attached.some((p) => p.a === other.id || p.b === other.id)) continue;
      const d = Math.hypot(other.x - v.x, other.y - v.y);
      if (d < bestD) {
        bestD = d;
        best = other;
      }
    }
    return best;
  }, []);

  const mergeVertices = useCallback((circ: Circuit, keepId: string, dropId: string) => {
    for (const p of circ.parts) {
      if (p.a === dropId) p.a = keepId;
      if (p.b === dropId) p.b = keepId;
    }
    circ.vertices = circ.vertices.filter((v) => v.id !== dropId);
    enforceLengths(circ, new Set([keepId]));
  }, []);

  const clampAll = useCallback((circ: Circuit) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    for (const v of circ.vertices) {
      v.x = Math.min(Math.max(v.x, 14), rect.width - 14);
      v.y = Math.min(Math.max(v.y, 14), rect.height - 14);
    }
  }, []);

  const handlersRef = useRef<{ move: (e: PointerEvent) => void; up: (e: PointerEvent) => void }>({
    move: () => {},
    up: () => {},
  });

  handlersRef.current.move = (e: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const circ = circuitRef.current;
    const { x, y } = toCanvas(e);
    if (drag.kind === "body") {
      const dx = x - drag.lastX;
      const dy = y - drag.lastY;
      drag.lastX = x;
      drag.lastY = y;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      const pinned = new Set(drag.verts);
      for (const vid of drag.verts) {
        const v = vertexById(circ, vid);
        if (v) {
          v.x += dx;
          v.y += dy;
        }
      }
      enforceLengths(circ, pinned);
      const part = circ.parts.find((p) => p.id === drag.partId);
      if (part) {
        const va = vertexById(circ, part.a);
        const t = va ? findSnapTarget(circ, va) : null;
        snapHintRef.current = t?.id ?? null;
      }
    } else {
      const v = vertexById(circ, drag.vertexId);
      if (!v) return;
      drag.moved += Math.abs(x - v.x) + Math.abs(y - v.y);
      v.x = x;
      v.y = y;
      enforceLengths(circ, new Set([v.id]));
      snapHintRef.current = findSnapTarget(circ, v)?.id ?? null;
    }
  };

  handlersRef.current.up = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    snapHintRef.current = null;
    if (!drag) return;
    const circ = circuitRef.current;
    if (drag.kind === "vertex") {
      const v = vertexById(circ, drag.vertexId);
      if (v) {
        const target = findSnapTarget(circ, v);
        if (target) mergeVertices(circ, target.id, v.id);
      }
    } else {
      const part = circ.parts.find((p) => p.id === drag.partId);
      if (part) {
        if (drag.moved < 5) {
          if (part.type === "switch") part.closed = !part.closed;
        } else {
          for (const vid of [part.a, part.b]) {
            const v = vertexById(circ, vid);
            if (!v) continue;
            const target = findSnapTarget(circ, v);
            if (target) mergeVertices(circ, target.id, vid);
          }
        }
      }
    }
    clampAll(circ);
    enforceLengths(circ, new Set());
  };

  useEffect(() => {
    const move = (e: PointerEvent) => handlersRef.current.move(e);
    const up = (e: PointerEvent) => handlersRef.current.up(e);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, []);

  const collectGroup = useCallback((circ: Circuit, start: Part): string[] => {
    const verts = new Set<string>([start.a, start.b]);
    const used = new Set<string>([start.id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const q of circ.parts) {
        if (used.has(q.id) || !CATALOG[q.type].rigid) continue;
        if (verts.has(q.a) || verts.has(q.b)) {
          used.add(q.id);
          verts.add(q.a);
          verts.add(q.b);
          grew = true;
        }
      }
    }
    return [...verts];
  }, []);

  const startBodyDrag = useCallback(
    (part: Part, e: React.PointerEvent) => {
      e.stopPropagation();
      ensureAudio();
      const circ = circuitRef.current;
      const { x, y } = toCanvas(e);
      setSelectedId(part.id);
      dragRef.current = {
        kind: "body",
        partId: part.id,
        verts: collectGroup(circ, part),
        lastX: x,
        lastY: y,
        moved: 0,
      };
    },
    [collectGroup, ensureAudio, toCanvas]
  );

  const startVertexDrag = useCallback(
    (v: Vertex, e: React.PointerEvent) => {
      e.stopPropagation();
      ensureAudio();
      dragRef.current = { kind: "vertex", vertexId: v.id, moved: 0 };
    },
    [ensureAudio]
  );

  const spawnFromToolbox = useCallback(
    (type: PartType, e: React.PointerEvent) => {
      e.preventDefault();
      ensureAudio();
      const circ = circuitRef.current;
      const { x, y } = toCanvas(e);
      const part = createPart(type, x, y, circ);
      setSelectedId(part.id);
      dragRef.current = {
        kind: "body",
        partId: part.id,
        verts: [part.a, part.b],
        lastX: x,
        lastY: y,
        moved: 100, // spawning is a drag, never a click
      };
    },
    [ensureAudio, toCanvas]
  );

  const splitVertex = useCallback((vid: string) => {
    const circ = circuitRef.current;
    const attached = partsAtVertex(circ, vid);
    if (attached.length < 2) return;
    const v = vertexById(circ, vid);
    if (!v) return;
    attached.forEach((p, i) => {
      if (i === 0) return;
      const otherId = p.a === vid ? p.b : p.a;
      const other = vertexById(circ, otherId);
      const dx = (other?.x ?? v.x + 1) - v.x;
      const dy = (other?.y ?? v.y) - v.y;
      const d = Math.hypot(dx, dy) || 1;
      const nv: Vertex = { id: uid("v"), x: v.x + (dx / d) * 24, y: v.y + (dy / d) * 24 };
      circ.vertices.push(nv);
      if (p.a === vid) p.a = nv.id;
      else p.b = nv.id;
    });
    enforceLengths(circ, new Set());
  }, []);

  const deletePart = useCallback((id: string) => {
    const circ = circuitRef.current;
    circ.parts = circ.parts.filter((p) => p.id !== id);
    const used = new Set<string>();
    for (const p of circ.parts) {
      used.add(p.a);
      used.add(p.b);
    }
    circ.vertices = circ.vertices.filter((v) => used.has(v.id));
    setSelectedId(null);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Delete" && e.key !== "Backspace") return;
      const active = document.activeElement;
      if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) return;
      if (selectedRef.current) {
        e.preventDefault();
        deletePart(selectedRef.current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [deletePart]);

  const clearAll = useCallback(() => {
    circuitRef.current = { vertices: [], parts: [] };
    setSelectedId(null);
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {
      // ignore
    }
  }, []);

  // ——— render ———

  const circ = circuitRef.current;
  const selected = circ.parts.find((p) => p.id === selectedId) ?? null;
  const degree = new Map<string, number>();
  for (const p of circ.parts) {
    degree.set(p.a, (degree.get(p.a) ?? 0) + 1);
    degree.set(p.b, (degree.get(p.b) ?? 0) + 1);
  }

  return (
    <div
      className="h-dvh w-full flex flex-col bg-[#0b1220] text-slate-200 select-none overflow-hidden"
      onPointerDown={ensureAudio}
    >
      {/* top bar */}
      <header className="h-12 shrink-0 flex items-center gap-2 px-3 sm:px-4 border-b border-slate-800 bg-[#0e1628]">
        <span className="font-semibold tracking-tight text-[15px]">⚡ Circuit Lab</span>
        <span className="hidden md:inline text-xs text-slate-500">
          build it · break it · measure it
        </span>
        <div className="flex-1" />
        <TopToggle on={showValues} onClick={() => setShowValues((v) => !v)}>
          Numbers
        </TopToggle>
        <TopToggle on={heatView} onClick={() => setHeatView((v) => !v)}>
          Heat view
        </TopToggle>
        <TopToggle on={soundOn} onClick={() => setSoundOn((v) => !v)}>
          Sound
        </TopToggle>
        <TopToggle on={showHelp} onClick={() => setShowHelp((v) => !v)}>
          How to play
        </TopToggle>
        <button
          className="text-xs px-2.5 py-1 rounded-full border border-red-900 text-red-400 hover:bg-red-950 transition-colors"
          onClick={clearAll}
        >
          Clear all
        </button>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* toolbox */}
        <aside className="w-44 md:w-56 shrink-0 overflow-y-auto border-r border-slate-800 bg-[#0e1628] p-2">
          {TOOLBOX.map((group) => (
            <div key={group.title} className="mb-3">
              <h4 className="text-[10px] uppercase tracking-widest text-slate-500 px-1 mb-1">
                {group.title}
              </h4>
              <div className="flex flex-col gap-1">
                {group.items.map((type) => {
                  const def = CATALOG[type];
                  const prev = previews.get(type)!;
                  return (
                    <div
                      key={type}
                      className="rounded-lg border border-slate-800 hover:border-sky-700 hover:bg-slate-800/60 cursor-grab active:cursor-grabbing p-1.5 transition-colors"
                      onPointerDown={(e) => spawnFromToolbox(type, e)}
                      title={def.hint}
                    >
                      <svg
                        width="100%"
                        height="34"
                        viewBox={`-8 -20 ${def.len + 16} 40`}
                        preserveAspectRatio="xMidYMid meet"
                        className="pointer-events-none"
                      >
                        <Glyph p={prev} L={def.len} />
                      </svg>
                      <div className="text-[11px] font-medium text-slate-300 leading-tight">
                        {def.label}
                      </div>
                      <div className="text-[9.5px] text-slate-500 leading-tight hidden md:block">
                        {def.hint}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </aside>

        {/* board */}
        <div className="relative flex-1 min-w-0">
          <svg ref={svgRef} className="w-full h-full touch-none block">
            <defs>
              <pattern id="grid" width="26" height="26" patternUnits="userSpaceOnUse">
                <path d="M 26 0 H 0 V 26" fill="none" stroke="#152036" strokeWidth="1" />
              </pattern>
              <radialGradient id="bulbGlow">
                <stop offset="0%" stopColor="#fde047" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#fde047" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="ledGlow">
                <stop offset="0%" stopColor="#f87171" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#f87171" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="heatGlow">
                <stop offset="0%" stopColor="#f97316" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
              </radialGradient>
            </defs>

            <rect width="100%" height="100%" fill="#0b1424" onPointerDown={() => setSelectedId(null)} />
            <rect width="100%" height="100%" fill="url(#grid)" pointerEvents="none" />

            {/* parts */}
            {circ.parts.map((p) => {
              const va = vertexById(circ, p.a);
              const vb = vertexById(circ, p.b);
              if (!va || !vb) return null;
              const L = Math.max(4, Math.hypot(vb.x - va.x, vb.y - va.y));
              const angle = (Math.atan2(vb.y - va.y, vb.x - va.x) * 180) / Math.PI;
              const overheat = Math.max(0, Math.min(0.85, (p.temp - 70) / 300));
              return (
                <g key={p.id} transform={`translate(${va.x} ${va.y}) rotate(${angle})`}>
                  {overheat > 0.02 && (
                    <ellipse cx={L / 2} cy={0} rx={L / 2 + 14} ry={26} fill="url(#heatGlow)" opacity={overheat} />
                  )}
                  <Glyph p={p} L={L} />
                  <FlowDots p={p} L={L} />
                  {p.id === selectedId && (
                    <rect
                      x={-9}
                      y={-24}
                      width={L + 18}
                      height={48}
                      rx={12}
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth={1.5}
                      strokeDasharray="5 4"
                    />
                  )}
                  <line
                    x1={0}
                    y1={0}
                    x2={L}
                    y2={0}
                    stroke="transparent"
                    strokeWidth={28}
                    strokeLinecap="round"
                    style={{ cursor: "grab" }}
                    onPointerDown={(e) => startBodyDrag(p, e)}
                  />
                </g>
              );
            })}

            {/* labels — drawn unrotated so they always read upright */}
            {circ.parts.map((p) => {
              const va = vertexById(circ, p.a);
              const vb = vertexById(circ, p.b);
              if (!va || !vb) return null;
              const mx = (va.x + vb.x) / 2;
              const my = (va.y + vb.y) / 2;
              const len = Math.hypot(vb.x - va.x, vb.y - va.y) || 1;
              // push labels out sideways from the part, always downward-ish
              let px = -(vb.y - va.y) / len;
              let py = (vb.x - va.x) / len;
              if (py < 0) {
                px = -px;
                py = -py;
              }
              const lx = mx + px * 34;
              const ly = my + py * 34;
              const lines: { text: string; fill: string; size: number; bold?: boolean }[] = [];

              if (p.type === "ammeter") {
                lines.push({ text: shortA(p.current), fill: "#7dd3fc", size: 13, bold: true });
              } else if (p.type === "voltmeter") {
                lines.push({ text: shortV(p.volts), fill: "#f0abfc", size: 13, bold: true });
              } else if (showValues) {
                if (p.type === "battery") lines.push({ text: `${p.voltage} V`, fill: "#94a3b8", size: 10.5 });
                else if (p.type === "capacitor")
                  lines.push({ text: `${p.capacitance} F · holding ${shortV(p.capV)}`, fill: "#94a3b8", size: 10.5 });
                else if (p.type === "fuse")
                  lines.push({
                    text: p.blown ? "BLOWN — click it to fix" : `melts above ${p.maxAmps} A`,
                    fill: p.blown ? "#f87171" : "#94a3b8",
                    size: 10.5,
                  });
                else if (p.type !== "wire" && p.type !== "switch" && p.type !== "led")
                  lines.push({ text: `${p.resistance >= 1e6 ? "blocks current" : `${p.resistance} Ω`}`, fill: "#94a3b8", size: 10.5 });
                if (Math.abs(p.current) > 0.0005) {
                  lines.push({ text: shortA(p.current), fill: "#facc15", size: 10 });
                }
              }
              const fire = p.temp > 280;
              return (
                <g key={`lbl-${p.id}`} pointerEvents="none">
                  {lines.map((l, i) => (
                    <text
                      key={i}
                      x={lx}
                      y={ly + i * 13}
                      textAnchor="middle"
                      fontSize={l.size}
                      fontWeight={l.bold ? 700 : 500}
                      fill={l.fill}
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {l.text}
                    </text>
                  ))}
                  {heatView && (
                    <g>
                      <rect
                        x={mx - 26}
                        y={my - 46}
                        width={52}
                        height={17}
                        rx={8}
                        fill={p.temp > 100 ? "#7f1d1d" : p.temp > 45 ? "#7c2d12" : "#1e293b"}
                        opacity={0.92}
                      />
                      <text
                        x={mx}
                        y={my - 34}
                        textAnchor="middle"
                        fontSize={10.5}
                        fill={p.temp > 45 ? "#fecaca" : "#94a3b8"}
                        style={{ fontFamily: "var(--font-mono)" }}
                      >
                        {Math.round(p.temp)} °C
                      </text>
                    </g>
                  )}
                  {fire && (
                    <text x={mx} y={my - (heatView ? 52 : 26)} textAnchor="middle" fontSize={Math.min(32, 16 + (p.temp - 280) / 25)}>
                      🔥
                    </text>
                  )}
                </g>
              );
            })}

            {/* connection dots */}
            {circ.vertices.map((v) => {
              const deg = degree.get(v.id) ?? 0;
              const isSnapHint = snapHintRef.current === v.id;
              return (
                <g key={v.id}>
                  {isSnapHint && <circle cx={v.x} cy={v.y} r={13} fill="none" stroke="#4ade80" strokeWidth={2.5} />}
                  {deg >= 2 ? (
                    <circle cx={v.x} cy={v.y} r={5.5} fill="#fbbf24" stroke="#92400e" strokeWidth={1.5} />
                  ) : (
                    <circle cx={v.x} cy={v.y} r={6} fill="#0b1220" stroke="#fb923c" strokeWidth={2.5} />
                  )}
                  <circle
                    cx={v.x}
                    cy={v.y}
                    r={13}
                    fill="transparent"
                    style={{ cursor: "crosshair" }}
                    onPointerDown={(e) => startVertexDrag(v, e)}
                    onDoubleClick={() => splitVertex(v.id)}
                  />
                </g>
              );
            })}
          </svg>

          {circ.parts.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <p className="text-slate-500 text-sm text-center px-8">
                The board is empty.
                <br />
                Press and drag a part in from the left panel to start building.
              </p>
            </div>
          )}

          {showHelp && (
            <div className="absolute top-3 right-3 w-80 max-w-[85%] rounded-xl border border-slate-700 bg-[#0e1628]/95 p-4 shadow-2xl text-[13px] leading-relaxed text-slate-300">
              <div className="font-semibold mb-2 text-slate-100">How to play</div>
              <ul className="space-y-1.5 list-disc pl-4">
                <li>Press and drag a part from the left panel onto the board.</li>
                <li>
                  Drag the <span className="text-orange-400">orange end dots</span> on top of each
                  other to connect parts. A <span className="text-amber-400">yellow dot</span> means
                  connected.
                </li>
                <li>Double-click a yellow dot to pull a connection apart.</li>
                <li>Click a switch to flip it. Click any part to change its settings.</li>
                <li>The little yellow moving dots show the current flowing.</li>
                <li>
                  Turn on <b>Heat view</b> to see every part&apos;s temperature. Try connecting a
                  battery straight to itself with a wire and watch it cook.
                </li>
                <li>The heater and hair dryer barely warm up at 9 volts — real ones run on 120
                  volts. Click the battery and turn it up.</li>
                <li>Press Delete to remove the selected part. Your circuit saves itself.</li>
              </ul>
            </div>
          )}

          {selected && (
            <Inspector
              part={selected}
              onDelete={() => deletePart(selected.id)}
              onClose={() => setSelectedId(null)}
              onFlip={() => {
                const tmp = selected.a;
                selected.a = selected.b;
                selected.b = tmp;
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function TopToggle({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
        on
          ? "border-sky-600 bg-sky-950 text-sky-300"
          : "border-slate-700 text-slate-400 hover:bg-slate-800"
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Inspector({
  part,
  onDelete,
  onClose,
  onFlip,
}: {
  part: Part;
  onDelete: () => void;
  onClose: () => void;
  onFlip: () => void;
}) {
  const def = CATALOG[part.type];
  const set = (fn: (p: Part) => void) => fn(part); // mutate; the frame loop re-renders

  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[360px] max-w-[92%] rounded-xl border border-slate-700 bg-[#0e1628]/95 shadow-2xl p-3.5 text-sm">
      <div className="flex items-center mb-2">
        <span className="font-semibold text-slate-100">{def.label}</span>
        <div className="flex-1" />
        <button className="text-slate-500 hover:text-slate-200 px-1" onClick={onClose}>
          ✕
        </button>
      </div>

      {part.type === "battery" && (
        <>
          <SimSlider
            label={`Push strength: ${part.voltage} volts`}
            min={1}
            max={120}
            step={1}
            value={part.voltage}
            onChange={(v) => set((p) => (p.voltage = v))}
          />
          <p className="text-[11px] text-slate-500 mt-1 mb-2">
            A little battery is 9 volts. A wall outlet pushes about 120 volts.
          </p>
          <button className="btn-soft" onClick={onFlip}>
            Swap the + and − ends
          </button>
        </>
      )}

      {(part.type === "resistor" ||
        part.type === "bulb" ||
        part.type === "heater" ||
        part.type === "hairdryer") && (
        <>
          <SimSlider
            label={`Resistance: ${part.resistance} ohms`}
            min={def.minR ?? 1}
            max={def.maxR ?? 100}
            step={1}
            value={part.resistance}
            onChange={(v) => set((p) => (p.resistance = v))}
          />
          <p className="text-[11px] text-slate-500 mt-1">
            More ohms = harder for current to get through = less current flows.
          </p>
        </>
      )}

      {part.type === "capacitor" && (
        <>
          <SimSlider
            label={`Size: ${part.capacitance} farads`}
            min={0.01}
            max={2}
            step={0.01}
            value={part.capacitance}
            onChange={(v) => set((p) => (p.capacitance = v))}
          />
          <p className="text-[11px] text-slate-500 mt-1 mb-2">
            It is holding {fmtVolts(part.capV)} right now. Bigger size = fills more slowly.
          </p>
          <button className="btn-soft" onClick={() => set((p) => (p.capV = 0))}>
            Dump its stored charge
          </button>
        </>
      )}

      {part.type === "fuse" && (
        <>
          <SimSlider
            label={`Melts above: ${part.maxAmps} amps`}
            min={1}
            max={50}
            step={1}
            value={part.maxAmps}
            onChange={(v) => set((p) => (p.maxAmps = v))}
          />
          {part.blown && (
            <button className="btn-soft mt-2" onClick={() => set((p) => (p.blown = false))}>
              Put in a new fuse
            </button>
          )}
        </>
      )}

      {part.type === "switch" && (
        <button className="btn-soft" onClick={() => set((p) => (p.closed = !p.closed))}>
          {part.closed ? "Open the switch (stop the current)" : "Close the switch (let current flow)"}
        </button>
      )}

      {part.type === "led" && (
        <>
          <p className="text-[11px] text-slate-500 mb-2">
            An LED only lets current through one way, and it eats 2 volts to light up.
            {part.ledOn ? " It is ON." : " It is dark right now — maybe flip it?"}
          </p>
          <button className="btn-soft" onClick={onFlip}>
            Flip it around
          </button>
        </>
      )}

      {(part.type === "speaker" ||
        part.type === "motor" ||
        part.type === "coin" ||
        part.type === "hand" ||
        part.type === "eraser" ||
        part.type === "ammeter" ||
        part.type === "voltmeter" ||
        part.type === "wire") && (
        <p className="text-[11px] text-slate-500">{def.hint}</p>
      )}

      <div className="mt-3 pt-2 border-t border-slate-800 flex items-center text-[11px] text-slate-400 gap-3" style={{ fontFamily: "var(--font-mono)" }}>
        <span>through it: {fmtAmps(part.current)}</span>
        <span>across it: {fmtVolts(part.volts)}</span>
        <span className={part.temp > 60 ? "text-orange-400" : ""}>{Math.round(part.temp)} °C</span>
      </div>

      <button
        className="mt-2 w-full text-xs py-1.5 rounded-lg border border-red-900 text-red-400 hover:bg-red-950 transition-colors"
        onClick={onDelete}
      >
        Remove this part (or press Delete)
      </button>
    </div>
  );
}

function SimSlider({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs text-slate-300">{label}</span>
      <input
        type="range"
        className="sim-slider mt-1"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </label>
  );
}

// A ready-made loop so the page never opens onto a blank board:
// battery → switch → light bulb, all wired up. Close the switch and it lights.
function buildStarter(circ: Circuit, cx: number, cy: number) {
  const addV = (x: number, y: number): Vertex => {
    const v = { id: uid("v"), x, y };
    circ.vertices.push(v);
    return v;
  };
  const addP = (type: PartType, a: Vertex, b: Vertex): Part => {
    const def = CATALOG[type];
    const part: Part = {
      id: uid("p"),
      type,
      a: a.id,
      b: b.id,
      resistance: def.resistance,
      voltage: def.voltage ?? 0,
      capacitance: def.capacitance ?? 0,
      maxAmps: def.maxAmps ?? 0,
      closed: false,
      blown: false,
      ledOn: false,
      temp: ROOM_TEMP,
      capV: 0,
      flow: 0,
      spin: 0,
      current: 0,
      volts: 0,
    };
    circ.parts.push(part);
    return part;
  };

  const y0 = cy + 90;
  const y1 = cy - 90;
  const x0 = cx - 160;
  const x1 = cx + 160;

  const a1 = addV(x0, y0); // bottom-left corner
  const a2 = addV(cx - 55, y0);
  const a3 = addV(cx + 55, y0);
  const a4 = addV(x1, y0); // bottom-right corner
  const b1 = addV(x0, y1); // top-left corner
  const b2 = addV(cx - 47.5, y1);
  const b3 = addV(cx + 47.5, y1);
  const b4 = addV(x1, y1); // top-right corner
  const r1 = addV(x1, y1 + 100); // switch lower end on the right side

  addP("wire", a1, a2);
  addP("battery", a2, a3);
  addP("wire", a3, a4);
  addP("wire", a1, b1);
  addP("wire", b1, b2);
  addP("bulb", b2, b3);
  addP("wire", b3, b4);
  addP("switch", b4, r1);
  addP("wire", r1, a4);
}
