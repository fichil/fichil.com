import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TaxonomyTermPage } from "@/components/TaxonomyPages";
import { alternateTaxonomyPath, getTerm, getTerms, taxonomyPath } from "@/lib/content";
import { createMetadata } from "@/lib/seo";
export function generateStaticParams() { return getTerms("en", "categories").map((term) => ({ slug: term.slug })); }
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> { const { slug } = await params; const term = getTerm("en", "categories", slug); if (!term) return {}; return createMetadata({ locale: "en", title: `Category: ${term.name}`, description: `${term.count} engineering notes in ${term.name}.`, path: taxonomyPath("en", "categories", slug), alternatePath: alternateTaxonomyPath("en", "categories", slug) }); }
export default async function Page({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; const term = getTerm("en", "categories", slug); if (!term) notFound(); return <TaxonomyTermPage locale="en" kind="categories" slug={slug} name={term.name} />; }
