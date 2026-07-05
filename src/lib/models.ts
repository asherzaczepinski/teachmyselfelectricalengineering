// Ready-made builds: whole working machines assembled from ordinary parts.
// Drag one onto the board and it lands as a single connected assembly that
// you can then rewire, extend, or break like anything else.

import { blankPart, Circuit, NOTES, Part, PartType, uid, Vertex } from "./sim";

export interface Model {
  id: string;
  title: string;
  blurb: string;
  build: (cx: number, cy: number) => Circuit;
}

function fragment() {
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

// battery on the left with its + end at the top rail, then N parallel
// branches — the backbone shared by the piano and the disco lights
function rails(
  cx: number,
  cy: number,
  branchXs: number[],
  topY: number,
  botY: number,
  battX: number,
  voltage: number,
  makeBranch: (i: number, top: Vertex, bot: Vertex, V: ReturnType<typeof fragment>["V"], P: ReturnType<typeof fragment>["P"]) => void
): Circuit {
  const { circ, V, P } = fragment();
  const topLeft = V(cx + battX, cy + topY);
  const battBot = V(cx + battX, cy + topY + 110);
  const botLeft = V(cx + battX, cy + botY);
  P("battery", battBot, topLeft, { voltage });
  P("wire", battBot, botLeft);
  let prevTop = topLeft;
  let prevBot = botLeft;
  for (const [i, dx] of branchXs.entries()) {
    const t = V(cx + dx, cy + topY);
    const bot = V(cx + dx, cy + botY);
    P("wire", prevTop, t);
    P("wire", prevBot, bot);
    makeBranch(i, t, bot, V, P);
    prevTop = t;
    prevBot = bot;
  }
  return circ;
}

export const MODELS: Model[] = [
  {
    id: "piano",
    title: "Piano",
    blurb: "A full octave — play it with A S D F G H J K.",
    build: (cx, cy) => {
      const keys = ["a", "s", "d", "f", "g", "h", "j", "k"];
      const xs = keys.map((_, i) => -455 + i * 130);
      return rails(cx, cy, xs, -140, 140, -585, 9, (i, top, bot, V, P) => {
        const m = V(top.x, top.y + 100);
        const s = V(top.x, top.y + 200);
        P("button", top, m, { key: keys[i] });
        P("speaker", m, s, { mode: "note", noteHz: NOTES[i].hz });
        P("wire", s, bot);
      });
    },
  },
  {
    id: "disco",
    title: "Disco lights",
    blurb: "Three colors flashing out of step with each other.",
    build: (cx, cy) => {
      const colors = ["red", "green", "blue"] as const;
      const speeds = [1.3, 2, 3.2];
      return rails(cx, cy, [-160, 0, 160], -140, 160, -320, 9, (i, top, bot, V, P) => {
        const m1 = V(top.x, top.y + 100);
        const m2 = V(top.x, top.y + 210);
        P("blinker", top, m1, { hz: speeds[i] });
        P("resistor", m1, m2, { resistance: 220 });
        P("led", m2, bot, { color: colors[i] });
      });
    },
  },
  {
    id: "siren",
    title: "Siren",
    blurb: "Beeps all by itself. Annoying on purpose.",
    build: (cx, cy) => {
      const { circ, V, P } = fragment();
      const a = V(cx - 150, cy - 80);
      const m = V(cx - 50, cy - 80);
      const s = V(cx + 50, cy - 80);
      const b = V(cx + 150, cy - 80);
      const c = V(cx + 150, cy + 80);
      const b1 = V(cx + 55, cy + 80);
      const b2 = V(cx - 55, cy + 80);
      const d = V(cx - 150, cy + 80);
      P("blinker", a, m, { hz: 2.5 });
      P("speaker", m, s, { mode: "note", noteHz: 440 });
      P("wire", s, b);
      P("wire", b, c);
      P("wire", c, b1);
      P("battery", b1, b2, { voltage: 9 });
      P("wire", b2, d);
      P("wire", d, a);
      return circ;
    },
  },
  {
    id: "crane",
    title: "Crane",
    blurb: "Flip the switch and the crate winds up the rope.",
    build: (cx, cy) => {
      return rails(cx, cy, [120], -140, 140, -140, 12, (_i, top, bot, V, P) => {
        const m = V(top.x, top.y + 100);
        const s = V(top.x, top.y + 210);
        P("switch", top, m);
        P("motor", m, s, { attachment: "winch" });
        P("wire", s, bot);
      });
    },
  },
  {
    id: "fan",
    title: "Desk fan",
    blurb: "A motor, a propeller, and a switch to run it.",
    build: (cx, cy) => {
      return rails(cx, cy, [120], -140, 140, -140, 9, (_i, top, bot, V, P) => {
        const m = V(top.x, top.y + 100);
        const s = V(top.x, top.y + 210);
        P("switch", top, m);
        P("motor", m, s, { attachment: "propeller" });
        P("wire", s, bot);
      });
    },
  },
  {
    id: "chiplab",
    title: "Programmable brain rig",
    blurb: "A microchip blinking a bulb through magnetic channel 1, with a button input on channel 2. Click the chip to edit its program.",
    build: (cx, cy) => {
      return rails(cx, cy, [-100, 130, 360], -140, 140, -330, 9, (i, top, bot, V, P) => {
        if (i === 0) {
          const m = V(top.x, top.y + 100);
          const c = V(top.x, top.y + 210);
          P("switch", top, m, { closed: true });
          P("chip", m, c, { text: "turn 1 on\nwait 0.5\nturn 1 off\nwait 0.5" });
          P("wire", c, bot);
        } else if (i === 1) {
          const m = V(top.x, top.y + 100);
          const c = V(top.x, top.y + 195);
          P("relay", top, m, { channel: 1 });
          P("bulb", m, c);
          P("wire", c, bot);
        } else {
          const m = V(top.x, top.y + 100);
          const c = V(top.x, top.y + 200);
          P("button", top, m, { key: "a" });
          P("coil", m, c, { channel: 2 });
          P("wire", c, bot);
        }
      });
    },
  },
  {
    id: "pocketcalc",
    title: "Pocket calculator",
    blurb: "Add, subtract, multiply, divide — with every internal switch shown live below it.",
    build: (cx, cy) => {
      const { circ, V, P } = fragment();
      const a = V(cx - 260, cy - 100);
      const m = V(cx - 160, cy - 100);
      const c2 = V(cx + 20, cy - 100);
      const b = V(cx + 260, cy - 100);
      const c = V(cx + 260, cy + 110);
      const b1 = V(cx + 55, cy + 110);
      const b2 = V(cx - 55, cy + 110);
      const d = V(cx - 260, cy + 110);
      P("switch", a, m, { closed: true });
      P("calculator", m, c2);
      P("wire", c2, b);
      P("wire", b, c);
      P("wire", c, b1);
      P("battery", b1, b2, { voltage: 9 });
      P("wire", b2, d);
      P("wire", d, a);
      return circ;
    },
  },
  {
    id: "adder",
    title: "Calculator (adds 1+1)",
    blurb: "A real binary adder made of magnet logic. Hold A, S, or both: green light = ones, red light = twos.",
    // Hold A → coil 1. Hold S → coil 2. The magnetic switches then compute:
    // SUM  = exactly one coil on  (that's XOR, built from 4 switches)
    // CARRY = both coils on       (that's AND, built from 2 in a row)
    // — the same logic, switch for switch, as the relay computers of the 1940s.
    build: (cx, cy) => {
      const { circ, V, P } = fragment();
      const topY = cy - 200;
      const botY = cy + 200;
      // battery column
      const topLeft = V(cx - 560, topY);
      const battBot = V(cx - 560, topY + 110);
      const botLeft = V(cx - 560, botY);
      P("battery", battBot, topLeft, { voltage: 9 });
      P("wire", battBot, botLeft);
      // input columns: key → electromagnet coil
      const mkInput = (x: number, key: string, channel: number, prevT: Vertex, prevB: Vertex) => {
        const t = V(x, topY);
        const m = V(x, topY + 100);
        const c = V(x, topY + 200);
        const b = V(x, botY);
        P("wire", prevT, t);
        P("wire", prevB, b);
        P("button", t, m, { key });
        P("coil", m, c, { channel });
        P("wire", c, b);
        return { t, b };
      };
      const inA = mkInput(cx - 380, "a", 1, topLeft, botLeft);
      const inB = mkInput(cx - 200, "s", 2, inA.t, inA.b);
      // CARRY column: coil-1 switch AND coil-2 switch → red light (the twos)
      const ct = V(cx - 20, topY);
      const cm1 = V(cx - 20, topY + 100);
      const cm2 = V(cx - 20, topY + 200);
      const cm3 = V(cx - 20, topY + 310);
      const cb = V(cx - 20, botY);
      P("wire", inB.t, ct);
      P("wire", inB.b, cb);
      P("relay", ct, cm1, { channel: 1 });
      P("relay", cm1, cm2, { channel: 2 });
      P("resistor", cm2, cm3, { resistance: 220 });
      P("led", cm3, cb, { color: "red" });
      // SUM: two legs that join — (1 on AND 2 off) OR (1 off AND 2 on) → green
      const s1t = V(cx + 160, topY);
      const s2t = V(cx + 340, topY);
      const s1m = V(cx + 160, topY + 100);
      const s2m = V(cx + 340, topY + 100);
      const join = V(cx + 160, topY + 200);
      const leg2b = V(cx + 340, topY + 200);
      const sr = V(cx + 160, topY + 310);
      const sb = V(cx + 160, botY);
      P("wire", ct, s1t);
      P("wire", s1t, s2t);
      P("wire", cb, sb);
      P("relay", s1t, s1m, { channel: 1 });
      P("relay", s1m, join, { channel: 2, normallyClosed: true });
      P("relay", s2t, s2m, { channel: 1, normallyClosed: true });
      P("relay", s2m, leg2b, { channel: 2 });
      P("wire", leg2b, join);
      P("resistor", join, sr, { resistance: 220 });
      P("led", sr, sb, { color: "green" });
      return circ;
    },
  },
  {
    id: "digit",
    title: "Number display",
    blurb: "Seven light strips in the classic 8. Flip the switches to draw any number.",
    build: (cx, cy) => {
      const { circ, V, P } = fragment();
      // segment endpoints in digit-local coordinates (100 wide, 200 tall);
      // the corners have small gaps so each strip stays its own circuit.
      // preset switches draw a “3”.
      const segs = [
        { x1: 5, y1: 0, x2: 95, y2: 0, on: true }, // top
        { x1: 100, y1: 5, x2: 100, y2: 95, on: true }, // top right
        { x1: 100, y1: 105, x2: 100, y2: 195, on: true }, // bottom right
        { x1: 5, y1: 200, x2: 95, y2: 200, on: true }, // bottom
        { x1: 0, y1: 105, x2: 0, y2: 195, on: false }, // bottom left
        { x1: 0, y1: 5, x2: 0, y2: 95, on: false }, // top left
        { x1: 5, y1: 100, x2: 95, y2: 100, on: true }, // middle
      ];
      const dx = cx + 60;
      const dy = cy - 250;
      const battA = V(cx - 340, cy + 240);
      const battB = V(cx - 450, cy + 240);
      P("battery", battA, battB, { voltage: 9 }); // + end faces the switch rail
      let prevTap = battB;
      let prevCommon: Vertex | null = null;
      segs.forEach((s, i) => {
        const tapY = cy - 210 + i * 60;
        const tap = V(cx - 450, tapY);
        P("wire", prevTap, tap);
        prevTap = tap;
        const swEnd = V(cx - 350, tapY);
        P("switch", tap, swEnd, { closed: s.on });
        const a = V(dx + s.x1, dy + s.y1);
        const b = V(dx + s.x2, dy + s.y2);
        P("wire", swEnd, a);
        P("segment", a, b);
        const c = V(cx + 260, tapY);
        P("wire", b, c);
        if (prevCommon) P("wire", prevCommon, c);
        prevCommon = c;
      });
      const cornerBR = V(cx + 260, cy + 240);
      P("wire", prevCommon!, cornerBR);
      P("wire", cornerBR, battA);
      return circ;
    },
  },
  {
    id: "streetlight",
    title: "Streetlight",
    blurb: "Turns itself on when its light sensor goes dark. Switch the 'sun' off and watch.",
    build: (cx, cy) => {
      // the sun: a bright bulb on the loop's right edge, so the sensor
      // (~80px away) gets a strong dose of its light
      const { circ, V, P } = fragment();
      const sa = V(cx - 500, cy - 90);
      const sm = V(cx - 400, cy - 90);
      const st = V(cx - 320, cy - 90);
      const sunBot = V(cx - 320, cy + 5);
      const sc = V(cx - 320, cy + 90);
      const sb1 = V(cx - 360, cy + 90);
      const sb2 = V(cx - 470, cy + 90);
      const sd = V(cx - 500, cy + 90);
      P("switch", sa, sm, { closed: true });
      P("wire", sm, st);
      P("bulb", st, sunBot, { resistance: 4 });
      P("wire", sunBot, sc);
      P("wire", sc, sb1);
      P("battery", sb1, sb2, { voltage: 12 });
      P("wire", sb2, sd);
      P("wire", sd, sa);
      // the streetlight itself: sensor + coil branch, and a normally-CLOSED
      // magnetic switch + lamp branch far enough away not to fool the sensor
      const frag2 = rails(cx, cy, [-255, 200], -140, 160, -180, 9, (i, top, bot, V2, P2) => {
        if (i === 0) {
          const m1 = V2(top.x, top.y + 100);
          const m2 = V2(top.x, top.y + 200);
          P2("lightsensor", top, m1);
          P2("coil", m1, m2, { channel: 5 });
          P2("wire", m2, bot);
        } else {
          const m1 = V2(top.x, top.y + 100);
          const m2 = V2(top.x, top.y + 195);
          P2("relay", top, m1, { channel: 5, normallyClosed: true });
          P2("bulb", m1, m2);
          P2("wire", m2, bot);
        }
      });
      circ.vertices.push(...frag2.vertices);
      circ.parts.push(...frag2.parts);
      return circ;
    },
  },
  {
    id: "firealarm",
    title: "Fire alarm",
    blurb: "A heat sensor watches the heater. When it gets hot, the alarm screams.",
    build: (cx, cy) => {
      const { circ, V, P } = fragment();
      // the danger: wall plug + switch + space heater
      const ha = V(cx - 620, cy - 90);
      const hm = V(cx - 520, cy - 90);
      const hb = V(cx - 390, cy - 90);
      const hc = V(cx - 390, cy + 90);
      const hb1 = V(cx - 450, cy + 90);
      const hb2 = V(cx - 560, cy + 90);
      const hd = V(cx - 620, cy + 90);
      P("switch", ha, hm);
      P("heater", hm, hb);
      P("wire", hb, hc);
      P("wire", hc, hb1);
      P("outlet", hb1, hb2);
      P("wire", hb2, hd);
      P("wire", hd, ha);
      // the alarm: heat sensor (parked ~70px from the heater) + coil branch,
      // then a magnetic switch + siren branch on its own little battery
      const frag2 = rails(cx - 40, cy, [-345, 220], -140, 160, -140, 9, (i, top, bot, V2, P2) => {
        if (i === 0) {
          const m1 = V2(top.x, top.y + 100);
          const m2 = V2(top.x, top.y + 200);
          P2("heatsensor", top, m1);
          P2("coil", m1, m2, { channel: 6 });
          P2("wire", m2, bot);
        } else {
          const m1 = V2(top.x, top.y + 100);
          const m2 = V2(top.x, top.y + 200);
          P2("relay", top, m1, { channel: 6 });
          P2("speaker", m1, m2, { mode: "note", noteHz: 523.25 });
          P2("wire", m2, bot);
        }
      });
      circ.vertices.push(...frag2.vertices);
      circ.parts.push(...frag2.parts);
      return circ;
    },
  },
  {
    id: "wireless",
    title: "Wireless power",
    blurb: "No wires between them: the bulb shines, the solar panel catches it, the fan spins.",
    build: (cx, cy) => {
      const { circ, V, P } = fragment();
      // transmitter: bright bulb on the loop's right edge
      const ta = V(cx - 450, cy - 80);
      const tm = V(cx - 350, cy - 80);
      const tt = V(cx - 225, cy - 80);
      const tBot = V(cx - 225, cy + 15);
      const tc = V(cx - 225, cy + 80);
      const tb1 = V(cx - 280, cy + 80);
      const tb2 = V(cx - 390, cy + 80);
      const td = V(cx - 450, cy + 80);
      P("switch", ta, tm, { closed: true });
      P("wire", tm, tt);
      P("bulb", tt, tBot, { resistance: 4 });
      P("wire", tBot, tc);
      P("wire", tc, tb1);
      P("battery", tb1, tb2, { voltage: 12 });
      P("wire", tb2, td);
      P("wire", td, ta);
      // receiver: solar panel on ITS left edge, catching the bulb's light —
      // it has no battery at all, the light is the power source
      const ra = V(cx - 160, cy - 80);
      const rMid = V(cx - 160, cy + 30);
      const rb = V(cx - 160, cy + 80);
      const rc = V(cx - 35, cy + 80);
      const rd = V(cx + 75, cy + 80);
      const re = V(cx + 75, cy - 80);
      P("solar", ra, rMid);
      P("wire", rMid, rb);
      P("wire", rb, rc);
      P("motor", rc, rd, { attachment: "propeller" });
      P("wire", rd, re);
      P("wire", re, ra);
      return circ;
    },
  },
  {
    id: "bell",
    title: "Electric bell",
    blurb: "The coil switches ITSELF off, over and over — that buzz is the bell.",
    build: (cx, cy) => {
      const { circ, V, P } = fragment();
      const a = V(cx - 210, cy - 80);
      const m1 = V(cx - 110, cy - 80);
      const m2 = V(cx - 10, cy - 80);
      const m3 = V(cx + 80, cy - 80);
      const b = V(cx + 210, cy - 80);
      const c = V(cx + 210, cy + 80);
      const b1 = V(cx + 55, cy + 80);
      const b2 = V(cx - 55, cy + 80);
      const d = V(cx - 210, cy + 80);
      P("switch", a, m1);
      // the coil breaks its own power: normally-closed switch on its own channel
      P("relay", m1, m2, { channel: 3, normallyClosed: true });
      P("coil", m2, m3, { channel: 3, resistance: 40 });
      P("buzzer", m3, b);
      P("wire", b, c);
      P("wire", c, b1);
      P("battery", b1, b2, { voltage: 9 });
      P("wire", b2, d);
      P("wire", d, a);
      return circ;
    },
  },
  {
    id: "morse",
    title: "Morse code key",
    blurb: "Tap short and long beeps — this is how messages crossed oceans.",
    build: (cx, cy) => {
      const { circ, V, P } = fragment();
      const a = V(cx - 160, cy - 70);
      const m = V(cx - 60, cy - 70);
      const s = V(cx + 30, cy - 70);
      const b = V(cx + 160, cy - 70);
      const c = V(cx + 160, cy + 70);
      const b1 = V(cx + 55, cy + 70);
      const b2 = V(cx - 55, cy + 70);
      const d = V(cx - 160, cy + 70);
      P("button", a, m, { key: "m" });
      P("buzzer", m, s);
      P("wire", s, b);
      P("wire", b, c);
      P("wire", c, b1);
      P("battery", b1, b2, { voltage: 9 });
      P("wire", b2, d);
      P("wire", d, a);
      return circ;
    },
  },
];
