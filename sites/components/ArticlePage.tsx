import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { ReadingProgress } from "@/components/ReadingProgress";
import { articlePath, taxonomyPath, taxonomySlug, type Locale, type Post } from "@/lib/content";
import { labels } from "@/lib/i18n";
import { absoluteUrl } from "@/lib/seo";

export function ArticlePage({ locale, post }: { locale: Locale; post: Post }) {
  const copy = labels[locale];
  const other: Locale = locale === "en" ? "zh-cn" : "en";
  const alternate = articlePath(other, post.slug);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.date,
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
          <p>{post.description}</p>
          <div className="article-meta"><time dateTime={post.date}>{post.date}</time><span>{post.readingMinutes} {copy.minRead}</span></div>
        </header>
        <div className="article-grid">
          <div className="article-main"><div className="prose" dangerouslySetInnerHTML={{ __html: post.html }} /><div className="article-taxonomy"><div><strong>{copy.tags}</strong>{post.tags.map((tag) => <Link className="chip" key={tag} href={taxonomyPath(locale, "tags", taxonomySlug(tag))}>{tag}</Link>)}</div><div><strong>{copy.categories}</strong>{post.categories.map((category) => <Link className="chip" key={category} href={taxonomyPath(locale, "categories", taxonomySlug(category))}>{category}</Link>)}</div></div></div>
          <aside className="toc-panel"><div className="toc-title">{copy.toc}</div><nav aria-label={copy.toc}>{post.toc.map((item) => <a className={item.depth === 3 ? "toc-subitem" : ""} key={item.id} href={`#${item.id}`}>{item.text}</a>)}</nav></aside>
        </div>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      </article>
    </AppShell>
  );
}
