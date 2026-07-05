import Link from "next/link";
import { LESSONS } from "../lib/lessons";

const TOTAL_STEPS = LESSONS.length + 1; // this overview is step 1

export default function Welcome() {
  return (
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--ink)]">
      <div className="mx-auto max-w-4xl px-5 py-8">
        {/* guide nav — this page is step 1 */}
        <nav className="flex items-center gap-3 text-sm mb-8">
          <div className="flex items-center gap-2.5">
            <svg width="26" height="26" viewBox="0 0 30 30" aria-hidden>
              <circle cx="15" cy="15" r="13" fill="none" stroke="var(--accent)" strokeWidth="2.5" />
              <path
                d="M7 15h4.5l2-5 3 10 2-5H23"
                fill="none"
                stroke="var(--ink)"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="font-semibold tracking-tight">Circuit Lab</span>
          </div>
          <div className="flex-1" />
          <span className="text-[var(--ink-3)] text-xs" style={{ fontFamily: "var(--font-mono)" }}>
            The overview · 1 / {TOTAL_STEPS}
          </span>
          <div className="flex-1" />
          <Link href={`/learn/${LESSONS[0].slug}`} className="btn">
            {LESSONS[0].title} →
          </Link>
        </nav>

        <h1 className="text-3xl font-semibold tracking-tight leading-tight" style={{ textWrap: "balance" }}>
          A real electronics lab in your browser.
        </h1>
        <p className="mt-4 text-xl leading-relaxed text-[var(--ink-2)] max-w-[62ch]">
          Every board on this site runs a real circuit solver: real currents, real heat, real
          consequences. You can light bulbs, blow fuses, play a piano made of buttons and
          speakers, wire magnetic switches into a machine that adds numbers for real &mdash;
          and zoom all the way in until you&apos;re watching the electrons
          themselves. Everything works the way your hands expect: drag parts in from the left,
          snap their glowing end dots together, and scroll to zoom &mdash; keep zooming and you
          fall straight through the workbench into the molecules.
          {` By the last of the ${TOTAL_STEPS} steps `}
          you&apos;ll have used the same laws, equations and instruments engineers use on a
          real bench &mdash; nothing faked, nothing skipped, everything said in plain words.
        </p>

      </div>
    </div>
  );
}
