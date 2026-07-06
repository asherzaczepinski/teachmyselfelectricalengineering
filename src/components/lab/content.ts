// All the words in the lab, in one place: the shelf layout (TOOLBOX), the
// plain-language part descriptions (LEARN), the whats-it-made-of stories for
// the microscope (microMaterial), and the click-a-symbol glossary.

import { PartType } from "../../lib/sim";

export const TOOLBOX: { title: string; items: PartType[] }[] = [
  {
    title: "Build",
    items: [
      "breadboard",
      "wire",
      "battery",
      "switch",
      "resistor",
      "bulb",
      "led",
      "diode",
      "segment",
      "capacitor",
      "inductor",
      "fuse",
      "ptc",
      "zener",
      "neon",
      "heater",
      "motor",
      "pot",
      "rgbled",
      "servo",
    ],
  },
  { title: "Inputs & sound", items: ["button", "blinker", "speaker", "buzzer", "voicebox", "tiltswitch"] },
  { title: "Measure", items: ["ammeter", "voltmeter"] },
  {
    title: "Logic & sensors",
    items: ["coil", "relay", "lightsensor", "heatsensor", "solar", "ultrasonic", "pir", "soundsensor", "chip"],
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
  coil:
    "An electromagnet: a few hundred loops of wire wrapped around an iron core. Push current through the loops and their little magnetic fields all stack up into one strong magnet; cut the current and the magnetism vanishes instantly. The dial picks which CHANNEL (1-6) it broadcasts on — any magnetic switch tuned to the same number feels it across the bench, no wires between them. More current = a stronger pull.",
  relay:
    "A magnetic switch — a springy iron strip that snaps shut when a coil on its channel is energized, and springs back open the moment the magnetism dies. It's how a WEAK circuit can control a STRONG one: the tiny coil current never touches this switch's circuit, it just reaches over magnetically and flips it. Set it 'normally closed' and it does the opposite: open while the magnet is on. Chain a few and you have logic: two in a row = AND, two side by side = OR.",
  lightsensor: "In the dark it resists like rubber; in bright light it conducts almost happily. Park it near a bulb and it becomes an eye for your circuit.",
  heatsensor: "Its resistance falls as things near it heat up. Pair it with a coil and a magnetic switch and you've built a genuine fire alarm.",
  solar: "Light knocks electrons loose in the panel, and that IS a voltage. The brighter the light landing on it, the harder it pushes. Free power — as long as something shines on it.",
  zener:
    "A diode with a designed weakness: forward, it's a normal one-way valve; backward, it holds the line until about 5 volts and then conducts ON PURPOSE, clamping the voltage right there. That clamp protects delicate parts from spikes.",
  neon:
    "Two metal pins in a glass bubble of neon gas. Below about 65 volts the gas is an insulator; above it, the gas ionizes and glows that famous orange. Old machines used them as power lights straight off the mains.",
  ptc: "A resettable fuse (a PTC). Overload it and it heats up; heat makes its plastic-and-carbon body resist harder, which strangles the current before anything burns. Unlike a normal fuse, it cools off and forgives you.",
  breadboard:
    "A slab of plastic full of sockets. The holes in each little column are joined by metal strips inside, so parts pushed into the same column connect without solder. Here it's your building platform — nothing conducts through its body.",
  pot: "A potentiometer — a resistor with a knob. Inside, a wiper slides along a carbon track: more track between the contacts, more resistance. Every volume dial you've ever turned was one of these.",
  rgbled:
    "Three tiny LEDs — red, green, blue — sharing one lens. Push current through it and its color sweeps with the strength of the flow. Every pixel on your screen is this exact trick, shrunk a thousandfold.",
  tiltswitch:
    "A little tube with a metal ball inside. Hold it level and the ball sits away from the contacts; tilt it and the ball rolls down and bridges them. Drag one of its ends up or down to tip it.",
  servo: "A motor with its own tiny brain: instead of spinning forever it swings an arm TO an angle and holds it there. More volts, bigger swing. Robot arms and RC-car steering are stacks of these.",
  ultrasonic:
    "Sonar, like a bat: one eye clicks, the other listens for the echo. Here, the closer any other part sits to it, the better it conducts — park something next to it and it wakes right up.",
  pir: "A motion sensor. It doesn't see things — it sees CHANGE. Move anything nearby and it conducts for a moment, then settles back to silence. Every automatic hallway light has one watching.",
  soundsensor:
    "A microphone driving a switch: while something nearby is making noise — a buzzer, a speaker, the talking machine — it conducts. Clap-activated lights are exactly this.",
  memory:
    "A memory cell. It holds one number on its screen and adds one every time current STARTS flowing through it. Cut the power completely — it still remembers. Inside are latching switches: switches that stay flipped after the push that flipped them is gone.",
  chip: "A microcontroller — a whole computer the size of a fingernail, ready to be programmed. Power its two pins and its onboard light blinks its 'I'm alive' heartbeat. Later steps will teach it tricks; for now it's the newest tool on your bench.",
  usbc: "The PC's power lead: five steady, safe volts out of the tower. Solder your microchip (or anything small) to its bare end joint and the computer feeds it — exactly how a real Arduino drinks from a USB port.",
  calculator: "Inside this box are thousands of the same magnetic-switch tricks you can build yourself — the 1+1 adder, repeated and chained until it can multiply and divide. Real chips just shrink those switches down to specks of silicon. No power, no math: it's a circuit part like any other.",
};

// ——— the microscope: what you see when you zoom all the way into a part ———

export interface MicroMaterial {
  title: string;
  atoms: string;
  electrons: string;
  atomFill: string;
  atomStroke: string;
  freeElectrons: boolean;
  split?: boolean; // draw two different materials meeting in the middle
}

export function microMaterial(t: PartType): MicroMaterial {
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
  if (t === "calculator" || t === "voicebox" || t === "memory")
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
export function explainSymbols(text: string): string[] {
  const out: string[] = [];
  for (const [re, gloss] of SYMBOL_GLOSS) if (re.test(text)) out.push(gloss);
  return out.length ? out : ["This label shows the part's live reading, straight from the solver."];
}

