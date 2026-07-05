// The drawn artwork for every part, in local coordinates: the part runs
// from (0,0) to (L,0) along the x axis.

import { LED_COLORS, Part, PartType } from "../../lib/sim";

export const COPPER = "#d98e32";

// width of the drawn body in the middle of each part — current dots are
// hidden under this span so they only run along the exposed lead wires
export const BODY_W: Record<PartType, number> = {
  wire: 0,
  battery: 60,
  resistor: 60,
  bulb: 44,
  switch: 56,
  button: 44,
  blinker: 46,
  fuse: 50,
  capacitor: 22,
  led: 38,
  diode: 38,
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
