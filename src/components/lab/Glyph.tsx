// The drawn artwork for every part, in local coordinates: the part runs
// from (0,0) to (L,0) along the x axis.

import { memo } from "react";
import {
  CHANNEL_COLORS,
  LED_COLORS,
  LETTER_SECONDS,
  Part,
  PartType,
  PHONE_DEFAULT,
  PHONES,
} from "../../lib/sim";

export const COPPER = "#d98e32";

// width of the drawn body in the middle of each part — current dots are
// hidden under this span so they only run along the exposed lead wires
export const BODY_W: Record<PartType, number> = {
  wire: 0,
  battery: 60,
  outlet: 44,
  inductor: 56,
  buzzer: 34,
  voicebox: 64,
  calculator: 150,
  chip: 70,
  usbc: 56,
  coil: 56,
  relay: 56,
  lightsensor: 40,
  heatsensor: 40,
  solar: 60,
  resistor: 60,
  bulb: 44,
  switch: 56,
  button: 44,
  blinker: 46,
  fuse: 50,
  capacitor: 22,
  led: 38,
  diode: 38,
  segment: 76,
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

export function heatColor(t: number): string | null {
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

// ——— calculator: a 3×5 pixel font and the keypad layout ———
// (exported so the interactive key hit-areas in CircuitLab line up exactly)

export const PIXEL_FONT: Record<string, number[]> = {
  "0": [0b111, 0b101, 0b101, 0b101, 0b111],
  "1": [0b010, 0b110, 0b010, 0b010, 0b111],
  "2": [0b111, 0b001, 0b111, 0b100, 0b111],
  "3": [0b111, 0b001, 0b111, 0b001, 0b111],
  "4": [0b101, 0b101, 0b111, 0b001, 0b001],
  "5": [0b111, 0b100, 0b111, 0b001, 0b111],
  "6": [0b111, 0b100, 0b111, 0b101, 0b111],
  "7": [0b111, 0b001, 0b010, 0b010, 0b010],
  "8": [0b111, 0b101, 0b111, 0b101, 0b111],
  "9": [0b111, 0b101, 0b111, 0b001, 0b111],
  "-": [0b000, 0b000, 0b111, 0b000, 0b000],
  ".": [0b000, 0b000, 0b000, 0b000, 0b010],
  E: [0b111, 0b100, 0b111, 0b100, 0b111],
  r: [0b000, 0b000, 0b110, 0b101, 0b100],
};

export const CALC_KEYPAD: string[][] = [
  ["7", "8", "9", "÷"],
  ["4", "5", "6", "×"],
  ["1", "2", "3", "−"],
  ["C", "0", "=", "+"],
];

// key rectangle in the part's local coordinates (cx = middle of the part)
export function calcKeyRect(cx: number, row: number, col: number) {
  return { x: cx - 62 + col * 32, y: 0 + row * 15, w: 29, h: 13 };
}

function PixelScreen({ cx, textValue, on }: { cx: number; textValue: string; on: boolean }) {
  const chars = textValue.slice(0, 9).split("");
  const px = 2.6;
  const charW = 4 * px;
  const totalW = chars.length * charW;
  const x0 = cx + 60 - totalW; // right-aligned like a real calculator
  const rects: { x: number; y: number }[] = [];
  chars.forEach((ch, ci) => {
    const rows = PIXEL_FONT[ch];
    if (!rows) return;
    rows.forEach((bits, r) => {
      for (let c = 0; c < 3; c++) {
        if (bits & (1 << (2 - c))) rects.push({ x: x0 + ci * charW + c * px, y: -36 + r * px });
      }
    });
  });
  return (
    <>
      <rect x={cx - 64} y={-40} width={128} height={22} rx={3} fill={on ? "#0a1f10" : "#101418"} stroke="#334155" />
      {on &&
        rects.map((r, i) => (
          <rect key={i} x={r.x} y={r.y} width={px - 0.5} height={px - 0.5} fill="#4ade80" />
        ))}
    </>
  );
}

// a tiny relay symbol for the "look inside" panels: lit + flat = closed
function MiniSwitch({ x, y, on, dim }: { x: number; y: number; on: boolean; dim?: boolean }) {
  const c = on ? "#fbbf24" : "#5b6476";
  return (
    <g transform={`translate(${x} ${y})`} opacity={dim ? 0.3 : 1}>
      <circle cx={0} cy={0} r={1.6} fill={c} />
      <circle cx={10} cy={0} r={1.6} fill={c} />
      <line
        x1={0}
        y1={0}
        x2={on ? 10 : 8}
        y2={on ? 0 : -6}
        stroke={c}
        strokeWidth={1.6}
        strokeLinecap="round"
      />
    </g>
  );
}

function bitsOf(n: number, count: number): boolean[] {
  const v = Math.round(Math.abs(n)) & ((1 << count) - 1);
  const out: boolean[] = [];
  for (let i = count - 1; i >= 0; i--) out.push(!!(v & (1 << i)));
  return out;
}

// The calculator with its lid permanently off: EVERY switch inside, live.
// Three honest blocks: the screen (one switch per pixel), the two number
// registers (one switch per binary digit, with place values explained),
// and the 12-column adding unit (the same 18-switch adder from the lessons,
// once per binary digit, showing its true state for the numbers held).
// Memoized: it only re-renders when the numbers actually change.
const CalcGutsBig = memo(function CalcGutsBig({
  cx,
  display,
  acc,
  op,
  powered,
}: {
  cx: number;
  display: string;
  acc: number;
  op: string;
  powered: boolean;
}) {
  const PLACE = [2048, 1024, 512, 256, 128, 64, 32, 16, 8, 4, 2, 1];
  const screenN = Math.round(Math.abs(parseFloat(display) || 0)) & 0xfff;
  const accN = Math.round(Math.abs(acc)) & 0xfff;
  const bitsA = bitsOf(screenN, 12); // MSB first
  const bitsB = bitsOf(accN, 12);
  const litPlaces = PLACE.filter((_, i) => bitsA[i]);
  const x0 = cx - 230;

  // the adding unit, computed for real: ripple the carry from the low digit up
  const columns: boolean[][] = [];
  let carry: boolean = false;
  for (let i = 11; i >= 0; i--) {
    const a: boolean = bitsA[i];
    const b: boolean = bitsB[i];
    const c: boolean = carry;
    columns.unshift([
      // sum = exactly-odd-count: four 3-switch legs (same as the Adding machine build)
      a, !b, !c,
      !a, b, !c,
      !a, !b, c,
      a, b, c,
      // carry-out = any two: three 2-switch legs
      a, b,
      a, c,
      b, c,
    ]);
    carry = (a && b) || (a && c) || (b && c);
  }
  const sum = (screenN + accN) & 0xfff;

  // screen pixels, each one a switch
  const pixChars = display.slice(0, 9).split("");
  const pixelBlocks: { x: number; y: number; on: boolean }[] = [];
  pixChars.forEach((ch, ci) => {
    const rows = PIXEL_FONT[ch] ?? [0, 0, 0, 0, 0];
    rows.forEach((bitsRow, r) => {
      for (let c = 0; c < 3; c++) {
        pixelBlocks.push({
          x: x0 + 14 + ci * 30 + c * 8,
          y: 106 + r * 8,
          on: powered && !!(bitsRow & (1 << (2 - c))),
        });
      }
    });
  });

  return (
    <g>
      <rect x={x0} y={74} width={460} height={368} rx={10} fill="#11161f" stroke="#475569" strokeWidth={1.5} />
      <text x={x0 + 14} y={92} fontSize={9.5} fill="#e2e8f0" fontWeight={700}>
        INSIDE — every switch, live{powered ? "" : " (no power, all dark)"}
      </text>

      {/* block 1: the screen */}
      <text x={x0 + 300} y={106} fontSize={7.5} fill="#7d8aa3">
        THE SCREEN — every pixel is one switch
      </text>
      <text x={x0 + 300} y={116} fontSize={7.5} fill="#7d8aa3">
        driving one tiny light. 135 switches.
      </text>
      {pixelBlocks.map((px, i) => (
        <rect
          key={i}
          x={px.x}
          y={px.y}
          width={6}
          height={6}
          rx={1}
          fill={px.on ? "#4ade80" : "#1f2733"}
          stroke={px.on ? "none" : "#2a3446"}
          strokeWidth={0.5}
        />
      ))}

      {/* block 2: counting in binary */}
      <text x={x0 + 14} y={172} fontSize={8.5} fill="#e2e8f0" fontWeight={600}>
        COUNTING IN BINARY — each switch is one place. Lit means “count me”.
      </text>
      {PLACE.map((pv, i) => (
        <text key={pv} x={x0 + 26 + i * 30} y={186} fontSize={6.5} fill="#7d8aa3" textAnchor="middle">
          {pv}
        </text>
      ))}
      <text x={x0 + 14} y={200} fontSize={7} fill="#7d8aa3">
        screen
      </text>
      {bitsA.map((b, i) => (
        <MiniSwitch key={`a${i}`} x={x0 + 20 + i * 30} y={198} on={powered && b} />
      ))}
      <text x={x0 + 14} y={220} fontSize={7} fill="#7d8aa3">
        memory
      </text>
      {bitsB.map((b, i) => (
        <MiniSwitch key={`b${i}`} x={x0 + 20 + i * 30} y={218} on={powered && b} />
      ))}
      <text x={x0 + 14} y={238} fontSize={8} fill={powered ? "#fbbf24" : "#5b6476"}>
        {powered
          ? litPlaces.length > 0
            ? `lit places add up: ${litPlaces.join(" + ")} = ${screenN}`
            : "no switches lit — that's how you write zero"
          : "power it to see the numbers"}
        {op && powered ? `   ·   “${op}” is waiting` : ""}
      </text>

      {/* block 3: the adding unit */}
      <text x={x0 + 14} y={258} fontSize={8.5} fill="#e2e8f0" fontWeight={600}>
        THE ADDING UNIT — one 18-switch adder per place (the same one from the lessons), carry rippling right to left
      </text>
      {columns.map((col, i) => (
        <g key={i}>
          <text x={x0 + 26 + i * 36} y={270} fontSize={6.5} fill="#7d8aa3" textAnchor="middle">
            {PLACE[i]}
          </text>
          {col.map((on, k) => (
            <MiniSwitch
              key={k}
              x={x0 + 14 + i * 36 + (k % 3) * 12}
              y={280 + Math.floor(k / 3) * 11}
              on={powered && on}
              dim={!powered}
            />
          ))}
        </g>
      ))}
      <text x={x0 + 14} y={368} fontSize={8} fill={powered ? "#fbbf24" : "#5b6476"}>
        {powered ? `wired up right now: screen + memory = ${screenN} + ${accN} = ${sum}` : ""}
      </text>
      <text x={x0 + 14} y={388} fontSize={7.5} fill="#7d8aa3">
        216 adding switches + 24 register switches + 135 pixel switches = 375 on this panel.
      </text>
      <text x={x0 + 14} y={400} fontSize={7.5} fill="#7d8aa3">
        Multiplying is this adder run over and over; dividing is it run backwards.
      </text>
      <text x={x0 + 14} y={412} fontSize={7.5} fill="#7d8aa3">
        A real pocket calculator holds about 40,000 — same switches, shrunk to specks of silicon.
      </text>
    </g>
  );
});

// the talking machine with its lid off: the live buzz/hiss mixer and the
// mouth-shape filters, re-tuning letter by letter
function VoiceGuts({ p, cx }: { p: Part; cx: number }) {
  const powered = Math.abs(p.current) > 0.02;
  const speaking = p.playing && powered;
  const idx = Math.floor(p.playPos / LETTER_SECONDS);
  const ch = speaking ? (p.text[idx] ?? " ").toLowerCase() : " ";
  const ph = PHONES[ch] ?? PHONE_DEFAULT;
  const tIn = speaking ? (p.playPos % LETTER_SECONDS) / LETTER_SECONDS : 0;
  let env = speaking ? Math.min(1, tIn / 0.15, (1 - tIn) / 0.15) : 0;
  if (ph.burst) env = tIn < 0.35 ? 1 : 0;
  const voiced = speaking ? ph.v * env : 0;
  const noisy = speaking ? ph.n * env : 0;
  const box = (x: number, y: number, w: number, label: string, active: boolean, sub?: string) => (
    <g>
      <rect x={x} y={y} width={w} height={22} rx={4} fill={active ? "#2a2410" : "#1a2130"} stroke={active ? "#8a6a1e" : "#3e4d69"} />
      <text x={x + w / 2} y={y + (sub ? 9 : 12)} textAnchor="middle" fontSize={7.5} fontWeight={600} fill={active ? "#fbbf24" : "#7d8aa3"}>
        {label}
      </text>
      {sub && (
        <text x={x + w / 2} y={y + 18} textAnchor="middle" fontSize={7} fill={active ? "#fbbf24" : "#5b6476"}>
          {sub}
        </text>
      )}
    </g>
  );
  const bar = (x: number, y: number, level: number) => (
    <g>
      <rect x={x} y={y} width={44} height={5} rx={2.5} fill="#1a2130" />
      <rect x={x} y={y} width={44 * Math.min(1, level)} height={5} rx={2.5} fill="#fbbf24" />
    </g>
  );
  const wire = (x1: number, y1: number, x2: number, y2: number, active: boolean) => (
    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={active ? "#8a6a1e" : "#3e4d69"} strokeWidth={1.5} />
  );
  return (
    <g>
      <rect x={cx - 140} y={22} width={280} height={152} rx={8} fill="#141a28" stroke="#475569" strokeWidth={1.5} />
      <text x={cx - 130} y={38} fontSize={8.5} fill="#94a3b8" fontWeight={600}>
        INSIDE — LIVE. A buzz and a hiss, pushed through mouth-shaped filters
      </text>
      {p.text
        .slice(0, 26)
        .split("")
        .map((c, i) => (
          <text
            key={i}
            x={cx - 130 + i * 10}
            y={166}
            fontSize={9}
            fontWeight={speaking && i === idx ? 700 : 400}
            fill={speaking && i === idx ? "#fbbf24" : "#5b6476"}
          >
            {c.toUpperCase()}
          </text>
        ))}
      {wire(cx - 68, 57, cx - 40, 57, voiced > 0.05)}
      {wire(cx - 68, 57, cx - 40, 84, voiced > 0.05)}
      {wire(cx + 22, 57, cx + 42, 62, voiced > 0.05)}
      {wire(cx + 22, 84, cx + 42, 74, voiced > 0.05)}
      {wire(cx - 68, 112, cx - 40, 112, noisy > 0.05)}
      {wire(cx + 22, 112, cx + 42, 80, noisy > 0.05)}
      {box(cx - 130, 46, 62, "BUZZ", voiced > 0.05, "vocal cords")}
      {box(cx - 40, 46, 62, `filter ${ph.f1 || "—"}`, voiced > 0.05, "throat")}
      {box(cx - 40, 73, 62, `filter ${ph.f2 || "—"}`, voiced > 0.05, "mouth")}
      {box(cx - 130, 101, 62, "HISS", noisy > 0.05, "air noise")}
      {box(cx - 40, 101, 62, `filter ${ph.nf || "—"}`, noisy > 0.05, "teeth")}
      {box(cx + 42, 60, 88, "OUT TO CONE", voiced + noisy > 0.05)}
      {bar(cx + 64, 92, voiced)}
      <text x={cx + 64} y={104} fontSize={7} fill="#7d8aa3">
        buzz level
      </text>
      {bar(cx + 64, 112, noisy)}
      <text x={cx + 64} y={124} fontSize={7} fill="#7d8aa3">
        hiss level
      </text>
      <text x={cx - 130} y={142} fontSize={8} fill={speaking ? "#fbbf24" : "#5b6476"}>
        {speaking
          ? `letter “${(p.text[idx] ?? "").toUpperCase()}” — ${ph.n > 0 && ph.v === 0 ? "pure hiss" : ph.burst ? "a little explosion" : "buzz shaped by two filters"}`
          : powered
            ? "press Speak and watch the mouth re-shape for every letter"
            : "no power — nothing to see"}
      </text>
    </g>
  );
}

// stable pseudo-random shards for a destroyed part, seeded by its id
function shards(id: string, cx: number): { x: number; y: number; r: number; a: number }[] {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  const out = [];
  for (let k = 0; k < 6; k++) {
    h = (h * 1103515245 + 12345) >>> 0;
    const ang = ((h % 360) * Math.PI) / 180;
    h = (h * 1103515245 + 12345) >>> 0;
    const dist = 14 + (h % 22);
    h = (h * 1103515245 + 12345) >>> 0;
    out.push({
      x: cx + Math.cos(ang) * dist,
      y: Math.sin(ang) * dist * 0.7,
      r: 2 + (h % 4),
      a: h % 360,
    });
  }
  return out;
}

function Destroyed({ p, L }: { p: Part; L: number }) {
  const cx = L / 2;
  return (
    <>
      <line x1={0} y1={0} x2={cx - 16} y2={0} stroke="#4a4440" strokeWidth={5} strokeLinecap="round" />
      <line x1={cx + 16} y1={0} x2={L} y2={0} stroke="#4a4440" strokeWidth={5} strokeLinecap="round" />
      <ellipse cx={cx} cy={0} rx={22} ry={12} fill="#17130f" opacity={0.85} />
      <path
        d={`M ${cx - 14} 0 l 5 -6 M ${cx + 14} 0 l -5 6`}
        stroke="#4a4440"
        strokeWidth={2.5}
        fill="none"
        strokeLinecap="round"
      />
      {shards(p.id, cx).map((s, k) => (
        <rect
          key={k}
          x={s.x - s.r}
          y={s.y - s.r}
          width={s.r * 2}
          height={s.r * 1.4}
          fill="#3b332c"
          transform={`rotate(${s.a} ${s.x} ${s.y})`}
        />
      ))}
      <path
        d={`M ${cx - 4} -12 q -5 -8 1 -16 M ${cx + 5} -10 q 6 -9 0 -18`}
        stroke="#6b6560"
        strokeWidth={2}
        fill="none"
        opacity={0.5}
        strokeLinecap="round"
      />
    </>
  );
}

export function Glyph({ p, L, angle = 0 }: { p: Part; L: number; angle?: number }) {
  if (p.destroyed) return <Destroyed p={p} L={L} />;

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

    case "chip":
      return (
        <>
          {leads}
          <rect x={cx - 35} y={-16} width={70} height={32} rx={4} fill="#0e7490" stroke="#155e75" strokeWidth={1.5} />
          <rect x={cx - 14} y={-9} width={28} height={18} rx={2} fill="#111318" />
          {[-26, -18, 18, 26].map((dx) => (
            <rect key={dx} x={cx + dx - 2} y={-14} width={4} height={28} fill="#d9dee6" opacity={0.5} />
          ))}
          <circle cx={cx + 27} cy={-10} r={2.5} fill={Math.abs(p.current) > 0.01 ? "#4ade80" : "#134e4a"} />
        </>
      );

    case "usbc":
      return (
        <>
          {leads}
          <rect x={cx - 28} y={-9} width={34} height={18} rx={8} fill="#3a4150" stroke="#5c6676" strokeWidth={1.5} />
          <rect x={cx - 22} y={-4} width={22} height={8} rx={4} fill="#161a22" />
          <rect x={cx + 6} y={-6} width={22} height={12} rx={5} fill="#22262e" />
        </>
      );

    case "outlet":
      return (
        <>
          {leads}
          <rect x={cx - 22} y={-17} width={44} height={34} rx={6} fill="#e7e5e4" stroke="#a8a29e" strokeWidth={1.5} />
          <rect x={cx - 9} y={-10} width={4} height={9} rx={1} fill="#292524" />
          <rect x={cx + 5} y={-10} width={4} height={9} rx={1} fill="#292524" />
          <circle cx={cx} cy={8} r={2.8} fill="#292524" />
        </>
      );

    case "inductor":
      return (
        <>
          {leads}
          <path
            d={`M ${pad} 0 ${[0, 1, 2, 3].map(() => `a 7 9 0 0 1 ${bodyW / 4} 0`).join(" ")}`}
            fill="none"
            stroke={hot ?? "#94a3b8"}
            strokeWidth={3.5}
          />
        </>
      );

    case "buzzer": {
      const loud = Math.min(1, Math.abs(p.current) / 0.8);
      return (
        <>
          {leads}
          <circle cx={cx} cy={0} r={15} fill="#18181b" stroke="#52525b" strokeWidth={2} />
          <rect x={cx - 7} y={-1.5} width={14} height={3} rx={1.5} fill="#52525b" />
          {loud > 0.03 && (
            <>
              <path d={`M ${cx + 19} -7 q 6 7 0 14`} fill="none" stroke="#fca5a5" strokeWidth={2} opacity={loud} />
              <path d={`M ${cx + 24} -11 q 9 11 0 22`} fill="none" stroke="#fca5a5" strokeWidth={2} opacity={loud * 0.6} />
            </>
          )}
        </>
      );
    }

    case "voicebox": {
      const speaking = p.playing && Math.abs(p.current) > 0.02;
      const letter = speaking
        ? (p.text[Math.floor(p.playPos / LETTER_SECONDS)] ?? "").toUpperCase()
        : "";
      return (
        <>
          {leads}
          <rect x={cx - 32} y={-16} width={64} height={32} rx={7} fill="#1e293b" stroke="#64748b" strokeWidth={1.5} />
          {/* mouth grille */}
          {[-20, -13, -6, 1, 8].map((dx) => (
            <line key={dx} x1={cx + dx} y1={-8} x2={cx + dx} y2={8} stroke="#475569" strokeWidth={2.5} />
          ))}
          <g transform={`rotate(${-angle} ${cx} 0)`}>
            <VoiceGuts p={p} cx={cx} />
          </g>
          <rect
            x={cx + 16}
            y={-10}
            width={13}
            height={20}
            rx={3}
            fill={speaking ? "#f59e0b" : "#334155"}
          />
          {speaking && letter.trim() && (
            <>
              <path d={`M ${cx + 36} -9 q 8 9 0 18`} fill="none" stroke="#7dd3fc" strokeWidth={2} />
              <text x={cx + 22.5} y={1} textAnchor="middle" dominantBaseline="middle" fontSize={12} fontWeight={700} fill="#1c1400">
                {letter}
              </text>
            </>
          )}
        </>
      );
    }

    case "calculator": {
      const on = Math.abs(p.current) > 0.01;
      return (
        <>
          {leads}
          <rect x={cx - 70} y={-48} width={140} height={116} rx={9} fill="#1c2333" stroke="#475569" strokeWidth={1.5} />
          <PixelScreen cx={cx} textValue={p.display} on={on} />
          <g transform={`rotate(${-angle} ${cx} 0)`}>
            {/* drawn big: every switch should be readable without squinting */}
            <g transform={`translate(${cx} 74) scale(1.7) translate(${-cx} -74)`}>
              <CalcGutsBig cx={cx} display={p.display} acc={p.calcAcc} op={p.calcOp} powered={on} />
            </g>
          </g>
          {CALC_KEYPAD.flatMap((row, r) =>
            row.map((k, c) => {
              const kr = calcKeyRect(cx, r, c);
              const isOp = c === 3 || k === "=" || k === "C";
              return (
                <g key={k}>
                  <rect
                    x={kr.x}
                    y={kr.y}
                    width={kr.w}
                    height={kr.h}
                    rx={3.5}
                    fill={isOp ? "#3b2f14" : "#283348"}
                    stroke={isOp ? "#8a6a1e" : "#3e4d69"}
                    strokeWidth={1}
                  />
                  <text
                    x={kr.x + kr.w / 2}
                    y={kr.y + kr.h / 2 + 0.5}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fontSize={9}
                    fontWeight={600}
                    fill={on ? (isOp ? "#fbbf24" : "#cbd5e1") : "#64748b"}
                  >
                    {k}
                  </text>
                </g>
              );
            })
          )}
        </>
      );
    }

    case "coil": {
      const on = Math.abs(p.current) > 0.02;
      const chColor = CHANNEL_COLORS[p.channel] ?? "#fbbf24";
      return (
        <>
          {leads}
          <path
            d={`M ${pad} 0 ${[0, 1, 2, 3].map(() => `a 7 10 0 0 1 ${bodyW / 4} 0`).join(" ")}`}
            fill="none"
            stroke={on ? chColor : hot ?? "#94a3b8"}
            strokeWidth={4}
          />
          {on && (
            <>
              <path d={`M ${cx - 14} -14 q 14 -10 28 0`} fill="none" stroke={chColor} strokeWidth={1.5} opacity={0.7} />
              <path d={`M ${cx - 20} -18 q 20 -16 40 0`} fill="none" stroke={chColor} strokeWidth={1.5} opacity={0.4} />
            </>
          )}
          <circle cx={cx} cy={17} r={8} fill="#0f172a" stroke={chColor} strokeWidth={2} />
          <text x={cx} y={18} textAnchor="middle" dominantBaseline="middle" fontSize={10} fontWeight={700} fill={chColor}>
            {p.channel}
          </text>
        </>
      );
    }

    case "relay": {
      const chColor = CHANNEL_COLORS[p.channel] ?? "#fbbf24";
      const pivotX = cx - 20;
      const endX = p.engaged ? cx + 20 : pivotX + 40 * Math.cos(-0.55);
      const endY = p.engaged ? 0 : 40 * Math.sin(-0.55);
      return (
        <>
          {leads}
          <line x1={pad} y1={0} x2={pivotX} y2={0} stroke={COPPER} strokeWidth={5} strokeLinecap="round" />
          <line x1={cx + 20} y1={0} x2={L - pad} y2={0} stroke={COPPER} strokeWidth={5} strokeLinecap="round" />
          <line x1={pivotX} y1={0} x2={endX} y2={endY} stroke="#e5e7eb" strokeWidth={4} strokeLinecap="round" />
          <circle cx={pivotX} cy={0} r={4} fill="#e5e7eb" />
          <circle cx={cx + 20} cy={0} r={4} fill="#e5e7eb" />
          {/* the little magnet that pulls the lever */}
          <rect x={cx - 8} y={10} width={16} height={8} rx={2} fill={chColor} opacity={0.85} />
          <circle cx={cx} cy={26} r={8} fill="#0f172a" stroke={chColor} strokeWidth={2} />
          <text x={cx} y={27} textAnchor="middle" dominantBaseline="middle" fontSize={10} fontWeight={700} fill={chColor}>
            {p.channel}
          </text>
          {p.normallyClosed && (
            <text x={cx + 14} y={26} fontSize={9} fill={chColor} dominantBaseline="middle">
              !
            </text>
          )}
        </>
      );
    }

    case "lightsensor": {
      const f = p.sense;
      return (
        <>
          {leads}
          <circle cx={cx} cy={0} r={14} fill="#292524" stroke="#a8a29e" strokeWidth={2} />
          <path d={`M ${cx - 8} -4 h 16 M ${cx - 8} 0 h 16 M ${cx - 8} 4 h 16`} stroke={f > 0.3 ? "#fde047" : "#57534e"} strokeWidth={2} />
          {f > 0.15 &&
            [-30, 0, 30].map((a) => (
              <line
                key={a}
                x1={cx + 22 * Math.cos(((a - 90) * Math.PI) / 180)}
                y1={22 * Math.sin(((a - 90) * Math.PI) / 180)}
                x2={cx + 32 * Math.cos(((a - 90) * Math.PI) / 180)}
                y2={32 * Math.sin(((a - 90) * Math.PI) / 180)}
                stroke="#fde047"
                strokeWidth={2}
                opacity={f}
              />
            ))}
        </>
      );
    }

    case "heatsensor": {
      const f = p.sense;
      return (
        <>
          {leads}
          <rect x={cx - 8} y={-16} width={16} height={26} rx={8} fill="#292524" stroke="#a8a29e" strokeWidth={2} />
          <circle cx={cx} cy={8} r={5} fill={f > 0.3 ? "#f87171" : "#57534e"} />
          <rect x={cx - 2} y={-10 + (1 - f) * 14} width={4} height={18 - (1 - f) * 14} rx={2} fill={f > 0.3 ? "#f87171" : "#57534e"} />
          {f > 0.15 && (
            <path d={`M ${cx - 14} -20 q 4 -5 0 -10 M ${cx + 14} -20 q -4 -5 0 -10`} fill="none" stroke="#fca5a5" strokeWidth={2} opacity={f} />
          )}
        </>
      );
    }

    case "solar": {
      const f = p.sense;
      return (
        <>
          {leads}
          <rect x={cx - 30} y={-16} width={60} height={32} rx={3} fill="#0c4a6e" stroke={f > 0.2 ? "#7dd3fc" : "#475569"} strokeWidth={2} />
          {[-15, 0, 15].map((dx) => (
            <line key={dx} x1={cx + dx} y1={-16} x2={cx + dx} y2={16} stroke="#075985" strokeWidth={2} />
          ))}
          <line x1={cx - 30} y1={0} x2={cx + 30} y2={0} stroke="#075985" strokeWidth={2} />
          {f > 0.15 && (
            <circle cx={cx} cy={0} r={34} fill="none" stroke="#7dd3fc" strokeWidth={1.5} opacity={f * 0.7} />
          )}
        </>
      );
    }

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
      const tint = LED_COLORS[p.color] ?? LED_COLORS.red;
      const glow = on ? Math.min(1, 0.35 + Math.abs(p.current) / 0.4) : 0;
      return (
        <>
          {leads}
          {on && (
            <>
              <circle cx={cx} cy={0} r={16 + glow * 16} fill={tint} opacity={glow * 0.35} />
              <circle cx={cx} cy={0} r={8 + glow * 6} fill={tint} opacity={glow * 0.55} />
            </>
          )}
          <polygon
            points={`${cx - 9},-10 ${cx - 9},10 ${cx + 7},0`}
            fill={on ? tint : "#3f3f46"}
            stroke={tint}
            strokeWidth={1.4}
          />
          <line x1={cx + 8} y1={-10} x2={cx + 8} y2={10} stroke={tint} strokeWidth={2.5} />
        </>
      );
    }

    case "diode": {
      const on = p.ledOn && Math.abs(p.current) > 0.001;
      return (
        <>
          {leads}
          <polygon
            points={`${cx - 9},-10 ${cx - 9},10 ${cx + 7},0`}
            fill={on ? "#94a3b8" : "#3f3f46"}
            stroke="#94a3b8"
            strokeWidth={1.4}
          />
          <line x1={cx + 8} y1={-10} x2={cx + 8} y2={10} stroke="#94a3b8" strokeWidth={2.5} />
        </>
      );
    }

    case "segment": {
      const on = Math.abs(p.current) > 0.003;
      const glow = Math.min(1, Math.abs(p.current) / 0.06);
      return (
        <>
          {leads}
          {on && (
            <rect
              x={pad - 5}
              y={-11}
              width={bodyW + 10}
              height={22}
              rx={11}
              fill="#ff6a3d"
              opacity={glow * 0.35}
            />
          )}
          <rect
            x={pad}
            y={-6}
            width={bodyW}
            height={12}
            rx={6}
            fill={on ? "#ff4b2e" : "#2a1512"}
            stroke={on ? "#ff8a6a" : "#4a221c"}
            strokeWidth={1.5}
          />
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

    case "button": {
      const down = p.pressed;
      const capY = down ? -22 : -28;
      return (
        <>
          {leads}
          <line x1={pad} y1={0} x2={cx - 16} y2={0} stroke={COPPER} strokeWidth={5} strokeLinecap="round" />
          <line x1={cx + 16} y1={0} x2={L - pad} y2={0} stroke={COPPER} strokeWidth={5} strokeLinecap="round" />
          <circle cx={cx - 16} cy={0} r={3.5} fill="#e5e7eb" />
          <circle cx={cx + 16} cy={0} r={3.5} fill="#e5e7eb" />
          {/* the bridge bar that closes the contacts when pressed */}
          <line
            x1={cx - 16}
            y1={down ? 0 : -9}
            x2={cx + 16}
            y2={down ? 0 : -9}
            stroke="#e5e7eb"
            strokeWidth={3.5}
            strokeLinecap="round"
          />
          <line x1={cx} y1={down ? -1 : -10} x2={cx} y2={capY + 12} stroke="#94a3b8" strokeWidth={3} />
          <rect
            x={cx - 13}
            y={capY - 4}
            width={26}
            height={17}
            rx={4}
            fill={down ? "#f59e0b" : "#334155"}
            stroke={down ? "#fbbf24" : "#64748b"}
            strokeWidth={1.5}
          />
          <text
            x={cx}
            y={capY + 5}
            textAnchor="middle"
            fontSize={11}
            fontWeight={700}
            fill={down ? "#1c1400" : "#e2e8f0"}
          >
            {(p.key || "?").toUpperCase()}
          </text>
        </>
      );
    }

    case "blinker": {
      const on = (p.phase * p.hz) % 1 < 0.5;
      return (
        <>
          {leads}
          <rect x={pad} y={-12} width={bodyW} height={24} rx={5} fill="#1e293b" stroke="#475569" strokeWidth={1.5} />
          {/* a little square wave, lit while the blinker is letting current through */}
          <path
            d={`M ${cx - 15} 5 h 6 v -10 h 7 v 10 h 7 v -10 h 5`}
            fill="none"
            stroke={on ? "#fbbf24" : "#64748b"}
            strokeWidth={2}
          />
          <circle cx={cx + 16} cy={-6} r={2.6} fill={on ? "#fbbf24" : "#475569"} />
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
          <line x1={0} y1={0} x2={cx - 6} y2={0} stroke={COPPER} strokeWidth={5} strokeLinecap="round" />
          <line x1={cx + 6} y1={0} x2={L} y2={0} stroke={COPPER} strokeWidth={5} strokeLinecap="round" />
          <line
            x1={cx - 6}
            y1={-15}
            x2={cx - 6}
            y2={15}
            stroke={p.capV > 0.3 ? "#fbbf24" : "#e2e8f0"}
            strokeWidth={4}
            opacity={0.5 + charge * 0.5}
          />
          <line
            x1={cx + 6}
            y1={-15}
            x2={cx + 6}
            y2={15}
            stroke={p.capV < -0.3 ? "#fbbf24" : "#e2e8f0"}
            strokeWidth={4}
            opacity={0.5 + charge * 0.5}
          />
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
            </>
          )}
        </>
      );
    }

    case "motor": {
      const att = p.attachment;
      return (
        <>
          {leads}
          {att === "winch" && (
            // rope + crate hang below the drum; counter-rotate so gravity
            // still points down even when the motor sits on a vertical branch
            <g transform={`rotate(${-angle} ${cx} 0)`}>
              <line x1={cx} y1={10} x2={cx} y2={26 + (1 - p.lift) * 64} stroke="#a8a29e" strokeWidth={1.5} />
              <g transform={`translate(${cx} ${26 + (1 - p.lift) * 64})`}>
                <rect x={-12} y={0} width={24} height={19} rx={2} fill="#8a5a2b" stroke="#5c3a17" strokeWidth={1.5} />
                <line x1={-12} y1={9.5} x2={12} y2={9.5} stroke="#5c3a17" strokeWidth={1.5} />
                <line x1={0} y1={0} x2={0} y2={19} stroke="#5c3a17" strokeWidth={1.5} />
              </g>
            </g>
          )}
          <circle cx={cx} cy={0} r={22} fill="#1e293b" stroke="#64748b" strokeWidth={2} />
          <g transform={`rotate(${p.spin.toFixed(1)} ${cx} 0)`}>
            {att === "fan" &&
              [0, 120, 240].map((a) => (
                <ellipse key={a} cx={cx + 11} cy={0} rx={10} ry={4.5} fill="#7dd3fc" opacity={0.85} transform={`rotate(${a} ${cx} 0)`} />
              ))}
            {att === "propeller" &&
              [0, 180].map((a) => (
                <ellipse key={a} cx={cx + 15} cy={0} rx={14} ry={2.8} fill="#cbd5e1" opacity={0.9} transform={`rotate(${a} ${cx} 0)`} />
              ))}
            {att === "wheel" && (
              <>
                <circle cx={cx} cy={0} r={19} fill="none" stroke="#0f172a" strokeWidth={7} />
                <circle cx={cx} cy={0} r={19} fill="none" stroke="#334155" strokeWidth={5} />
                {[0, 60, 120].map((a) => (
                  <line
                    key={a}
                    x1={cx - 15}
                    y1={0}
                    x2={cx + 15}
                    y2={0}
                    stroke="#94a3b8"
                    strokeWidth={2.5}
                    transform={`rotate(${a} ${cx} 0)`}
                  />
                ))}
              </>
            )}
            {att === "winch" && (
              <>
                <circle cx={cx} cy={0} r={10} fill="#475569" stroke="#94a3b8" strokeWidth={2} />
                <line x1={cx - 10} y1={0} x2={cx + 10} y2={0} stroke="#94a3b8" strokeWidth={2} />
              </>
            )}
          </g>
          <circle cx={cx} cy={0} r={4} fill="#e2e8f0" />
        </>
      );
    }

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
          <g transform={`translate(${cx} 0)`}>
            <path
              d="M -8 8 v -12 a 2.5 2.5 0 0 1 5 0 v -4 a 2.5 2.5 0 0 1 5 0 v 4 a 2.5 2.5 0 0 1 5 0 v 6 c 0 6 -3 10 -8 10 h -2 c -3 0 -5 -2 -5 -4"
              fill="#e8b98a"
              stroke="#b98a5a"
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
          </g>
        </>
      );
  }
}

// current dots that run along the part while current flows
export function FlowDots({ p, L, electron }: { p: Part; L: number; electron: boolean }) {
  if (Math.abs(p.current) < 0.002 || p.destroyed) return null;
  const bodyW = BODY_W[p.type];
  const pad = Math.max(0, (L - bodyW) / 2);
  const SP = 16;
  // electrons really drift the opposite way from the arrow Ben Franklin picked
  const flow = electron ? -p.flow : p.flow;
  const offset = ((flow % SP) + SP) % SP;
  const dots: number[] = [];
  for (let x = offset; x <= L; x += SP) {
    if (bodyW > 0 && x > pad - 3 && x < L - pad + 3) continue;
    dots.push(x);
  }
  const fill = electron ? "#7cc7ff" : "#ffd83d";
  return (
    <>
      {dots.map((x, k) => (
        <circle key={k} cx={x} cy={0} r={2.7} fill={fill} opacity={0.95} />
      ))}
    </>
  );
}
