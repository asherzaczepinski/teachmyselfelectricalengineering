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
  Circuit,
  LETTER_SECONDS,
  Part,
  PartType,
  PHONE_DEFAULT,
  PHONES,
  Vertex,
  createPart,
  enforceLengths,
  partsAtVertex,
  stepCircuit,
  uid,
  vertexById,
} from "../../lib/sim";
import { GUIDES } from "../../lib/guides";
import { DRAWERS, DrawerItem, microMaterial, explainSymbols } from "./content";
import { Glyph } from "./Glyph";
import { Inspector } from "./Inspector";
import { OrientationBall } from "./OrientationBall";
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
  | { kind: "marquee"; x0: number; y0: number; x1: number; y1: number }
  | { kind: "pan"; lastX: number; lastY: number }
  | { kind: "group"; lastX: number; lastY: number }
  | { kind: "rotate"; midX: number; midY: number; grabA: number; orig: { id: string; x: number; y: number }[] }
  | { kind: "orbit"; lastX: number; lastY: number };

const SOLDER_MS = 850; // hold a dot on a dot this long and it fuses
const POLAR_MAX = 1.52; // radians from straight-down: almost fully horizontal

// a little soldering-iron cursor for when you're about to fuse a joint
const IRON_CURSOR = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'28\' height=\'28\'><path d=\'M3 25 L14 14\' stroke=\'%23b9c2cf\' stroke-width=\'3\' stroke-linecap=\'round\'/><path d=\'M13 15 L21 7\' stroke=\'%231c2230\' stroke-width=\'6\' stroke-linecap=\'round\'/><circle cx=\'3\' cy=\'25\' r=\'2.4\' fill=\'%23ffd83d\'/></svg>'
)}") 3 25, crosshair`;

// what the letters and symbols on the board mean, in plain words
type Particle = BoardParticle;

function clamp(v: number, lo: number, hi: number) {
  return Math.min(Math.max(v, lo), hi);
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


export { LEARN, TOOLBOX } from "./content";

function previewPart(type: PartType): Part {
  const part: Part = { id: `prev-${type}`, a: "_a", b: "_b", ...blankPart(type) };
  part.closed = true; // previews look best conducting
  return part;
}

interface CircuitLabProps {
  // the circuit that loads on mount and on "Reset"
  initialBuild?: (cx: number, cy: number) => Circuit;
  onHelp?: () => void;
}

export default function CircuitLab({ initialBuild, onHelp }: CircuitLabProps) {
  const circuitRef = useRef<Circuit>({ vertices: [], parts: [] });
  const dragRef = useRef<Drag | null>(null);
  const snapHintRef = useRef<string | null>(null);
  const boardDivRef = useRef<HTMLDivElement>(null);
  const sizeRef = useRef({ w: 1200, h: 700 });
  // polar a touch under the old 0.6 = the camera starts a tiny bit higher
  const camRef = useRef<CamState>({ tx: 600, ty: 360, tz: 0, dist: 900, azim: 0, polar: 0.52 });
  const apiRef = useRef<BoardApi | null>(null);
  const uiRef = useRef<UIState>({
    selectedId: null,
    selectedIds: [],
    snapHintId: null,
    handle: null,
    degrees: new Map(),
    electronView: false,
    showAmps: true,
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
  const momentumRef = useRef({ vx: 0, vy: 0, vaz: 0, vpol: 0 });

  const [, setFrame] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [vertexMenu, setVertexMenu] = useState<string | null>(null);
  // "select" lets you grab and rewire parts; "hand" only moves the view,
  // so you can't knock your circuit apart by accident
  const toolMode = "hand" as "select" | "hand"; // one mode: parts drag directly, empty board moves the view
  // which story the moving dots tell: Franklin's current or the real electrons
  const [electronView, setElectronView] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedIdsRef = useRef(selectedIds);
  selectedIdsRef.current = selectedIds;
  const [infoToast, setInfoToast] = useState<string | null>(null);
  // while the window is being resized, cover the canvas with the last good
  // frame + a spinner instead of letting the user watch it stutter
  const [resizeSnap, setResizeSnap] = useState<string | null>(null);

  const [showParts, setShowParts] = useState(false);
  const showPartsRef = useRef(false);
  showPartsRef.current = showParts;
  const [nukeAsk, setNukeAsk] = useState(false);
  const resizeTimerRef = useRef<number | null>(null);
  const infoTimerRef = useRef<number | null>(null);
  const showInfo = useCallback((text: string) => {
    setInfoToast(text);
    if (infoTimerRef.current) window.clearTimeout(infoTimerRef.current);
    infoTimerRef.current = window.setTimeout(() => setInfoToast(null), 4500);
  }, []);
  const [symbolTip, setSymbolTip] = useState<{ x: number; y: number; lines: string[] } | null>(null);
  // readings come from real meters; the amps overlay is an opt-in x-ray
  const toolModeRef = useRef(toolMode);
  toolModeRef.current = toolMode;

  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const soundOnRef = useRef(true); // sound is always on

  // undo: snapshots taken before every board-changing action
  const historyRef = useRef<string[]>([]);
  const redoRef = useRef<string[]>([]);
  const pushHistory = useCallback(() => {
    const snap = JSON.stringify(circuitRef.current);
    const h = historyRef.current;
    redoRef.current = []; // a fresh edit erases the redo future
    if (h[h.length - 1] === snap) return;
    h.push(snap);
    if (h.length > 60) h.shift();
  }, []);
  const undo = useCallback(() => {
    const raw = historyRef.current.pop();
    if (!raw) return;
    try {
      redoRef.current.push(JSON.stringify(circuitRef.current));
      circuitRef.current = JSON.parse(raw) as Circuit;
      particlesRef.current = [];
      setSelectedId(null);
      setVertexMenu(null);
    } catch {}
  }, []);

  const redo = useCallback(() => {
    const raw = redoRef.current.pop();
    if (!raw) return;
    try {
      historyRef.current.push(JSON.stringify(circuitRef.current));
      circuitRef.current = JSON.parse(raw) as Circuit;
      particlesRef.current = [];
      setSelectedId(null);
      setVertexMenu(null);
    } catch {}
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
      // released drags coast: the camera glides to a stop instead of freezing
      if (!dragRef.current) {
        const mom = momentumRef.current;
        const cam = camRef.current;
        if (Math.abs(mom.vx) > 0.02 || Math.abs(mom.vy) > 0.02) {
          cam.tx += mom.vx;
          cam.ty += mom.vy;
          clampCam();
        }
        if (Math.abs(mom.vaz) > 0.00005 || Math.abs(mom.vpol) > 0.00005) {
          cam.azim += mom.vaz;
          cam.polar = clamp(cam.polar + mom.vpol, 0.05, POLAR_MAX);
        }
        mom.vx *= 0.9;
        mom.vy *= 0.9;
        mom.vaz *= 0.88;
        mom.vpol *= 0.88;
      }
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

  useEffect(() => {
    const onResize = () => {
      setResizeSnap((cur) => cur ?? apiRef.current?.snapshot() ?? "");
      if (resizeTimerRef.current) window.clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = window.setTimeout(() => setResizeSnap(null), 380);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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
    c.polar = clamp(c.polar, 0.05, POLAR_MAX);
    c.dist = clamp(c.dist, 26, 18000);
    // the plane is endless, but the view stays within shouting distance of
    // the work so nobody gets lost in the blue
    c.tx = clamp(c.tx, -30000, 30000);
    c.ty = clamp(c.ty, -30000, 30000);
    // ...and climb from the mat up past the monitor's top, but no higher
    c.tz = clamp(c.tz, 0, 3600);
  }, []);

  useEffect(() => {
    const host = boardDivRef.current;
    if (!host) return;
    const onWheel = (e: WheelEvent) => {
      // wheel over HTML (the parts panel, the inspector…) scrolls THAT, and
      // an open parts panel freezes the 3D zoom entirely
      if (showPartsRef.current || !(e.target instanceof HTMLCanvasElement)) return;
      // Scrolling dollies toward the cursor. Keep going and you pass into
      // the microscope: molecules, then the actual electrons.
      e.preventDefault();
      const cam = camRef.current;
      const f = Math.exp(e.deltaY * 0.0016);
      cam.dist = clamp(cam.dist * f, 26, 18000);
      if (f < 1) {
        // zooming in leans gently toward whatever is actually under the
        // cursor — the monitor face, a drawer front, a part — lifting the
        // orbit pivot up to it, the way Unity's scene view dollies. A soft
        // pull, not a lurch, so it never feels like it grabs the view.
        const hit = apiRef.current?.pointUnder(e.clientX, e.clientY);
        const under = hit ?? apiRef.current?.toWorld(e.clientX, e.clientY);
        if (under) {
          const ax = clamp(under.x, -30000, 30000);
          const ay = clamp(under.y, -30000, 30000);
          const az = clamp(hit?.z ?? 0, 0, 3600);
          const pull = 0.55 * (1 - f);
          cam.tx += (ax - cam.tx) * pull;
          cam.ty += (ay - cam.ty) * pull;
          cam.tz += (az - cam.tz) * pull;
        }
      } else {
        // zooming out: keep looking at what you were working on until you're
        // properly high up — only then drift home over the table's center
        const homing = clamp((cam.dist - 6500) / 6500, 0, 1);
        if (homing > 0) {
          cam.tx += (BENCH.cx - cam.tx) * (1 - 1 / f) * homing;
          cam.ty += (BENCH.cy - cam.ty) * (1 - 1 / f) * homing;
          cam.tz += (0 - cam.tz) * (1 - 1 / f) * homing;
        }
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
    cam.tz = 0; // framing the circuit brings the pivot back down to the mat
    cam.dist = clamp(Math.max(bh / (2 * tanV), bw / (2 * tanV * aspect)) * 1.12, 200, 18000);
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
      v.x = clamp(v.x, -60000, 60000);
      v.y = clamp(v.y, -60000, 60000);
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
      const dAz = -(e.clientX - drag.lastX) * 0.005;
      const dPol = -(e.clientY - drag.lastY) * 0.004;
      cam.azim += dAz;
      // shift-drag up tilts the camera down toward the horizon, drag down
      // brings it overhead — the direction the user expects
      cam.polar = clamp(cam.polar + dPol, 0.05, POLAR_MAX);
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      const mom = momentumRef.current;
      mom.vaz = mom.vaz * 0.7 + dAz * 0.3;
      mom.vpol = mom.vpol * 0.7 + dPol * 0.3;
      clampCam();
      return;
    }
    if (drag.kind === "pan") {
      // both rays from the same camera — an honest delta while the camera eases
      const cam = camRef.current;
      const wPrev = toWorld({ clientX: drag.lastX, clientY: drag.lastY });
      const wNow = toWorld(e);
      cam.tx -= wNow.x - wPrev.x;
      cam.ty -= wNow.y - wPrev.y;
      const mom = momentumRef.current;
      mom.vx = mom.vx * 0.7 + (wPrev.x - wNow.x) * 0.3;
      mom.vy = mom.vy * 0.7 + (wPrev.y - wNow.y) * 0.3;
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      clampCam();
      return;
    }
    if (drag.kind === "rotate") {
      const circR = circuitRef.current;
      const w = toWorld(e);
      const d = Math.atan2(w.y - drag.midY, w.x - drag.midX) - drag.grabA;
      const c = Math.cos(d);
      const sn = Math.sin(d);
      for (const o of drag.orig) {
        const v = vertexById(circR, o.id);
        if (!v) continue;
        v.x = drag.midX + (o.x - drag.midX) * c - (o.y - drag.midY) * sn;
        v.y = drag.midY + (o.x - drag.midX) * sn + (o.y - drag.midY) * c;
      }
      return;
    }
    if (drag.kind === "group") {
      // both rays from the same camera — an honest delta while the camera eases
      const wPrev = toWorld({ clientX: drag.lastX, clientY: drag.lastY });
      const wNow = toWorld(e);
      const gdx = wNow.x - wPrev.x;
      const gdy = wNow.y - wPrev.y;
      drag.lastX = e.clientX;
      drag.lastY = e.clientY;
      const movedVs = new Set<string>();
      for (const pid of selectedIdsRef.current) {
        const gp = circ.parts.find((pp) => pp.id === pid);
        if (!gp) continue;
        for (const vid of [gp.a, gp.b]) {
          if (movedVs.has(vid)) continue;
          movedVs.add(vid);
          const v = vertexById(circ, vid);
          if (v) {
            v.x += gdx;
            v.y += gdy;
          }
        }
      }
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
      // joint-dragging: the dragged joint goes exactly where the mouse goes.
      // Wires stretch to meet it; rigid parts (battery, bulb…) get TOWED
      // along behind it instead of bolting the joint in place.
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
    if (!drag || drag.kind === "orbit" || drag.kind === "pan") return;
    if (drag.kind === "group" || drag.kind === "rotate") {
      clampAll(circuitRef.current);
      enforceLengths(circuitRef.current, new Set());
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
        } else if (part.type === "chip") {
          // near the dock? snap in and power up straight from the PC
          const va2 = vertexById(circ, part.a);
          const vb2 = vertexById(circ, part.b);
          if (va2 && vb2) {
            const mx = (va2.x + vb2.x) / 2;
            const my = (va2.y + vb2.y) / 2;
            if (Math.hypot(mx - -160, my - -750) < 300) {
              va2.x = -160 - 55;
              va2.y = -750;
              vb2.x = -160 + 55;
              vb2.y = -750;
              if (!part.pressed) {
                part.pressed = true;
                showInfo("Chip docked — powered straight from the PC. Click it (or the computer) to program it.");
              }
            } else if (part.pressed) {
              part.pressed = false;
              showInfo("Chip unplugged from the dock — it needs wired power now.");
            }
          }
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




  // every press on the 3D board lands here: raycast, then route
  const onBoardPointerDown = useCallback(
    (e: React.PointerEvent) => {
      ensureAudio();
      momentumRef.current = { vx: 0, vy: 0, vaz: 0, vpol: 0 };
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
      if (pk.kind === "rotate") {
        // spin the WHOLE machine around its own center, shape intact
        const part = circ.parts.find((pp) => pp.id === uiRef.current.selectedId);
        if (part) {
          const vids = [...new Set(collectGroup(circ, part))];
          const orig = vids
            .map((vid) => vertexById(circ, vid))
            .filter((v): v is Vertex => !!v)
            .map((v) => ({ id: v.id, x: v.x, y: v.y }));
          if (orig.length) {
            const midX = orig.reduce((a, o) => a + o.x, 0) / orig.length;
            const midY = orig.reduce((a, o) => a + o.y, 0) / orig.length;
            pushHistory();
            const w = toWorld(e);
            dragRef.current = { kind: "rotate", midX, midY, grabA: Math.atan2(w.y - midY, w.x - midX), orig };
          }
        }
        return;
      }
      // the parts panel melts away when you click anywhere else
      setShowParts(false);
      if (pk.kind === "action") {
        if (pk.action === "guide") onHelp?.();
        if (pk.action === "undo") undo();
        if (pk.action === "reset") setNukeAsk(true);
        return;
      }
      // parts and their end-dots always drag directly, whatever the tool mode
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
      if (toolModeRef.current === "hand") {
        setSelectedId(null);
        setSelectedIds([]);
        setVertexMenu(null);
        // dragging empty ground slides the view; shift/right-drag or the
        // orientation ball rotate it
        dragRef.current = pk.kind === "bg"
          ? { kind: "pan", lastX: e.clientX, lastY: e.clientY }
          : { kind: "orbit", lastX: e.clientX, lastY: e.clientY };
        return;
      }
      setVertexMenu(null);
      // grabbing inside the region frame moves the whole selection
      const many = selectedIdsRef.current;
      if (many.length > 1 && pk.kind === "bg") {
        let gx0 = Infinity, gy0 = Infinity, gx1 = -Infinity, gy1 = -Infinity;
        for (const pid of many) {
          const gp = circ.parts.find((pp) => pp.id === pid);
          if (!gp) continue;
          for (const vid of [gp.a, gp.b]) {
            const v = vertexById(circ, vid);
            if (!v) continue;
            gx0 = Math.min(gx0, v.x);
            gy0 = Math.min(gy0, v.y);
            gx1 = Math.max(gx1, v.x);
            gy1 = Math.max(gy1, v.y);
          }
        }
        const gpad = 55;
        if (pk.x >= gx0 - gpad && pk.x <= gx1 + gpad && pk.y >= gy0 - gpad && pk.y <= gy1 + gpad) {
          pushHistory();
          dragRef.current = { kind: "group", lastX: e.clientX, lastY: e.clientY };
          return;
        }
      }
      setSelectedId(null);
      setSelectedIds([]);
      // select mode: dragging empty board sweeps a region you can then drag around
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
    (item: DrawerItem, e: React.PointerEvent) => {
      e.preventDefault();
      ensureAudio();
      pushHistory();
      const circ = circuitRef.current;
      const { x, y } = toWorld(e);
      const type = item.type;
      const part = createPart(type, x, y, circ);
      if (item.preset) Object.assign(part, item.preset);
      if (type === "button") {
        const used = new Set(circ.parts.filter((p) => p.type === "button").map((p) => p.key));
        part.key = [...KEY_POOL].find((k) => !used.has(k)) ?? "a";
      }
      setSelectedId(null); // no explainer box on spawn — just drag it
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
    // the whole attached machine goes, not just the one part
    const start = circ.parts.find((p) => p.id === id);
    const doomedV = new Set<string>(start ? collectGroup(circ, start) : []);
    circ.parts = circ.parts.filter((p) => !(doomedV.has(p.a) || doomedV.has(p.b) || p.id === id));
    const used = new Set<string>();
    for (const p of circ.parts) {
      used.add(p.a);
      used.add(p.b);
    }
    circ.vertices = circ.vertices.filter((v) => used.has(v.id));
    setSelectedId(null);
  }, [collectGroup, pushHistory]);

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
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "z") {
        e.preventDefault();
        redo();
        return;
      }
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
    showAmps: true,
    showLabels: true,
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

  const previews = useMemo(() => {
    const m = new Map<PartType, Part>();
    for (const d of DRAWERS) for (const it of d.items) if (!m.has(it.type)) m.set(it.type, previewPart(it.type));
    return m;
  }, []);

  return (
    <div
      className="h-full w-full flex flex-col bg-[var(--bg)] text-[var(--ink)] select-none overflow-hidden"
      onPointerDown={ensureAudio}
    >
      {/* the shelf floats OVER the board (never resizes the canvas — a resize
          used to trigger the freeze-frame overlay, which read as a blackout) */}
      <div className="relative flex flex-1 min-h-0">
        {/* parts + controls live in the dock on the right */}

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
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 w-[520px] max-w-[92%] border border-[var(--accent-dim)] bg-[var(--panel)] p-4 text-[13px] leading-relaxed pointer-events-none">
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
                className="absolute z-20 -translate-x-1/2 border border-[var(--line)] bg-[var(--panel)] p-2 shadow-2xl"
                style={{ left: sx, top: sy - 62 }}
              >
                <div className="text-[11px] text-[var(--ink-3)] px-1 pb-1.5 text-center">
                  {n} things joined at this connector
                </div>
                <div className="flex justify-center">
                  <button
                    className="btn btn-danger"
                    title="Unattach — everything joined here comes loose (click anywhere else to keep)"
                    aria-label="Unattach"
                    onClick={() => {
                      splitVertex(v.id);
                      setVertexMenu(null);
                      showInfo("Unattached — the ends are loose again.");
                    }}
                  >
                    ✕ Unattach
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
                className="absolute z-20 pointer-events-none "
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
              className="absolute z-30 max-w-[300px] px-3 py-2 text-[11.5px] leading-relaxed text-[var(--ink)] pointer-events-none"
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
            <div
              key={infoToast}
              className="toast-fade absolute top-3 left-1/2 -translate-x-1/2 z-30 border border-[var(--line)] bg-[var(--panel)] px-4 py-2 text-xs text-[var(--ink)]">
              {infoToast}
            </div>
          )}





          {nukeAsk && (
            <div className="absolute inset-0 z-40 flex items-center justify-center" style={{ background: "rgba(6,10,18,0.45)" }}>
              <div className="border border-[var(--danger-dim)] bg-[var(--panel)] p-4 w-[320px] text-sm">
                <p className="font-semibold text-[var(--ink)] mb-1">Clear the whole bench?</p>
                <p className="text-[12.5px] text-[var(--ink-2)] mb-3">
                  Every part and wire goes in the trash. Cmd/Ctrl+Z can still bring it back.
                </p>
                <div className="flex gap-2 justify-end">
                  <button className="btn" onClick={() => setNukeAsk(false)}>
                    Keep it
                  </button>
                  <button
                    className="btn btn-danger"
                    onClick={() => {
                      clearBoard();
                      setNukeAsk(false);
                    }}
                  >
                    Clear everything
                  </button>
                </div>
              </div>
            </div>
          )}

          {resizeSnap !== null && (
            <div className="absolute inset-0 z-40 bg-[var(--bg)]">
              {resizeSnap && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={resizeSnap} alt="" className="w-full h-full object-cover" draggable={false} />
              )}
              <div className="absolute inset-0 flex items-center justify-center">
                <div
                  className="animate-spin"
                  style={{ width: 30, height: 30, border: "3px solid var(--accent)", borderTopColor: "transparent" }}
                  aria-label="Resizing"
                />
              </div>
            </div>
          )}


          {/* the dock: a handful of translucent buttons on the right */}
          <aside
            className="absolute top-3 right-3 z-30 w-28 border border-[var(--line)] p-1 flex flex-col gap-1"
            style={{ background: "color-mix(in oklab, var(--panel) 68%, transparent)", backdropFilter: "blur(6px)" }}
          >
            <button
              className="btn w-full"
              aria-pressed={showParts}
              title="Every part in the shop, all at once"
              onClick={() => setShowParts((v) => !v)}
            >
              Parts
            </button>
            <button className="btn w-full" title="How it all works" onClick={() => onHelp?.()}>
              Guide
            </button>
            <button
              className="btn w-full"
              title={
                electronView
                  ? "Back to current flowing + to − : the direction Ben Franklin decided on"
                  : "See the electrons themselves — they really drift the OTHER way"
              }
              onClick={() => {
                const toElectrons = !electronView;
                setElectronView(toElectrons);
                if (!circuitRef.current.parts.some((p) => Math.abs(p.current) > 0.002))
                  showInfo(
                    toElectrons
                      ? "No current is flowing yet — close a loop and the blue electron dots will drift (the real way: − to +)."
                      : "No current is flowing yet — close a loop and the yellow dots will show it."
                  );
              }}
            >
              {electronView ? "Show current" : "Show electrons"}
            </button>
            <button className="btn btn-danger w-full" title="Clear the whole bench" onClick={() => setNukeAsk(true)}>
              Clear bench
            </button>
          </aside>

          {/* every part at once, laid out flat — no drawers, no scrolling.
              Grabbing one closes the panel so the drag lands on the board. */}
          {showParts && (
            <div
              className="panel-appear absolute top-3 right-36 z-30 border border-[var(--line)] p-3 overflow-y-auto"
              style={{
                background: "color-mix(in oklab, var(--panel) 84%, transparent)",
                backdropFilter: "blur(6px)",
                maxWidth: "calc(100vw - 15rem)",
                maxHeight: "calc(100% - 1.5rem)",
              }}
            >
              <div className="flex items-center mb-2">
                <span className="text-[11px] uppercase tracking-widest text-[var(--ink-3)]">Every part in the shop</span>
                <div className="flex-1" />
                <button className="btn" style={{ border: "none" }} onClick={() => setShowParts(false)} aria-label="Close">
                  ✕
                </button>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-3">
                {DRAWERS.map((d) => (
                  <div key={d.key} className="w-40">
                    <h4 className="text-[10px] uppercase tracking-widest text-[var(--ink-3)] mb-1">{d.title}</h4>
                    <div className="flex flex-col gap-0.5">
                      {d.items.map((item, i) => {
                        const def = CATALOG[item.type];
                        const prev = previews.get(item.type)!;
                        return (
                          <button
                            key={`${item.type}-${i}`}
                            className="flex items-center gap-1.5 px-1 py-0.5 text-left border border-transparent hover:border-[var(--line)]"
                            onPointerDown={(e) => {
                              setShowParts(false);
                              spawnFromToolbox(item, e);
                            }}
                            title={def.hint}
                          >
                            <svg
                              width="44"
                              height="20"
                              viewBox={`-8 -22 ${def.len + 16} 44`}
                              preserveAspectRatio="xMidYMid meet"
                              className="pointer-events-none shrink-0"
                            >
                              <Glyph p={prev} L={def.len} />
                            </svg>
                            <span className="text-[10.5px] text-[var(--ink-2)] leading-tight">{item.name ?? def.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <OrientationBall
            camRef={camRef}
            onGrab={(e) => {
              momentumRef.current = { vx: 0, vy: 0, vaz: 0, vpol: 0 };
              dragRef.current = { kind: "orbit", lastX: e.clientX, lastY: e.clientY };
            }}
          />



          {circ.parts.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center text-sm text-[var(--ink-3)] px-8 leading-relaxed">
                <p className="font-medium text-[var(--ink-2)]">The board is empty.</p>
                <p>Open a parts drawer on the right and drag something in.</p>
              </div>
            </div>
          )}



          {selected && selected.type !== "wire" && (
            <Inspector
              part={selected}
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

