# Product

## Register

product

## Users

One self-learner (and anyone he shares a link with) teaching himself electrical engineering by playing. He's at a desk on a laptop, curious, zero patience for jargon. The job: build a circuit, poke it, see/hear/feel what electricity actually does — like PhET's Circuit Construction Kit but with more toys.

## Product Purpose

A single-page circuit sandbox with real physics. Drag parts, wire them, and get honest feedback: real solved currents, light, heat, sound, motion — and real consequences (blown fuses, fires, explosions). Success = the user builds something (a piano, a light show, a crane) and understands why it works.

## Brand Personality

Playful workshop, honest physics, zero jargon. It should feel like a well-made toy lab bench: sturdy chrome around a lively board. The chrome disappears; the circuit is the show.

## Anti-references

- Generic AI dashboard styling: glass cards, purple gradients, glowing pills, emoji-as-icons in the chrome.
- Textbook solemnity: no formulas-first, no unexplained symbols (see memory: every quantity in plain words).
- Toy-without-truth: no faked behavior; every reading comes from the solver.

## Design Principles

1. **The board is the hero.** Chrome is quiet, dark, and flat; light, glow, and color are reserved for what the circuit is doing.
2. **Plain words, spelled out.** "Push strength: 9 volts", never bare "V=9". Hints teach in one sentence.
3. **Consequences are content.** Heat, sparks, explosions and blown fuses are the curriculum, rendered in the sim layer — not as UI decoration.
4. **Familiar controls, earned.** Standard buttons, toggles, panels with full state vocabulary (hover/focus/active/disabled). No invented affordances.
5. **Everything responds now.** 60 fps sim; UI transitions 150–250 ms; motion conveys state only.

## Accessibility & Inclusion

- Text contrast ≥ 4.5:1 on all chrome; readings also shown as text, never color-only.
- Full keyboard support for the piano keys; Delete to remove; focus-visible rings on all controls.
- `prefers-reduced-motion`: UI transitions collapse to instant; sim animation remains (it is the data).
