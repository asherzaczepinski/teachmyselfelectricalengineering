// Circuit engine: every part is a two-ended element between two vertices.
// Each frame we rebuild a conductance matrix (nodal analysis), solve it,
// and use the answer to drive current flow, brightness, heat, sound and spin.

export type PartType =
  | "wire"
  | "battery"
  | "resistor"
  | "bulb"
  | "switch"
  | "fuse"
  | "capacitor"
  | "led"
  | "speaker"
  | "motor"
  | "heater"
  | "hairdryer"
  | "ammeter"
  | "voltmeter"
  | "coin"
  | "eraser"
  | "hand";

export interface PartDef {
  label: string;
  hint: string; // plain-words description shown in the toolbox
  len: number; // distance between the two end dots, in pixels
  rigid: boolean; // rigid parts keep their length; wires stretch
  category: "Build" | "Measure" | "Real things";
  resistance: number; // ohms — how hard it is for current to get through
  voltage?: number; // battery push, in volts
  capacitance?: number; // farads
  maxAmps?: number; // fuse melts above this many amps
  heatK: number; // watts of cooling per degree above room temperature
  heatMass: number; // joules needed to warm it by one degree
  minR?: number;
  maxR?: number; // slider range when resistance is editable
}

export const ROOM_TEMP = 25;
export const WIRE_R = 0.01;
export const BATTERY_INTERNAL_R = 0.05;
export const LED_DROP = 2; // volts an LED eats before it lights
export const LED_ON_R = 5;
const GMIN = 1e-9; // tiny leak to ground so the math never divides by zero

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
  },
  battery: {
    label: "Battery",
    hint: "Pushes current around the loop. Turn it up to 120 volts.",
    len: 110,
    rigid: true,
    category: "Build",
    resistance: BATTERY_INTERNAL_R,
    voltage: 9,
    heatK: 2.5,
    heatMass: 150,
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
  },
  led: {
    label: "LED",
    hint: "Lights up, but only if current flows the right way.",
    len: 90,
    rigid: true,
    category: "Build",
    resistance: LED_ON_R,
    heatK: 0.05,
    heatMass: 5,
  },
  capacitor: {
    label: "Capacitor",
    hint: "Stores charge, then gives it back. Watch it fill and empty.",
    len: 95,
    rigid: true,
    category: "Build",
    resistance: 0,
    capacitance: 0.1,
    heatK: 1,
    heatMass: 50,
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
  },
  speaker: {
    label: "Speaker",
    hint: "Makes real sound. More volts = higher pitch, more current = louder.",
    len: 100,
    rigid: true,
    category: "Build",
    resistance: 8,
    heatK: 0.3,
    heatMass: 30,
  },
  motor: {
    label: "Fan motor",
    hint: "Spins faster with more current. Flip the current, it spins backwards.",
    len: 110,
    rigid: true,
    category: "Build",
    resistance: 10,
    heatK: 0.5,
    heatMass: 60,
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
  },
  heater: {
    label: "Space heater",
    hint: "A real heater is just a big resistor. Needs ~120 volts to get hot.",
    len: 130,
    rigid: true,
    category: "Real things",
    resistance: 15,
    minR: 5,
    maxR: 60,
    heatK: 1.8,
    heatMass: 120,
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
  b: string; // vertex id of the other end (battery: + end, LED: arrow points a → b)
  resistance: number;
  voltage: number; // battery push
  capacitance: number;
  maxAmps: number; // fuse limit
  closed: boolean; // switch position
  blown: boolean; // fuse melted
  ledOn: boolean;
  temp: number; // °C
  capV: number; // volts stored on a capacitor right now
  flow: number; // animation offset for the moving current dots
  spin: number; // fan blade angle
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

export function createPart(type: PartType, x: number, y: number, circ: Circuit): Part {
  const def = CATALOG[type];
  const va: Vertex = { id: uid("v"), x: x - def.len / 2, y };
  const vb: Vertex = { id: uid("v"), x: x + def.len / 2, y };
  circ.vertices.push(va, vb);
  const part: Part = {
    id: uid("p"),
    type,
    a: va.id,
    b: vb.id,
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
}

// ——— the solver ———
// Every conducting element is reduced to the same shape:
//   current from a to b  =  g × (Va − Vb + emf)
// Resistors: g = 1/R, emf = 0.  Battery: g = 1/internalR, emf = its voltage.
// Capacitor (backward Euler): g = C/dt, emf = −(volts it held last frame).
// LED when on: g = 1/5Ω, emf = −2V (the drop it eats).

interface Model {
  g: number;
  emf: number;
}

function modelFor(p: Part, dt: number): Model | null {
  if (p.a === p.b) return null;
  switch (p.type) {
    case "battery":
      return { g: 1 / BATTERY_INTERNAL_R, emf: p.voltage };
    case "switch":
      return p.closed ? { g: 1 / p.resistance, emf: 0 } : null;
    case "fuse":
      return p.blown ? null : { g: 1 / p.resistance, emf: 0 };
    case "capacitor": {
      const g = p.capacitance / Math.max(dt, 1 / 240);
      return { g, emf: -p.capV };
    }
    case "led":
      return p.ledOn ? { g: 1 / LED_ON_R, emf: -LED_DROP } : { g: 1e-9, emf: 0 };
    case "eraser":
      return { g: 1e-9, emf: 0 };
    default:
      return { g: 1 / Math.max(p.resistance, 1e-6), emf: 0 };
  }
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

export function stepCircuit(circ: Circuit, dt: number) {
  // LEDs are on/off depending on the answer, and the answer depends on the
  // LEDs — so solve, flip any LED whose state was wrong, and solve again.
  let volts = new Map<string, number>();
  for (let iter = 0; iter < 8; iter++) {
    volts = solveOnce(circ, dt);
    let changed = false;
    for (const p of circ.parts) {
      if (p.type !== "led") continue;
      const v = (volts.get(p.a) ?? 0) - (volts.get(p.b) ?? 0);
      if (p.ledOn) {
        const i = (v - LED_DROP) / LED_ON_R;
        if (i < 1e-6) {
          p.ledOn = false;
          changed = true;
        }
      } else if (v > LED_DROP + 1e-6) {
        p.ledOn = true;
        changed = true;
      }
    }
    if (!changed) break;
  }

  for (const p of circ.parts) {
    const def = CATALOG[p.type];
    const va = volts.get(p.a) ?? 0;
    const vb = volts.get(p.b) ?? 0;
    p.volts = va - vb;
    const m = modelFor(p, dt);
    p.current = m ? m.g * (p.volts + m.emf) : 0;
    if (!isFinite(p.current)) p.current = 0;

    if (p.type === "capacitor") p.capV = p.volts;

    // Heat: power turns into temperature, and hot parts cool toward room temp.
    let watts = 0;
    if (p.type === "battery") watts = p.current * p.current * BATTERY_INTERNAL_R;
    else if (p.type === "led") watts = Math.abs(p.current * p.volts) * 0.7;
    else if (p.type === "capacitor") watts = 0;
    else if (m && m.g > 1e-8) watts = (p.current * p.current) / m.g;
    p.temp += ((watts - def.heatK * (p.temp - ROOM_TEMP)) * dt) / def.heatMass;
    p.temp = Math.min(Math.max(p.temp, ROOM_TEMP), 1200);

    // Fuse melts the instant too much current flows.
    if (p.type === "fuse" && !p.blown && Math.abs(p.current) > p.maxAmps) {
      p.blown = true;
    }

    // Animation: moving dots, spinning blades.
    const speed = Math.max(-170, Math.min(170, p.current * 40));
    p.flow += speed * dt;
    if (p.type === "motor" || p.type === "hairdryer") {
      p.spin += Math.max(-1600, Math.min(1600, p.current * 420)) * dt;
    }
  }
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
