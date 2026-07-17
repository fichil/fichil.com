import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogIndexPage } from "@/components/BlogIndexPage";
import { getPageCount } from "@/lib/content";
import { createMetadata } from "@/lib/seo";

export function generateStaticParams() { return Array.from({ length: Math.max(0, getPageCount("zh-cn") - 1) }, (_, index) => ({ page: String(index + 2) })); }
export async function generateMetadata({ params }: { params: Promise<{ page: string }> }): Promise<Metadata> { const { page } = await params; return createMetadata({ locale: "zh-cn", title: `工程技术记录 · 第 ${page} 页`, description: "记录后端、DevOps、物流系统、生产恢复与 AI 辅助工程实践。", path: `/zh-cn/blog/page/${page}/`, alternatePath: `/blog/page/${page}/` }); }
export default async function Page({ params }: { params: Promise<{ page: string }> }) { const value = Number((await params).page); if (!Number.isInteger(value) || value < 2 || value > getPageCount("zh-cn")) notFound(); return <BlogIndexPage locale="zh-cn" page={value} />; }
