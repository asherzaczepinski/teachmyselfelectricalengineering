import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LESSONS, lessonBySlug } from "../../../lib/lessons";
import LessonView from "../../../components/LessonView";

export function generateStaticParams() {
  return LESSONS.map((l) => ({ slug: l.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const lesson = lessonBySlug(slug);
  return {
    title: lesson ? `${lesson.title} — Circuit Lab` : "Circuit Lab",
    description: lesson?.subtitle,
  };
}

export default async function LessonPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!lessonBySlug(slug)) notFound();
  return <LessonView slug={slug} />;
}
