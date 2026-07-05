// The instruction manual: each guide teaches one build in plain words and
// can construct the finished circuit on the board.

import { blankPart, Circuit, NOTES, Part, PartType, uid, Vertex } from "./sim";

export interface Guide {
  id: string;
  title: string;
  tagline: string;
  steps: string[];
  why: string;
  build: (cx: number, cy: number) => Circuit;
}

function builder() {
  const circ: Circuit = { vertices: [], parts: [] };
  const V = (x: number, y: number): Vertex => {
    const v = { id: uid("v"), x, y };
    circ.vertices.push(v);
    return v;
  };
  const P = (type: PartType, a: Vertex, b: Vertex, over: Partial<Part> = {}): Part => {
    const part: Part = { id: uid("p"), a: a.id, b: b.id, ...blankPart(type), ...over };
    circ.parts.push(part);
    return part;
  };
  return { circ, V, P };
}

export const GUIDES: Guide[] = [
  {
    id: "first-bulb",
    title: "Light your first bulb",
    tagline: "The classic loop: battery, switch, bulb.",
    steps: [
      "Drag out a battery, a switch, a light bulb and four wires.",
      "Connect them end to end so they make one closed ring. Drag the orange end dots onto each other until they turn yellow.",
      "Click the switch to close it. The bulb lights up.",
      "Click the battery and drag its slider — more volts means a brighter bulb.",
    ],
    why: "Current only flows when there is one unbroken loop from the battery's + end back to its − end. The switch works by breaking that loop.",
    build: (cx, cy) => {
      const { circ, V, P } = builder();
      const a1 = V(cx - 160, cy + 90);
      const a2 = V(cx - 55, cy + 90);
      const a3 = V(cx + 55, cy + 90);
      const a4 = V(cx + 160, cy + 90);
      const b1 = V(cx - 160, cy - 90);
      const b2 = V(cx - 47.5, cy - 90);
      const b3 = V(cx + 47.5, cy - 90);
      const b4 = V(cx + 160, cy - 90);
      const r1 = V(cx + 160, cy + 10);
      P("wire", a1, a2);
      P("battery", a2, a3);
      P("wire", a3, a4);
      P("wire", a1, b1);
      P("wire", b1, b2);
      P("bulb", b2, b3);
      P("wire", b3, b4);
      P("switch", b4, r1);
      P("wire", r1, a4);
      return circ;
    },
  },
  {
    id: "piano",
    title: "Build a piano",
    tagline: "Five key buttons, five speakers, five notes.",
    steps: [
      "Each speaker is set to play one musical note.",
      "Each key button only lets current through while you hold its keyboard letter.",
      "Put a button and a speaker in a line — that's one piano key. Build five of those side by side.",
      "Join all the tops together and all the bottoms together, then connect the battery across them.",
      "Now play! Press A, S, D, F and G on your keyboard.",
    ],
    why: "The five branches sit side by side across the same battery — that's called 'in parallel'. Each branch gets the full battery push, so each key plays at full volume no matter how many you hold.",
    build: (cx, cy) => {
      const { circ, V, P } = builder();
      const keys = ["a", "s", "d", "f", "g"];
      const xs = [-320, -160, 0, 160, 320];
      const topLeft = V(cx - 450, cy - 140);
      const battBot = V(cx - 450, cy - 30);
      const botLeft = V(cx - 450, cy + 140);
      // + end faces the top rail: current runs down through each pressed key
      P("battery", battBot, topLeft, { voltage: 9 });
      P("wire", battBot, botLeft);
      let prevTop = topLeft;
      let prevBot = botLeft;
      xs.forEach((dx, i) => {
        const t = V(cx + dx, cy - 140);
        const m = V(cx + dx, cy - 40);
        const s = V(cx + dx, cy + 60);
        const bot = V(cx + dx, cy + 140);
        P("wire", prevTop, t);
        P("wire", prevBot, bot);
        P("button", t, m, { key: keys[i] });
        P("speaker", m, s, { mode: "note", noteHz: NOTES[i].hz });
        P("wire", s, bot);
        prevTop = t;
        prevBot = bot;
      });
      return circ;
    },
  },
  {
    id: "light-show",
    title: "Make a light show",
    tagline: "Blinkers flash colored LEDs at different speeds.",
    steps: [
      "A blinker is a switch that flips itself on and off automatically.",
      "Stack a blinker, a resistor and an LED into one line — that's one flashing light.",
      "Build three of them side by side with different LED colors, and connect the battery across all three.",
      "Click each blinker and give it a different speed. Now the colors dance out of step.",
    ],
    why: "The resistor is there to protect the LED — without it, the LED would take the battery's full push, overheat and pop. Around 220 ohms keeps the current tiny and safe.",
    build: (cx, cy) => {
      const { circ, V, P } = builder();
      const colors = ["red", "green", "blue"] as const;
      const speeds = [1.3, 2, 3.2];
      const xs = [-160, 0, 160];
      const topLeft = V(cx - 320, cy - 140);
      const battBot = V(cx - 320, cy - 30);
      const botLeft = V(cx - 320, cy + 160);
      // + end must face the top rail so current runs down through each LED
      P("battery", battBot, topLeft, { voltage: 9 });
      P("wire", battBot, botLeft);
      let prevTop = topLeft;
      let prevBot = botLeft;
      xs.forEach((dx, i) => {
        const t = V(cx + dx, cy - 140);
        const m1 = V(cx + dx, cy - 40);
        const m2 = V(cx + dx, cy + 70);
        const bot = V(cx + dx, cy + 160);
        P("wire", prevTop, t);
        P("wire", prevBot, bot);
        P("blinker", t, m1, { hz: speeds[i] });
        P("resistor", m1, m2, { resistance: 220 });
        P("led", m2, bot, { color: colors[i] });
        prevTop = t;
        prevBot = bot;
      });
      return circ;
    },
  },
  {
    id: "spin-lift",
    title: "Spin a wheel, lift a crate",
    tagline: "Two motors with attachments, each on its own switch.",
    steps: [
      "Click a motor to choose what's bolted onto it: fan blades, a wheel, a propeller, or a crane winch.",
      "Here, one motor has a wheel and one has a winch with a crate on a rope.",
      "Close a switch and its motor spins. More volts = faster spinning = faster lifting.",
      "Flip the battery's + and − ends and the winch runs backwards — the crate comes back down.",
    ],
    why: "A motor turns electrical push into real movement. Which way it spins depends on which way the current flows through it — that's why reversing the battery reverses the crate.",
    build: (cx, cy) => {
      const { circ, V, P } = builder();
      const topLeft = V(cx - 260, cy - 140);
      const battBot = V(cx - 260, cy - 30);
      const botLeft = V(cx - 260, cy + 140);
      // + end faces the top rail so the winch winds UP when you close the switch
      P("battery", battBot, topLeft, { voltage: 12 });
      P("wire", battBot, botLeft);
      let prevTop = topLeft;
      let prevBot = botLeft;
      const branches: { x: number; att: "wheel" | "winch" }[] = [
        { x: -60, att: "wheel" },
        { x: 160, att: "winch" },
      ];
      for (const br of branches) {
        const t = V(cx + br.x, cy - 140);
        const m = V(cx + br.x, cy - 40);
        const s = V(cx + br.x, cy + 70);
        const bot = V(cx + br.x, cy + 140);
        P("wire", prevTop, t);
        P("wire", prevBot, bot);
        P("switch", t, m);
        P("motor", m, s, { attachment: br.att });
        P("wire", s, bot);
        prevTop = t;
        prevBot = bot;
      }
      return circ;
    },
  },
  {
    id: "blow-fuse",
    title: "Blow a fuse (on purpose)",
    tagline: "See the safety part do its one job.",
    steps: [
      "This loop has a fuse rated for 2 amps, a 5 ohm resistor, and an ammeter so you can watch the current.",
      "Close the switch. The ammeter reads about 1.8 amps — just under the limit. The fuse is fine.",
      "Now click the battery and slowly drag the volts up.",
      "The moment the current passes 2 amps, the fuse melts and the whole circuit goes dead. That's it doing its job.",
      "Click the fuse and put in a new one to try again.",
    ],
    why: "Current = push ÷ resistance (that's Ohm's law in plain words). 9 volts ÷ 5 ohms ≈ 1.8 amps. Push past 10 volts and the current crosses 2 amps — exactly what the fuse is watching for.",
    build: (cx, cy) => {
      const { circ, V, P } = builder();
      const t1 = V(cx - 200, cy - 100);
      const t2 = V(cx - 155, cy - 100);
      const t3 = V(cx - 65, cy - 100);
      const t4 = V(cx + 45, cy - 100);
      const t5 = V(cx + 155, cy - 100);
      const t6 = V(cx + 200, cy - 100);
      const r1 = V(cx + 200, cy);
      const r2 = V(cx + 200, cy + 100);
      const b1 = V(cx + 55, cy + 100);
      const b2 = V(cx - 55, cy + 100);
      const b3 = V(cx - 200, cy + 100);
      P("wire", t1, t2);
      P("fuse", t2, t3, { maxAmps: 2 });
      P("resistor", t3, t4, { resistance: 5 });
      P("ammeter", t4, t5);
      P("wire", t5, t6);
      P("switch", t6, r1);
      P("wire", r1, r2);
      P("battery", b1, b2, { voltage: 9 });
      P("wire", r2, b1);
      P("wire", b2, b3);
      P("wire", b3, t1);
      return circ;
    },
  },
  {
    id: "short-circuit",
    title: "Short circuit = fire",
    tagline: "Why you never connect + straight to −.",
    steps: [
      "This loop is a battery connected to itself through nothing but wire. No bulb, no resistor — nothing to slow the current down.",
      "Close the switch and keep your eyes on the wires.",
      "A huge current flows. The wires warm up, then the battery starts cooking itself.",
      "Wait for it… the battery catches fire and eventually explodes. You can press Delete to put it out of its misery, or watch the fireworks.",
      "Try it again with a fuse in the loop and see how the fuse saves the battery.",
    ],
    why: "With almost zero resistance in the loop, Ohm's law says the current gets enormous — over 100 amps here. All that energy has nowhere to go except heat. Real house wiring has fuses and breakers for exactly this reason.",
    build: (cx, cy) => {
      const { circ, V, P } = builder();
      const t1 = V(cx - 150, cy - 80);
      const t2 = V(cx + 150, cy - 80);
      const r1 = V(cx + 150, cy + 20);
      const r2 = V(cx + 150, cy + 80);
      const b1 = V(cx + 55, cy + 80);
      const b2 = V(cx - 55, cy + 80);
      const b3 = V(cx - 150, cy + 80);
      P("wire", t1, t2);
      P("switch", t2, r1);
      P("wire", r1, r2);
      P("battery", r2, b1, { voltage: 9 });
      // battery b end should be the + terminal facing the loop — orientation
      // doesn't matter for the short, only that the loop is unbroken
      P("wire", b1, b2);
      P("wire", b2, b3);
      P("wire", b3, t1);
      return circ;
    },
  },
  {
    id: "measure",
    title: "Measure like an engineer",
    tagline: "Ammeter goes IN the loop, voltmeter goes ACROSS.",
    steps: [
      "The ammeter sits inside the loop, so all the current passes through it. It reads amps.",
      "The voltmeter hangs across the bulb from the outside. It reads how many volts the bulb is using up.",
      "Close the switch and read both meters.",
      "Multiply them: volts × amps = watts, the bulb's real power. Change the battery and watch both numbers move together.",
    ],
    why: "An ammeter must be part of the loop (it barely resists, so it doesn't change anything). A voltmeter must NOT be part of the loop (it resists so much that almost no current sneaks through it). Swap those rules and your readings mean nothing.",
    build: (cx, cy) => {
      const { circ, V, P } = builder();
      const t1 = V(cx - 200, cy - 100);
      const bA = V(cx - 47.5, cy - 100);
      const bB = V(cx + 47.5, cy - 100);
      const t2 = V(cx + 200, cy - 100);
      const r1 = V(cx + 200, cy + 10);
      const r2 = V(cx + 200, cy + 100);
      const s1 = V(cx + 90, cy + 100);
      const b1 = V(cx + 55, cy + 100);
      const b2 = V(cx - 55, cy + 100);
      const b3 = V(cx - 200, cy + 100);
      const vA = V(cx - 55, cy - 190);
      const vB = V(cx + 55, cy - 190);
      P("wire", t1, bA);
      P("bulb", bA, bB);
      P("wire", bB, t2);
      P("ammeter", t2, r1);
      P("wire", r1, r2);
      P("wire", r2, s1);
      P("wire", s1, b1);
      P("battery", b1, b2, { voltage: 9 });
      P("wire", b2, b3);
      P("wire", b3, t1);
      P("wire", bA, vA);
      P("voltmeter", vA, vB);
      P("wire", vB, bB);
      return circ;
    },
  },
];
