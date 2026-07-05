// Circuit engine: every part is a two-ended element between two vertices.
// Each frame we rebuild a conductance matrix (nodal analysis), solve it,
// and use the answer to drive current, light, heat, sound, motion — and
// consequences (blown fuses, exploded parts).

export type PartType =
  | "wire"
  | "battery"
  | "outlet"
  | "resistor"
  | "bulb"
  | "switch"
  | "button"
  | "blinker"
  | "fuse"
  | "capacitor"
  | "inductor"
  | "led"
  | "diode"
  | "segment"
  | "speaker"
  | "buzzer"
  | "voicebox"
  | "calculator"
  | "chip"
  | "usbc"
  | "memory"
  | "motor"
  | "coil"
  | "relay"
  | "lightsensor"
  | "heatsensor"
  | "solar"
  | "heater"
  | "hairdryer"
  | "ammeter"
  | "voltmeter"
  | "coin"
  | "eraser"
  | "hand";

export type LedColor = "red" | "amber" | "green" | "blue" | "white" | "purple";
export type MotorAttachment = "fan" | "wheel" | "propeller" | "winch";
export type SpeakerMode = "note" | "volts";

export interface PartDef {
  label: string;
  hint: string; // plain-words description shown in the toolbox
  len: number; // distance between the two end dots, in pixels
  rigid: boolean; // rigid parts keep their length; wires stretch
  category: "Build" | "Inputs & sound" | "Logic & sensors" | "Measure" | "Real things";
  resistance: number; // ohms — how hard it is for current to get through
  voltage?: number; // battery push, in volts
  capacitance?: number; // farads
  maxAmps?: number; // fuse melts above this many amps
  heatK: number; // watts of cooling per degree above room temperature
  heatMass: number; // joules needed to warm it by one degree
  explodeAt: number; // °C at which the part blows apart (Infinity = never)
  minR?: number;
  maxR?: number; // slider range when resistance is editable
}

export const ROOM_TEMP = 25;
export const WIRE_R = 0.01;
export const BATTERY_INTERNAL_R = 0.05;
export const LED_DROP = 2; // volts an LED eats before it lights
export const LED_ON_R = 5;
export const DIODE_DROP = 0.7;
export const DIODE_ON_R = 2;
export const CAP_MAX_VOLTS = 60; // capacitors pop above this
const GMIN = 1e-9; // tiny leak to ground so the math never divides by zero
export const LETTER_SECONDS = 0.19; // how long a talking machine spends per letter

// How each letter is mouthed, Voder-style: vowels are a buzz shaped by two
// resonant frequencies (f1/f2 — real measured vowel formants), hisses are
// filtered noise, plosives are a short burst then silence.
export interface Phone {
  f1: number;
  f2: number;
  v: number; // how much voiced buzz
  nf: number; // noise filter center
  n: number; // how much noise
  burst?: boolean; // plosive: sound only at the start of the letter
}
export const PHONE_DEFAULT: Phone = { f1: 500, f2: 1500, v: 0.6, nf: 3000, n: 0.2 };
export const PHONES: Record<string, Phone> = {
  a: { f1: 750, f2: 1200, v: 1, nf: 0, n: 0 },
  e: { f1: 530, f2: 1900, v: 1, nf: 0, n: 0 },
  i: { f1: 320, f2: 2300, v: 1, nf: 0, n: 0 },
  o: { f1: 500, f2: 900, v: 1, nf: 0, n: 0 },
  u: { f1: 350, f2: 800, v: 1, nf: 0, n: 0 },
  y: { f1: 320, f2: 2200, v: 0.9, nf: 0, n: 0 },
  w: { f1: 350, f2: 750, v: 0.9, nf: 0, n: 0 },
  m: { f1: 280, f2: 1100, v: 0.6, nf: 0, n: 0 },
  n: { f1: 300, f2: 1400, v: 0.6, nf: 0, n: 0 },
  l: { f1: 400, f2: 1300, v: 0.9, nf: 0, n: 0 },
  r: { f1: 420, f2: 1300, v: 0.9, nf: 0, n: 0 },
  s: { f1: 0, f2: 0, v: 0, nf: 5500, n: 1 },
  z: { f1: 300, f2: 1500, v: 0.4, nf: 5000, n: 0.7 },
  c: { f1: 0, f2: 0, v: 0, nf: 5000, n: 0.9 },
  x: { f1: 0, f2: 0, v: 0, nf: 4500, n: 0.9 },
  f: { f1: 0, f2: 0, v: 0, nf: 2800, n: 0.8 },
  v: { f1: 300, f2: 1200, v: 0.4, nf: 2800, n: 0.5 },
  h: { f1: 0, f2: 0, v: 0, nf: 1500, n: 0.6 },
  j: { f1: 300, f2: 2000, v: 0.4, nf: 3200, n: 0.6 },
  p: { f1: 0, f2: 0, v: 0, nf: 1000, n: 1, burst: true },
  b: { f1: 300, f2: 900, v: 0.5, nf: 1000, n: 0.6, burst: true },
  t: { f1: 0, f2: 0, v: 0, nf: 4200, n: 1, burst: true },
  d: { f1: 300, f2: 1600, v: 0.5, nf: 4000, n: 0.6, burst: true },
  k: { f1: 0, f2: 0, v: 0, nf: 2400, n: 1, burst: true },
  g: { f1: 300, f2: 1300, v: 0.5, nf: 2400, n: 0.6, burst: true },
  q: { f1: 0, f2: 0, v: 0, nf: 2400, n: 1, burst: true },
  " ": { f1: 0, f2: 0, v: 0, nf: 0, n: 0 },
};

export const NOTES: { name: string; hz: number }[] = [
  { name: "C", hz: 261.63 },
  { name: "D", hz: 293.66 },
  { name: "E", hz: 329.63 },
  { name: "F", hz: 349.23 },
  { name: "G", hz: 392.0 },
  { name: "A", hz: 440.0 },
  { name: "B", hz: 493.88 },
  { name: "C high", hz: 523.25 },
];

// the microchip's tiny language: one command per line.
//   turn 3 on / turn 3 off   — drive magnetic channel 3 (like a built-in coil)
//   wait 0.5                 — pause that many seconds
//   if 2 is on … end         — only run the middle if channel 2 is active
// the program repeats from the top forever, like real firmware.
export const DEFAULT_CHIP_PROGRAM = `turn 1 on
wait 0.5
turn 1 off
wait 0.5`;

interface ChipOp {
  kind: "set" | "wait" | "if" | "end";
  ch?: number;
  on?: boolean;
  s?: number;
  skipTo?: number;
}
const progCache = new Map<string, ChipOp[]>();
function parseProgram(src: string): ChipOp[] {
  const hit = progCache.get(src);
  if (hit) return hit;
  const ops: ChipOp[] = [];
  for (const raw of src.split("\n")) {
    const l = raw.trim().toLowerCase();
    if (!l || l.startsWith("#")) continue;
    let m: RegExpMatchArray | null;
    if ((m = l.match(/^turn\s+([1-6])\s+(on|off)$/))) ops.push({ kind: "set", ch: +m[1], on: m[2] === "on" });
    else if ((m = l.match(/^wait\s+([\d.]+)$/)))
      ops.push({ kind: "wait", s: Math.max(0.05, parseFloat(m[1]) || 0.5) });
    else if ((m = l.match(/^if\s+([1-6])\s+is\s+(on|off)$/))) ops.push({ kind: "if", ch: +m[1], on: m[2] === "on" });
    else if (l === "end") ops.push({ kind: "end" });
    // anything else is ignored — forgiving for first-time programmers
  }
  const stack: number[] = [];
  ops.forEach((op, i) => {
    if (op.kind === "if") stack.push(i);
    else if (op.kind === "end" && stack.length) ops[stack.pop()!].skipTo = i;
  });
  if (progCache.size > 300) progCache.clear();
  progCache.set(src, ops);
  return ops;
}

export const COIL_PULL_IN_AMPS = 0.02; // a coil needs this much current to grab its switches
export const CHANNEL_COLORS: Record<number, string> = {
  1: "#fbbf24",
  2: "#38bdf8",
  3: "#4ade80",
  4: "#f472b6",
  5: "#c084fc",
  6: "#f87171",
};

export const LED_COLORS: Record<LedColor, string> = {
  red: "#ff5a49",
  amber: "#ffb020",
  green: "#4ade80",
  blue: "#5aa9ff",
  white: "#f4f6ff",
  purple: "#c084fc",
};

export const CATALOG: Record<PartType, PartDef> = {
  wire: {
    label: "Wire",
    hint: "Connects things. Stretches as long as you want.",
    len: 100,
    rigid: false,
    category: "Build",
    resistance: WIRE_R,
    heatK: 1.5,
    heatMass: 20,
    explodeAt: 700,
  },
  battery: {
    label: "Battery",
    hint: "Pushes current around the loop. Goes up to 120 volts.",
    len: 110,
    rigid: true,
    category: "Build",
    resistance: BATTERY_INTERNAL_R,
    voltage: 9,
    heatK: 2.5,
    heatMass: 150,
    explodeAt: 420,
  },
  outlet: {
    label: "Wall plug",
    hint: "Pretend wall outlet — a steady 120 volt push. Respect it.",
    len: 110,
    rigid: true,
    category: "Build",
    resistance: 0.02,
    voltage: 120,
    heatK: 5,
    heatMass: 500,
    explodeAt: 1000,
  },
  usbc: {
    label: "USB-C power",
    hint: "Five steady volts from a phone charger — the modern bench power source.",
    len: 100,
    rigid: true,
    category: "Build",
    resistance: 0.1,
    voltage: 5,
    heatK: 2,
    heatMass: 80,
    explodeAt: 500,
  },
  switch: {
    label: "Switch",
    hint: "Click it to open or close the circuit.",
    len: 100,
    rigid: true,
    category: "Build",
    resistance: 0.005,
    heatK: 1,
    heatMass: 30,
    explodeAt: 550,
  },
  resistor: {
    label: "Resistor",
    hint: "Slows the current down. Drag the slider to change it.",
    len: 110,
    rigid: true,
    category: "Build",
    resistance: 10,
    minR: 1,
    maxR: 1000,
    heatK: 0.05,
    heatMass: 8,
    explodeAt: 380,
  },
  bulb: {
    label: "Light bulb",
    hint: "Glows brighter when more power flows through it.",
    len: 95,
    rigid: true,
    category: "Build",
    resistance: 10,
    minR: 5,
    maxR: 200,
    heatK: 0.08,
    heatMass: 12,
    explodeAt: 600,
  },
  led: {
    label: "LED",
    hint: "A little colored light. Only works one way around.",
    len: 90,
    rigid: true,
    category: "Build",
    resistance: LED_ON_R,
    heatK: 0.05,
    heatMass: 5,
    explodeAt: 320,
  },
  diode: {
    label: "Diode",
    hint: "A one-way street for current. No light, just direction.",
    len: 90,
    rigid: true,
    category: "Build",
    resistance: DIODE_ON_R,
    heatK: 0.05,
    heatMass: 6,
    explodeAt: 330,
  },
  segment: {
    label: "Display strip",
    hint: "One glowing bar of a digital number. Seven of them make the classic 8.",
    len: 90,
    rigid: true,
    category: "Build",
    resistance: 100,
    heatK: 0.15,
    heatMass: 10,
    explodeAt: 350,
  },
  capacitor: {
    label: "Capacitor",
    hint: "Stores charge, then gives it back. Pops above 60 volts!",
    len: 95,
    rigid: true,
    category: "Build",
    resistance: 0,
    capacitance: 0.1,
    heatK: 1,
    heatMass: 50,
    explodeAt: 300,
  },
  inductor: {
    label: "Inductor",
    hint: "A coil that hates change — it fights the current speeding up or slowing down.",
    len: 100,
    rigid: true,
    category: "Build",
    resistance: 0,
    heatK: 1,
    heatMass: 40,
    explodeAt: 400,
  },
  fuse: {
    label: "Fuse",
    hint: "A safety part — it melts and cuts the circuit if too much current flows.",
    len: 90,
    rigid: true,
    category: "Build",
    resistance: 0.005,
    maxAmps: 10,
    heatK: 0.5,
    heatMass: 5,
    explodeAt: 800,
  },
  button: {
    label: "Key button",
    hint: "Only lets current through while you hold its keyboard letter. Build a piano!",
    len: 100,
    rigid: true,
    category: "Inputs & sound",
    resistance: 0.005,
    heatK: 1,
    heatMass: 30,
    explodeAt: 550,
  },
  blinker: {
    label: "Blinker",
    hint: "Flips itself on and off, over and over. Great for light shows.",
    len: 100,
    rigid: true,
    category: "Inputs & sound",
    resistance: 0.005,
    heatK: 1,
    heatMass: 30,
    explodeAt: 450,
  },
  speaker: {
    label: "Speaker",
    hint: "Makes real sound. Pick the note it plays, or let the volts pick the pitch.",
    len: 100,
    rigid: true,
    category: "Inputs & sound",
    resistance: 8,
    heatK: 0.3,
    heatMass: 30,
    explodeAt: 380,
  },
  buzzer: {
    label: "Buzzer",
    hint: "One rude noise, no settings. Louder with more current.",
    len: 90,
    rigid: true,
    category: "Inputs & sound",
    resistance: 20,
    heatK: 0.3,
    heatMass: 25,
    explodeAt: 380,
  },
  voicebox: {
    label: "Talking machine",
    hint: "Type words into it, power it, press Speak — it sounds the letters out.",
    len: 120,
    rigid: true,
    category: "Inputs & sound",
    resistance: 8,
    heatK: 0.3,
    heatMass: 40,
    explodeAt: 380,
  },
  calculator: {
    label: "Calculator",
    hint: "A full add/subtract/multiply/divide machine. Power it, click its keys, and watch every switch inside it work on the panel below.",
    len: 180,
    rigid: true,
    category: "Logic & sensors",
    resistance: 40,
    heatK: 0.5,
    heatMass: 60,
    explodeAt: 380,
  },
  chip: {
    label: "Microchip (Arduino-style)",
    hint: "A tiny programmable brain. Power it and its onboard light blinks — programming it comes later.",
    len: 110,
    rigid: true,
    category: "Logic & sensors",
    resistance: 150,
    heatK: 0.3,
    heatMass: 20,
    explodeAt: 260,
  },
  coil: {
    label: "Electromagnet coil",
    hint: "Power it and it becomes a magnet that flips every magnetic switch on its channel.",
    len: 100,
    rigid: true,
    category: "Logic & sensors",
    resistance: 120,
    heatK: 0.3,
    heatMass: 25,
    explodeAt: 350,
  },
  relay: {
    label: "Magnetic switch",
    hint: "Flipped from a distance by a powered coil on the same channel. This is how old computers computed.",
    len: 100,
    rigid: true,
    category: "Logic & sensors",
    resistance: 0.005,
    heatK: 1,
    heatMass: 30,
    explodeAt: 550,
  },
  lightsensor: {
    label: "Light sensor",
    hint: "Resists a LOT in the dark, barely at all in bright light. Point it at a bulb.",
    len: 100,
    rigid: true,
    category: "Logic & sensors",
    resistance: 1e6,
    heatK: 1,
    heatMass: 30,
    explodeAt: 350,
  },
  heatsensor: {
    label: "Heat sensor",
    hint: "Resists less as things near it get hot. The heart of every fire alarm.",
    len: 100,
    rigid: true,
    category: "Logic & sensors",
    resistance: 316000,
    heatK: 1,
    heatMass: 30,
    explodeAt: 350,
  },
  solar: {
    label: "Solar panel",
    hint: "Turns light landing on it into volts. Feed it a bright bulb.",
    len: 110,
    rigid: true,
    category: "Logic & sensors",
    resistance: 4,
    voltage: 0,
    heatK: 1,
    heatMass: 60,
    explodeAt: 400,
  },
  motor: {
    label: "Motor",
    hint: "Spins with current. Bolt on fan blades, a wheel, a propeller, or a crane winch.",
    len: 110,
    rigid: true,
    category: "Build",
    resistance: 10,
    heatK: 0.5,
    heatMass: 60,
    explodeAt: 420,
  },
  ammeter: {
    label: "Ammeter",
    hint: "Put it IN the loop. Reads how much current flows through it (amps).",
    len: 110,
    rigid: true,
    category: "Measure",
    resistance: 0.01,
    heatK: 1,
    heatMass: 40,
    explodeAt: 380,
  },
  memory: {
    label: "Memory",
    hint: "Stores one number and shows it. Each fresh pulse of current adds one — and it remembers with the power off.",
    len: 110,
    rigid: true,
    category: "Logic & sensors",
    resistance: 0.5,
    heatK: 1,
    heatMass: 50,
    explodeAt: 380,
  },
  voltmeter: {
    label: "Voltmeter",
    hint: "Connect its two ends ACROSS a part. Reads the voltage between them.",
    len: 110,
    rigid: true,
    category: "Measure",
    resistance: 1e7,
    heatK: 1,
    heatMass: 40,
    explodeAt: 380,
  },
  heater: {
    label: "Space heater",
    hint: "A real heater is just a big resistor. Needs ~120 volts to get properly hot.",
    len: 130,
    rigid: true,
    category: "Real things",
    resistance: 15,
    minR: 5,
    maxR: 60,
    heatK: 1.8,
    heatMass: 70,
    explodeAt: 900,
  },
  hairdryer: {
    label: "Hair dryer",
    hint: "Heater coil + fan in one. Watch it spin and blow hot air.",
    len: 130,
    rigid: true,
    category: "Real things",
    resistance: 12,
    minR: 5,
    maxR: 60,
    heatK: 2,
    heatMass: 100,
    explodeAt: 520,
  },
  coin: {
    label: "Coin",
    hint: "Metal conducts! A coin works almost like a wire.",
    len: 70,
    rigid: true,
    category: "Real things",
    resistance: 0.005,
    heatK: 1,
    heatMass: 40,
    explodeAt: 950,
  },
  eraser: {
    label: "Eraser",
    hint: "Rubber blocks current completely. Nothing gets through.",
    len: 90,
    rigid: true,
    category: "Real things",
    resistance: 1e9,
    heatK: 1,
    heatMass: 40,
    explodeAt: 400,
  },
  hand: {
    label: "Your hand",
    hint: "Skin conducts a tiny, tiny bit. That's why outlets are dangerous.",
    len: 100,
    rigid: true,
    category: "Real things",
    resistance: 100000,
    heatK: 1,
    heatMass: 100,
    explodeAt: Infinity,
  },
};

export interface Vertex {
  id: string;
  x: number;
  y: number;
}

export interface Part {
  id: string;
  type: PartType;
  a: string; // vertex id of one end
  b: string; // the other end (battery: + end; LED/diode arrow points a → b)
  resistance: number;
  voltage: number; // battery push
  capacitance: number;
  maxAmps: number; // fuse limit
  closed: boolean; // switch position
  pressed: boolean; // key button held down right now
  key: string; // keyboard letter bound to a key button
  hz: number; // blinker flips per second
  phase: number; // blinker clock
  color: LedColor; // LED color
  mode: SpeakerMode; // speaker: fixed note, or pitch follows volts
  noteHz: number; // speaker note frequency
  attachment: MotorAttachment; // what's bolted onto a motor
  lift: number; // 0..1 — how high a winch has hauled its crate
  channel: number; // 1–6: which coil talks to which magnetic switch
  normallyClosed: boolean; // magnetic switch: OPENS (instead of closes) when its coil is on
  engaged: boolean; // magnetic switch: conducting right now
  henries: number; // inductor size
  indI: number; // current an inductor is carrying (it resists changing this)
  sense: number; // 0..1 — how much light/heat a sensor is picking up
  text: string; // words typed into a talking machine
  playing: boolean; // talking machine is speaking right now
  playPos: number; // seconds into its speech
  pc: number; // microchip: which program step it's on
  chipDrive: number; // microchip: bitmask of channels it is currently driving
  chipWait: number; // microchip: seconds left on a "wait"
  display: string; // what a calculator's screen shows
  calcAcc: number; // calculator: the number waiting on the left of the operator
  calcOp: string; // calculator: pending operator ("+", "−", "×", "÷" or "")
  calcFresh: boolean; // calculator: next digit starts a new number
  mem: number; // memory cell: the number it is holding
  memOn: boolean; // memory cell: currently feeling current (so one pulse counts once)
  blown: boolean; // fuse melted
  destroyed: boolean; // part exploded — permanently an open circuit
  ledOn: boolean; // shared by LED and diode ("is it conducting")
  temp: number; // °C
  capV: number; // volts stored on a capacitor right now
  flow: number; // animation offset for the moving current dots
  spin: number; // rotor angle
  current: number; // amps flowing a → b (last solve)
  volts: number; // voltage from a to b (last solve)
}

export interface Circuit {
  vertices: Vertex[];
  parts: Part[];
}

let nextId = 1;
export function uid(prefix: string): string {
  return `${prefix}${nextId++}`;
}
export function bumpIdsPast(circ: Circuit) {
  for (const v of circ.vertices) {
    const n = parseInt(v.id.replace(/^\D+/, ""), 10);
    if (!isNaN(n) && n >= nextId) nextId = n + 1;
  }
  for (const p of circ.parts) {
    const n = parseInt(p.id.replace(/^\D+/, ""), 10);
    if (!isNaN(n) && n >= nextId) nextId = n + 1;
  }
}

export function blankPart(type: PartType): Omit<Part, "id" | "a" | "b"> {
  const def = CATALOG[type];
  return {
    type,
    resistance: def.resistance,
    voltage: def.voltage ?? 0,
    capacitance: def.capacitance ?? 0,
    maxAmps: def.maxAmps ?? 0,
    closed: false,
    pressed: false,
    key: "",
    hz: 2,
    phase: 0,
    color: "red",
    mode: "note",
    noteHz: NOTES[0].hz,
    attachment: "fan",
    lift: 0,
    channel: 1,
    normallyClosed: false,
    engaged: false,
    henries: 2,
    indI: 0,
    sense: 0,
    text: "hello",
    playing: false,
    playPos: 0,
    pc: 0,
    chipDrive: 0,
    chipWait: 0,
    display: "0",
    calcAcc: 0,
    calcOp: "",
    calcFresh: true,
    mem: 0,
    memOn: false,
    blown: false,
    destroyed: false,
    ledOn: false,
    temp: ROOM_TEMP,
    capV: 0,
    flow: 0,
    spin: 0,
    current: 0,
    volts: 0,
  };
}

export function createPart(type: PartType, x: number, y: number, circ: Circuit): Part {
  const def = CATALOG[type];
  const va: Vertex = { id: uid("v"), x: x - def.len / 2, y };
  const vb: Vertex = { id: uid("v"), x: x + def.len / 2, y };
  circ.vertices.push(va, vb);
  const part: Part = { id: uid("p"), a: va.id, b: vb.id, ...blankPart(type) };
  if (type === "chip") part.text = DEFAULT_CHIP_PROGRAM;
  circ.parts.push(part);
  return part;
}

// ——— the solver ———
// Every conducting element is reduced to the same shape:
//   current from a to b  =  g × (Va − Vb + emf)
// Resistors: g = 1/R, emf = 0.  Battery: g = 1/internalR, emf = its voltage.
// Capacitor (backward Euler): g = C/dt, emf = −(volts it held last frame).
// LED/diode when on: g = 1/onR, emf = −(the drop it eats).

interface Model {
  g: number;
  emf: number;
}

function modelFor(p: Part, dt: number): Model | null {
  if (p.a === p.b || p.destroyed) return null;
  switch (p.type) {
    case "battery":
      return { g: 1 / BATTERY_INTERNAL_R, emf: p.voltage };
    case "outlet":
      return { g: 1 / 0.02, emf: 120 };
    case "usbc":
      return { g: 1 / 0.1, emf: 5 };
    case "solar":
      // voltage is set each frame from the light landing on the panel
      return { g: 1 / 4, emf: p.voltage };
    case "switch":
      return p.closed ? { g: 1 / p.resistance, emf: 0 } : null;
    case "relay":
      return p.engaged ? { g: 1 / p.resistance, emf: 0 } : null;
    case "inductor": {
      // backward Euler: the inductor keeps pushing the current it already
      // carries; g = dt/L, emf chosen so i = g·v + (previous current)
      const g = Math.max(dt, 1 / 240) / Math.max(p.henries, 0.05);
      return { g, emf: p.indI / g };
    }
    case "button":
      return p.pressed ? { g: 1 / p.resistance, emf: 0 } : null;
    case "blinker":
      return (p.phase * p.hz) % 1 < 0.5 ? { g: 1 / p.resistance, emf: 0 } : null;
    case "fuse":
      return p.blown ? null : { g: 1 / p.resistance, emf: 0 };
    case "capacitor": {
      const g = p.capacitance / Math.max(dt, 1 / 240);
      return { g, emf: -p.capV };
    }
    case "led":
      // off-state leak (10 MΩ) is deliberately much bigger than GMIN so a
      // dead-ended LED's floating node follows its neighbor instead of the
      // solver's ground reference — otherwise the on/off check oscillates
      return p.ledOn ? { g: 1 / LED_ON_R, emf: -LED_DROP } : { g: 1e-7, emf: 0 };
    case "diode":
      return p.ledOn ? { g: 1 / DIODE_ON_R, emf: -DIODE_DROP } : { g: 1e-7, emf: 0 };
    case "eraser":
      return { g: 1e-9, emf: 0 };
    default:
      return { g: 1 / Math.max(p.resistance, 1e-6), emf: 0 };
  }
}

function dropOf(type: PartType): number {
  return type === "diode" ? DIODE_DROP : LED_DROP;
}
function onROf(type: PartType): number {
  return type === "diode" ? DIODE_ON_R : LED_ON_R;
}

function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    }
    if (Math.abs(A[piv][col]) < 1e-14) return null;
    if (piv !== col) {
      const tmp = A[col];
      A[col] = A[piv];
      A[piv] = tmp;
      const t = b[col];
      b[col] = b[piv];
      b[piv] = t;
    }
    const d = A[col][col];
    for (let r = col + 1; r < n; r++) {
      const f = A[r][col] / d;
      if (f === 0) continue;
      for (let c = col; c < n; c++) A[r][c] -= f * A[col][c];
      b[r] -= f * b[col];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let c = r + 1; c < n; c++) s -= A[r][c] * x[c];
    x[r] = s / A[r][r];
  }
  return x;
}

function solveOnce(circ: Circuit, dt: number): Map<string, number> {
  const idx = new Map<string, number>();
  circ.vertices.forEach((v, i) => idx.set(v.id, i));
  const n = circ.vertices.length;
  const volts = new Map<string, number>();
  if (n === 0) return volts;

  const A: number[][] = [];
  for (let i = 0; i < n; i++) {
    A.push(new Array<number>(n).fill(0));
    A[i][i] = GMIN;
  }
  const rhs = new Array<number>(n).fill(0);

  for (const p of circ.parts) {
    const m = modelFor(p, dt);
    if (!m) continue;
    const ia = idx.get(p.a);
    const ib = idx.get(p.b);
    if (ia === undefined || ib === undefined) continue;
    A[ia][ia] += m.g;
    A[ib][ib] += m.g;
    A[ia][ib] -= m.g;
    A[ib][ia] -= m.g;
    rhs[ia] -= m.g * m.emf;
    rhs[ib] += m.g * m.emf;
  }

  const x = solveLinear(A, rhs);
  circ.vertices.forEach((v, i) => volts.set(v.id, x ? x[i] : 0));
  return volts;
}

export interface StepEvents {
  exploded: Part[]; // parts that blew apart this frame
  fusesBlown: Part[];
}

export function stepCircuit(circ: Circuit, dt: number): StepEvents {
  const events: StepEvents = { exploded: [], fusesBlown: [] };

  // advance blinker clocks before solving so their state is current
  for (const p of circ.parts) {
    if (p.type === "blinker") p.phase += dt;
  }

  // Magnetic switches follow LAST frame's coil currents — real relays take a
  // moment to move, and that tiny delay is exactly what makes relay logic
  // (and self-interrupting bells) work instead of dividing by zero.
  const activeChannels = new Set<number>();
  for (const p of circ.parts) {
    if (p.type === "coil" && !p.destroyed && Math.abs(p.current) > COIL_PULL_IN_AMPS) {
      activeChannels.add(p.channel);
    }
  }
  for (const p of circ.parts) {
    if (p.type === "chip" && !p.destroyed) {
      for (let ch = 1; ch <= 6; ch++) if (p.chipDrive & (1 << ch)) activeChannels.add(ch);
    }
  }
  for (const p of circ.parts) {
    if (p.type === "relay") {
      p.engaged = p.normallyClosed ? !activeChannels.has(p.channel) : activeChannels.has(p.channel);
    }
  }

  // Sensors and solar panels react to last frame's light and heat, falling
  // off with distance squared — put them CLOSE to what they should watch.
  if (circ.parts.some((p) => p.type === "lightsensor" || p.type === "heatsensor" || p.type === "solar")) {
    const vpos = new Map<string, Vertex>();
    for (const v of circ.vertices) vpos.set(v.id, v);
    const mid = (p: Part) => {
      const a = vpos.get(p.a);
      const b = vpos.get(p.b);
      return a && b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : null;
    };
    const lights: { x: number; y: number; b: number }[] = [];
    const heats: { x: number; y: number; w: number }[] = [];
    for (const p of circ.parts) {
      if (p.destroyed) continue;
      const m = mid(p);
      if (!m) continue;
      if (p.type === "bulb") {
        const b = Math.min(1, Math.abs(p.current * p.volts) / 40);
        if (b > 0.02) lights.push({ x: m.x, y: m.y, b });
      } else if (p.type === "led" && p.ledOn) {
        const b = Math.min(1, Math.abs(p.current) / 0.1) * 0.6;
        if (b > 0.02) lights.push({ x: m.x, y: m.y, b });
      }
      if (p.temp > 45) heats.push({ x: m.x, y: m.y, w: p.temp - 45 });
    }
    for (const p of circ.parts) {
      if (p.destroyed) continue;
      const m = mid(p);
      if (!m) continue;
      if (p.type === "lightsensor" || p.type === "solar") {
        let raw = 0;
        for (const l of lights) {
          const d2 = Math.max((l.x - m.x) ** 2 + (l.y - m.y) ** 2, 1600);
          raw += (l.b * 40000) / d2;
        }
        const f = raw / (raw + 2.5);
        p.sense = f;
        if (p.type === "lightsensor") p.resistance = Math.pow(10, 6 - 5.5 * f);
        else p.voltage = 11 * f;
      } else if (p.type === "heatsensor") {
        let warm = 0;
        for (const h of heats) {
          const d2 = Math.max((h.x - m.x) ** 2 + (h.y - m.y) ** 2, 1600);
          warm += (h.w * 2000) / d2;
        }
        const f = warm / (warm + 80);
        p.sense = f;
        p.resistance = Math.pow(10, 5.5 - 5 * f);
      }
    }
  }

  // LEDs/diodes are on or off depending on the answer, and the answer depends
  // on them — so solve, flip any whose state was wrong, and solve again.
  let volts = new Map<string, number>();
  for (let iter = 0; iter < 8; iter++) {
    volts = solveOnce(circ, dt);
    let changed = false;
    for (const p of circ.parts) {
      if ((p.type !== "led" && p.type !== "diode") || p.destroyed) continue;
      const v = (volts.get(p.a) ?? 0) - (volts.get(p.b) ?? 0);
      const drop = dropOf(p.type);
      if (p.ledOn) {
        const i = (v - drop) / onROf(p.type);
        if (i < 1e-6) {
          p.ledOn = false;
          changed = true;
        }
      } else if (v > drop + 1e-6) {
        p.ledOn = true;
        changed = true;
      }
    }
    if (!changed) break;
    // states flipped after this solve — if we're out of iterations, solve
    // once more so every reading is consistent with the final states
    if (iter === 7) volts = solveOnce(circ, dt);
  }

  for (const p of circ.parts) {
    const def = CATALOG[p.type];
    const va = volts.get(p.a) ?? 0;
    const vb = volts.get(p.b) ?? 0;
    p.volts = va - vb;
    const m = modelFor(p, dt);
    p.current = m ? m.g * (p.volts + m.emf) : 0;
    if (!isFinite(p.current)) p.current = 0;

    if (p.type === "capacitor" && !p.destroyed) p.capV = p.volts;
    if (p.type === "inductor") p.indI = p.destroyed ? 0 : p.current;
    if (p.type === "voicebox" && p.playing) {
      // it only speaks while powered — no current, no voice
      if (Math.abs(p.current) > 0.02) p.playPos += dt;
      if (p.playPos >= Math.max(p.text.length, 1) * LETTER_SECONDS) {
        p.playing = false;
        p.playPos = 0;
      }
    }

    if (p.type === "memory" && !p.destroyed) {
      // count once per pulse: latch on a strong rising current, release only
      // when it clearly stops (hysteresis, so a wobbly press can't double-count)
      const amps = Math.abs(p.current);
      if (!p.memOn && amps > 0.02) {
        p.memOn = true;
        p.mem += 1;
      } else if (p.memOn && amps < 0.008) {
        p.memOn = false;
      }
    }

    // Heat: power turns into temperature; hot parts cool toward room temp.
    let watts = 0;
    if (p.destroyed) watts = 0;
    else if (p.type === "battery") watts = p.current * p.current * BATTERY_INTERNAL_R;
    else if (p.type === "outlet") watts = p.current * p.current * 0.02;
    else if (p.type === "usbc") watts = p.current * p.current * 0.1;
    else if (p.type === "solar") watts = p.current * p.current * 4;
    else if (p.type === "led" || p.type === "diode") watts = Math.abs(p.current * p.volts) * 0.7;
    else if (p.type === "capacitor" || p.type === "inductor") watts = 0;
    else if (m && m.g > 1e-8) watts = (p.current * p.current) / m.g;
    p.temp += ((watts - def.heatK * (p.temp - ROOM_TEMP)) * dt) / def.heatMass;
    p.temp = Math.min(Math.max(p.temp, ROOM_TEMP), 1200);

    // Consequences.
    if (p.type === "fuse" && !p.blown && Math.abs(p.current) > p.maxAmps) {
      p.blown = true;
      events.fusesBlown.push(p);
    }
    if (!p.destroyed && p.temp >= def.explodeAt) {
      p.destroyed = true;
      events.exploded.push(p);
    }
    if (p.type === "capacitor" && !p.destroyed && Math.abs(p.capV) > CAP_MAX_VOLTS) {
      p.destroyed = true;
      events.exploded.push(p);
    }

    // Animation: moving dots, spinning rotors, hauling winches.
    const speed = Math.max(-170, Math.min(170, p.current * 40));
    p.flow += speed * dt;
    if (p.type === "motor" || p.type === "hairdryer") {
      p.spin += Math.max(-1600, Math.min(1600, p.current * 420)) * dt;
      if (p.type === "motor" && p.attachment === "winch") {
        p.lift = Math.min(1, Math.max(0, p.lift + p.current * 0.12 * dt));
      }
    }
  }

  // ——— run every powered microchip's program one slice forward ———
  for (const p of circ.parts) {
    if (p.type !== "chip") continue;
    const powered = !p.destroyed && Math.abs(p.current) > 0.01;
    if (!powered) {
      p.pc = 0;
      p.chipDrive = 0;
      p.chipWait = 0;
      continue;
    }
    const ops = parseProgram(p.text);
    if (!ops.length) continue;
    if (p.chipWait > 0) {
      p.chipWait -= dt;
      if (p.chipWait > 0) continue;
      p.chipWait = 0;
      p.pc++;
    }
    let guard = 0;
    while (guard++ < 40) {
      if (p.pc >= ops.length) p.pc = 0; // firmware loops forever
      const op = ops[p.pc];
      if (op.kind === "set") {
        p.chipDrive = op.on ? p.chipDrive | (1 << (op.ch ?? 1)) : p.chipDrive & ~(1 << (op.ch ?? 1));
        p.pc++;
      } else if (op.kind === "if") {
        if (activeChannels.has(op.ch ?? 1) === op.on) p.pc++;
        else p.pc = (op.skipTo ?? ops.length - 1) + 1;
      } else if (op.kind === "end") {
        p.pc++;
      } else {
        p.chipWait = op.s ?? 0.5;
        break;
      }
    }
  }

  return events;
}

// ——— geometry helpers ———

export function vertexById(circ: Circuit, id: string): Vertex | undefined {
  return circ.vertices.find((v) => v.id === id);
}

export function partsAtVertex(circ: Circuit, vid: string): Part[] {
  return circ.parts.filter((p) => p.a === vid || p.b === vid);
}

// Nudge rigid parts back to their design length after something moved.
// Pinned vertices (the one being dragged) never move.
export function enforceLengths(circ: Circuit, pinned: Set<string>) {
  for (let pass = 0; pass < 4; pass++) {
    for (const p of circ.parts) {
      const def = CATALOG[p.type];
      if (!def.rigid) continue;
      const va = vertexById(circ, p.a);
      const vb = vertexById(circ, p.b);
      if (!va || !vb) continue;
      let dx = vb.x - va.x;
      let dy = vb.y - va.y;
      let d = Math.hypot(dx, dy);
      if (d < 1e-6) {
        dx = 1;
        dy = 0;
        d = 1;
      }
      const err = d - def.len;
      if (Math.abs(err) < 0.25) continue;
      const ux = dx / d;
      const uy = dy / d;
      const aPin = pinned.has(va.id);
      const bPin = pinned.has(vb.id);
      if (aPin && bPin) continue;
      if (aPin) {
        vb.x = va.x + ux * def.len;
        vb.y = va.y + uy * def.len;
      } else if (bPin) {
        va.x = vb.x - ux * def.len;
        va.y = vb.y - uy * def.len;
      } else {
        va.x += (ux * err) / 2;
        va.y += (uy * err) / 2;
        vb.x -= (ux * err) / 2;
        vb.y -= (uy * err) / 2;
      }
    }
  }
}
