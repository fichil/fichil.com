import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogIndexPage } from "@/components/BlogIndexPage";
import { getPageCount } from "@/lib/content";
import { createMetadata } from "@/lib/seo";

export function generateStaticParams() { return Array.from({ length: Math.max(0, getPageCount("en") - 1) }, (_, index) => ({ page: String(index + 2) })); }
export async function generateMetadata({ params }: { params: Promise<{ page: string }> }): Promise<Metadata> { const { page } = await params; return createMetadata({ locale: "en", title: `Engineering Notes · Page ${page}`, description: "Backend, DevOps, logistics systems, production recovery, and AI-assisted engineering notes.", path: `/blog/page/${page}/`, alternatePath: `/zh-cn/blog/page/${page}/` }); }
export default async function Page({ params }: { params: Promise<{ page: string }> }) { const value = Number((await params).page); if (!Number.isInteger(value) || value < 2 || value > getPageCount("en")) notFound(); return <BlogIndexPage locale="en" page={value} />; }
