import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TaxonomyTermPage } from "@/components/TaxonomyPages";
import { alternateTaxonomyPath, getTerm, getTerms, taxonomyPath } from "@/lib/content";
import { createMetadata } from "@/lib/seo";
export function generateStaticParams() { return getTerms("zh-cn", "categories").map((term) => ({ slug: term.slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> { const { slug } = await params; const term = getTerm("zh-cn", "categories", slug); if (!term) return {}; return createMetadata({ locale: "zh-cn", title: `分类：${term.name}`, description: `${term.count} 篇 ${term.name} 工程记录。`, path: taxonomyPath("zh-cn", "categories", slug), alternatePath: alternateTaxonomyPath("zh-cn", "categories", slug) }); }
export default async function Page({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; const term = getTerm("zh-cn", "categories", slug); if (!term) notFound(); return <TaxonomyTermPage locale="zh-cn" kind="categories" slug={slug} name={term.name} />; }
