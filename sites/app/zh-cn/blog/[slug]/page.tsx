import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticlePage } from "@/components/ArticlePage";
import { articlePath, getPost, getPosts } from "@/lib/content";
import { createMetadata } from "@/lib/seo";

export function generateStaticParams() { return getPosts("zh-cn").map((post) => ({ slug: post.slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> { const { slug } = await params; const post = getPost("zh-cn", slug); if (!post) return {}; return createMetadata({ locale: "zh-cn", title: post.title, description: post.description, path: articlePath("zh-cn", slug), alternatePath: articlePath("en", slug), type: "article", publishedTime: `${post.date}T00:00:00Z`, tags: post.tags }); }
export default async function Page({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; const post = getPost("zh-cn", slug); if (!post) notFound(); return <ArticlePage locale="zh-cn" post={post} />; }
