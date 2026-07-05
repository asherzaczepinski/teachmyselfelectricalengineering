"use client";

/* eslint-disable react-hooks/refs, react-hooks/immutability, react-hooks/set-state-in-effect --
   This is a 60 fps simulation: the circuit lives in a mutable ref (the single
   source of truth for the physics loop) and a frame counter re-renders the
   SVG every animation frame. Reading and mutating refs during render is the
   intended architecture, not an oversight. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  blankPart,
  CATALOG,
  Circuit,
  LED_COLORS,
  LedColor,
  MotorAttachment,
  NOTES,
  Part,
  PartType,
  Vertex,
  bumpIdsPast,
  createPart,
  enforceLengths,
  partsAtVertex,
  stepCircuit,
  uid,
  vertexById,
} from "../../lib/sim";
import { GUIDES } from "../../lib/guides";
import { FlowDots, Glyph } from "./Glyph";

const SNAP = 20; // how close two end dots must get before they connect
const SAVE_KEY = "circuit-lab-v2";
const WORLD = 3200; // the board reaches this far in every direction
const KEY_POOL = "asdfghjklqwertyuiop";

const TOOLBOX: { title: string; items: PartType[] }[] = [
  {
    title: "Build",
    items: ["wire", "battery", "switch", "resistor", "bulb", "led", "diode", "capacitor", "fuse", "motor"],
  },
  { title: "Inputs & sound", items: ["button", "blinker", "speaker"] },
  { title: "Measure", items: ["ammeter", "voltmeter"] },
  { title: "Real things", items: ["heater", "hairdryer", "coin", "eraser", "hand"] },
];

// deeper explanations shown in learning mode when you hover a part
const LEARN: Record<PartType, string> = {
  wire: "Wire is the road the current drives on. It barely resists at all — but push a huge current through and even wire heats up. That's why house wiring has thickness rules.",
  battery: "The battery is the pump. It doesn't 'contain' current — it pushes the current that's already in the wires around the loop. More volts = a harder push. It also warms up inside when it works hard.",
  switch: "A switch is just a gap you can open and close. Open gap = broken loop = zero current everywhere in that loop, instantly.",
  resistor: "A resistor is a narrow spot in the road. It turns some of the electrical push into heat. Ohm's law in plain words: current = push ÷ resistance.",
  bulb: "A bulb is a resistor that runs so hot its little wire glows. The brightness you see is real power: volts across it × amps through it.",
  led: "An LED makes light directly from current — no heat-glow needed, so it barely warms up. But it's a one-way door, and it always eats about 2 volts as its entry fee.",
  diode: "A diode is a one-way door for current. Current flows along the arrow, never against it. Used to protect things from being plugged in backwards.",
  capacitor: "A capacitor is a tiny rechargeable bucket for charge. Current flows in until it's full, then stops. Cut the power and it pours its charge back out. Overfill it past 60 volts and it pops.",
  fuse: "A fuse is a bodyguard that dies for you. It's a thin wire that melts the moment the current passes its limit, breaking the loop before anything expensive burns.",
  button: "A momentary switch — closed only while you hold it. Real keyboards, doorbells and game controllers are grids of these.",
  blinker: "A switch that flips itself on a timer. Real ones use a tiny chip; old ones used a strip of metal that bent as it heated up.",
  speaker: "A speaker turns wiggling current into wiggling air, which is all sound is. Pitch is how fast it wiggles; loudness is how hard.",
  motor: "A motor turns current into spin using magnets. Reverse the current and the spin reverses. Whatever you bolt on — wheel, propeller, winch — inherits the spin.",
  ammeter: "Counts amps flowing THROUGH it, so it must sit inside the loop. It resists almost nothing so it doesn't disturb what it's measuring.",
  voltmeter: "Measures the voltage difference between its two ends, so it hangs ACROSS a part from outside the loop. It resists so much that almost no current detours through it.",
  heater: "A space heater is nothing but a big resistor with a fan. 100% of the electrical energy becomes heat — that's why heaters are the hungriest appliances in a house.",
  hairdryer: "A heater coil and a fan motor sharing one plug. It needs wall-outlet voltage (about 120 volts) to actually get hot — try it on 9 volts and it barely whispers.",
  coin: "Metal is full of electrons that are free to move, so a coin conducts almost like a wire. This is why dropping metal across battery terminals is a bad day.",
  eraser: "Rubber holds its electrons tight — none free to move, so no current, period. That's an insulator, and it's why plugs are coated in it.",
  hand: "Skin resists a lot — but not infinitely. A 9 volt battery can't push a dangerous current through you. A 120 volt outlet can. That's the whole reason outlets deserve respect.",
};

type Drag =
  | { kind: "body"; partId: string; verts: string[]; lastX: number; lastY: number; moved: number }
  | { kind: "vertex"; vertexId: string; moved: number }
  | { kind: "pan"; lastX: number; lastY: number };

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
  age: number;
  life: number;
  size: number;
  color: string;
  kind: "shard" | "spark" | "smoke";
}

interface View {
  x: number;
  y: number;
  scale: number;
}

// ——— plain-words formatting ———

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
function noteName(hz: number): string {
  let best = NOTES[0];
  for (const n of NOTES) if (Math.abs(n.hz - hz) < Math.abs(best.hz - hz)) best = n;
  return best.name;
}
function clamp(v: number, lo: number, hi: number) {
  return Math.min(Math.max(v, lo), hi);
}

function previewPart(type: PartType): Part {
  return {
    id: `preview-${type}`,
    a: "pa",
    b: "pb",
    ...blankPart(type),
    key: type === "button" ? "a" : "",
  };
}

interface AudioBits {
  ctx: AudioContext | null;
  noise: AudioBuffer | null;
  speakers: Map<string, { osc: OscillatorNode; gain: GainNode }>;
  sparkGain: GainNode | null;
}

export default function CircuitLab() {
  const circuitRef = useRef<Circuit>({ vertices: [], parts: [] });
  const dragRef = useRef<Drag | null>(null);
  const snapHintRef = useRef<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const sizeRef = useRef({ w: 1200, h: 700 });
  const viewRef = useRef<View>({ x: 0, y: 0, scale: 1 });
  const particlesRef = useRef<Particle[]>([]);
  const audioRef = useRef<AudioBits>({ ctx: null, noise: null, speakers: new Map(), sparkGain: null });
  const volumeToastShownRef = useRef(false);

  const [, setFrame] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showValues, setShowValues] = useState(true);
  const [heatView, setHeatView] = useState(false);
  const [electronFlow, setElectronFlow] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  const [guidesOpen, setGuidesOpen] = useState(false);
  const [openGuide, setOpenGuide] = useState<string | null>(null);
  const [confirmLoad, setConfirmLoad] = useState<string | null>(null);
  const [volumeToast, setVolumeToast] = useState(false);
  const [learnMode, setLearnMode] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [vertexMenu, setVertexMenu] = useState<string | null>(null);

  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const soundOnRef = useRef(soundOn);
  soundOnRef.current = soundOn;

  const previews = useMemo(() => {
    const m = new Map<PartType, Part>();
    for (const group of TOOLBOX) for (const t of group.items) m.set(t, previewPart(t));
    return m;
  }, []);

  // ——— audio ———

  const ensureAudio = useCallback(() => {
    const a = audioRef.current;
    if (!a.ctx) {
      try {
        a.ctx = new AudioContext();
        a.noise = a.ctx.createBuffer(1, a.ctx.sampleRate, a.ctx.sampleRate);
        const data = a.noise.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      } catch {
        return;
      }
    }
    if (a.ctx.state === "suspended") void a.ctx.resume();
  }, []);

  const playBoom = useCallback(() => {
    const a = audioRef.current;
    if (!a.ctx || !a.noise || !soundOnRef.current) return;
    const ctx = a.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = a.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(120, t + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.65, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    src.connect(lp);
    lp.connect(g);
    g.connect(ctx.destination);
    src.start(t);
    src.stop(t + 0.65);
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(80, t);
    osc.frequency.exponentialRampToValueAtTime(34, t + 0.35);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.5, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
    osc.connect(og);
    og.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.45);
  }, []);

  const updateAudio = useCallback(() => {
    const a = audioRef.current;
    if (!a.ctx || !a.noise) return;
    const ctx = a.ctx;
    const t = ctx.currentTime;

    // speakers
    const alive = new Set<string>();
    let anyAudible = false;
    for (const p of circuitRef.current.parts) {
      if (p.type !== "speaker" || p.destroyed) continue;
      alive.add(p.id);
      let node = a.speakers.get(p.id);
      if (!node) {
        const osc = ctx.createOscillator();
        osc.type = "triangle";
        const gain = ctx.createGain();
        gain.gain.value = 0;
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        node = { osc, gain };
        a.speakers.set(p.id, node);
      }
      const amps = Math.abs(p.current);
      if (amps > 0.02) anyAudible = true;
      const vol = soundOnRef.current && amps > 0.02 ? Math.min(amps * 0.12, 0.22) : 0;
      const freq = p.mode === "note" ? p.noteHz : 110 + Math.min(Math.abs(p.volts), 130) * 14;
      const wantType: OscillatorType = p.mode === "note" ? "triangle" : "sawtooth";
      if (node.osc.type !== wantType) node.osc.type = wantType;
      node.gain.gain.setTargetAtTime(vol, t, 0.04);
      node.osc.frequency.setTargetAtTime(freq, t, 0.03);
    }
    for (const [id, node] of a.speakers) {
      if (!alive.has(id)) {
        node.osc.stop();
        node.gain.disconnect();
        a.speakers.delete(id);
      }
    }

    if (anyAudible && soundOnRef.current && !volumeToastShownRef.current) {
      volumeToastShownRef.current = true;
      try {
        localStorage.setItem("circuit-lab-volume-toast", "1");
      } catch {}
      setVolumeToast(true);
      window.setTimeout(() => setVolumeToast(false), 7000);
    }

    // sparking: a crackle that grows as any part nears its explosion point
    if (!a.sparkGain) {
      const src = ctx.createBufferSource();
      src.buffer = a.noise;
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 2800;
      bp.Q.value = 0.8;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(bp);
      bp.connect(g);
      g.connect(ctx.destination);
      src.start();
      a.sparkGain = g;
    }
    let danger = 0;
    for (const p of circuitRef.current.parts) {
      const at = CATALOG[p.type].explodeAt;
      if (!isFinite(at) || p.destroyed) continue;
      danger = Math.max(danger, clamp((p.temp - 0.62 * at) / (0.38 * at), 0, 1));
    }
    const target = soundOnRef.current && danger > 0 ? danger * (Math.random() < 0.45 ? 0.2 : 0.03) : 0;
    a.sparkGain.gain.setTargetAtTime(target, t, 0.025);
  }, []);

  // ——— particles ———

  const spawnExplosion = useCallback((x: number, y: number) => {
    const ps = particlesRef.current;
    for (let k = 0; k < 12; k++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 120 + Math.random() * 340;
      ps.push({
        x,
        y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 120,
        rot: Math.random() * 360,
        vr: (Math.random() - 0.5) * 720,
        age: 0,
        life: 1.2 + Math.random() * 0.8,
        size: 3 + Math.random() * 5,
        color: ["#3b332c", "#57534e", "#292524"][k % 3],
        kind: "shard",
      });
    }
    for (let k = 0; k < 14; k++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 260 + Math.random() * 420;
      ps.push({
        x,
        y,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        rot: 0,
        vr: 0,
        age: 0,
        life: 0.35 + Math.random() * 0.3,
        size: 1.6 + Math.random() * 2,
        color: ["#ffd83d", "#ff9a3d", "#ff5a49"][k % 3],
        kind: "spark",
      });
    }
    for (let k = 0; k < 6; k++) {
      ps.push({
        x: x + (Math.random() - 0.5) * 20,
        y: y + (Math.random() - 0.5) * 10,
        vx: (Math.random() - 0.5) * 30,
        vy: -30 - Math.random() * 40,
        rot: 0,
        vr: 0,
        age: 0,
        life: 1.8 + Math.random() * 1,
        size: 8 + Math.random() * 8,
        color: "#6b6560",
        kind: "smoke",
      });
    }
    if (ps.length > 400) ps.splice(0, ps.length - 400);
  }, []);

  const stepParticles = useCallback((dt: number) => {
    const ps = particlesRef.current;
    for (const p of ps) {
      p.age += dt;
      if (p.kind === "shard") p.vy += 700 * dt;
      if (p.kind === "spark") p.vy += 250 * dt;
      if (p.kind === "smoke") p.vy -= 12 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
    particlesRef.current = ps.filter((p) => p.age < p.life);
  }, []);

  // ——— load & save ———

  useEffect(() => {
    try {
      if (localStorage.getItem("circuit-lab-volume-toast")) volumeToastShownRef.current = true;
    } catch {}
    let loaded = false;
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Circuit;
        if (Array.isArray(saved.vertices) && Array.isArray(saved.parts) && saved.parts.length > 0) {
          saved.parts = saved.parts.filter((p) => CATALOG[p.type]);
          for (const p of saved.parts) {
            const fresh = blankPart(p.type);
            for (const key of Object.keys(fresh) as (keyof typeof fresh)[]) {
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
      circuitRef.current = GUIDES[0].build((rect?.width ?? 1100) / 2, (rect?.height ?? 650) / 2);
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
      const events = stepCircuit(circuitRef.current, dt);
      for (const p of events.exploded) {
        const va = vertexById(circuitRef.current, p.a);
        const vb = vertexById(circuitRef.current, p.b);
        if (va && vb) spawnExplosion((va.x + vb.x) / 2, (va.y + vb.y) / 2);
        playBoom();
      }
      stepParticles(dt);
      updateAudio();
      saveTimer += dt;
      if (saveTimer > 3) {
        saveTimer = 0;
        try {
          localStorage.setItem(SAVE_KEY, JSON.stringify(circuitRef.current));
        } catch {}
      }
      setFrame((f) => (f + 1) % 1e9);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playBoom, spawnExplosion, stepParticles, updateAudio]);

  // track canvas size
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const ro = new ResizeObserver(() => {
      const r = svg.getBoundingClientRect();
      sizeRef.current = { w: Math.max(200, r.width), h: Math.max(200, r.height) };
    });
    ro.observe(svg);
    return () => ro.disconnect();
  }, []);

  // ——— view (pan / zoom) ———

  const clampView = useCallback((v: View) => {
    v.scale = clamp(v.scale, 0.25, 2.5);
    v.x = clamp(v.x, -WORLD, WORLD);
    v.y = clamp(v.y, -WORLD, WORLD);
  }, []);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      const v = viewRef.current;
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.01);
        const ns = clamp(v.scale * factor, 0.25, 2.5);
        const px = e.clientX - rect.left;
        const py = e.clientY - rect.top;
        const wx = v.x + px / v.scale;
        const wy = v.y + py / v.scale;
        v.x = wx - px / ns;
        v.y = wy - py / ns;
        v.scale = ns;
      } else {
        v.x += e.deltaX / v.scale;
        v.y += e.deltaY / v.scale;
      }
      clampView(v);
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  }, [clampView]);

  const zoomBy = useCallback(
    (factor: number) => {
      const v = viewRef.current;
      const { w, h } = sizeRef.current;
      const ns = clamp(v.scale * factor, 0.25, 2.5);
      const wx = v.x + w / v.scale / 2;
      const wy = v.y + h / v.scale / 2;
      v.x = wx - w / ns / 2;
      v.y = wy - h / ns / 2;
      v.scale = ns;
      clampView(v);
    },
    [clampView]
  );

  const fitView = useCallback(() => {
    const c = circuitRef.current;
    const { w, h } = sizeRef.current;
    const v = viewRef.current;
    if (c.vertices.length === 0) {
      v.x = -w / 2;
      v.y = -h / 2;
      v.scale = 1;
      return;
    }
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (const vert of c.vertices) {
      x0 = Math.min(x0, vert.x);
      y0 = Math.min(y0, vert.y);
      x1 = Math.max(x1, vert.x);
      y1 = Math.max(y1, vert.y);
    }
    const bw = x1 - x0 + 320;
    const bh = y1 - y0 + 320;
    const scale = clamp(Math.min(w / bw, h / bh), 0.25, 1.3);
    v.scale = scale;
    v.x = (x0 + x1) / 2 - w / scale / 2;
    v.y = (y0 + y1) / 2 - h / scale / 2;
    clampView(v);
  }, [clampView]);

  // ——— pointer plumbing ———

  const toWorld = useCallback((e: { clientX: number; clientY: number }) => {
    const rect = svgRef.current?.getBoundingClientRect();
    const v = viewRef.current;
    return {
      x: v.x + (e.clientX - (rect?.left ?? 0)) / v.scale,
      y: v.y + (e.clientY - (rect?.top ?? 0)) / v.scale,
    };
  }, []);

  const findSnapTarget = useCallback((circ: Circuit, v: Vertex): Vertex | null => {
    let best: Vertex | null = null;
    let bestD = SNAP;
    const attached = partsAtVertex(circ, v.id);
    for (const other of circ.vertices) {
      if (other.id === v.id) continue;
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
    for (const v of circ.vertices) {
      v.x = clamp(v.x, -WORLD + 20, WORLD - 20);
      v.y = clamp(v.y, -WORLD + 20, WORLD - 20);
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
    if (drag.kind === "pan") {
      const v = viewRef.current;
      v.x -= (e.clientX - drag.lastX) / v.scale;
      v.y -= (e.clientY - drag.lastY) / v.scale;
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      clampView(v);
      return;
    }
    const { x, y } = toWorld(e);
    if (drag.kind === "body") {
      const dx = x - drag.lastX;
      const dy = y - drag.lastY;
      drag.lastX = x;
      drag.lastY = y;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.moved > 6) {
        // once it's clearly a drag, a held key button releases
        const part = circ.parts.find((p) => p.id === drag.partId);
        if (part?.type === "button") part.pressed = false;
      }
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
    if (!drag || drag.kind === "pan") return;
    const circ = circuitRef.current;
    if (drag.kind === "vertex") {
      const v = vertexById(circ, drag.vertexId);
      if (v) {
        if (drag.moved < 5) {
          // a click, not a drag — offer to pull the junction apart
          setVertexMenu(partsAtVertex(circ, v.id).length >= 2 ? v.id : null);
        } else {
          const target = findSnapTarget(circ, v);
          if (target) mergeVertices(circ, target.id, v.id);
        }
      }
    } else {
      const part = circ.parts.find((p) => p.id === drag.partId);
      if (part) {
        if (part.type === "button") part.pressed = false;
        if (drag.moved < 5) {
          if (part.type === "switch" && !part.destroyed) part.closed = !part.closed;
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
      const { x, y } = toWorld(e);
      setSelectedId(part.id);
      setVertexMenu(null);
      if (part.type === "button" && !part.destroyed) part.pressed = true;
      dragRef.current = {
        kind: "body",
        partId: part.id,
        verts: collectGroup(circ, part),
        lastX: x,
        lastY: y,
        moved: 0,
      };
    },
    [collectGroup, ensureAudio, toWorld]
  );

  const startVertexDrag = useCallback(
    (v: Vertex, e: React.PointerEvent) => {
      e.stopPropagation();
      ensureAudio();
      setVertexMenu(null);
      dragRef.current = { kind: "vertex", vertexId: v.id, moved: 0 };
    },
    [ensureAudio]
  );

  const startPan = useCallback(
    (e: React.PointerEvent) => {
      ensureAudio();
      setSelectedId(null);
      setVertexMenu(null);
      dragRef.current = { kind: "pan", lastX: e.clientX, lastY: e.clientY };
    },
    [ensureAudio]
  );

  const spawnFromToolbox = useCallback(
    (type: PartType, e: React.PointerEvent) => {
      e.preventDefault();
      ensureAudio();
      const circ = circuitRef.current;
      const { x, y } = toWorld(e);
      const part = createPart(type, x, y, circ);
      if (type === "button") {
        const used = new Set(circ.parts.filter((p) => p.type === "button").map((p) => p.key));
        part.key = [...KEY_POOL].find((k) => !used.has(k)) ?? "a";
      }
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
    [ensureAudio, toWorld]
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

  // keyboard: Delete removes, letters press key buttons (the piano)
  useEffect(() => {
    const isTyping = () => {
      const el = document.activeElement;
      return (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement
      );
    };
    const down = (e: KeyboardEvent) => {
      if (isTyping()) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedRef.current) {
          e.preventDefault();
          deletePart(selectedRef.current);
        }
        return;
      }
      const k = e.key.toLowerCase();
      let hit = false;
      for (const p of circuitRef.current.parts) {
        if (p.type === "button" && p.key === k && !p.destroyed) {
          p.pressed = true;
          hit = true;
        }
      }
      if (hit) {
        ensureAudio();
        e.preventDefault();
      }
    };
    const up = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      for (const p of circuitRef.current.parts) {
        if (p.type === "button" && p.key === k) p.pressed = false;
      }
    };
    const releaseAll = () => {
      for (const p of circuitRef.current.parts) if (p.type === "button") p.pressed = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", releaseAll);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", releaseAll);
    };
  }, [deletePart, ensureAudio]);

  const clearAll = useCallback(() => {
    circuitRef.current = { vertices: [], parts: [] };
    particlesRef.current = [];
    setSelectedId(null);
    try {
      localStorage.removeItem(SAVE_KEY);
    } catch {}
  }, []);

  const loadGuide = useCallback(
    (guideId: string) => {
      const guide = GUIDES.find((g) => g.id === guideId);
      if (!guide) return;
      const v = viewRef.current;
      const { w, h } = sizeRef.current;
      const cx = v.x + w / v.scale / 2;
      const cy = v.y + h / v.scale / 2;
      circuitRef.current = guide.build(cx, cy);
      particlesRef.current = [];
      setSelectedId(null);
      setConfirmLoad(null);
      fitView();
    },
    [fitView]
  );

  // ——— render ———

  const circ = circuitRef.current;
  const view = viewRef.current;
  const { w: vw, h: vh } = sizeRef.current;
  const selected = circ.parts.find((p) => p.id === selectedId) ?? null;
  // O(1) vertex lookups for the two render loops below — this runs at 60 fps
  const vmap = new Map<string, Vertex>();
  for (const v of circ.vertices) vmap.set(v.id, v);
  const degree = new Map<string, number>();
  for (const p of circ.parts) {
    degree.set(p.a, (degree.get(p.a) ?? 0) + 1);
    degree.set(p.b, (degree.get(p.b) ?? 0) + 1);
  }
  const speakerPlaying = circ.parts.some(
    (p) => p.type === "speaker" && !p.destroyed && Math.abs(p.current) > 0.02
  );

  return (
    <div
      className="h-dvh w-full flex flex-col bg-[var(--bg)] text-[var(--ink)] select-none overflow-hidden"
      onPointerDown={ensureAudio}
    >
      {/* top bar */}
      <header className="h-12 shrink-0 flex items-center gap-2.5 px-3 border-b border-[var(--line)] bg-[var(--panel)]">
        <span className="font-semibold tracking-tight text-sm pr-1">Circuit Lab</span>
        <button
          className={guidesOpen ? "btn btn-primary" : "btn"}
          onClick={() => setGuidesOpen((v) => !v)}
        >
          Guides
        </button>
        <button
          className={learnMode ? "btn btn-primary" : "btn"}
          aria-pressed={learnMode}
          onClick={() => setLearnMode((v) => !v)}
          title="Hover over any part and get a plain-words explanation of what it does"
        >
          Learn
        </button>
        <div className="flex-1" />
        <div className="seg" role="group" aria-label="What to show on the board">
          <button aria-pressed={showValues} onClick={() => setShowValues((v) => !v)}>
            Numbers
          </button>
          <button aria-pressed={heatView} onClick={() => setHeatView((v) => !v)}>
            Heat
          </button>
        </div>
        <div className="seg" role="group" aria-label="Which way the moving dots point" title="Ben Franklin guessed current flows + to −. Electrons actually drift the other way. Both views are correct — pick one.">
          <button
            className="seg-accent"
            aria-pressed={!electronFlow}
            onClick={() => setElectronFlow(false)}
          >
            Current + → −
          </button>
          <button
            className="seg-accent"
            aria-pressed={electronFlow}
            onClick={() => setElectronFlow(true)}
          >
            Electrons − → +
          </button>
        </div>
        <button className="btn" aria-pressed={soundOn} onClick={() => setSoundOn((v) => !v)}>
          {soundOn ? "Sound on" : "Sound off"}
        </button>
        <button className="btn" aria-pressed={showHelp} onClick={() => setShowHelp((v) => !v)}>
          Help
        </button>
        <button className="btn btn-danger" onClick={clearAll}>
          Clear
        </button>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* toolbox */}
        <aside className="w-44 md:w-56 shrink-0 overflow-y-auto border-r border-[var(--line)] bg-[var(--panel)] p-2">
          {TOOLBOX.map((group) => (
            <div key={group.title} className="mb-3">
              <h4 className="text-[10px] uppercase tracking-widest text-[var(--ink-3)] px-1.5 mb-1">
                {group.title}
              </h4>
              <div className="flex flex-col gap-0.5">
                {group.items.map((type) => {
                  const def = CATALOG[type];
                  const prev = previews.get(type)!;
                  return (
                    <button
                      key={type}
                      className="tool-item"
                      onPointerDown={(e) => spawnFromToolbox(type, e)}
                      title={def.hint}
                    >
                      <svg
                        width="100%"
                        height="32"
                        viewBox={`-8 -22 ${def.len + 16} 44`}
                        preserveAspectRatio="xMidYMid meet"
                        className="pointer-events-none"
                      >
                        <Glyph p={prev} L={def.len} />
                      </svg>
                      <div className="text-[11px] font-medium text-[var(--ink-2)] leading-tight">
                        {def.label}
                      </div>
                      <div className="text-[10px] text-[var(--ink-3)] leading-tight hidden md:block">
                        {def.hint}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </aside>

        {/* board */}
        <div className="relative flex-1 min-w-0">
          <svg
            ref={svgRef}
            className="w-full h-full touch-none block"
            viewBox={`${view.x} ${view.y} ${vw / view.scale} ${vh / view.scale}`}
          >
            <defs>
              <pattern id="grid" width="26" height="26" patternUnits="userSpaceOnUse">
                <path d="M 26 0 H 0 V 26" fill="none" stroke="var(--board-grid)" strokeWidth="1" />
              </pattern>
              <radialGradient id="bulbGlow">
                <stop offset="0%" stopColor="#fde047" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#fde047" stopOpacity="0" />
              </radialGradient>
              <radialGradient id="heatGlow">
                <stop offset="0%" stopColor="#f97316" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
              </radialGradient>
            </defs>

            <rect
              x={view.x}
              y={view.y}
              width={vw / view.scale}
              height={vh / view.scale}
              fill="var(--board)"
              onPointerDown={startPan}
            />
            <rect
              x={-WORLD}
              y={-WORLD}
              width={WORLD * 2}
              height={WORLD * 2}
              fill="url(#grid)"
              pointerEvents="none"
            />

            {/* parts */}
            {circ.parts.map((p) => {
              const va = vmap.get(p.a);
              const vb = vmap.get(p.b);
              if (!va || !vb) return null;
              const L = Math.max(4, Math.hypot(vb.x - va.x, vb.y - va.y));
              const angle = (Math.atan2(vb.y - va.y, vb.x - va.x) * 180) / Math.PI;
              const overheat = p.destroyed ? 0 : Math.max(0, Math.min(0.85, (p.temp - 70) / 300));
              return (
                <g key={p.id} transform={`translate(${va.x} ${va.y}) rotate(${angle})`}>
                  {overheat > 0.02 && (
                    <ellipse cx={L / 2} cy={0} rx={L / 2 + 14} ry={26} fill="url(#heatGlow)" opacity={overheat} />
                  )}
                  <Glyph p={p} L={L} angle={angle} />
                  <FlowDots p={p} L={L} electron={electronFlow} />
                  {p.id === selectedId && (
                    <rect
                      x={-9}
                      y={-24}
                      width={L + 18}
                      height={48}
                      rx={12}
                      fill="none"
                      stroke="var(--focus)"
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
                    onPointerEnter={() => setHoverId(p.id)}
                    onPointerLeave={() => setHoverId((h) => (h === p.id ? null : h))}
                  />
                </g>
              );
            })}

            {/* labels — drawn unrotated so they always read upright */}
            {circ.parts.map((p) => {
              const va = vmap.get(p.a);
              const vb = vmap.get(p.b);
              if (!va || !vb) return null;
              const mx = (va.x + vb.x) / 2;
              const my = (va.y + vb.y) / 2;
              const len = Math.hypot(vb.x - va.x, vb.y - va.y) || 1;
              let px = -(vb.y - va.y) / len;
              let py = (vb.x - va.x) / len;
              if (py < 0) {
                px = -px;
                py = -py;
              }
              const lx = mx + px * 34;
              const ly = my + py * 34;
              const lines: { text: string; fill: string; size: number; bold?: boolean }[] = [];

              if (p.destroyed) {
                lines.push({ text: "blew up — remove it", fill: "#f87171", size: 10.5 });
              } else if (p.type === "ammeter") {
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
                else if (p.type === "button")
                  lines.push({ text: `hold ${(p.key || "?").toUpperCase()}`, fill: "#94a3b8", size: 10.5 });
                else if (p.type === "blinker")
                  lines.push({ text: `blinks ${p.hz}×/sec`, fill: "#94a3b8", size: 10.5 });
                else if (p.type === "speaker")
                  lines.push({
                    text: p.mode === "note" ? `plays ${noteName(p.noteHz)}` : "pitch follows volts",
                    fill: "#94a3b8",
                    size: 10.5,
                  });
                else if (
                  p.type !== "wire" &&
                  p.type !== "switch" &&
                  p.type !== "led" &&
                  p.type !== "diode"
                )
                  lines.push({
                    text: `${p.resistance >= 1e6 ? "blocks current" : `${p.resistance} Ω`}`,
                    fill: "#94a3b8",
                    size: 10.5,
                  });
                if (Math.abs(p.current) > 0.0005) {
                  lines.push({ text: shortA(p.current), fill: "#facc15", size: 10 });
                }
              }
              const fire = !p.destroyed && p.temp > 280;
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
                  {heatView && !p.destroyed && (
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
                    <g transform={`translate(${mx} ${my - (heatView ? 58 : 30)})`} opacity={Math.min(1, (p.temp - 280) / 120)}>
                      <path
                        d={`M 0 10 C -8 6 -9 -2 -4 -8 C -4 -3 -1 -2 0 -5 C 1 -9 4 -10 3 -14 C 9 -8 9 4 0 10`}
                        fill="#fb923c"
                      />
                      <path d={`M 0 8 C -4 5 -4 0 -1 -3 C 0 0 2 0 2 -4 C 5 0 4 6 0 8`} fill="#fde047" />
                    </g>
                  )}
                </g>
              );
            })}

            {/* explosion debris */}
            <g pointerEvents="none">
              {particlesRef.current.map((pt, i) => {
                const fade = 1 - pt.age / pt.life;
                if (pt.kind === "smoke") {
                  return (
                    <circle
                      key={i}
                      cx={pt.x}
                      cy={pt.y}
                      r={pt.size * (1 + pt.age)}
                      fill={pt.color}
                      opacity={0.22 * fade}
                    />
                  );
                }
                if (pt.kind === "spark") {
                  return <circle key={i} cx={pt.x} cy={pt.y} r={pt.size} fill={pt.color} opacity={fade} />;
                }
                return (
                  <rect
                    key={i}
                    x={pt.x - pt.size / 2}
                    y={pt.y - pt.size / 2}
                    width={pt.size}
                    height={pt.size * 0.7}
                    fill={pt.color}
                    opacity={fade}
                    transform={`rotate(${pt.rot} ${pt.x} ${pt.y})`}
                  />
                );
              })}
            </g>

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
                    <circle cx={v.x} cy={v.y} r={6} fill="var(--board)" stroke="#fb923c" strokeWidth={2.5} />
                  )}
                  <circle
                    cx={v.x}
                    cy={v.y}
                    r={13}
                    fill="transparent"
                    style={{ cursor: "crosshair" }}
                    onPointerDown={(e) => startVertexDrag(v, e)}
                    onDoubleClick={() => splitVertex(v.id)}
                    onPointerEnter={() => setHoverId(v.id)}
                    onPointerLeave={() => setHoverId((h) => (h === v.id ? null : h))}
                  />
                </g>
              );
            })}
          </svg>

          {/* zoom controls */}
          <div className="absolute bottom-4 right-4 z-10 flex items-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-1">
            <button className="btn" style={{ border: "none" }} onClick={() => zoomBy(1 / 1.25)} aria-label="Zoom out">
              −
            </button>
            <span className="text-[11px] text-[var(--ink-3)] w-10 text-center" style={{ fontFamily: "var(--font-mono)" }}>
              {Math.round(view.scale * 100)}%
            </span>
            <button className="btn" style={{ border: "none" }} onClick={() => zoomBy(1.25)} aria-label="Zoom in">
              +
            </button>
            <button className="btn" style={{ border: "none" }} onClick={fitView}>
              Fit
            </button>
          </div>

          {/* sound-off warning */}
          {!soundOn && speakerPlaying && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 rounded-lg border border-[var(--accent-dim)] bg-[var(--panel)] px-4 py-2 text-xs text-[var(--ink)]">
              A speaker is playing but sound is off — hit <b>Sound off</b> up top, and turn your
              computer volume up.
            </div>
          )}
          {volumeToast && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-4 py-2 text-xs text-[var(--ink)]">
              Your circuit is making sound — turn your computer volume up to hear it.
            </div>
          )}

          {/* learning mode explainer */}
          {learnMode && (
            <div className="absolute top-3 left-3 z-10 w-80 max-w-[70%] rounded-xl border border-[var(--accent-dim)] bg-[var(--panel)] p-3.5 text-[12.5px] leading-relaxed pointer-events-none">
              {(() => {
                const part = circ.parts.find((p) => p.id === hoverId);
                if (part) {
                  return (
                    <>
                      <div className="font-semibold text-[var(--ink)] mb-1">{CATALOG[part.type].label}</div>
                      <p className="text-[var(--ink-2)]">{LEARN[part.type]}</p>
                      <p className="mt-1.5 text-[11px] text-[var(--ink-3)]" style={{ fontFamily: "var(--font-mono)" }}>
                        right now: {fmtAmps(part.current)} through it · {fmtVolts(part.volts)} across it ·{" "}
                        {Math.round(part.temp)} °C
                      </p>
                    </>
                  );
                }
                const vert = circ.vertices.find((v) => v.id === hoverId);
                if (vert) {
                  const n = partsAtVertex(circ, vert.id).length;
                  return (
                    <>
                      <div className="font-semibold text-[var(--ink)] mb-1">
                        {n >= 2 ? "Junction" : "Loose end"}
                      </div>
                      <p className="text-[var(--ink-2)]">
                        {n >= 2
                          ? `${n} parts meet here, so current can pass between them. At a junction, whatever flows in must flow out — nothing gets lost. Click it for the option to pull it apart.`
                          : "Nothing is connected here yet. Drag this dot onto another dot until it turns yellow — that means they're joined."}
                      </p>
                    </>
                  );
                }
                return (
                  <p className="text-[var(--ink-2)]">
                    Learning mode is on. Hover over any part or connection dot on the board and I&apos;ll
                    explain what it actually does.
                  </p>
                );
              })()}
            </div>
          )}

          {/* junction popover — click a dot to disconnect it */}
          {(() => {
            if (!vertexMenu) return null;
            const v = circ.vertices.find((vv) => vv.id === vertexMenu);
            if (!v) return null;
            const n = partsAtVertex(circ, v.id).length;
            if (n < 2) return null;
            const sx = clamp((v.x - view.x) * view.scale, 90, vw - 90);
            const sy = clamp((v.y - view.y) * view.scale, 70, vh - 40);
            return (
              <div
                className="absolute z-20 -translate-x-1/2 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-2 shadow-2xl"
                style={{ left: sx, top: sy - 62 }}
              >
                <div className="text-[11px] text-[var(--ink-3)] px-1 pb-1.5">
                  {n} parts joined here
                </div>
                <div className="flex gap-1.5">
                  <button
                    className="btn"
                    onClick={() => {
                      splitVertex(v.id);
                      setVertexMenu(null);
                    }}
                  >
                    Pull apart
                  </button>
                  <button className="btn" style={{ border: "none" }} onClick={() => setVertexMenu(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            );
          })()}

          {circ.parts.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center text-sm text-[var(--ink-3)] px-8 leading-relaxed">
                <p className="font-medium text-[var(--ink-2)]">The board is empty.</p>
                <p>Drag a part in from the left panel, or open Guides for ready-made builds.</p>
              </div>
            </div>
          )}

          {showHelp && (
            <div className="absolute top-3 right-3 z-20 w-80 max-w-[85%] rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4 shadow-2xl text-[13px] leading-relaxed text-[var(--ink-2)]">
              <div className="flex items-center mb-2">
                <span className="font-semibold text-[var(--ink)]">Help</span>
                <div className="flex-1" />
                <button className="btn" style={{ border: "none" }} onClick={() => setShowHelp(false)}>
                  ✕
                </button>
              </div>
              <ul className="space-y-1.5 list-disc pl-4">
                <li>Drag parts in from the left. Drag the orange end dots onto each other to connect — a yellow dot means connected.</li>
                <li>Click a yellow dot for the option to pull that connection apart.</li>
                <li>Turn on <b>Learn</b> and hover anything for a plain-words explanation.</li>
                <li>Scroll to move around the board. Pinch (or hold Ctrl and scroll) to zoom. Drag the empty board to pan.</li>
                <li>Click a switch to flip it. Hold a key button&apos;s letter on your keyboard to press it.</li>
                <li>The moving dots show flow. &ldquo;Current + → −&rdquo; is the direction Ben Franklin guessed 250 years ago; electrons actually drift the opposite way. Both views describe the same physics.</li>
                <li>Heat view shows temperatures. Push a part too hard and it sparks, catches fire, then blows apart.</li>
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

        {/* guides drawer */}
        {guidesOpen && (
          <aside className="w-80 shrink-0 overflow-y-auto border-l border-[var(--line)] bg-[var(--panel)] z-20">
            <div className="p-3 border-b border-[var(--line)]">
              <h3 className="font-semibold text-sm">Instruction manual</h3>
              <p className="text-[11px] text-[var(--ink-3)] mt-0.5">
                Every guide can also build the finished circuit for you.
              </p>
            </div>
            {GUIDES.map((g) => {
              const open = openGuide === g.id;
              return (
                <div key={g.id} className="border-b border-[var(--line)]">
                  <button
                    className="w-full text-left px-3 py-2.5 hover:bg-[var(--panel-2)] transition-colors"
                    onClick={() => {
                      setOpenGuide(open ? null : g.id);
                      setConfirmLoad(null);
                    }}
                  >
                    <div className="text-[13px] font-medium text-[var(--ink)]">{g.title}</div>
                    <div className="text-[11px] text-[var(--ink-3)]">{g.tagline}</div>
                  </button>
                  {open && (
                    <div className="px-3 pb-3 text-[12px] text-[var(--ink-2)]">
                      <ol className="list-decimal pl-4 space-y-1.5">
                        {g.steps.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ol>
                      <p className="mt-2 text-[11px] text-[var(--ink-3)] leading-relaxed">
                        <span className="font-semibold text-[var(--ink-2)]">Why it works: </span>
                        {g.why}
                      </p>
                      {confirmLoad === g.id ? (
                        <div className="mt-2.5 flex items-center gap-2">
                          <button className="btn btn-primary" onClick={() => loadGuide(g.id)}>
                            Yes, replace my board
                          </button>
                          <button className="btn" onClick={() => setConfirmLoad(null)}>
                            Keep mine
                          </button>
                        </div>
                      ) : (
                        <button className="btn mt-2.5" onClick={() => setConfirmLoad(g.id)}>
                          Build it for me
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </aside>
        )}
      </div>
    </div>
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
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 w-[380px] max-w-[92%] rounded-xl border border-[var(--line)] bg-[var(--panel)] shadow-2xl p-3.5 text-sm">
      <div className="flex items-center mb-2">
        <span className="font-semibold text-[var(--ink)]">{def.label}</span>
        <div className="flex-1" />
        <button className="btn" style={{ border: "none" }} onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      {part.destroyed ? (
        <p className="text-[12px] text-[var(--danger)] mb-1">
          It overheated and blew apart. Nothing left to fix — remove it and build a new one.
        </p>
      ) : (
        <>
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
              <p className="text-[11px] text-[var(--ink-3)] mt-1 mb-2">
                A little battery is 9 volts. A wall outlet pushes about 120 volts.
              </p>
              <button className="btn" onClick={onFlip}>
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
              <p className="text-[11px] text-[var(--ink-3)] mt-1">
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
              <p className="text-[11px] text-[var(--ink-3)] mt-1 mb-2">
                Holding {fmtVolts(part.capV)} right now. It pops above 60 volts — be nice to it.
              </p>
              <button className="btn" onClick={() => set((p) => (p.capV = 0))}>
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
                <button className="btn mt-2" onClick={() => set((p) => (p.blown = false))}>
                  Put in a new fuse
                </button>
              )}
            </>
          )}

          {part.type === "switch" && (
            <button className="btn" onClick={() => set((p) => (p.closed = !p.closed))}>
              {part.closed ? "Open the switch (stop the current)" : "Close the switch (let current flow)"}
            </button>
          )}

          {part.type === "button" && (
            <>
              <label className="flex items-center gap-2 text-[12px] text-[var(--ink-2)]">
                Keyboard letter:
                <input
                  className="sim-input w-12 text-center uppercase"
                  maxLength={1}
                  value={part.key.toUpperCase()}
                  onChange={(e) =>
                    set((p) => (p.key = e.target.value.slice(-1).toLowerCase()))
                  }
                />
              </label>
              <p className="text-[11px] text-[var(--ink-3)] mt-1.5">
                Hold that key to let current through — or click and hold the button itself.
              </p>
            </>
          )}

          {part.type === "blinker" && (
            <SimSlider
              label={`Speed: ${part.hz} flips per second`}
              min={0.5}
              max={8}
              step={0.1}
              value={part.hz}
              onChange={(v) => set((p) => (p.hz = Math.round(v * 10) / 10))}
            />
          )}

          {part.type === "speaker" && (
            <>
              <div className="seg mb-2" role="group" aria-label="What the speaker plays">
                <button aria-pressed={part.mode === "note"} onClick={() => set((p) => (p.mode = "note"))}>
                  Play one note
                </button>
                <button aria-pressed={part.mode === "volts"} onClick={() => set((p) => (p.mode = "volts"))}>
                  Pitch follows volts
                </button>
              </div>
              {part.mode === "note" ? (
                <label className="flex items-center gap-2 text-[12px] text-[var(--ink-2)]">
                  Note:
                  <select
                    className="sim-select"
                    value={part.noteHz}
                    onChange={(e) => set((p) => (p.noteHz = parseFloat(e.target.value)))}
                  >
                    {NOTES.map((n) => (
                      <option key={n.name} value={n.hz}>
                        {n.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="text-[11px] text-[var(--ink-3)]">
                  More volts across it = higher pitch. More current = louder.
                </p>
              )}
            </>
          )}

          {part.type === "led" && (
            <>
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-[12px] text-[var(--ink-2)] mr-1">Color:</span>
                {(Object.keys(LED_COLORS) as LedColor[]).map((c) => (
                  <button
                    key={c}
                    aria-label={`Make it ${c}`}
                    aria-pressed={part.color === c}
                    onClick={() => set((p) => (p.color = c))}
                    className="rounded-full"
                    style={{
                      width: 20,
                      height: 20,
                      background: LED_COLORS[c],
                      border: part.color === c ? "2px solid var(--ink)" : "2px solid transparent",
                      cursor: "pointer",
                    }}
                  />
                ))}
              </div>
              <p className="text-[11px] text-[var(--ink-3)] mb-2">
                An LED only lets current through one way, and it eats 2 volts to light up.
                {part.ledOn ? " It is ON." : " It is dark right now — maybe flip it?"}
              </p>
              <button className="btn" onClick={onFlip}>
                Flip it around
              </button>
            </>
          )}

          {part.type === "diode" && (
            <>
              <p className="text-[11px] text-[var(--ink-3)] mb-2">
                Current can only pass in the direction of the arrow.
                {part.ledOn ? " It is letting current through." : " It is blocking right now."}
              </p>
              <button className="btn" onClick={onFlip}>
                Flip it around
              </button>
            </>
          )}

          {part.type === "motor" && (
            <>
              <div className="seg mb-2" role="group" aria-label="What is bolted onto the motor">
                {(["fan", "wheel", "propeller", "winch"] as MotorAttachment[]).map((att) => (
                  <button
                    key={att}
                    aria-pressed={part.attachment === att}
                    onClick={() => set((p) => (p.attachment = att))}
                  >
                    {att === "fan" ? "Fan" : att === "wheel" ? "Wheel" : att === "propeller" ? "Prop" : "Winch"}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-[var(--ink-3)]">
                {part.attachment === "winch"
                  ? `The winch winds a rope. Crate is ${Math.round(part.lift * 100)}% of the way up. Reverse the current to lower it.`
                  : "More current = faster spinning. Reverse the current and it spins the other way."}
              </p>
            </>
          )}

          {(part.type === "coin" ||
            part.type === "hand" ||
            part.type === "eraser" ||
            part.type === "ammeter" ||
            part.type === "voltmeter" ||
            part.type === "wire") && <p className="text-[11px] text-[var(--ink-3)]">{def.hint}</p>}
        </>
      )}

      <div
        className="mt-3 pt-2 border-t border-[var(--line)] flex items-center text-[11px] text-[var(--ink-3)] gap-3"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        <span>through it: {fmtAmps(part.current)}</span>
        <span>across it: {fmtVolts(part.volts)}</span>
        <span className={part.temp > 60 ? "text-orange-400" : ""}>{Math.round(part.temp)} °C</span>
      </div>

      <button className="btn btn-danger mt-2 w-full justify-center" onClick={onDelete}>
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
      <span className="text-xs text-[var(--ink-2)]">{label}</span>
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
