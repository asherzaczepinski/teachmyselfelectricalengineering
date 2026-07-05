// The course: one idea at a time. Every lesson is a short read plus a live
// circuit already built on the board, ready to poke.

import { Circuit } from "./sim";
import { GUIDES } from "./guides";
import { MODELS } from "./models";

export interface Concept {
  name: string; // what engineers actually call it
  equation?: string; // the real formula, exactly as it appears in the field
  spellout?: string; // every letter in the formula, in plain words
  meaning: string; // what it tells you and how it's used on a real bench
}

export interface Lesson {
  slug: string;
  title: string;
  subtitle: string;
  section: string;
  body: string[]; // short paragraphs — the one idea, in plain words
  tryThis: string[]; // hands-on steps on the live board
  why: string; // the physics, spelled out
  concepts: Concept[]; // the real engineering: terms and equations, fully explained
  build: (cx: number, cy: number) => Circuit;
}

const guide = (id: string) => {
  const g = GUIDES.find((g) => g.id === id);
  if (!g) throw new Error(`missing guide ${id}`);
  return g;
};
const model = (id: string) => {
  const m = MODELS.find((m) => m.id === id);
  if (!m) throw new Error(`missing model ${id}`);
  return m;
};

export const SECTIONS = [
  "First sparks",
  "More than one path",
  "Circuits with senses",
  "Computing with magnets",
];

export const LESSONS: Lesson[] = [
  // ——— First sparks ———
  {
    slug: "first-bulb",
    title: "Light your first bulb",
    subtitle: "What a circuit actually is: one unbroken loop.",
    section: "First sparks",
    body: [
      "Electricity doesn't get used up like fuel in a tank. Current is stuff that's already sitting in the wires, and the battery is a pump that pushes it around in a circle. No circle, no current — that's the whole game.",
      "That's why the switch works. It doesn't 'turn off the electricity' at the bulb — it just breaks the circle somewhere, anywhere, and instantly the current stops everywhere in the loop at once.",
    ],
    tryThis: guide("first-bulb").steps,
    why: guide("first-bulb").why,
    concepts: [
      {
        name: "Current (the symbol is I, measured in amperes, 'amps', A)",
        equation: "I = Q / t",
        spellout:
          "I is the current in amps. Q is the amount of charge that went past, in coulombs (one coulomb ≈ six billion billion electrons). t is the time it took, in seconds.",
        meaning:
          "Current is a flow rate — charge per second, exactly like liters per second in a pipe. One amp = one coulomb passing per second. On a schematic, engineers draw current direction with an arrow, always + to −.",
      },
      {
        name: "Voltage (the symbol is V, measured in volts, V)",
        equation: "V = energy / charge",
        spellout:
          "V is the voltage in volts. It's how many joules of energy each coulomb of charge gains (from a battery) or spends (in a bulb).",
        meaning:
          "Voltage is the push BETWEEN two points — it's always a comparison, never a property of one point alone. That's why a bird on one power line is fine: both feet sit at the same voltage.",
      },
      {
        name: "The circuit (a closed loop)",
        meaning:
          "Engineers call an unbroken loop a 'closed circuit', a broken one an 'open circuit', and an accidental zero-resistance path a 'short circuit'. Every schematic you'll ever read is just loops — trace them the way you traced this one.",
      },
    ],
    build: guide("first-bulb").build,
  },
  {
    slug: "measure",
    title: "Measure like an engineer",
    subtitle: "Amps go through, volts go across. Never mix those up.",
    section: "First sparks",
    body: [
      "There are only two numbers that matter in a circuit, and they answer different questions. Current (amps) asks: how much stuff is flowing past this point? Voltage (volts) asks: how hard is it being pushed between these two points?",
      "Because they answer different questions, you measure them differently. The ammeter joins the loop and lets the whole current run through itself. The voltmeter stands outside the loop and just compares two points — like a referee, not a player.",
    ],
    tryThis: guide("measure").steps,
    why: guide("measure").why,
    concepts: [
      {
        name: "First, the units themselves",
        equation: "amps (A) · volts (V) · ohms (Ω) · watts (W)",
        spellout:
          "Amps measure FLOW — how much charge streams past a point each second. Volts measure PUSH — how hard the source shoves between two points. Ohms measure RESISTANCE — how much a part fights the flow. Watts measure POWER — how much energy gets spent each second.",
        meaning:
          "Every number you will ever read on a bench, a datasheet or an appliance label is one of these four (or one of them with a prefix: milli- = a thousandth, kilo- = a thousand). Get these four straight and every equation below is just arithmetic between them.",
      },
      {
        name: "Ohm's law — the one equation you'll use every single day",
        equation: "V = I × R",
        spellout:
          "V is the voltage across the part, in volts. I is the current through it, in amps. R is its resistance, in ohms (symbol Ω).",
        meaning:
          "Know any two, get the third: I = V ÷ R and R = V ÷ I are the same law rearranged. On a real bench you measure V and I with meters exactly like these, then compute R — that's how you find a mystery resistor or check a heater element.",
      },
      {
        name: "Electric power (the symbol is P, measured in watts, W)",
        equation: "P = V × I",
        spellout:
          "P is power in watts — energy spent per second. V is the volts across the part, I is the amps through it.",
        meaning:
          "Multiply your two meter readings and you get real power. A '60 watt' bulb literally means V × I = 60. This is the number on every appliance label, and it's why your electricity bill is in kilowatt-hours (power × time).",
      },
      {
        name: "How meters connect: series vs parallel",
        meaning:
          "In series = in the loop (all current passes through). In parallel = across two points (it compares them from outside). Ammeters go in series and have nearly zero ohms; voltmeters go in parallel and have millions of ohms. Wire them the other way around and, on a real bench, you blow the meter's fuse — every electrician has done it once.",
      },
    ],
    build: guide("measure").build,
  },
  {
    slug: "blow-fuse",
    title: "Blow a fuse (on purpose)",
    subtitle: "Ohm's law, taught by a part that dies for you.",
    section: "First sparks",
    body: [
      "Here's the most important sentence in this whole course: current = push ÷ resistance. Nine volts pushing through five ohms gives about 1.8 amps. Turn the push up and the current goes up with it. That's Ohm's law, and it's really that plain.",
      "A fuse is a bet on that law. It's a wire so thin it melts above a set current. As long as your circuit behaves, it's invisible. The moment something goes wrong and the current spikes, it melts first and breaks the loop — sacrificing itself before the expensive stuff cooks.",
    ],
    tryThis: guide("blow-fuse").steps,
    why: guide("blow-fuse").why,
    concepts: [
      {
        name: "Joule heating (also called I²R loss)",
        equation: "P = I² × R",
        spellout:
          "P is the heat made, in watts. I is the current in amps — squared, so double the current means FOUR times the heat. R is the resistance in ohms.",
        meaning:
          "This is Ohm's law combined with P = V × I. The square is the dangerous part: currents don't have to get much bigger to make wildly more heat. It's why fuses exist, why thick wires matter, and why data centers spend fortunes on cooling.",
      },
      {
        name: "Ratings",
        meaning:
          "Every real part carries ratings: a fuse's amp rating, a resistor's watt rating, a wire's ampacity. Engineering practice is to stay well under them — a common rule of thumb is to use parts at no more than about half their rating. The fuse in this build rated '2 A' is a promise: past that, it opens the circuit.",
      },
      {
        name: "Series circuit rule",
        equation: "I is the same everywhere in a single loop",
        meaning:
          "In one unbranched loop, the ammeter reads the same current no matter where you put it — charge isn't created or lost along the way. That's why one fuse anywhere in the loop protects the whole loop.",
      },
    ],
    build: guide("blow-fuse").build,
  },
  {
    slug: "short-circuit",
    title: "Short circuit = fire",
    subtitle: "What happens when nothing slows the current down.",
    section: "First sparks",
    body: [
      "Every circuit so far had something in the loop doing a job — a bulb, a resistor — and that job soaked up the push. This loop has nothing. Just wire from + straight back to −.",
      "Ohm's law doesn't care that this is a mistake. Push ÷ almost-zero resistance = an enormous current, over a hundred amps here. All that energy still has to go somewhere, and the only thing left is heat. Watch where it goes.",
    ],
    tryThis: guide("short-circuit").steps,
    why: guide("short-circuit").why,
    concepts: [
      {
        name: "Internal resistance (the symbol is r, in ohms)",
        equation: "I_short = EMF / r",
        spellout:
          "I_short is the short-circuit current in amps. EMF (electromotive force) is the battery's full chemical push in volts — the 'no load' voltage. r is the battery's own tiny internal resistance in ohms.",
        meaning:
          "No source is perfect: every battery has a little resistance inside itself, and in a short that's the ONLY thing limiting current. A 9 V battery with r = 0.05 Ω shorts at 180 amps' worth of trying — which is why it cooks. Real engineers measure r by watching the terminal voltage sag under load.",
      },
      {
        name: "Terminal voltage sag",
        equation: "V_terminals = EMF − I × r",
        spellout:
          "V_terminals is what a voltmeter reads across the battery. EMF is its full push, I is the current being drawn, r is the internal resistance.",
        meaning:
          "The harder you work a battery, the lower its terminal voltage droops — that's your car's lights dimming as the starter cranks. In a dead short, almost all the EMF is dropped inside the battery itself, which is where all that heat comes from.",
      },
      {
        name: "Overcurrent protection",
        meaning:
          "Real installations put a fuse or circuit breaker in series with EVERYTHING. House breakers trip at 15–20 A; the wiring behind your walls is sized so it stays safe below that. The lesson here is the rule real electricians live by: the fuse protects the wire, not the appliance.",
      },
    ],
    build: guide("short-circuit").build,
  },

  // ——— More than one path ———
  {
    slug: "piano",
    title: "Build a piano",
    subtitle: "Parallel branches: every path gets the full push.",
    section: "More than one path",
    body: [
      "So far the current had one road. Now give it five, side by side across the same battery. That arrangement is called 'in parallel', and it has a superpower: every branch feels the battery's full push, no matter what the other branches are doing.",
      "That's why you can hold three keys and each note plays just as loud. It's also why every light in your house doesn't dim when you turn on one more — your house is wired in parallel too.",
    ],
    tryThis: guide("piano").steps,
    why: guide("piano").why,
    concepts: [
      {
        name: "Kirchhoff's current law (KCL) — one of the two laws all circuit analysis stands on",
        equation: "current in = current out, at every junction",
        spellout:
          "At any point where wires join, the amps flowing in must exactly equal the amps flowing out. Nothing piles up, nothing vanishes.",
        meaning:
          "Watch the rail readings while you hold keys: the battery's current is exactly the sum of the branch currents. Every professional analysis tool — including the solver running this page — is built on KCL plus Ohm's law applied at every junction simultaneously.",
      },
      {
        name: "Parallel resistance",
        equation: "1/R_total = 1/R₁ + 1/R₂ + …",
        spellout:
          "R_total is the combined resistance of branches sitting side by side. R₁, R₂ and so on are each branch's own resistance, all in ohms.",
        meaning:
          "More parallel paths = LESS total resistance = more total current, because you've opened more lanes. Two equal branches halve the resistance. This is why plugging too many appliances into one outlet strip trips the breaker — each one is another parallel path.",
      },
      {
        name: "The parallel voltage rule",
        equation: "every parallel branch feels the same V",
        meaning:
          "All five piano branches sit across the same two rails, so each gets the full 9 volts regardless of the others. Your house is wired exactly this way at 120 V — which is why the toaster doesn't dim when the fridge kicks on.",
      },
    ],
    build: guide("piano").build,
  },
  {
    slug: "light-show",
    title: "Make a light show",
    subtitle: "LEDs, blinkers, and the resistor that keeps them alive.",
    section: "More than one path",
    body: [
      "An LED is fussier than a bulb. It only passes current one way, it always eats about 2 volts as an entry fee, and past that it barely resists at all — so if you connect it straight to a battery, it takes everything the battery has, overheats, and pops.",
      "The fix is one humble resistor in series. It soaks up the leftover push and holds the current down to a safe trickle. Every LED you've ever seen has a resistor (or something like it) babysitting it.",
    ],
    tryThis: guide("light-show").steps,
    why: guide("light-show").why,
    concepts: [
      {
        name: "Kirchhoff's voltage law (KVL) — the other foundation law",
        equation: "around any loop, all the voltages add up to zero",
        spellout:
          "Walk any closed loop: the pushes (battery volts, counted +) and the drops (volts used by each part, counted −) always cancel out exactly.",
        meaning:
          "In each branch here: 9 V from the battery = 2 V eaten by the LED + 7 V dropped across the resistor. Nothing left over, ever. KVL is how engineers work out unknown voltages on paper before touching a part.",
      },
      {
        name: "LED forward voltage (written V_f on every datasheet)",
        equation: "V_f ≈ 1.8–3.3 V depending on color",
        spellout: "V_f is the fixed voltage an LED eats before it conducts — its 'entry fee'.",
        meaning:
          "This lab's LEDs use V_f = 2 V. Real red LEDs are ~1.8 V, blue and white ~3 V — the color literally sets the energy per light particle. You'll find V_f on the first page of any LED datasheet you ever read.",
      },
      {
        name: "Sizing a current-limiting resistor — the most-Googled formula in hobby electronics",
        equation: "R = (V_supply − V_f) / I_target",
        spellout:
          "R is the resistor to use, in ohms. V_supply is your source voltage. V_f is the LED's forward voltage. I_target is the current you want — usually 0.010 to 0.020 amps (10–20 mA) for a normal LED.",
        meaning:
          "Here: (9 − 2) ÷ 0.031 ≈ 220 Ω, exactly the resistor in this build. Do this arithmetic once per LED, forever — it's the first real calculation every electronics beginner learns, and now you know where every number in it comes from.",
      },
    ],
    build: guide("light-show").build,
  },
  {
    slug: "spin-lift",
    title: "Spin a wheel, lift a crate",
    subtitle: "Motors turn current into real movement — with direction.",
    section: "More than one path",
    body: [
      "A motor is a loop of wire between magnets. Push current through, and the wire gets shoved sideways — spin. Push the current the other way, and the shove reverses — the motor runs backwards. Direction of current is not a bookkeeping detail; it's which way your crane goes.",
      "Bolt something on the shaft and the spin becomes work: a wheel drives, a propeller blows, a winch winds rope. More current, more speed. This is most of what electricity does for civilization — heaters and motors, push and spin.",
    ],
    tryThis: guide("spin-lift").steps,
    why: guide("spin-lift").why,
    concepts: [
      {
        name: "The motor force (in the field: F = BIL, the 'motor law')",
        equation: "F = B × I × L",
        spellout:
          "F is the sideways force on the wire, in newtons. B is the magnetic field strength, in teslas. I is the current in amps. L is the length of wire sitting in the field, in meters.",
        meaning:
          "A wire carrying current through a magnetic field gets shoved sideways — that shove, arranged in a circle, is every motor ever built. Reverse I and the force reverses, which is exactly why your crane runs backwards when you flip the battery.",
      },
      {
        name: "Electrical power becoming mechanical power",
        equation: "P_in = V × I   →   P_out = force × speed",
        spellout:
          "P_in is the electrical watts you feed the motor (volts × amps). P_out is the mechanical watts it delivers (newtons of force × meters-per-second of movement). The difference is lost as heat.",
        meaning:
          "Watts are watts — electrical and mechanical power are the same currency, which is why motor nameplates list both. A real motor converts 70–95% of P_in into motion; the rest warms the windings (you can feel this motor's temperature climb under load).",
      },
      {
        name: "The load changes the current",
        meaning:
          "A real motor draws more current the harder it works, and a stalled motor draws the most of all — near short-circuit levels. That's why stalled motors burn out and why real motor circuits always carry a fuse or breaker sized above running current but below stall current.",
      },
    ],
    build: guide("spin-lift").build,
  },

  // ——— Circuits with senses ———
  {
    slug: "streetlight",
    title: "Streetlight",
    subtitle: "A light sensor gives your circuit an eye.",
    section: "Circuits with senses",
    body: [
      "A light sensor is just a resistor that changes its mind: in the dark it resists like rubber, in bright light it barely resists at all. That one trick lets a circuit react to the world.",
      "The clever part of a streetlight is that it turns ON when the sensor sees LESS. That takes an inverter — here, a magnetic switch that OPENS when its coil is powered. Daylight powers the coil, the coil holds the lamp's switch open. Darkness lets go, the switch snaps shut, the lamp lights. Nobody flips anything.",
    ],
    tryThis: [
      "The little loop on the left is the 'sun' — a bright bulb with its own switch, currently on.",
      "Notice the lamp on the right is dark, and the sensor reads a high light percentage.",
      "Open the sun's switch. The sensor goes dark, the coil lets go, and the streetlamp turns itself on.",
      "Turn the sun back on and watch it switch itself off again.",
    ],
    why: "The sensor and coil form a chain: light → low resistance → enough current to magnetize the coil → the flipped switch stays open. Break any link (darkness) and the lamp circuit closes. This exact pattern — sensor, threshold, inverted switch — runs your porch light, your thermostat, and your toaster.",
    concepts: [
      {
        name: "The voltage divider — the most common two-resistor circuit in existence",
        equation: "V_out = V_in × R₂ / (R₁ + R₂)",
        spellout:
          "V_out is the voltage you tap off the middle. V_in is the full supply voltage. R₁ and R₂ are the two resistances in series — V_out is measured across R₂.",
        meaning:
          "Two resistances in series split the voltage in proportion to their size. The sensor branch here IS a divider: sensor + coil in series, and the coil's share of the 9 volts grows as the sensor's resistance shrinks. Nearly every sensor in the real world is read this way.",
      },
      {
        name: "The photoresistor (LDR — light-dependent resistor)",
        equation: "bright ≈ hundreds of Ω, dark ≈ millions of Ω",
        meaning:
          "A real LDR datasheet quotes exactly those two numbers — a 'light resistance' and a 'dark resistance', often 1,000× apart. This lab's sensor behaves the same. LDRs cost pennies and sat in every streetlight and night-light for decades.",
      },
      {
        name: "Logical inversion (NOT)",
        meaning:
          "The 'opens when coil is on' switch turns a YES into a NO — engineers call the two relay types 'normally open' (NO) and 'normally closed' (NC), and the NC kind is a hardware NOT gate. Automatic behavior usually needs at least one inversion: act when something ISN'T there.",
      },
    ],
    build: model("streetlight").build,
  },
  {
    slug: "firealarm",
    title: "Fire alarm",
    subtitle: "A heat sensor plus a threshold equals a decision.",
    section: "Circuits with senses",
    body: [
      "A heat sensor's resistance falls as things near it warm up. On its own that just makes a meter wiggle. The interesting moment is when you add a threshold: below this much current, nothing; above it, the coil grabs and the siren fires. A smooth, gradual change in temperature becomes a sharp yes/no decision.",
      "That jump — from 'measuring' to 'deciding' — is the seed of everything automatic. A thermostat is this circuit. So is a kettle that switches itself off.",
    ],
    tryThis: [
      "Close the switch on the left loop. The space heater starts warming up on wall-outlet power.",
      "Watch the heat sensor's percentage climb as the heater coil starts to glow red.",
      "Around half a minute in, the sensor's resistance drops far enough — the coil grabs, and the alarm screams.",
      "Open the heater's switch. The alarm keeps going until things cool back down — just like a real one.",
    ],
    why: "The coil needs about 20 milliamps to magnetize. Current through the sensor branch is 9 volts ÷ (sensor + coil resistance), so the alarm fires exactly when the sensor drops below a few hundred ohms — which happens at a specific temperature. Threshold = decision.",
    concepts: [
      {
        name: "The thermistor (this kind is called NTC — negative temperature coefficient)",
        equation: "hotter → lower R",
        spellout:
          "NTC means the resistance and the temperature move in OPPOSITE directions: temperature up, ohms down.",
        meaning:
          "Real thermistors are the cheapest temperature sensor there is — they're in your kettle, your laptop battery, your car. Engineers read them with the voltage-divider trick from last step, then convert ohms to degrees using the part's datasheet curve.",
      },
      {
        name: "Threshold and trip point",
        equation: "trips when I = V / (R_sensor + R_coil) > I_pull-in",
        spellout:
          "I is the branch current. V is the supply (9 volts). R_sensor is the thermistor's resistance right now, R_coil is the coil's fixed 120 Ω. I_pull-in is the current the coil needs to grab (about 0.02 amps here).",
        meaning:
          "Set the numbers and you've CHOSEN the temperature at which the alarm fires — that's what the dial on a real thermostat adjusts. Turning a smooth analog reading into one sharp yes/no is the single most common job in control engineering.",
      },
      {
        name: "Hysteresis (worth knowing the word)",
        meaning:
          "Real alarms trip at one temperature but reset at a slightly LOWER one, so they don't chatter on/off right at the boundary. That deliberate gap is called hysteresis. Watch this alarm as things cool and you'll see why designers add it.",
      },
    ],
    build: model("firealarm").build,
  },
  {
    slug: "wireless",
    title: "Wireless power",
    subtitle: "Light is energy — catch it and spin a fan with it.",
    section: "Circuits with senses",
    body: [
      "The receiver circuit here has no battery. Read that again: no battery. Its only power source is the light landing on the solar panel from the bulb next door.",
      "That's not a trick — light IS energy leaving the bulb. Most of it heats the room; the panel catches some and turns it back into a voltage. Every solar farm is this build, with the sun as the transmitter.",
    ],
    tryThis: [
      "Close the transmitter's switch. The bulb blazes.",
      "Look at the solar panel's label — it's making volts now. The fan spins with not a single wire crossing the gap.",
      "Drag the receiver loop further away, then closer. Distance matters enormously — energy spreads out fast.",
      "Open the switch. Fan stops. No light, no power.",
    ],
    why: "The bulb turns electrical power into light, the panel turns light back into electrical push. Each hop wastes most of the energy (feel free to compare the bulb's watts to the motor's), which is why real wireless power is hard — but it genuinely works, and you just watched it.",
    concepts: [
      {
        name: "Efficiency (the symbol is η, the Greek letter eta)",
        equation: "η = P_out / P_in",
        spellout:
          "η is efficiency — a fraction between 0 and 1 (or a percentage). P_out is the useful watts you get; P_in is the watts you paid.",
        meaning:
          "Compute it here for real: the bulb draws about 30 watts, the fan gets maybe 4 — so this link is around 13% efficient, and each conversion step multiplies its losses. Real solar panels run about 20% efficient; every energy engineer lives and dies by η.",
      },
      {
        name: "The inverse-square law",
        equation: "intensity ∝ 1 / d²",
        spellout:
          "The light power landing per unit area falls with the SQUARE of the distance d. Twice as far = a quarter of the light. (∝ means 'is proportional to'.)",
        meaning:
          "Light spreads out over a growing sphere, so its energy thins fast. Drag the receiver away and watch the panel's volts collapse — that's 1/d² live, and it's the same law behind radio range, Wi-Fi bars and why Mars rovers need big panels.",
      },
      {
        name: "The photovoltaic effect",
        meaning:
          "Light arrives in packets (photons). A photon with enough energy knocks an electron loose inside the panel's junction, and the junction's one-way field sweeps it out as current. It's the LED's trick run in reverse — LED: current in, light out; solar cell: light in, current out.",
      },
    ],
    build: model("wireless").build,
  },

  // ——— Computing with magnets ———
  {
    slug: "bell",
    title: "Electric bell",
    subtitle: "A circuit that switches itself — your first oscillator.",
    section: "Computing with magnets",
    body: [
      "An electromagnet coil becomes a magnet when current flows. A magnetic switch flips when a coil on its channel is powered. Now the mischief: what if the coil's own power runs through a switch that OPENS when the coil is on?",
      "Power flows → coil magnetizes → switch opens → power stops → coil lets go → switch closes → power flows again. Around and around, dozens of times a second, forever. That buzz is exactly how doorbells and old car horns work — and a circuit that flips itself is called an oscillator, the heartbeat inside every computer.",
    ],
    tryThis: [
      "Close the switch and listen. That machine-gun buzz is the loop making and breaking itself.",
      "Click the flipped magnetic switch and watch its label — it's obeying the coil right next to it, on the same channel.",
      "Try changing the magnetic switch to the 'closes when coil is on' kind. The buzzing stops — the loop just latches. One word changed, completely different machine.",
    ],
    why: "The magnetic switch takes a moment to move (in this lab, one frame). That tiny delay is what makes the cycle possible — with an instant switch the circuit would have no answer at all. Real relays buzz at their own mechanical speed; ours rings at the speed of the simulation.",
    concepts: [
      {
        name: "The oscillator",
        equation: "f = 1 / T",
        spellout:
          "f is the frequency in hertz (Hz) — how many complete on/off cycles happen per second. T is the period — how many seconds one cycle takes.",
        meaning:
          "Any circuit that flips itself endlessly is an oscillator, and everything with a beat contains one: a doorbell (tens of Hz), a quartz watch (32,768 Hz), your computer's clock (billions of Hz). They all trade on the same trick you just built: output fed back to fight its own input.",
      },
      {
        name: "Negative feedback",
        meaning:
          "The coil's output (magnetism) acts to CUT the coil's own input (current). Feed a system's result back against itself and you get either steady balance or endless oscillation, depending on the delay. This one idea runs thermostats, cruise control and audio amplifiers.",
      },
      {
        name: "Duty cycle",
        equation: "duty = time on / time of one full cycle",
        spellout: "The fraction of each cycle a signal spends ON — 0.5 means half on, half off.",
        meaning:
          "Real engineers dim LEDs and control motor speed by switching fast and adjusting the duty cycle (it's called PWM — pulse-width modulation). Your bell is a 50% duty oscillator; a dimmer is the same thing with an adjustable ratio.",
      },
    ],
    build: model("bell").build,
  },
  {
    slug: "adder",
    title: "The calculator",
    subtitle: "1 + 1, computed by six magnetic switches. This is a computer.",
    section: "Computing with magnets",
    body: [
      "Everything a computer does reduces to switches flipping other switches. Here is the smallest honest piece of that: a circuit that ADDS. Hold A and coil 1 magnetizes. Hold S and coil 2 magnetizes. The six magnetic switches then work out the answer in binary: green light is the ones place, red light is the twos place.",
      "Look at how the sum column does it: the green light gets power when exactly ONE coil is on — through 'switch 1 closed AND switch 2 flipped' on one leg, or the mirror image on the other. That arrangement has a name: exclusive-or. The red light is simpler: two switches in a row, both coils or nothing.",
      "The machines that ran phone networks and broke wartime codes were rooms full of exactly this, clicking. Silicon just made the switches microscopic and silent.",
    ],
    tryThis: [
      "Hold nothing: both lights dark. 0 + 0 = 00.",
      "Hold A alone: green. 1 + 0 = 01.",
      "Hold S alone: green again. 0 + 1 = 01.",
      "Hold both: green goes out, red lights. 1 + 1 = 10 — 'two' in binary. You just watched switches carry a digit.",
      "Click any magnetic switch and follow which coil it obeys and whether it's the flipped kind.",
    ],
    why: "Series switches = AND (both must conduct). Parallel legs = OR (either path works). A flipped switch = NOT. Sum = (A AND NOT B) OR (NOT A AND B); carry = A AND B. Those four words — and, or, not, carry — scale up to every calculator, phone and laptop ever built.",
    concepts: [
      {
        name: "Boolean logic in hardware",
        equation: "series = AND · parallel = OR · normally-closed = NOT",
        spellout:
          "Two switches in a row conduct only if BOTH are closed (AND). Two side-by-side paths conduct if EITHER is (OR). A switch that opens when told to close is a NOT.",
        meaning:
          "This mapping between wiring shapes and logic words is the deepest idea in digital electronics — Claude Shannon proved it in 1937, in what's often called the most important master's thesis ever written. Every chip layout is still just this, drawn smaller.",
      },
      {
        name: "The half adder (its real name)",
        equation: "SUM = A ⊕ B · CARRY = A · B",
        spellout:
          "⊕ is exclusive-or, XOR: true when the inputs differ. The dot means AND: true only when both are. A and B are the two input bits, each 0 or 1.",
        meaning:
          "This exact two-equation block — the half adder — is drawn in the first chapter of every digital design textbook, and you just watched one work in switches you can point at. Chain them with carry inputs and they're called full adders.",
      },
      {
        name: "Binary numbers (base 2)",
        equation: "places are worth 1, 2, 4, 8, 16, … (each double the last)",
        spellout:
          "Instead of ones/tens/hundreds, binary places are worth one, two, four, eight… A number is the sum of the places holding a 1: binary 10 = one two + zero ones = 2.",
        meaning:
          "Computers use base 2 because a switch has exactly two trustworthy states. Green lit alone = 01 = one. Red lit alone = 10 = two. Everything your phone has ever done is these place values, very fast.",
      },
    ],
    build: model("adder").build,
  },
  {
    slug: "program-the-chip",
    title: "Program the microchip",
    subtitle: "Your first firmware: a brain that drives the circuits you already know.",
    section: "Computing with magnets",
    body: [
      "The magnet calculator you just met was wired to do exactly one thing, forever. A microchip is the next idea: a huge pile of those same switches, arranged so that a LIST OF INSTRUCTIONS — a program — decides what they do. Change the list, change the machine, without touching a wire.",
      "This chip speaks the same magnetic language as your coils and switches: its program can drive channels 1–6 (like a built-in electromagnet) and read them (like a built-in magnetic switch). Here it's blinking a bulb through channel 1, and a key button on channel 2 is wired up as an input, waiting for your program to notice it.",
    ],
    tryThis: [
      "Watch: the chip runs 'turn 1 on · wait 0.5 · turn 1 off · wait 0.5' forever, and the channel-1 magnetic switch blinks the bulb.",
      "Click the chip and change both waits to 0.1. The instant you edit, the program restarts — and the bulb flickers fast.",
      "Now give it an input. Replace the program with:  if 2 is on  ·  turn 1 on  ·  end  ·  if 2 is off  ·  turn 1 off  ·  end  (one command per line). Hold A — the bulb follows the button, through software.",
      "Cut the chip's power with its switch. The program stops dead and forgets where it was — firmware only lives while current flows.",
      "Break something on purpose: write 'turn 1 on' with no wait and nothing else. It works — the bulb just stays on. Programs are only ever lists of these little steps.",
    ],
    why: "Nothing mystical was added: the chip drives channel 1 exactly like the coil you can hold in your hand, and reads channel 2 exactly like a magnetic switch does. 'Programmable' just means the wiring diagram moved into a list of words you can edit. Every Arduino project, thermostat and washing machine is this loop: read inputs, decide, set outputs, repeat.",
    concepts: [
      {
        name: "The microcontroller (MCU)",
        meaning:
          "A complete computer — processor, memory, inputs and outputs — on one chip, built to run a single small program forever. Arduinos, keyboards, toasters and car dashboards all run on them. They outnumber 'real' computers thousands to one.",
      },
      {
        name: "Firmware and the main loop",
        equation: "read inputs → decide → set outputs → repeat",
        spellout:
          "Firmware is the program burned into a device. Almost all firmware is one endless loop of those four steps — exactly what your blink program is.",
        meaning:
          "When this chip finishes its last line it starts over at the top, forever, thousands of times a second if you let it. That endless loop is the heartbeat of every embedded device you own.",
      },
      {
        name: "I/O — inputs and outputs (on real boards: GPIO pins)",
        meaning:
          "A program is useless until it can feel and touch the world. On a real Arduino those connections are numbered pins; here they're the magnetic channels 1–6. 'turn 1 on' is this lab's digitalWrite; 'if 2 is on' is its digitalRead — the two most-used commands in all of Arduino programming.",
      },
    ],
    build: model("chiplab").build,
  },
];

export function lessonBySlug(slug: string): Lesson | undefined {
  return LESSONS.find((l) => l.slug === slug);
}
export function lessonIndex(slug: string): number {
  return LESSONS.findIndex((l) => l.slug === slug);
}
