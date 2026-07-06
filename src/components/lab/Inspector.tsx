"use client";

// The panel that opens when a part is selected: its knobs, its readings,
// and its remove button. One case per part type that has anything to say.

import { useState } from "react";
import { CATALOG, CHANNEL_COLORS, LED_COLORS, LedColor, MotorAttachment, NOTES, Part } from "../../lib/sim";
import { fmtAmps, fmtVolts } from "../../lib/fmt";

export function Inspector({
  part,
  onClose,
  onFlip,
}: {
  part: Part;
  onClose: () => void;
  onFlip: () => void;
}) {
  const def = CATALOG[part.type];
  const set = (fn: (p: Part) => void) => fn(part); // mutate; the frame loop re-renders

  return (
    <div
      className="absolute top-16 right-44 z-20 w-[300px] max-w-[46%] max-h-[70%] overflow-y-auto border border-[var(--line)] p-2.5 text-sm"
      style={{ background: "color-mix(in oklab, var(--panel) 74%, transparent)", backdropFilter: "blur(3px)" }}
    >
      <div className="flex items-center mb-2">
        <span className="font-semibold text-[var(--ink)]">{def.label}</span>
        <div className="flex-1" />
        <button className="btn" style={{ border: "none" }} onClick={onClose} aria-label="Close">
          ✕
        </button>
      </div>

      {part.destroyed ? (
        <p className="text-[12px] text-[var(--danger)] mb-1">
          It overheated and blew apart. Nothing left to fix — remove it and build a new one.
        </p>
      ) : (
        <>
          {part.type === "battery" && (
            <>
              <p className="text-[12px] text-[var(--ink-2)] mb-2">
                Pushes with <b>{part.voltage} volts</b>. Want a harder or softer push? Grab a different
                battery from the POWER drawer.
              </p>
              <button className="btn" onClick={onFlip}>
                Swap the + and − ends
              </button>
            </>
          )}

          {part.type === "resistor" && (
            <p className="text-[12px] text-[var(--ink-2)] mb-1">
              This one resists with <b>{part.resistance} ohms</b>. Need more or less? The RESISTORS drawer
              has other sizes. More ohms = harder for current to get through = less current flows.
            </p>
          )}

          {(part.type === "pot" ||
            part.type === "bulb" ||
            part.type === "heater" ||
            part.type === "hairdryer") && (
            <>
              <SimSlider
                label={`Resistance: ${part.resistance} ohms`}
                min={def.minR ?? 1}
                max={def.maxR ?? 100}
                step={1}
                value={part.resistance}
                onChange={(v) => set((p) => (p.resistance = v))}
              />
              <p className="text-[11px] text-[var(--ink-3)] mt-1">
                More ohms = harder for current to get through = less current flows.
              </p>
            </>
          )}

          {part.type === "capacitor" && (
            <>
              <SimSlider
                label={`Size: ${part.capacitance} farads`}
                min={0.01}
                max={2}
                step={0.01}
                value={part.capacitance}
                onChange={(v) => set((p) => (p.capacitance = v))}
              />
              <p className="text-[11px] text-[var(--ink-3)] mt-1 mb-2">
                Holding {fmtVolts(part.capV)} right now. It pops above 60 volts — be nice to it.
              </p>
              <button className="btn" onClick={() => set((p) => (p.capV = 0))}>
                Dump its stored charge
              </button>
            </>
          )}

          {part.type === "fuse" && (
            <>
              <SimSlider
                label={`Melts above: ${part.maxAmps} amps`}
                min={1}
                max={50}
                step={1}
                value={part.maxAmps}
                onChange={(v) => set((p) => (p.maxAmps = v))}
              />
              {part.blown && (
                <button className="btn mt-2" onClick={() => set((p) => (p.blown = false))}>
                  Put in a new fuse
                </button>
              )}
            </>
          )}

          {part.type === "switch" && (
            <button className="btn" onClick={() => set((p) => (p.closed = !p.closed))}>
              {part.closed ? "Open the switch (stop the current)" : "Close the switch (let current flow)"}
            </button>
          )}

          {part.type === "button" && (
            <>
              <label className="flex items-center gap-2 text-[12px] text-[var(--ink-2)]">
                Keyboard letter:
                <input
                  className="sim-input w-12 text-center uppercase"
                  maxLength={1}
                  value={part.key.toUpperCase()}
                  onChange={(e) =>
                    set((p) => (p.key = e.target.value.slice(-1).toLowerCase()))
                  }
                />
              </label>
              <p className="text-[11px] text-[var(--ink-3)] mt-1.5">
                Hold that key to let current through — or click and hold the button itself.
              </p>
            </>
          )}

          {part.type === "blinker" && (
            <SimSlider
              label={`Speed: ${part.hz} flips per second`}
              min={0.5}
              max={8}
              step={0.1}
              value={part.hz}
              onChange={(v) => set((p) => (p.hz = Math.round(v * 10) / 10))}
            />
          )}

          {part.type === "inductor" && (
            <>
              <SimSlider
                label={`Size: ${part.henries} henries`}
                min={0.5}
                max={10}
                step={0.5}
                value={part.henries}
                onChange={(v) => set((p) => (p.henries = v))}
              />
              <p className="text-[11px] text-[var(--ink-3)] mt-1">
                Bigger = fights harder against the current changing. Watch an ammeter next to it.
              </p>
            </>
          )}

          {(part.type === "coil" || part.type === "relay") && (
            <>
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-[12px] text-[var(--ink-2)] mr-1">Channel:</span>
                {[1, 2, 3, 4, 5, 6].map((ch) => (
                  <button
                    key={ch}
                    aria-pressed={part.channel === ch}
                    onClick={() => set((p) => (p.channel = ch))}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 999,
                      fontSize: 11,
                      fontWeight: 700,
                      color: part.channel === ch ? "#0b1220" : CHANNEL_COLORS[ch],
                      background: part.channel === ch ? CHANNEL_COLORS[ch] : "transparent",
                      border: `2px solid ${CHANNEL_COLORS[ch]}`,
                      cursor: "pointer",
                    }}
                  >
                    {ch}
                  </button>
                ))}
              </div>
              {part.type === "coil" ? (
                <p className="text-[11px] text-[var(--ink-3)]">
                  Power this coil and every magnetic switch on channel {part.channel} flips.
                  {Math.abs(part.current) > 0.02 ? " It is magnetized right now." : " Not enough current to magnetize yet."}
                </p>
              ) : (
                <>
                  <div className="seg mb-2" role="group" aria-label="How the switch reacts to its coil">
                    <button
                      aria-pressed={!part.normallyClosed}
                      onClick={() => set((p) => (p.normallyClosed = false))}
                    >
                      Closes when coil is on
                    </button>
                    <button
                      aria-pressed={part.normallyClosed}
                      onClick={() => set((p) => (p.normallyClosed = true))}
                    >
                      Opens when coil is on
                    </button>
                  </div>
                  <p className="text-[11px] text-[var(--ink-3)]">
                    The &ldquo;opens&rdquo; kind is a NOT — that&apos;s the trick that makes real logic possible.
                    {part.engaged ? " Letting current through right now." : " Blocking right now."}
                  </p>
                </>
              )}
            </>
          )}

          {(part.type === "lightsensor" || part.type === "heatsensor") && (
            <p className="text-[11px] text-[var(--ink-3)]">
              {part.type === "lightsensor" ? "Light" : "Warmth"} landing on it:{" "}
              {Math.round(part.sense * 100)}%. Its resistance right now:{" "}
              {part.resistance >= 1000 ? `${Math.round(part.resistance / 1000)}k` : Math.round(part.resistance)}{" "}
              ohms. Move it closer to the {part.type === "lightsensor" ? "light" : "heat"} for a stronger
              reaction — distance matters a lot.
            </p>
          )}

          {part.type === "solar" && (
            <p className="text-[11px] text-[var(--ink-3)]">
              Light landing on it: {Math.round(part.sense * 100)}%, so it is pushing{" "}
              {fmtVolts(part.voltage)} right now. Park it close to a bright bulb.
            </p>
          )}

          {part.type === "voicebox" && (
            <>
              <label className="block text-[12px] text-[var(--ink-2)]">
                What it should say:
                <input
                  className="sim-input w-full mt-1"
                  maxLength={48}
                  value={part.text}
                  onChange={(e) => set((p) => (p.text = e.target.value))}
                />
              </label>
              <div className="flex items-center gap-2 mt-2">
                <button
                  className="btn btn-primary"
                  disabled={part.playing}
                  onClick={() =>
                    set((p) => {
                      p.playing = true;
                      p.playPos = 0;
                    })
                  }
                >
                  {part.playing ? "Speaking…" : "Speak"}
                </button>
                <span className="text-[11px] text-[var(--ink-3)]">
                  {Math.abs(part.current) > 0.02
                    ? "Powered and ready."
                    : "No power — it only talks while current flows through it."}
                </span>
              </div>
            </>
          )}

          {part.type === "speaker" && (
            <>
              <div className="seg mb-2" role="group" aria-label="What the speaker plays">
                <button aria-pressed={part.mode === "note"} onClick={() => set((p) => (p.mode = "note"))}>
                  Play one note
                </button>
                <button aria-pressed={part.mode === "volts"} onClick={() => set((p) => (p.mode = "volts"))}>
                  Pitch follows volts
                </button>
              </div>
              {part.mode === "note" ? (
                <label className="flex items-center gap-2 text-[12px] text-[var(--ink-2)]">
                  Note:
                  <select
                    className="sim-select"
                    value={part.noteHz}
                    onChange={(e) => set((p) => (p.noteHz = parseFloat(e.target.value)))}
                  >
                    {NOTES.map((n) => (
                      <option key={n.name} value={n.hz}>
                        {n.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <p className="text-[11px] text-[var(--ink-3)]">
                  More volts across it = higher pitch. More current = louder.
                </p>
              )}
            </>
          )}

          {part.type === "led" && (
            <>
              <div className="flex items-center gap-1.5 mb-2">
                <span className="text-[12px] text-[var(--ink-2)] mr-1">Color:</span>
                {(Object.keys(LED_COLORS) as LedColor[]).map((c) => (
                  <button
                    key={c}
                    aria-label={`Make it ${c}`}
                    aria-pressed={part.color === c}
                    onClick={() => set((p) => (p.color = c))}
                    className=""
                    style={{
                      width: 20,
                      height: 20,
                      background: LED_COLORS[c],
                      border: part.color === c ? "2px solid var(--ink)" : "2px solid transparent",
                      cursor: "pointer",
                    }}
                  />
                ))}
              </div>
              <p className="text-[11px] text-[var(--ink-3)] mb-2">
                An LED only lets current through one way, and it eats 2 volts to light up.
                {part.ledOn ? " It is ON." : " It is dark right now — maybe flip it?"}
              </p>
              <button className="btn" onClick={onFlip}>
                Flip it around
              </button>
            </>
          )}

          {part.type === "diode" && (
            <>
              <p className="text-[11px] text-[var(--ink-3)] mb-2">
                Current can only pass in the direction of the arrow.
                {part.ledOn ? " It is letting current through." : " It is blocking right now."}
              </p>
              <button className="btn" onClick={onFlip}>
                Flip it around
              </button>
            </>
          )}

          {part.type === "chip" && (
            <ChipEditor part={part} />
          )}

          {part.type === "memory" && (
            <>
              <p className="text-[13px] mb-2" style={{ fontFamily: "var(--font-mono)" }}>
                stored right now: <b className="text-[var(--accent)]">{Math.round(part.mem)}</b>
              </p>
              <p className="text-[11px] text-[var(--ink-3)] mb-2">
                Every fresh pulse of current through it adds one. Holding the current on only
                counts once — it waits for the next fresh push.
              </p>
              <button
                className="btn"
                onClick={() =>
                  set((p) => {
                    p.mem = 0;
                    p.memOn = false;
                  })
                }
              >
                Set back to 0
              </button>
            </>
          )}

          {part.type === "motor" && (
            <>
              <div className="seg mb-2" role="group" aria-label="What is bolted onto the motor">
                {(["fan", "wheel", "propeller", "winch"] as MotorAttachment[]).map((att) => (
                  <button
                    key={att}
                    aria-pressed={part.attachment === att}
                    onClick={() => set((p) => (p.attachment = att))}
                  >
                    {att === "fan" ? "Fan" : att === "wheel" ? "Wheel" : att === "propeller" ? "Prop" : "Winch"}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-[var(--ink-3)]">
                {part.attachment === "winch"
                  ? `The winch winds a rope. Crate is ${Math.round(part.lift * 100)}% of the way up. Reverse the current to lower it.`
                  : "More current = faster spinning. Reverse the current and it spins the other way."}
              </p>
            </>
          )}

          {(part.type === "coin" ||
            part.type === "hand" ||
            part.type === "eraser" ||
            part.type === "ammeter" ||
            part.type === "voltmeter" ||
            part.type === "outlet" ||
            part.type === "buzzer" ||
            part.type === "wire") && <p className="text-[11px] text-[var(--ink-3)]">{def.hint}</p>}
        </>
      )}

      <div
        className="mt-3 pt-2 border-t border-[var(--line)] flex items-center text-[11px] text-[var(--ink-3)] gap-3"
        style={{ fontFamily: "var(--font-mono)" }}
      >
        <span>through it: {fmtAmps(part.current)}</span>
        <span>across it: {fmtVolts(part.volts)}</span>
        <span className={part.temp > 60 ? "text-orange-400" : ""}>{Math.round(part.temp)} °C</span>
      </div>
    </div>
  );
}

function SimSlider({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs text-[var(--ink-2)]">{label}</span>
      <input
        type="range"
        className="sim-slider mt-1"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
      />
    </label>
  );
}

// the microchip's code editor, with its language manual one click away
export function ChipEditor({ part }: { part: Part }) {
  const [showDocs, setShowDocs] = useState(false);
  return (
    <>
      <div className="flex items-center mb-1">
        <label className="text-[12px] text-[var(--ink-2)]">Its program (runs top to bottom, forever):</label>
        <div className="flex-1" />
        <button
          className="btn"
          style={{ padding: "2px 8px" }}
          aria-expanded={showDocs}
          title="The chip's little language, explained"
          onClick={() => setShowDocs((v) => !v)}
        >
          ?
        </button>
      </div>
      {showDocs && (
        <div className="border border-[var(--line)] bg-[#0b1220] p-2 mb-2 text-[11px] leading-relaxed text-[var(--ink-2)]">
          <p className="mb-1">
            <b>turn 3 on</b> / <b>turn 3 off</b> — drive magnetic channel 3. Any magnetic switch set to
            channel 3 obeys, anywhere on the bench.
          </p>
          <p className="mb-1">
            <b>wait 0.5</b> — pause half a second before the next line.
          </p>
          <p className="mb-1">
            <b>if 2 is on</b> … <b>end</b> — run the lines in between only while channel 2 is energized
            (wire a button to an electromagnet coil on channel 2 to make an input).
          </p>
          <p className="mb-1">
            <b>if 2 is off</b> … <b>end</b> — the opposite test.
          </p>
          <p>
            When it runs out of lines it starts over at the top, forever — but only while current flows
            through its two pins. Lines it doesn&apos;t understand are skipped.
          </p>
        </div>
      )}
      <textarea
        className="sim-input w-full h-28 resize-y"
        style={{ fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.5 }}
        value={part.text}
        spellCheck={false}
        onChange={(e) => {
          /* eslint-disable react-hooks/immutability -- the chip program lives on the
             simulation part; the frame loop re-renders. Same pattern as every knob. */
          part.text = e.target.value;
          part.pc = 0;
          part.chipWait = 0;
          part.chipDrive = 0;
          /* eslint-enable react-hooks/immutability */
        }}
      />
      <p className="text-[11px] mt-1" style={{ fontFamily: "var(--font-mono)" }}>
        {Math.abs(part.current) > 0.01 ? (
          <span className="text-[var(--accent)]">
            running · driving{" "}
            {[1, 2, 3, 4, 5, 6].filter((ch) => part.chipDrive & (1 << ch)).join(", ") || "nothing"}
          </span>
        ) : (
          <span className="text-[var(--ink-3)]">no power — the program is stopped</span>
        )}
      </p>
    </>
  );
}
