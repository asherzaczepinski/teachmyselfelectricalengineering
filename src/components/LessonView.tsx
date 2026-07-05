"use client";

import Link from "next/link";
import { LESSONS, lessonBySlug, lessonIndex } from "../lib/lessons";
import CircuitLab from "./lab/CircuitLab";

export default function LessonView({ slug }: { slug: string }) {
  const lesson = lessonBySlug(slug)!;
  const idx = lessonIndex(slug);
  const prev = LESSONS[idx - 1];
  const next = LESSONS[idx + 1];

  return (
    <div className="min-h-dvh bg-[var(--bg)] text-[var(--ink)]">
      <div className="mx-auto max-w-4xl px-5 py-8">
        {/* guide nav */}
        <nav className="flex items-center gap-3 text-sm mb-8">
          <Link href={prev ? `/learn/${prev.slug}` : "/"} className="btn">
            ← {prev ? prev.title : "The overview"}
          </Link>
          <div className="flex-1" />
          <span className="text-[var(--ink-3)] text-xs" style={{ fontFamily: "var(--font-mono)" }}>
            {lesson.section} · step {idx + 2} / {LESSONS.length + 1}
          </span>
          <div className="flex-1" />
          {next ? (
            <Link href={`/learn/${next.slug}`} className="btn">
              {next.title} →
            </Link>
          ) : (
            <Link href="/" className="btn">
              Back to the overview →
            </Link>
          )}
        </nav>

        <h1 className="text-3xl font-semibold tracking-tight" style={{ textWrap: "balance" }}>
          {lesson.title}
        </h1>
        <p className="mt-1.5 text-[var(--ink-2)]">{lesson.subtitle}</p>

        <div className="mt-6 space-y-4 text-[15px] leading-relaxed text-[var(--ink-2)] max-w-[68ch]">
          {lesson.body.map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>

        {/* the live board */}
        <div className="mt-8 h-[68vh] min-h-[440px] rounded-xl overflow-hidden border border-[var(--line)]">
          <CircuitLab initialBuild={lesson.build} />
        </div>

        <section className="mt-8 grid gap-8 md:grid-cols-2">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-widest text-[var(--ink-3)] mb-3">
              Try this
            </h2>
            <ol className="list-decimal pl-5 space-y-2 text-[14px] leading-relaxed text-[var(--ink-2)]">
              {lesson.tryThis.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </div>
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-widest text-[var(--ink-3)] mb-3">
              Why it works
            </h2>
            <p className="text-[14px] leading-relaxed text-[var(--ink-2)]">{lesson.why}</p>
          </div>
        </section>

        {/* the real engineering: terms and equations, every letter explained */}
        <section className="mt-10 pb-10">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-[var(--ink-3)] mb-1">
            The real engineering
          </h2>
          <p className="text-[12px] text-[var(--ink-3)] mb-4">
            The same ideas with their field names and equations — nothing left half-explained.
          </p>
          <div className="space-y-3">
            {lesson.concepts.map((c) => (
              <div key={c.name} className="rounded-xl border border-[var(--line)] bg-[var(--panel)] p-4">
                <h3 className="text-[14px] font-semibold text-[var(--ink)]">{c.name}</h3>
                {c.equation && (
                  <p
                    className="mt-2 text-[15px] text-[var(--ink)] rounded-lg bg-[var(--panel-2)] px-3 py-2 inline-block"
                    style={{ fontFamily: "var(--font-mono)" }}
                  >
                    {c.equation}
                  </p>
                )}
                {c.spellout && (
                  <p className="mt-2 text-[13px] leading-relaxed text-[var(--ink-2)]">
                    <span className="font-semibold">In plain words: </span>
                    {c.spellout}
                  </p>
                )}
                <p className="mt-2 text-[13px] leading-relaxed text-[var(--ink-2)]">{c.meaning}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
