import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PostCard } from "@/components/PostCard";
import { alternateTaxonomyPath, getPostsByTerm, getTerms, localizedPath, taxonomyPath, type Locale, type TaxonomyKind } from "@/lib/content";
import { labels } from "@/lib/i18n";

export function TaxonomyIndexPage({ locale, kind }: { locale: Locale; kind: TaxonomyKind }) {
  const copy = labels[locale];
  const other: Locale = locale === "en" ? "zh-cn" : "en";
  const title = kind === "tags" ? copy.tags : copy.categories;
  return (
    <AppShell locale={locale} alternatePath={localizedPath(other, `/${kind}/`)}>
      <header className="page-hero section"><div className="eyebrow"><span>INDEX</span>{copy.nav.blog}</div><h1>{title}</h1><p>{getTerms(locale, kind).length} {title.toLowerCase()} · {copy.blogIntro}</p></header>
      <section className="section term-cloud">{getTerms(locale, kind).map((term) => <Link key={term.slug} href={taxonomyPath(locale, kind, term.slug)}><span>{term.name}</span><small>{term.count}</small></Link>)}</section>
    </AppShell>
  );
}

export function TaxonomyTermPage({ locale, kind, slug, name }: { locale: Locale; kind: TaxonomyKind; slug: string; name: string }) {
  const copy = labels[locale];
  const posts = getPostsByTerm(locale, kind, slug);
  return (
    <AppShell locale={locale} alternatePath={alternateTaxonomyPath(locale, kind, slug)}>
      <header className="page-hero section"><div className="eyebrow"><span>{kind === "tags" ? "TAG" : "TYPE"}</span>{kind === "tags" ? copy.tags : copy.categories}</div><h1>{name}</h1><p>{posts.length} {copy.articles}</p></header>
      <section className="section"><div className="post-grid blog-grid">{posts.map((post) => <PostCard key={post.slug} locale={locale} post={post} />)}</div></section>
    </AppShell>
  );
}
