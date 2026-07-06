"use client";

import { useState } from "react";
import CircuitLab, { LEARN } from "./lab/CircuitLab";
import { microMaterial } from "./lab/content";
import { Glyph } from "./lab/Glyph";
import { blankPart, CATALOG, Circuit, Part, PartType, uid } from "../lib/sim";

// a conducting preview of each part for the rulebook cards
function tourPart(type: PartType): Part {
  const part: Part = { id: `tour-${type}`, a: "_a", b: "_b", ...blankPart(type) };
  part.closed = true;
  return part;
}

// the simplest possible circuit: a battery, a bulb, two wires. No switch.
function starter(cx: number, cy: number): Circuit {
  const circ: Circuit = { vertices: [], parts: [] };
  const V = (x: number, y: number) => {
    const v = { id: uid("v"), x, y };
    circ.vertices.push(v);
    return v;
  };
  const P = (type: PartType, a: { id: string }, b: { id: string }) => {
    circ.parts.push({ id: uid("p"), a: a.id, b: b.id, ...blankPart(type) });
  };
  const bl = V(cx - 55, cy + 150);
  const br = V(cx + 55, cy + 150);
  const tr = V(cx + 55, cy - 150);
  const tl = V(cx - 55, cy - 150);
  P("battery", bl, br);
  P("wire", br, tr);
  P("bulb", tl, tr);
  P("wire", tl, bl);
  return circ;
}

// the parts worth reading about, in the order you're likely to meet them
const PART_TOUR: PartType[] = [
  "breadboard",
  "battery",
  "wire",
  "switch",
  "bulb",
  "resistor",
  "led",
  "fuse",
  "ptc",
  "zener",
  "neon",
  "capacitor",
  "inductor",
  "motor",
  "coil",
  "relay",
  "lightsensor",
  "heatsensor",
  "solar",
  "pot",
  "rgbled",
  "tiltswitch",
  "servo",
  "ultrasonic",
  "pir",
  "soundsensor",
];

const UNITS = [
  {
    name: "Amps — how much is flowing",
    equation: "current (amps) = how much charge passes one spot each second",
    body: "Electric current is stuff actually moving — electrons crawling through the metal. One amp means about six billion billion electrons pass a point every second. A phone charger moves about 2 amps; a lit LED sips about 0.02.",
  },
  {
    name: "Volts — how hard it's being pushed",
    equation: "voltage (volts) = the strength of the push between two points",
    body: "Volts don't flow anywhere. A volt measures how hard the battery is shoving the charge — the pressure difference between two points. A little battery pushes with 9 volts whether or not anything is connected, the same way a stretched spring pushes whether or not it's moving.",
  },
  {
    name: "Ohms — how hard the path fights back",
    equation: "resistance (ohms) = how much a part resists the flow",
    body: "Every material argues with current a little. Thick copper wire barely argues (a tiny fraction of an ohm). A bulb's thin filament argues a lot (hundreds of ohms once hot). The Ω symbol you see on labels is just the letter for ohms.",
  },
  {
    name: "Watts — how fast energy is being spent",
    equation: "power (watts) = volts × amps",
    body: "Multiply the push by the flow and you get how fast energy is turning into light, motion, or heat. Nine volts pushing two amps is eighteen watts. This is the number your electric bill counts, and the number that decides whether a part gets warm — or explodes.",
  },
];

const EQUATIONS = [
  {
    name: "Ohm's law — the one to remember",
    equation: "current = push ÷ resistance   (amps = volts ÷ ohms)",
    body: "This is most of electronics. Nine volts across five ohms: nine divided by five is 1.8 amps. Double the push, double the flow. Double the resistance, half the flow. Every letter version you'll ever see (I = V ÷ R) says exactly this: I is current in amps, V is voltage in volts, R is resistance in ohms.",
  },
  {
    name: "Heat in a part",
    equation: "watts of heat = amps × amps × ohms",
    body: "Current through resistance makes heat — that's the whole story of toasters, fuses, and burned fingers. Notice the current counts twice: three times the current means nine times the heat. That's why a short circuit (huge current, tiny resistance) cooks things so fast, and it's what the parts here obey when they glow, smoke, and blow apart.",
  },
  {
    name: "Parts in a chain (series)",
    equation: "total ohms = first ohms + second ohms + …",
    body: "One loop, one current: the same amps squeeze through every part in the chain, and each part's resistance stacks onto the total. Add a resistor in line with a bulb and the bulb dims, because the whole chain now argues harder against the same push.",
  },
  {
    name: "Parts side by side (parallel)",
    equation: "the current splits — most takes the easiest path",
    body: "Give the current two paths and it takes both at once, splitting up in proportion to how easy each path is. Two equal bulbs share evenly. A copper wire next to a bulb steals nearly everything — which is exactly what a short circuit is: an accidental easy path.",
  },
];

export default function Playground() {
  const [showDocs, setShowDocs] = useState(false);

  return (
    <div className="h-dvh bg-[var(--bg)] text-[var(--ink)]">
      {/* the lab: the whole screen */}
      <div className="h-full">
        <CircuitLab initialBuild={starter} onHelp={() => setShowDocs(true)} />
      </div>

      {/* the explanations, as their own page over the top; the lab stays alive underneath */}
      {showDocs && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-[var(--bg)]">
          <div className="mx-auto max-w-4xl px-5 pb-20 pt-6">
            <div className="flex items-center mb-10">
              <h1 className="text-2xl font-semibold tracking-tight">How it all works</h1>
              <div className="flex-1" />
              <button className="btn" onClick={() => setShowDocs(false)}>
                ← Back to the playground
              </button>
            </div>

            <section className="mb-14">
              <h2 className="text-2xl font-semibold tracking-tight mb-2">The units — what the numbers mean</h2>
              <p className="text-[var(--ink-2)] mb-6">
                Four words cover almost everything a meter can tell you. None of them are complicated; they just
                measure different things about the same flow.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                {UNITS.map((u) => (
                  <div key={u.name} className="border border-[var(--line)] bg-[var(--panel)] p-4">
                    <h3 className="font-semibold mb-1.5">{u.name}</h3>
                    <p className="text-[13px] mb-2 text-[var(--accent)]" style={{ fontFamily: "var(--font-mono)" }}>
                      {u.equation}
                    </p>
                    <p className="text-[13.5px] leading-relaxed text-[var(--ink-2)]">{u.body}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="mb-14">
              <h2 className="text-2xl font-semibold tracking-tight mb-2">
                The equations — the whole rulebook is short
              </h2>
              <p className="text-[var(--ink-2)] mb-6">
                Everything on the bench obeys these four rules, every frame. No letter here is left unexplained: if an
                equation uses a word, the words are amps, volts, ohms, and watts from the section above.
              </p>
              <div className="grid gap-4">
                {EQUATIONS.map((eq) => (
                  <div key={eq.name} className="border border-[var(--line)] bg-[var(--panel)] p-4">
                    <h3 className="font-semibold mb-1.5">{eq.name}</h3>
                    <p className="text-[13px] mb-2 text-[var(--accent)]" style={{ fontFamily: "var(--font-mono)" }}>
                      {eq.equation}
                    </p>
                    <p className="text-[13.5px] leading-relaxed text-[var(--ink-2)]">{eq.body}</p>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold tracking-tight mb-2">How the parts think</h2>
              <p className="text-[var(--ink-2)] mb-6">The logic of each part on the shelf, in plain words.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                {PART_TOUR.map((t) => {
                  const def = CATALOG[t];
                  const inside = microMaterial(t);
                  return (
                    <div key={t} className="border border-[var(--line)] bg-[var(--panel)] p-4">
                      <div className="bg-[#0b1220] border border-[var(--line)] px-2 py-1 mb-2.5">
                        <svg
                          width="100%"
                          height="46"
                          viewBox={`-10 -26 ${def.len + 20} 52`}
                          preserveAspectRatio="xMidYMid meet"
                          aria-hidden
                        >
                          <Glyph p={tourPart(t)} L={def.len} />
                        </svg>
                      </div>
                      <h3 className="font-semibold mb-1.5">{def.label}</h3>
                      <p className="text-[13.5px] leading-relaxed text-[var(--ink-2)] mb-2">{LEARN[t]}</p>
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--ink-3)] mb-1">
                        What it&apos;s made of — {inside.title}
                      </p>
                      <p className="text-[12.5px] leading-relaxed text-[var(--ink-3)]">{inside.atoms}</p>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
