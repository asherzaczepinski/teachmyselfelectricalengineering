"use client";

/* eslint-disable react-hooks/refs, react-hooks/immutability, react-hooks/set-state-in-effect, react-hooks/preserve-manual-memoization --
   This is a 60 fps simulation: the circuit lives in a mutable ref (the single
   source of truth for the physics loop) and a frame counter re-renders the
   SVG every animation frame. Reading and mutating refs during render is the
   intended architecture, not an oversight. */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  blankPart,
  CATALOG,
  CHANNEL_COLORS,
  Circuit,
  LED_COLORS,
  LedColor,
  LETTER_SECONDS,
  MotorAttachment,
  NOTES,
  Part,
  PartType,
  PHONE_DEFAULT,
  PHONES,
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
import { Model, MODELS } from "../../lib/models";
import { Glyph } from "./Glyph";
import { fmtAmps, fmtVolts } from "../../lib/fmt";
import ThreeBoard, {
  BENCH,
  BoardApi,
  BoardParticle,
  CamState,
  UIState,
} from "./three/ThreeBoard";

const FOV_RAD = (40 * Math.PI) / 180;

const SNAP = 20; // how close two end dots must get before they connect
const KEY_POOL = "asdfghjklqwertyuiop";

export const TOOLBOX: { title: string; items: PartType[] }[] = [
  {
    title: "Build",
    items: [
      "wire",
      "battery",
      "usbc",
      "switch",
      "resistor",
      "bulb",
      "led",
      "diode",
      "segment",
      "capacitor",
      "inductor",
      "fuse",
      "motor",
    ],
  },
  { title: "Inputs & sound", items: ["button", "blinker", "speaker", "buzzer"] },
  { title: "Measure", items: ["ammeter", "voltmeter"] },
  {
    title: "Logic & sensors",
    items: ["coil", "relay", "lightsensor", "heatsensor", "solar", "chip", "calculator"],
  },
];

// deeper explanations shown in learning mode when you hover a part
export const LEARN: Record<PartType, string> = {
  wire: "Wire is the road the current drives on. It barely resists at all — but push a huge current through and even wire heats up. That's why house wiring has thickness rules.",
  battery: "The battery is the pump. It doesn't 'contain' current — it pushes the current that's already in the wires around the loop. More volts = a harder push. It also warms up inside when it works hard.",
  switch: "A switch is just a gap you can open and close. Open gap = broken loop = zero current everywhere in that loop, instantly.",
  resistor: "A resistor is a narrow spot in the road. It turns some of the electrical push into heat. Ohm's law in plain words: current = push ÷ resistance.",
  bulb: "A bulb is a resistor that runs so hot its little wire glows. The brightness you see is real power: volts across it × amps through it.",
  led: "An LED makes light directly from current — no heat-glow needed, so it barely warms up. But it's a one-way door, and it always eats about 2 volts as its entry fee.",
  segment: "One bar of a digital number. Feed it current and it glows. Arrange seven in the classic 8 shape, give each its own switch, and you can draw every digit — that's exactly what's inside an alarm clock.",
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
  outlet: "A pretend wall socket: a steady 120 volt push, way more than any battery here. It's what real heaters and hair dryers are built for — and why shorting one is a fireworks show.",
  inductor: "A coil of wire that hates change. Current through it can't jump — it has to ramp up, and when you cut the power it fights back with a voltage kick. The magnetic partner of the capacitor.",
  buzzer: "The simplest noisemaker: one fixed, rude tone. More current just makes it louder. Real ones are a little disc that bends thousands of times a second.",
  voicebox: "A tiny speech machine. Every letter gets its own mouth-shape sound — vowels hum at two special frequencies, S hisses, P pops. The first real one (Bell Labs' Voder, 1939) worked exactly this way, played live from a keyboard.",
  coil: "Wrap wire in loops and run current through it — you get a magnet you can switch on and off. Every magnetic switch tuned to its channel number feels it, no wires needed.",
  relay: "A switch flipped by a coil's magnetism instead of your finger. Chain these and you can compute: two in a row = AND, side by side = OR, a 'flipped' one = NOT. Rooms full of these were the first computers.",
  lightsensor: "In the dark it resists like rubber; in bright light it conducts almost happily. Park it near a bulb and it becomes an eye for your circuit.",
  heatsensor: "Its resistance falls as things near it heat up. Pair it with a coil and a magnetic switch and you've built a genuine fire alarm.",
  solar: "Light knocks electrons loose in the panel, and that IS a voltage. The brighter the light landing on it, the harder it pushes. Free power — as long as something shines on it.",
  chip: "A microcontroller — a whole computer the size of a fingernail, ready to be programmed. Power its two pins and its onboard light blinks its 'I'm alive' heartbeat. Later steps will teach it tricks; for now it's the newest tool on your bench.",
  usbc: "The little connector that took over the world. Any phone charger pushes five steady, safe volts through it — which is why USB-C is the modern bench power supply for small electronics.",
  calculator: "Inside this box are thousands of the same magnetic-switch tricks you can build yourself — the 1+1 adder, repeated and chained until it can multiply and divide. Real chips just shrink those switches down to specks of silicon. No power, no math: it's a circuit part like any other.",
};

// ——— the microscope: what you see when you zoom all the way into a part ———

interface MicroMaterial {
  title: string;
  atoms: string;
  electrons: string;
  atomFill: string;
  atomStroke: string;
  freeElectrons: boolean;
  split?: boolean; // draw two different materials meeting in the middle
}

function microMaterial(t: PartType): MicroMaterial {
  if (t === "battery" || t === "outlet" || t === "solar")
    return {
      title: "a power source",
      atoms:
        "Two different materials with hungry chemistry between them: one side wants electrons badly, the other wants rid of them. That chemical tug-of-war is the push you call voltage.",
      electrons:
        "Electrons get grabbed in at one plate and shoved out the other. The volts number is just how hard the chemistry shoves.",
      atomFill: "#3f4a3a",
      atomStroke: "#6d825f",
      freeElectrons: true,
      split: true,
    };
  if (t === "led" || t === "diode")
    return {
      title: "a one-way junction",
      atoms:
        "Two slightly different crystals meet in the middle. The left one has spare electrons; the right one has empty seats (holes) for them.",
      electrons:
        "Electrons can FALL across the junction one way — in an LED that fall releases a flash of light — but climbing back up is nearly impossible. That's the whole one-way trick.",
      atomFill: "#4a3a55",
      atomStroke: "#7a5f8f",
      freeElectrons: true,
      split: true,
    };
  if (t === "capacitor")
    return {
      title: "two plates and a gap",
      atoms:
        "Two metal plates and, between them — nothing. Electrons can pile up on one plate and scare electrons off the other, but none ever cross.",
      electrons:
        "Watch the crowding: charge 'stored' in a capacitor is just electrons packed shoulder-to-shoulder on one side of a gap they can't jump.",
      atomFill: "#3d4b63",
      atomStroke: "#5d7396",
      freeElectrons: true,
      split: true,
    };
  if (t === "calculator" || t === "voicebox")
    return {
      title: "a city of switches",
      atoms:
        "This isn't one material — it's a built city. Millions of microscopic one-way junctions (the same kind inside an LED) wired into switches that flip each other.",
      electrons:
        "Every calculation is electrons being allowed through some junctions and refused at others, millions of times a second.",
      atomFill: "#33404f",
      atomStroke: "#567191",
      freeElectrons: true,
    };
  if (
    t === "resistor" ||
    t === "bulb" ||
    t === "heater" ||
    t === "hairdryer" ||
    t === "segment" ||
    t === "speaker" ||
    t === "buzzer" ||
    t === "motor" ||
    t === "coil" ||
    t === "lightsensor" ||
    t === "heatsensor" ||
    t === "hand"
  )
    return {
      title: "a rough material",
      atoms:
        "The atoms here are jumbled and packed tight — a rough neighborhood. Squeezing between them costs the electrons energy, and every bit of lost energy becomes heat. That IS what resistance means.",
      electrons:
        "Watch them bump and stagger. Each collision shakes an atom, and shaking atoms is literally what heat is — that's why hard-working resistors get hot.",
      atomFill: "#4f3a35",
      atomStroke: "#8a5f52",
      freeElectrons: true,
    };
  return {
    title: "a metal",
    atoms:
      "Copper atoms packed in a neat crystal — see the tidy rows? Metals are orderly, and every atom donates one electron to a shared sea that's free to slosh anywhere. Those loose electrons ARE the current.",
    electrons:
      "The blue dots are the electron sea. The atoms stay put; only the electrons travel.",
    atomFill: "#4a3d2e",
    atomStroke: "#8a6f4a",
    freeElectrons: true,
  };
}

function pseudo(i: number, j: number): number {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

type Drag =
  | { kind: "body"; partId: string; verts: string[]; lastX: number; lastY: number; moved: number }
  | {
      kind: "vertex";
      vertexId: string;
      moved: number;
      holdTargetId?: string; // soldering: the dot we're hovering to fuse with
      holdStart?: number;
    }
  | { kind: "pan"; lastX: number; lastY: number; downX: number; downY: number; moved: number }
  | { kind: "marquee"; x0: number; y0: number; x1: number; y1: number }
  | { kind: "lamp"; offX: number; offY: number }
  | { kind: "orbit"; lastX: number; lastY: number };

const SOLDER_MS = 850; // hold a dot on a dot this long and it fuses

// a little soldering-iron cursor for when you're about to fuse a joint
const IRON_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'28\' height=\'28\'><path d=\'M3 25 L14 14\' stroke=\'%23b9c2cf\' stroke-width=\'3\' stroke-linecap=\'round\'/><path d=\'M13 15 L21 7\' stroke=\'%231c2230\' stroke-width=\'6\' stroke-linecap=\'round\'/><circle cx=\'3\' cy=\'25\' r=\'2.4\' fill=\'%23ffd83d\'/></svg>'
)}") 3 25, crosshair`;

// what the letters and symbols on the board mean, in plain words
const SYMBOL_GLOSS: [RegExp, string][] = [
  [/Ω/, "Ω (the Greek letter omega) = ohms — how hard the part resists current"],
  [/\bmA\b/, "mA = milliamps — thousandths of an amp of flow"],
  [/\bmV\b/, "mV = millivolts — thousandths of a volt of push"],
  [/\bA\b/, "A = amps — how much charge flows past per second"],
  [/\bV\b/, "V = volts — how hard the push is between two points"],
  [/\bW\b/, "W = watts — energy spent per second"],
  [/\bF\b/, "F = farads — how much charge a capacitor can hold"],
  [/\bH\b/, "H = henries — how hard an inductor fights change"],
  [/×\/s/, "×/s = times per second"],
  [/°C/, "°C = degrees Celsius — temperature"],
  [/\+/, "+ = the positive end — conventional current flows out of here"],
  [/−/, "− = the negative end — conventional current returns here"],
];
function explainSymbols(text: string): string[] {
  const out: string[] = [];
  for (const [re, gloss] of SYMBOL_GLOSS) if (re.test(text)) out.push(gloss);
  return out.length ? out : ["This label shows the part's live reading, straight from the solver."];
}

type Particle = BoardParticle;

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

interface VoiceNodes {
  osc: OscillatorNode;
  noiseSrc: AudioBufferSourceNode;
  f1: BiquadFilterNode;
  f2: BiquadFilterNode;
  nf: BiquadFilterNode;
  gv1: GainNode;
  gv2: GainNode;
  gn: GainNode;
  out: GainNode;
}

interface AudioBits {
  ctx: AudioContext | null;
  noise: AudioBuffer | null;
  speakers: Map<string, { osc: OscillatorNode; gain: GainNode }>;
  voices: Map<string, VoiceNodes>;
  sparkGain: GainNode | null;
}


interface CircuitLabProps {
  // the circuit that loads on mount and on "Reset"
  initialBuild?: (cx: number, cy: number) => Circuit;
}

export default function CircuitLab({ initialBuild }: CircuitLabProps) {
  const circuitRef = useRef<Circuit>({ vertices: [], parts: [] });
  const dragRef = useRef<Drag | null>(null);
  const snapHintRef = useRef<string | null>(null);
  const boardDivRef = useRef<HTMLDivElement>(null);
  const sizeRef = useRef({ w: 1200, h: 700 });
  const camRef = useRef<CamState>({ tx: 600, ty: 360, dist: 900, azim: 0, polar: 0.6 });
  const apiRef = useRef<BoardApi | null>(null);
  const uiRef = useRef<UIState>({
    selectedId: null,
    selectedIds: [],
    snapHintId: null,
    handle: null,
    degrees: new Map(),
    electronView: false,
    showAmps: false,
    showLabels: true,
  });
  const particlesRef = useRef<Particle[]>([]);
  const clockRef = useRef(0); // animation clock for the microscope view
  const audioRef = useRef<AudioBits>({
    ctx: null,
    noise: null,
    speakers: new Map(),
    voices: new Map(),
    sparkGain: null,
  });
  const volumeToastShownRef = useRef(false);

  const [, setFrame] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [volumeToast, setVolumeToast] = useState(false);
  const [vertexMenu, setVertexMenu] = useState<string | null>(null);
  // "select" lets you grab and rewire parts; "hand" only moves the view,
  // so you can't knock your circuit apart by accident
  const [toolMode, setToolMode] = useState<"select" | "hand">("hand");
  // which story the moving dots tell: Franklin's current or the real electrons
  const [electronView, setElectronView] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const [infoToast, setInfoToast] = useState<string | null>(null);
  const infoTimerRef = useRef<number | null>(null);
  const showInfo = useCallback((text: string) => {
    setInfoToast(text);
    if (infoTimerRef.current) window.clearTimeout(infoTimerRef.current);
    infoTimerRef.current = window.setTimeout(() => setInfoToast(null), 4500);
  }, []);
  const [symbolTip, setSymbolTip] = useState<{ x: number; y: number; lines: string[] } | null>(null);
  // readings come from real meters; the amps overlay is an opt-in x-ray
  const [insideId, setInsideId] = useState<string | null>(null);
  const lampRef = useRef({ x: BENCH.cx - BENCH.w / 2 - 320, y: BENCH.cy - BENCH.h / 2 + 500 });
  const [showAmps, setShowAmps] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const toolModeRef = useRef(toolMode);
  toolModeRef.current = toolMode;

  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const soundOnRef = useRef(true); // sound is always on — speakers just work

  // undo: snapshots taken before every board-changing action
  const historyRef = useRef<string[]>([]);
  const pushHistory = useCallback(() => {
    const snap = JSON.stringify(circuitRef.current);
    const h = historyRef.current;
    if (h[h.length - 1] === snap) return;
    h.push(snap);
    if (h.length > 60) h.shift();
  }, []);
  const undo = useCallback(() => {
    const raw = historyRef.current.pop();
    if (!raw) return;
    try {
      circuitRef.current = JSON.parse(raw) as Circuit;
      particlesRef.current = [];
      setSelectedId(null);
      setVertexMenu(null);
    } catch {}
  }, []);


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

    // speakers and buzzers share one oscillator-per-part pattern
    const alive = new Set<string>();
    let anyAudible = false;
    for (const p of circuitRef.current.parts) {
      if ((p.type !== "speaker" && p.type !== "buzzer") || p.destroyed) continue;
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
      const freq =
        p.type === "buzzer" ? 950 : p.mode === "note" ? p.noteHz : 110 + Math.min(Math.abs(p.volts), 130) * 14;
      const wantType: OscillatorType = p.type === "buzzer" ? "square" : p.mode === "note" ? "triangle" : "sawtooth";
      if (node.osc.type !== wantType) node.osc.type = wantType;
      node.gain.gain.setTargetAtTime(p.type === "buzzer" ? vol * 0.7 : vol, t, 0.04);
      node.osc.frequency.setTargetAtTime(freq, t, 0.03);
    }
    for (const [id, node] of a.speakers) {
      if (!alive.has(id)) {
        node.osc.stop();
        node.gain.disconnect();
        a.speakers.delete(id);
      }
    }

    // talking machines: a buzz and a hiss, shaped through mouth-like filters
    const aliveVoices = new Set<string>();
    for (const p of circuitRef.current.parts) {
      if (p.type !== "voicebox" || p.destroyed) continue;
      aliveVoices.add(p.id);
      let vn = a.voices.get(p.id);
      if (!vn) {
        const osc = ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = 115;
        const noiseSrc = ctx.createBufferSource();
        noiseSrc.buffer = a.noise;
        noiseSrc.loop = true;
        const mk = (fq: number, q: number) => {
          const f = ctx.createBiquadFilter();
          f.type = "bandpass";
          f.frequency.value = fq;
          f.Q.value = q;
          return f;
        };
        const f1 = mk(500, 6);
        const f2 = mk(1500, 9);
        const nf = mk(3000, 1);
        const gv1 = ctx.createGain();
        const gv2 = ctx.createGain();
        const gn = ctx.createGain();
        gv1.gain.value = 0;
        gv2.gain.value = 0;
        gn.gain.value = 0;
        const out = ctx.createGain();
        out.gain.value = 0.5;
        osc.connect(f1);
        osc.connect(f2);
        f1.connect(gv1);
        f2.connect(gv2);
        noiseSrc.connect(nf);
        nf.connect(gn);
        gv1.connect(out);
        gv2.connect(out);
        gn.connect(out);
        out.connect(ctx.destination);
        osc.start();
        noiseSrc.start();
        vn = { osc, noiseSrc, f1, f2, nf, gv1, gv2, gn, out };
        a.voices.set(p.id, vn);
      }
      const powered = Math.abs(p.current) > 0.02;
      const speaking = p.playing && powered && soundOnRef.current;
      let voiced = 0;
      let noisy = 0;
      if (speaking) {
        anyAudible = true;
        const idx = Math.floor(p.playPos / LETTER_SECONDS);
        const ch = (p.text[idx] ?? " ").toLowerCase();
        const ph = PHONES[ch] ?? PHONE_DEFAULT;
        const tIn = (p.playPos % LETTER_SECONDS) / LETTER_SECONDS;
        // quick fade in/out inside each letter so they don't smear together
        let env = Math.min(1, tIn / 0.15, (1 - tIn) / 0.15);
        if (ph.burst) env = tIn < 0.35 ? 1 : 0;
        voiced = ph.v * env;
        noisy = ph.n * env;
        if (ph.f1 > 0) vn.f1.frequency.setTargetAtTime(ph.f1, t, 0.02);
        if (ph.f2 > 0) vn.f2.frequency.setTargetAtTime(ph.f2, t, 0.02);
        if (ph.nf > 0) vn.nf.frequency.setTargetAtTime(ph.nf, t, 0.02);
        // a little pitch wobble so it sounds spoken, not sung
        vn.osc.frequency.setTargetAtTime(110 + Math.sin(p.playPos * 5) * 8, t, 0.05);
      }
      vn.gv1.gain.setTargetAtTime(voiced * 0.5, t, 0.02);
      vn.gv2.gain.setTargetAtTime(voiced * 0.35, t, 0.02);
      vn.gn.gain.setTargetAtTime(noisy * 0.3, t, 0.02);
    }
    for (const [id, vn] of a.voices) {
      if (!aliveVoices.has(id)) {
        vn.osc.stop();
        vn.noiseSrc.stop();
        vn.out.disconnect();
        a.voices.delete(id);
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
    for (let k = 0; k < 14; k++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 80 + Math.random() * 220;
      ps.push({
        x,
        y,
        z: 14,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        vz: 160 + Math.random() * 320,
        age: 0,
        life: 1.4 + Math.random() * 0.8,
        size: 3 + Math.random() * 5,
        color: "#57534e",
        kind: "shard",
      });
    }
    // one big flash particle — ThreeBoard turns it into a burst of real light
    ps.push({ x, y, z: 30, vx: 0, vy: 0, vz: 0, age: 0, life: 0.2, size: 28, color: "#ffedbb", kind: "spark" });
    for (let k = 0; k < 28; k++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 180 + Math.random() * 380;
      ps.push({
        x,
        y,
        z: 14,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        vz: Math.random() * 260,
        age: 0,
        life: 0.35 + Math.random() * 0.3,
        size: 1.6 + Math.random() * 2,
        color: "#ffc23d",
        kind: "spark",
      });
    }
    for (let k = 0; k < 6; k++) {
      ps.push({
        x: x + (Math.random() - 0.5) * 20,
        y: y + (Math.random() - 0.5) * 20,
        z: 16,
        vx: (Math.random() - 0.5) * 30,
        vy: (Math.random() - 0.5) * 30,
        vz: 40 + Math.random() * 40,
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
      if (p.kind !== "smoke") p.vz -= 850 * dt; // gravity pulls debris back to the bench
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      if (p.z < 2 && p.kind === "shard") {
        p.z = 2;
        p.vz *= -0.35; // a little bounce
        p.vx *= 0.6;
        p.vy *= 0.6;
      }
    }
    particlesRef.current = ps.filter((p) => p.age < p.life);
  }, []);

  // ——— load the stop's build ———

  useEffect(() => {
    try {
      if (localStorage.getItem("circuit-lab-volume-toast")) volumeToastShownRef.current = true;
    } catch {}
    const rect = boardDivRef.current?.getBoundingClientRect();
    const cw = rect?.width ?? 1100;
    const ch = rect?.height ?? 650;
    sizeRef.current = { w: cw, h: ch };
    circuitRef.current = (initialBuild ?? GUIDES[0].build)(cw / 2, ch / 2);
    fitView();
    setFrame((f) => f + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ——— the live simulation loop ———

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
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
      clockRef.current += dt;
      // dangerously hot parts spit real sparks before they let go
      const circHot = circuitRef.current;
      for (const hp of circHot.parts) {
        const at = CATALOG[hp.type].explodeAt;
        if (!isFinite(at) || hp.destroyed) continue;
        const danger = (hp.temp - 0.6 * at) / (0.4 * at);
        if (danger > 0.15 && Math.random() < danger * 0.25) {
          const va = vertexById(circHot, hp.a);
          const vb = vertexById(circHot, hp.b);
          if (va && vb) {
            const f = Math.random();
            particlesRef.current.push({
              x: va.x + (vb.x - va.x) * f,
              y: va.y + (vb.y - va.y) * f,
              z: 10,
              vx: (Math.random() - 0.5) * 160,
              vy: (Math.random() - 0.5) * 160,
              vz: 120 + Math.random() * 240,
              age: 0,
              life: 0.3 + Math.random() * 0.25,
              size: 1 + Math.random() * 1.4,
              color: "#ffc23d",
              kind: "spark",
            });
          }
        }
      }
      // soldering: dot held on dot long enough → fuse the joint
      const d = dragRef.current;
      if (d && d.kind === "vertex" && d.holdTargetId && d.holdStart && performance.now() - d.holdStart > SOLDER_MS) {
        const circ2 = circuitRef.current;
        const v = vertexById(circ2, d.vertexId);
        const target = vertexById(circ2, d.holdTargetId);
        if (v && target) {
          mergeVertices(circ2, target.id, v.id);
          enforceLengths(circ2, new Set());
        }
        dragRef.current = null;
        snapHintRef.current = null;
      }
      setFrame((f) => (f + 1) % 1e9);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playBoom, spawnExplosion, stepParticles, updateAudio]);

  // track canvas size
  useEffect(() => {
    const host = boardDivRef.current;
    if (!host) return;
    const ro = new ResizeObserver(() => {
      const r = host.getBoundingClientRect();
      sizeRef.current = { w: Math.max(200, r.width), h: Math.max(200, r.height) };
    });
    ro.observe(host);
    return () => ro.disconnect();
  }, []);

  // ——— camera (orbit / pan / dolly) ———

  // how many screen pixels one world unit covers at the camera target —
  // this is what the microscope thresholds are written against
  const effScale = useCallback(() => {
    return sizeRef.current.h / (2 * camRef.current.dist * Math.tan(FOV_RAD / 2));
  }, []);

  const clampCam = useCallback(() => {
    const c = camRef.current;
    c.dist = clamp(c.dist, 26, 20000);
    c.tx = clamp(c.tx, BENCH.cx - BENCH.w / 2, BENCH.cx + BENCH.w / 2);
    c.ty = clamp(c.ty, BENCH.cy - BENCH.h / 2, BENCH.cy + BENCH.h / 2);
    c.polar = clamp(c.polar, 0.05, 1.2);
  }, []);

  useEffect(() => {
    const host = boardDivRef.current;
    if (!host) return;
    const onWheel = (e: WheelEvent) => {
      // Scrolling dollies toward the cursor. Keep going and you pass into
      // the microscope: molecules, then the actual electrons.
      e.preventDefault();
      const cam = camRef.current;
      const under = apiRef.current?.toWorld(e.clientX, e.clientY);
      const f = Math.exp(e.deltaY * 0.0016);
      cam.dist = clamp(cam.dist * f, 26, 20000);
      if (under && f < 1) {
        // zooming in pulls the view toward what you're pointing at
        cam.tx += (under.x - cam.tx) * (1 - f);
        cam.ty += (under.y - cam.ty) * (1 - f);
      }
      clampCam();
    };
    host.addEventListener("wheel", onWheel, { passive: false });
    return () => host.removeEventListener("wheel", onWheel);
  }, [clampCam]);

  const fitView = useCallback(() => {
    const c = circuitRef.current;
    const { w, h } = sizeRef.current;
    const cam = camRef.current;
    if (c.vertices.length === 0) {
      cam.dist = 800;
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
    const hasGuts = c.parts.some((p) => p.type === "calculator" || p.type === "voicebox");
    const pad = hasGuts ? 700 : 260;
    const bw = x1 - x0 + pad;
    const bh = y1 - y0 + pad;
    const aspect = w / Math.max(1, h);
    const tanV = Math.tan(FOV_RAD / 2);
    cam.tx = (x0 + x1) / 2;
    cam.ty = (y0 + y1) / 2;
    cam.dist = clamp(Math.max(bh / (2 * tanV), bw / (2 * tanV * aspect)) * 1.12, 200, 60000);
    clampCam();
  }, [clampCam]);

  // ——— pointer plumbing ———

  const toWorld = useCallback((e: { clientX: number; clientY: number }) => {
    return apiRef.current?.toWorld(e.clientX, e.clientY) ?? { x: 0, y: 0 };
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
    // a tiny burst of solder sparks where the joint was made
    const kept = vertexById(circ, keepId);
    if (kept) {
      for (let k = 0; k < 7; k++) {
        const ang = Math.random() * Math.PI * 2;
        const sp = 40 + Math.random() * 120;
        particlesRef.current.push({
          x: kept.x,
          y: kept.y,
          z: 10,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp,
          vz: 60 + Math.random() * 160,
          age: 0,
          life: 0.25 + Math.random() * 0.2,
          size: 1.2 + Math.random() * 1.4,
          color: "#ffd83d",
          kind: "spark",
        });
      }
    }
  }, []);

  const clampAll = useCallback((circ: Circuit) => {
    // parts stay on the work mat
    for (const v of circ.vertices) {
      v.x = clamp(v.x, BENCH.cx - BENCH.w / 2 + 40, BENCH.cx + BENCH.w / 2 - 40);
      v.y = clamp(v.y, BENCH.cy - BENCH.h / 2 + 40, BENCH.cy + BENCH.h / 2 - 40);
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
    if (drag.kind === "orbit") {
      const cam = camRef.current;
      cam.azim -= (e.clientX - drag.lastX) * 0.005;
      // shift-drag up tilts the camera down toward the horizon, drag down
      // brings it overhead — the direction the user expects
      cam.polar = clamp(cam.polar - (e.clientY - drag.lastY) * 0.004, 0.05, 1.2);
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      return;
    }
    if (drag.kind === "pan") {
      // both rays are cast with the SAME camera, so the delta is honest even
      // while the eased camera is still catching up — no runaway feedback
      const cam = camRef.current;
      const wPrev = toWorld({ clientX: drag.lastX, clientY: drag.lastY });
      const wNow = toWorld(e);
      cam.tx -= wNow.x - wPrev.x;
      cam.ty -= wNow.y - wPrev.y;
      drag.moved += Math.abs(e.clientX - drag.lastX) + Math.abs(e.clientY - drag.lastY);
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      clampCam();
      return;
    }
    if (drag.kind === "lamp") {
      const w = toWorld(e);
      lampRef.current = {
        x: clamp(w.x + drag.offX, BENCH.cx - BENCH.w / 2 - 500, BENCH.cx + BENCH.w / 2 + 300),
        y: clamp(w.y + drag.offY, BENCH.cy - BENCH.h / 2 - 300, BENCH.cy + BENCH.h / 2 + 300),
      };
      return;
    }
    if (drag.kind === "marquee") {
      const host = boardDivRef.current?.getBoundingClientRect();
      drag.x1 = e.clientX - (host?.left ?? 0);
      drag.y1 = e.clientY - (host?.top ?? 0);
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
      const target = findSnapTarget(circ, v);
      snapHintRef.current = target?.id ?? null;
      // soldering: hovering a dot on another dot starts the fuse timer
      if (target) {
        if (drag.holdTargetId !== target.id) {
          drag.holdTargetId = target.id;
          drag.holdStart = performance.now();
        }
      } else {
        drag.holdTargetId = undefined;
        drag.holdStart = undefined;
      }
    }
  };

  handlersRef.current.up = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    snapHintRef.current = null;
    if (!drag || drag.kind === "orbit" || drag.kind === "lamp") return;
    if (drag.kind === "pan") {
      if (drag.moved < 5) {
        const pk = apiRef.current?.pick(drag.downX, drag.downY);
        const circ2 = circuitRef.current;
        if (pk?.kind === "part") {
          const part = circ2.parts.find((p) => p.id === pk.partId);
          if (part) {
            setSelectedId(part.id);
            setSelectedIds([part.id]);
            if (part.type === "switch" && !part.destroyed) part.closed = !part.closed;
          }
        } else if (pk?.kind === "vertex") {
          setVertexMenu(partsAtVertex(circ2, pk.vertexId).length >= 2 ? pk.vertexId : null);
        } else {
          setSelectedId(null);
          setSelectedIds([]);
          setVertexMenu(null);
        }
      }
      return;
    }
    const circ = circuitRef.current;
    if (drag.kind === "marquee") {
      const xa = Math.min(drag.x0, drag.x1);
      const xb = Math.max(drag.x0, drag.x1);
      const ya = Math.min(drag.y0, drag.y1);
      const yb = Math.max(drag.y0, drag.y1);
      if (xb - xa > 6 || yb - ya > 6) {
        const ids: string[] = [];
        for (const p of circ.parts) {
          const va = vertexById(circ, p.a);
          const vb = vertexById(circ, p.b);
          if (!va || !vb) continue;
          const pr = apiRef.current?.project((va.x + vb.x) / 2, (va.y + vb.y) / 2);
          if (pr && pr.x >= xa && pr.x <= xb && pr.y >= ya && pr.y <= yb) ids.push(p.id);
        }
        setSelectedIds(ids);
        setSelectedId(ids.length === 1 ? ids[0] : null);
      }
      return;
    }
    if (drag.kind === "vertex") {
      const v = vertexById(circ, drag.vertexId);
      if (v && drag.moved < 5) {
        // a click, not a drag — offer to pull the junction apart
        setVertexMenu(partsAtVertex(circ, v.id).length >= 2 ? v.id : null);
      }
      // no merge on release: joints are made by HOLDING dot on dot (soldering)
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
      pushHistory();
      const circ = circuitRef.current;
      const { x, y } = toWorld(e);
      setVertexMenu(null);
      const multi = selectedIdsRef.current;
      let verts: string[];
      if (multi.length > 1 && multi.includes(part.id)) {
        // dragging any selected part moves the whole selection together
        const set = new Set<string>();
        for (const id of multi) {
          const sp = circ.parts.find((pp) => pp.id === id);
          if (sp) {
            set.add(sp.a);
            set.add(sp.b);
          }
        }
        verts = [...set];
      } else {
        setSelectedId(part.id);
        setSelectedIds([part.id]);
        verts = collectGroup(circ, part);
      }
      if (part.type === "button" && !part.destroyed) part.pressed = true;
      dragRef.current = {
        kind: "body",
        partId: part.id,
        verts,
        lastX: x,
        lastY: y,
        moved: 0,
      };
    },
    [collectGroup, ensureAudio, pushHistory, toWorld]
  );

  const startVertexDrag = useCallback(
    (v: Vertex, e: React.PointerEvent) => {
      e.stopPropagation();
      ensureAudio();
      pushHistory();
      setVertexMenu(null);
      dragRef.current = { kind: "vertex", vertexId: v.id, moved: 0 };
    },
    [ensureAudio, pushHistory]
  );

  const saveDesign = useCallback(() => {
    try {
      const blob = new Blob([JSON.stringify(circuitRef.current, null, 1)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "circuit-design.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch {}
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadDesign = useCallback(
    (file: File) => {
      file.text().then((raw) => {
        try {
          const data = JSON.parse(raw) as Circuit;
          if (!Array.isArray(data.vertices) || !Array.isArray(data.parts)) return;
          pushHistory();
          data.parts = data.parts.filter((p) => CATALOG[p.type]);
          for (const p of data.parts) {
            const fresh = blankPart(p.type);
            for (const key of Object.keys(fresh) as (keyof typeof fresh)[]) {
              if (p[key] === undefined) (p as unknown as Record<string, unknown>)[key] = fresh[key];
            }
          }
          circuitRef.current = data;
          bumpIdsPast(data);
          particlesRef.current = [];
          setSelectedId(null);
          setVertexMenu(null);
          fitView();
        } catch {
          // not a circuit file — ignore
        }
      });
    },
    [fitView, pushHistory]
  );

  const toggleFullscreen = useCallback(() => {
    const host = boardDivRef.current;
    if (!host) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void host.requestFullscreen();
  }, []);

  // every press on the 3D board lands here: raycast, then route
  const onBoardPointerDown = useCallback(
    (e: React.PointerEvent) => {
      ensureAudio();
      // presses on HTML overlays (inspector, sliders, popovers, trash) are
      // theirs alone — only the 3D canvas talks to the board
      if (!(e.target instanceof HTMLCanvasElement)) return;
      if (e.button === 2 || (e.button === 0 && e.shiftKey)) {
        // right-drag (or shift-drag) orbits the camera around the bench
        dragRef.current = { kind: "orbit", lastX: e.clientX, lastY: e.clientY };
        return;
      }
      if (e.button !== 0) return;
      const pk = apiRef.current?.pick(e.clientX, e.clientY);
      if (!pk) return;
      const circ = circuitRef.current;
      setSymbolTip(null);
      if (pk.kind === "lamp") {
        const w = apiRef.current?.toWorld(e.clientX, e.clientY);
        if (w) dragRef.current = { kind: "lamp", offX: lampRef.current.x - w.x, offY: lampRef.current.y - w.y };
        return;
      }
      if (pk.kind === "label") {
        const host = boardDivRef.current?.getBoundingClientRect();
        setSymbolTip({
          x: e.clientX - (host?.left ?? 0),
          y: e.clientY - (host?.top ?? 0),
          lines: explainSymbols(pk.text),
        });
        return;
      }
      if (pk.kind === "calckey") {
        const part = circ.parts.find((p) => p.id === pk.partId);
        if (part) {
          setSelectedId(part.id);
          setSelectedIds([part.id]);
          pressCalcKey(part, pk.key);
        }
        return;
      }
      if (toolModeRef.current === "hand") {
        // move-view mode: everything drags the view; a plain click still selects
        dragRef.current = {
          kind: "pan",
          lastX: e.clientX,
          lastY: e.clientY,
          downX: e.clientX,
          downY: e.clientY,
          moved: 0,
        };
        return;
      }
      if (pk.kind === "vertex") {
        const v = vertexById(circ, pk.vertexId);
        if (v) startVertexDrag(v, e);
        return;
      }
      if (pk.kind === "part") {
        const part = circ.parts.find((p) => p.id === pk.partId);
        if (part) startBodyDrag(part, e);
        return;
      }
      setSelectedId(null);
      setSelectedIds([]);
      setVertexMenu(null);
      // select mode: dragging empty board sweeps a selection box (no panning);
      // hand mode pans as usual
      const host = boardDivRef.current?.getBoundingClientRect();
      dragRef.current = {
        kind: "marquee",
        x0: e.clientX - (host?.left ?? 0),
        y0: e.clientY - (host?.top ?? 0),
        x1: e.clientX - (host?.left ?? 0),
        y1: e.clientY - (host?.top ?? 0),
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ensureAudio]
  );

  const onBoardDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (!(e.target instanceof HTMLCanvasElement)) return;
      const pk = apiRef.current?.pick(e.clientX, e.clientY);
      if (!pk) return;
      if (pk.kind === "bg") fitView();
      else if (pk.kind === "vertex") splitVertex(pk.vertexId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fitView]
  );

  const spawnFromToolbox = useCallback(
    (type: PartType, e: React.PointerEvent) => {
      e.preventDefault();
      ensureAudio();
      pushHistory();
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
    [ensureAudio, pushHistory, toWorld]
  );

  const spawnModel = useCallback(
    (model: Model, e: React.PointerEvent) => {
      e.preventDefault();
      ensureAudio();
      pushHistory();
      const circ = circuitRef.current;
      const { x, y } = toWorld(e);
      const frag = model.build(x, y);
      // give key buttons letters that aren't taken on the board yet
      const used = new Set(circ.parts.filter((p) => p.type === "button").map((p) => p.key));
      for (const p of frag.parts) {
        if (p.type !== "button") continue;
        if (!p.key || used.has(p.key)) p.key = [...KEY_POOL].find((k) => !used.has(k)) ?? p.key;
        used.add(p.key);
      }
      circ.vertices.push(...frag.vertices);
      circ.parts.push(...frag.parts);
      setSelectedId(null);
      setVertexMenu(null);
      // drag the whole assembly as one rigid piece until it's dropped
      dragRef.current = {
        kind: "body",
        partId: frag.parts[0].id,
        verts: frag.vertices.map((v) => v.id),
        lastX: x,
        lastY: y,
        moved: 100,
      };
    },
    [ensureAudio, pushHistory, toWorld]
  );

  const splitVertex = useCallback((vid: string) => {
    pushHistory();
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
  }, [pushHistory]);

  const deletePart = useCallback((id: string) => {
    pushHistory();
    const circ = circuitRef.current;
    circ.parts = circ.parts.filter((p) => p.id !== id);
    const used = new Set<string>();
    for (const p of circ.parts) {
      used.add(p.a);
      used.add(p.b);
    }
    circ.vertices = circ.vertices.filter((v) => used.has(v.id));
    setSelectedId(null);
  }, [pushHistory]);

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
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        const many = selectedIdsRef.current;
        if (many.length > 1) {
          e.preventDefault();
          pushHistory();
          const circ2 = circuitRef.current;
          circ2.parts = circ2.parts.filter((p) => !many.includes(p.id));
          const used = new Set<string>();
          for (const p of circ2.parts) {
            used.add(p.a);
            used.add(p.b);
          }
          circ2.vertices = circ2.vertices.filter((v) => used.has(v.id));
          setSelectedId(null);
          setSelectedIds([]);
        } else if (selectedRef.current) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deletePart, ensureAudio, undo]);

  // the calculator behaves like the cheap real thing: type, operator, type, equals
  const pressCalcKey = useCallback((part: Part, k: string) => {
    if (part.destroyed || Math.abs(part.current) < 0.01) return; // no power, no math
    const apply = (a: number, op: string, b: number) =>
      op === "+" ? a + b : op === "−" ? a - b : op === "×" ? a * b : b === 0 ? NaN : a / b;
    const fmt = (n: number) => {
      if (!isFinite(n)) return "Err";
      let s = String(Math.round(n * 1e6) / 1e6);
      if (s.length > 9) s = String(Math.round(n));
      if (s.length > 9) s = "Err";
      return s;
    };
    if (k >= "0" && k <= "9") {
      part.display =
        part.calcFresh || part.display === "0" ? k : (part.display + k).slice(0, 9);
      part.calcFresh = false;
    } else if (k === "C") {
      part.display = "0";
      part.calcAcc = 0;
      part.calcOp = "";
      part.calcFresh = true;
    } else if (k === "=") {
      if (part.calcOp) {
        part.display = fmt(apply(part.calcAcc, part.calcOp, parseFloat(part.display) || 0));
        part.calcOp = "";
        part.calcFresh = true;
      }
    } else {
      const cur = parseFloat(part.display) || 0;
      if (part.calcOp && !part.calcFresh) {
        const r = apply(part.calcAcc, part.calcOp, cur);
        part.display = fmt(r);
        part.calcAcc = isFinite(r) ? r : 0;
      } else {
        part.calcAcc = cur;
      }
      part.calcOp = k;
      part.calcFresh = true;
    }
  }, []);

  const clearBoard = useCallback(() => {
    pushHistory();
    circuitRef.current = { vertices: [], parts: [] };
    particlesRef.current = [];
    setSelectedId(null);
    setVertexMenu(null);
  }, [pushHistory]);

  const resetLesson = useCallback(() => {
    if (!initialBuild) return;
    pushHistory();
    const { w, h } = sizeRef.current;
    circuitRef.current = initialBuild(w / 2, h / 2);
    particlesRef.current = [];
    setSelectedId(null);
    setVertexMenu(null);
    fitView();
  }, [fitView, initialBuild, pushHistory]);

  // ——— render ———

  const circ = circuitRef.current;
  const { w: vw, h: vh } = sizeRef.current;
  const selected = circ.parts.find((p) => p.id === selectedId) ?? null;
  const vmap = new Map<string, Vertex>();
  for (const v of circ.vertices) vmap.set(v.id, v);
  const degree = new Map<string, number>();
  for (const p of circ.parts) {
    degree.set(p.a, (degree.get(p.a) ?? 0) + 1);
    degree.set(p.b, (degree.get(p.b) ?? 0) + 1);
  }

  uiRef.current = {
    selectedId,
    selectedIds,
    snapHintId: snapHintRef.current,
    handle: null,
    degrees: degree,
    electronView,
    showAmps,
    showLabels,
  };

  // synthetic 2D view of the camera target, for the microscope overlay
  const es = effScale();
  const view = { x: camRef.current.tx - vw / (2 * es), y: camRef.current.ty - vh / (2 * es), scale: es };

  // ——— microscope: a mode you switch on; zooming deeper goes from
  // molecules to electrons while you're inside it ———
  const microFade = 0 as number; // the deep-zoom microscope is retired
  const electronStage = es > 9;
  let microPart: Part | null = null;
  let microAngle = 0;
  if (microFade > 0 && circ.parts.length > 0) {
    const cxw = camRef.current.tx;
    const cyw = camRef.current.ty;
    let best = Infinity;
    for (const p of circ.parts) {
      const va = vmap.get(p.a);
      const vb = vmap.get(p.b);
      if (!va || !vb) continue;
      const d = Math.hypot((va.x + vb.x) / 2 - cxw, (va.y + vb.y) / 2 - cyw);
      if (d < best) {
        best = d;
        microPart = p;
        microAngle = Math.atan2(vb.y - va.y, vb.x - va.x);
      }
    }
  }
  const microMat = microPart ? microMaterial(microPart.type) : null;

  return (
    <div
      className="h-full w-full flex flex-col bg-[var(--bg)] text-[var(--ink)] select-none overflow-hidden"
      onPointerDown={ensureAudio}
    >
      <div className="flex flex-1 min-h-0">
        {/* toolbox: single parts first, big builds at the bottom */}
        <aside className="w-44 md:w-56 p-2 border-r shrink-0 overflow-y-auto border-[var(--line)] bg-[var(--panel)]">
          <button
            className={`${toolMode === "select" ? "btn btn-primary" : "btn"} mb-3 w-full justify-center`}
            aria-pressed={toolMode === "select"}
            title="When on: click and drag parts, pull connections apart, rewire. When off: dragging just moves the view."
            onClick={() => setToolMode((m) => (m === "select" ? "hand" : "select"))}
          >
            {toolMode === "select" ? "Select & drag: ON" : "Select & drag"}
          </button>
          <div className="seg mb-2 w-full" role="group" aria-label="What the moving dots show">
            <button
              className="flex-1"
              aria-pressed={!electronView}
              title="Current flowing + to − : the direction Ben Franklin decided on, 250 years before anyone found the electron"
              onClick={() => {
                setElectronView(false);
                if (!circuitRef.current.parts.some((p) => Math.abs(p.current) > 0.002))
                  showInfo("No current is flowing yet — close a loop and the yellow dots will show it.");
              }}
            >
              Show current
            </button>
            <button
              className="flex-1"
              aria-pressed={electronView}
              title="The electrons themselves — they really drift the OTHER way, against Franklin's arrow. Both views are correct physics."
              onClick={() => {
                setElectronView(true);
                if (!circuitRef.current.parts.some((p) => Math.abs(p.current) > 0.002))
                  showInfo("No current is flowing yet — close a loop and the blue electron dots will drift (the real way: − to +).");
              }}
            >
              Show electrons
            </button>
          </div>
          <div className="seg mb-2 w-full" role="group" aria-label="Which readouts to show">
            <button
              className="flex-1"
              aria-pressed={showAmps}
              title="X-ray: show live amps on every part without a meter (off = measure with real ammeters, like a real bench)"
              onClick={() => setShowAmps((v) => !v)}
            >
              {showAmps ? "Amps: on" : "Amps: off"}
            </button>
            <button
              className="flex-1"
              aria-pressed={showLabels}
              title="Show or hide the info labels (ohms, volts, magnet numbers, …)"
              onClick={() => setShowLabels((v) => !v)}
            >
              {showLabels ? "Labels: on" : "Labels: off"}
            </button>
          </div>
          <button className="btn w-full justify-center mb-3" title="Undo (or press Cmd/Ctrl+Z)" onClick={undo}>
            Undo
          </button>
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
          <div className="mb-3 pt-2 border-t border-[var(--line)]">
            <h4 className="text-[10px] uppercase tracking-widest text-[var(--ink-3)] px-1.5 mb-1">
              Big builds — drag one in
            </h4>
            <div className="flex flex-col gap-0.5">
              {MODELS.map((m) => (
                <button
                  key={m.id}
                  className="tool-item"
                  onPointerDown={(e) => spawnModel(m, e)}
                  title={`${m.blurb} Drag it onto the board.`}
                >
                  <ModelPreview model={m} />
                  <div className="text-[11px] font-medium text-[var(--ink-2)] leading-tight">
                    {m.title}
                  </div>
                  <div className="text-[10px] text-[var(--ink-3)] leading-tight hidden md:block">
                    {m.blurb}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* board */}
        <div
          ref={boardDivRef}
          className="relative flex-1 min-w-0 touch-none"
          style={{
            cursor:
              dragRef.current?.kind === "vertex" && dragRef.current.holdTargetId ? IRON_CURSOR : undefined,
          }}
          onPointerDown={onBoardPointerDown}
          onDoubleClick={onBoardDoubleClick}
          onContextMenu={(e) => e.preventDefault()}
        >
          <ThreeBoard
            circuitRef={circuitRef}
            particlesRef={particlesRef}
            camRef={camRef}
            uiRef={uiRef}
            apiRef={apiRef}
            sizeRef={sizeRef}
            lampRef={lampRef}
          />

          {/* the microscope is its own flat view, drawn over the 3D bench */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none"
            viewBox={`${view.x} ${view.y} ${vw / view.scale} ${vh / view.scale}`}
          >
            {/* the microscope: molecules, then electrons */}
            {microPart &&
              microMat &&
              microFade > 0 &&
              (() => {
                const worldW = vw / view.scale;
                const worldH = vh / view.scale;
                const t = clockRef.current;
                // atoms stay a comfortable on-screen size whatever the zoom
                const s = clamp((electronStage ? 130 : 56) / view.scale, electronStage ? 20 : 9, 400);
                const r = s * (electronStage ? 0.36 : 0.32);
                const heatWobble = s * (0.02 + Math.min(0.22, (microPart.temp - 25) / 900));
                const midX = view.x + worldW / 2;
                const atoms: React.ReactNode[] = [];
                const i0 = Math.floor(view.x / s);
                const j0 = Math.floor(view.y / s);
                for (let i = i0; i <= i0 + worldW / s + 1; i++) {
                  for (let j = j0; j <= j0 + worldH / s + 1; j++) {
                    const rough = microMat.title === "a rough material" ? s * 0.22 : s * 0.04;
                    const ox = (pseudo(i, j) - 0.5) * 2 * rough + Math.sin(t * 3 + i * 2.1 + j) * heatWobble;
                    const oy = (pseudo(j, i) - 0.5) * 2 * rough + Math.cos(t * 3.4 + j * 1.7 + i) * heatWobble;
                    // capacitor: skip atoms in the middle gap; split materials tint by side
                    const x = i * s + ox;
                    if (microPart.type === "capacitor" && Math.abs(x - midX) < s * 2.2) continue;
                    const right = microMat.split && x > midX;
                    atoms.push(
                      <circle
                        key={`${i}-${j}`}
                        cx={x}
                        cy={j * s + oy}
                        r={r}
                        fill={right ? "#33404f" : microMat.atomFill}
                        stroke={right ? "#567191" : microMat.atomStroke}
                        strokeWidth={s * 0.045}
                      />
                    );
                  }
                }
                const electrons: React.ReactNode[] = [];
                if (microMat.freeElectrons) {
                  const amps = microPart.destroyed ? 0 : microPart.current;
                  // electrons really drift AGAINST the conventional arrow
                  const drift = -clamp(amps * 26, -120, 120) * t;
                  const dx = Math.cos(microAngle);
                  const dy = Math.sin(microAngle);
                  const jig = electronStage ? 4 : 2;
                  // anchored to fixed world-space tiles, like the atom lattice,
                  // so zooming never re-shuffles them or flips their motion
                  const T = 120;
                  const PER_TILE = 14;
                  const tx0 = Math.floor(view.x / T);
                  const ty0 = Math.floor(view.y / T);
                  for (let tx = tx0; tx <= tx0 + worldW / T + 1; tx++) {
                    for (let ty = ty0; ty <= ty0 + worldH / T + 1; ty++) {
                      for (let k = 0; k < PER_TILE; k++) {
                        const bx = pseudo(k * 3 + 1, tx * 17 + ty * 5) * T;
                        const by = pseudo(tx * 7 + k, ty * 11 + 3) * T;
                        const px =
                          tx * T +
                          ((((bx + drift * dx) % T) + T) % T) +
                          Math.sin(t * 6 + k * 3.3 + tx) * jig;
                        const py =
                          ty * T +
                          ((((by + drift * dy) % T) + T) % T) +
                          Math.cos(t * 5 + k * 2.1 + ty) * jig;
                        if (microPart.type === "capacitor") {
                          // electrons crowd the plate the current pushes them toward
                          const side = amps > 0.001 ? 1 : amps < -0.001 ? -1 : 0;
                          if (side !== 0 && Math.sign(px - midX) !== side && pseudo(k, tx + 21) > 0.25) continue;
                          if (Math.abs(px - midX) < s * 2.2) continue;
                        }
                        electrons.push(
                          <circle
                            key={`${tx}-${ty}-${k}`}
                            cx={px}
                            cy={py}
                            r={electronStage ? 1.3 : 0.7}
                            fill="#7cc7ff"
                            opacity={0.9}
                          />
                        );
                      }
                    }
                  }
                }
                return (
                  <g pointerEvents="none" opacity={microFade}>
                    <rect x={view.x} y={view.y} width={worldW} height={worldH} fill="var(--board)" opacity={0.97} />
                    {atoms}
                    {electrons}
                  </g>
                );
              })()}
          </svg>

          {/* microscope explainer */}
          {microPart && microMat && microFade > 0.5 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 w-[520px] max-w-[92%] rounded-xl border border-[var(--accent-dim)] bg-[var(--panel)] p-4 text-[13px] leading-relaxed pointer-events-none">
              <div className="font-semibold text-[var(--ink)] mb-1">
                Inside the {CATALOG[microPart.type].label.toLowerCase()} — zoomed roughly{" "}
                {electronStage ? "ten million" : "a million"} times. This is {microMat.title}.
              </div>
              <p className="text-[var(--ink-2)]">
                {electronStage ? microMat.electrons : microMat.atoms}
              </p>
              <p className="mt-1.5 text-[12px] text-[var(--ink-3)]">
                {electronStage
                  ? Math.abs(microPart.current) > 0.002
                    ? "There's current flowing: the electrons drift along at a literal crawl — about a millimeter per second in real wire — and they drift OPPOSITE the yellow arrows, because Ben Franklin guessed the direction before anyone had found the electron."
                    : "No current right now, so the electrons just jiggle in place, waiting for a push."
                  : "Zoom in to meet the electrons; switch Microscope off to come back to the workbench."}
              </p>
            </div>
          )}

          {volumeToast && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-4 py-2 text-xs text-[var(--ink)]">
              Your circuit is making sound — turn your computer volume up to hear it.
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

          {/* marquee selection box */}
          {(() => {
            const d = dragRef.current;
            if (!d || d.kind !== "marquee") return null;
            const xa = Math.min(d.x0, d.x1);
            const ya = Math.min(d.y0, d.y1);
            return (
              <div
                className="absolute z-10 border border-[var(--focus)] bg-[rgba(56,189,248,0.08)] pointer-events-none"
                style={{ left: xa, top: ya, width: Math.abs(d.x1 - d.x0), height: Math.abs(d.y1 - d.y0) }}
              />
            );
          })()}

          {/* soldering progress: hold a dot on a dot and the ring fills */}
          {(() => {
            const d = dragRef.current;
            if (!d || d.kind !== "vertex" || !d.holdTargetId || !d.holdStart) return null;
            const target = vertexById(circ, d.holdTargetId);
            if (!target) return null;
            const pr = apiRef.current?.project(target.x, target.y);
            if (!pr) return null;
            // eslint-disable-next-line react-hooks/purity -- re-rendered every frame by design
            const frac = Math.min(1, (performance.now() - d.holdStart) / SOLDER_MS);
            return (
              <div
                className="absolute z-20 pointer-events-none rounded-full"
                style={{
                  left: pr.x - 17,
                  top: pr.y - 17,
                  width: 34,
                  height: 34,
                  background: `conic-gradient(#ffd83d ${frac * 360}deg, rgba(255,216,61,0.15) 0deg)`,
                  WebkitMask: "radial-gradient(circle, transparent 11px, black 12px)",
                  mask: "radial-gradient(circle, transparent 11px, black 12px)",
                }}
              />
            );
          })()}

          {/* symbol explainer: click any label to decode its letters */}
          {symbolTip && (
            <div
              className="absolute z-30 max-w-[300px] rounded-lg px-3 py-2 text-[11.5px] leading-relaxed text-[var(--ink)] pointer-events-none"
              style={{
                left: Math.min(symbolTip.x, Math.max(60, vw - 310)),
                top: symbolTip.y + 12,
                background: "color-mix(in oklab, var(--panel) 72%, transparent)",
                backdropFilter: "blur(3px)",
                border: "1px solid var(--line)",
              }}
            >
              {symbolTip.lines.map((l) => (
                <div key={l}>{l}</div>
              ))}
            </div>
          )}

          {infoToast && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-4 py-2 text-xs text-[var(--ink)]">
              {infoToast}
            </div>
          )}

          {/* save / load, parked at the bottom of the screen */}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 flex gap-1.5">
            <button className="btn" title="Download this circuit as a file" onClick={saveDesign}>
              Save design
            </button>
            <button
              className="btn"
              title="Load a circuit file you saved earlier (replaces the board)"
              onClick={() => fileInputRef.current?.click()}
            >
              Load design
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) loadDesign(f);
                e.target.value = "";
              }}
            />
          </div>

          {/* recenter */}
          <button
            className="absolute top-3 right-21 z-10 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-2 text-[var(--ink-3)] hover:text-[var(--ink)] hover:bg-[var(--panel-2)] transition-colors"
            title="Recenter on your circuit"
            aria-label="Recenter on your circuit"
            onClick={fitView}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="8" cy="8" r="3.2" />
              <path d="M8 1.5v2.6 M8 11.9v2.6 M1.5 8h2.6 M11.9 8h2.6" />
            </svg>
          </button>

          {/* fullscreen */}
          <button
            className="absolute top-3 right-12 z-10 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-2 text-[var(--ink-3)] hover:text-[var(--ink)] hover:bg-[var(--panel-2)] transition-colors"
            title="Fullscreen"
            aria-label="Toggle fullscreen"
            onClick={toggleFullscreen}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M2 6V2h4 M10 2h4v4 M14 10v4h-4 M6 14H2v-4" />
            </svg>
          </button>

          {/* the trash can: clears the whole board */}
          <button
            className="absolute top-3 right-3 z-10 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-2 text-[var(--ink-3)] hover:text-[var(--ink)] hover:bg-[var(--panel-2)] transition-colors"
            title="Clear the whole board"
            aria-label="Clear the whole board"
            onClick={clearBoard}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M2.5 4h11 M6.5 4V2.5h3V4 M4 4l.8 9.5a1 1 0 0 0 1 .9h4.4a1 1 0 0 0 1-.9L12 4 M6.5 6.8v4.7 M9.5 6.8v4.7" />
            </svg>
          </button>

          {circ.parts.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center text-sm text-[var(--ink-3)] px-8 leading-relaxed">
                <p className="font-medium text-[var(--ink-2)]">The board is empty.</p>
                <p>Drag in parts or a big build from the left panel.</p>
                {initialBuild && (
                  <button className="btn mt-3 pointer-events-auto" onClick={resetLesson}>
                    Rebuild this step&apos;s circuit
                  </button>
                )}
              </div>
            </div>
          )}

          {/* the see-inside panel: what THIS part is doing, live */}
          {(() => {
            if (!insideId) return null;
            const ip = circ.parts.find((pp) => pp.id === insideId);
            if (!ip) return null;
            const mat = microMaterial(ip.type);
            const def = CATALOG[ip.type];
            return (
              <div
                className="absolute top-3 right-3 bottom-3 z-30 w-80 max-w-[85%] overflow-y-auto rounded-xl border border-[var(--accent-dim)] p-4 text-[12.5px] leading-relaxed"
                style={{ background: "color-mix(in oklab, var(--panel) 88%, transparent)", backdropFilter: "blur(4px)" }}
              >
                <div className="flex items-center mb-2">
                  <span className="font-semibold text-[var(--ink)]">Inside the {def.label.toLowerCase()}</span>
                  <div className="flex-1" />
                  <button className="btn" style={{ border: "none" }} onClick={() => setInsideId(null)} aria-label="Close">
                    ✕
                  </button>
                </div>
                <div className="rounded-lg bg-[#0b1220] border border-[var(--line)] p-2 mb-3">
                  <svg width="100%" height="86" viewBox={`-10 -34 ${def.len + 20} 78`} preserveAspectRatio="xMidYMid meet">
                    <Glyph p={ip} L={def.len} />
                  </svg>
                </div>
                <p className="text-[var(--ink-2)] mb-2">{LEARN[ip.type]}</p>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--ink-3)] mb-1">
                  Zoomed to the atoms — {mat.title}
                </p>
                <p className="text-[var(--ink-2)] mb-2">{mat.atoms}</p>
                <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--ink-3)] mb-1">
                  And the electrons
                </p>
                <p className="text-[var(--ink-2)] mb-3">{mat.electrons}</p>
                <p
                  className="text-[11px] text-[var(--ink-3)] pt-2 border-t border-[var(--line)]"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  live right now: {fmtAmps(ip.current)} through it · {fmtVolts(ip.volts)} across it ·{" "}
                  {Math.round(ip.temp)} °C
                  {Math.abs(ip.current) < 0.002 ? " · no current — the electrons are just jiggling in place" : ""}
                </p>
              </div>
            );
          })()}

          {selected && (
            <Inspector
              part={selected}
              onDelete={() => deletePart(selected.id)}
              onInside={() => setInsideId(selected.id)}
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

// a miniature wiring diagram of a ready-made build, drawn from its real parts
function ModelPreview({ model }: { model: Model }) {
  const { frag, viewBox } = useMemo(() => {
    const frag = model.build(0, 0);
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (const v of frag.vertices) {
      x0 = Math.min(x0, v.x);
      y0 = Math.min(y0, v.y);
      x1 = Math.max(x1, v.x);
      y1 = Math.max(y1, v.y);
    }
    const pad = 40;
    return {
      frag,
      viewBox: `${x0 - pad} ${y0 - pad} ${x1 - x0 + pad * 2} ${y1 - y0 + pad * 2}`,
    };
  }, [model]);
  const vmap = new Map(frag.vertices.map((v) => [v.id, v]));
  return (
    <svg width="100%" height="52" viewBox={viewBox} preserveAspectRatio="xMidYMid meet" className="pointer-events-none">
      {frag.parts.map((p) => {
        const va = vmap.get(p.a);
        const vb = vmap.get(p.b);
        if (!va || !vb) return null;
        const L = Math.max(4, Math.hypot(vb.x - va.x, vb.y - va.y));
        const angle = (Math.atan2(vb.y - va.y, vb.x - va.x) * 180) / Math.PI;
        // fixed precision: server and client can disagree on atan2's last
        // decimal, which breaks hydration of these server-rendered previews
        return (
          <g key={p.id} transform={`translate(${va.x.toFixed(1)} ${va.y.toFixed(1)}) rotate(${angle.toFixed(2)})`}>
            <Glyph p={p} L={L} angle={angle} />
          </g>
        );
      })}
    </svg>
  );
}

function Inspector({
  part,
  onDelete,
  onInside,
  onClose,
  onFlip,
}: {
  part: Part;
  onDelete: () => void;
  onInside: () => void;
  onClose: () => void;
  onFlip: () => void;
}) {
  const def = CATALOG[part.type];
  const set = (fn: (p: Part) => void) => fn(part); // mutate; the frame loop re-renders

  return (
    <div
      className="absolute bottom-14 left-1/2 -translate-x-1/2 z-20 w-[300px] max-w-[92%] rounded-xl border border-[var(--line)] p-2.5 text-sm"
      style={{ background: "color-mix(in oklab, var(--panel) 74%, transparent)", backdropFilter: "blur(3px)" }}
    >
      <div className="flex items-center mb-2">
        <span className="font-semibold text-[var(--ink)]">{def.label}</span>
        <div className="flex-1" />
        <button className="btn mr-1" onClick={onInside} title="What's physically inside this part, and what it's doing right now">
          See inside
        </button>
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

          {part.type === "inductor" && (
            <>
              <SimSlider
                label={`Size: ${part.henries} henries`}
                min={0.5}
                max={10}
                step={0.5}
                value={part.henries}
                onChange={(v) => set((p) => (p.henries = v))}
              />
              <p className="text-[11px] text-[var(--ink-3)] mt-1">
                Bigger = fights harder against the current changing. Watch an ammeter next to it.
              </p>
            </>
          )}

          {(part.type === "coil" || part.type === "relay") && (
            <>
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-[12px] text-[var(--ink-2)] mr-1">Channel:</span>
                {[1, 2, 3, 4, 5, 6].map((ch) => (
                  <button
                    key={ch}
                    aria-pressed={part.channel === ch}
                    onClick={() => set((p) => (p.channel = ch))}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 700,
                      color: part.channel === ch ? "#0b1220" : CHANNEL_COLORS[ch],
                      background: part.channel === ch ? CHANNEL_COLORS[ch] : "transparent",
                      border: `2px solid ${CHANNEL_COLORS[ch]}`,
                      cursor: "pointer",
                    }}
                  >
                    {ch}
                  </button>
                ))}
              </div>
              {part.type === "coil" ? (
                <p className="text-[11px] text-[var(--ink-3)]">
                  Power this coil and every magnetic switch on channel {part.channel} flips.
                  {Math.abs(part.current) > 0.02 ? " It is magnetized right now." : " Not enough current to magnetize yet."}
                </p>
              ) : (
                <>
                  <div className="seg mb-2" role="group" aria-label="How the switch reacts to its coil">
                    <button
                      aria-pressed={!part.normallyClosed}
                      onClick={() => set((p) => (p.normallyClosed = false))}
                    >
                      Closes when coil is on
                    </button>
                    <button
                      aria-pressed={part.normallyClosed}
                      onClick={() => set((p) => (p.normallyClosed = true))}
                    >
                      Opens when coil is on
                    </button>
                  </div>
                  <p className="text-[11px] text-[var(--ink-3)]">
                    The &ldquo;opens&rdquo; kind is a NOT — that&apos;s the trick that makes real logic possible.
                    {part.engaged ? " Letting current through right now." : " Blocking right now."}
                  </p>
                </>
              )}
            </>
          )}

          {(part.type === "lightsensor" || part.type === "heatsensor") && (
            <p className="text-[11px] text-[var(--ink-3)]">
              {part.type === "lightsensor" ? "Light" : "Warmth"} landing on it:{" "}
              {Math.round(part.sense * 100)}%. Its resistance right now:{" "}
              {part.resistance >= 1000 ? `${Math.round(part.resistance / 1000)}k` : Math.round(part.resistance)}{" "}
              ohms. Move it closer to the {part.type === "lightsensor" ? "light" : "heat"} for a stronger
              reaction — distance matters a lot.
            </p>
          )}

          {part.type === "solar" && (
            <p className="text-[11px] text-[var(--ink-3)]">
              Light landing on it: {Math.round(part.sense * 100)}%, so it is pushing{" "}
              {fmtVolts(part.voltage)} right now. Park it close to a bright bulb.
            </p>
          )}

          {part.type === "voicebox" && (
            <>
              <label className="block text-[12px] text-[var(--ink-2)]">
                What it should say:
                <input
                  className="sim-input w-full mt-1"
                  maxLength={48}
                  value={part.text}
                  onChange={(e) => set((p) => (p.text = e.target.value))}
                />
              </label>
              <div className="flex items-center gap-2 mt-2">
                <button
                  className="btn btn-primary"
                  disabled={part.playing}
                  onClick={() =>
                    set((p) => {
                      p.playing = true;
                      p.playPos = 0;
                    })
                  }
                >
                  {part.playing ? "Speaking…" : "Speak"}
                </button>
                <span className="text-[11px] text-[var(--ink-3)]">
                  {Math.abs(part.current) > 0.02
                    ? "Powered and ready."
                    : "No power — it only talks while current flows through it."}
                </span>
              </div>
            </>
          )}

          {part.type === "calculator" && (
            <p className="text-[11px] text-[var(--ink-3)]">
              {def.hint} The panel below it shows every switch inside, live — zoom out (the Fit
              button) to see the whole thing.
            </p>
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

          {part.type === "chip" && (
            <>
              <label className="block text-[12px] text-[var(--ink-2)] mb-1">
                Its program (runs top to bottom, forever):
              </label>
              <textarea
                className="sim-input w-full h-28 resize-y"
                style={{ fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.5 }}
                value={part.text}
                spellCheck={false}
                onChange={(e) => {
                  part.text = e.target.value;
                  part.pc = 0;
                  part.chipWait = 0;
                  part.chipDrive = 0;
                }}
              />
              <p className="text-[11px] text-[var(--ink-3)] mt-1.5">
                Commands: <b>turn 3 on</b> / <b>turn 3 off</b> drives magnetic channel 3 (any
                magnetic switch tuned to it obeys) · <b>wait 0.5</b> pauses half a second ·{" "}
                <b>if 2 is on</b> … <b>end</b> reads a channel (wire a button + coil to make an
                input). Lines it doesn&apos;t understand are skipped.
              </p>
              <p className="text-[11px] mt-1" style={{ fontFamily: "var(--font-mono)" }}>
                {Math.abs(part.current) > 0.01 ? (
                  <span className="text-[var(--accent)]">
                    running · driving{" "}
                    {[1, 2, 3, 4, 5, 6].filter((ch) => part.chipDrive & (1 << ch)).join(", ") || "nothing"}
                  </span>
                ) : (
                  <span className="text-[var(--ink-3)]">no power — the program is stopped</span>
                )}
              </p>
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
            part.type === "outlet" ||
            part.type === "buzzer" ||
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
