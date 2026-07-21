import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { ReadingProgress } from "@/components/ReadingProgress";
import { articlePath, getAdjacentPosts, getRelatedPosts, getSiteCopy, taxonomyPath, taxonomySlug, type Locale, type Post } from "@/lib/content";
import { PostCard } from "@/components/PostCard";
import { labels } from "@/lib/i18n";
import { absoluteUrl } from "@/lib/seo";

export function ArticlePage({ locale, post }: { locale: Locale; post: Post }) {
  const copy = labels[locale];
  const site = getSiteCopy(locale);
  const related = getRelatedPosts(locale, post);
  const adjacent = getAdjacentPosts(locale, post);
  const other: Locale = locale === "en" ? "zh-cn" : "en";
  const alternate = articlePath(other, post.slug);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.lastModified,
    inLanguage: locale === "zh-cn" ? "zh-CN" : "en-US",
    mainEntityOfPage: absoluteUrl(articlePath(locale, post.slug)),
    author: { "@type": "Person", name: "Fichil", url: absoluteUrl("/") },
    publisher: { "@type": "Person", name: "Fichil" },
  };
  return (
    <AppShell locale={locale} alternatePath={alternate}>
      <ReadingProgress label={copy.backToTop} />
      <article className="article-layout section">
        <header className="article-header">
          <div className="eyebrow"><span>NOTE</span>{post.categories[0] || copy.nav.blog}</div>
          <h1>{post.title}</h1>
          <div className="article-summary"><span>{copy.summary}</span><p>{post.description}</p></div>
          <div className="article-meta"><span>{copy.published} <time dateTime={post.date}>{post.date}</time></span><span>{copy.updated} <time dateTime={post.lastModified}>{post.lastModified}</time></span><span>{post.readingMinutes} {copy.minRead}</span></div>
        </header>
        <div className="article-grid">
          <div className="article-main"><div className="prose" dangerouslySetInnerHTML={{ __html: post.html }} /><div className="article-taxonomy"><div><strong>{copy.tags}</strong>{post.tags.map((tag) => <Link className="chip" key={tag} href={taxonomyPath(locale, "tags", taxonomySlug(tag))}>{tag}</Link>)}</div><div><strong>{copy.categories}</strong>{post.categories.map((category) => <Link className="chip" key={category} href={taxonomyPath(locale, "categories", taxonomySlug(category))}>{category}</Link>)}</div></div>
            <nav className="article-adjacent" aria-label={copy.articleNavigation}><div>{adjacent.previous ? <><span>{copy.previousArticle}</span><Link href={articlePath(locale, adjacent.previous.slug)}>← {adjacent.previous.title}</Link></> : null}</div><div>{adjacent.next ? <><span>{copy.nextArticle}</span><Link href={articlePath(locale, adjacent.next.slug)}>{adjacent.next.title} →</Link></> : null}</div></nav>
          </div>
          <aside className="toc-panel"><div className="toc-title">{copy.toc}</div><nav aria-label={copy.toc}>{post.toc.map((item) => <a className={item.depth === 3 ? "toc-subitem" : ""} key={item.id} href={`#${item.id}`}>{item.text}</a>)}</nav></aside>
        </div>
        <section className="article-contact"><div><span>{copy.needHelp}</span><h2>{site.contact.title}</h2></div><div><p>{site.contact.content}</p><Link className="button button-primary" href={site.contact.buttonLink}>{site.contact.buttonName}</Link></div></section>
        <section className="related-section"><div className="section-heading"><div><div className="eyebrow"><span>MORE</span>{copy.nav.blog}</div><h2>{copy.relatedTitle}</h2></div></div><div className="post-grid latest-grid">{related.map((item) => <PostCard locale={locale} post={item} key={item.slug} />)}</div></section>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      </article>
    </AppShell>
  );
}
