import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticlePage } from "@/components/ArticlePage";
import { articlePath, getPost, getPosts } from "@/lib/content";
import { createMetadata } from "@/lib/seo";

export function generateStaticParams() { return getPosts("en").map((post) => ({ slug: post.slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> { const { slug } = await params; const post = getPost("en", slug); if (!post) return {}; return createMetadata({ locale: "en", title: post.title, description: post.description, path: articlePath("en", slug), alternatePath: articlePath("zh-cn", slug), machinePath: `/api/ai/v1/articles/en/${slug}`, type: "article", publishedTime: `${post.date}T00:00:00Z`, tags: post.tags }); }
export default async function Page({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; const post = getPost("en", slug); if (!post) notFound(); return <ArticlePage locale="en" post={post} />; }
