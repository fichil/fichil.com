import Link from "next/link";
import { articlePath, taxonomyPath, taxonomySlug, type Locale, type Post } from "@/lib/content";
import { labels } from "@/lib/i18n";
import { AiVisitBadge } from "@/components/AiVisitBadge";

export function PostCard({ locale, post, featured = false }: { locale: Locale; post: Post; featured?: boolean }) {
  const copy = labels[locale];
  return (
    <article className={`post-card${featured ? " post-card-featured" : ""}`} data-reveal>
      <div className="post-card-meta"><time dateTime={post.date}>{post.date}</time>{post.categories[0] ? <Link href={taxonomyPath(locale, "categories", taxonomySlug(post.categories[0]))}>{post.categories[0]}</Link> : null}<span>{post.readingMinutes} {copy.minRead}</span></div>
      <h3><Link href={articlePath(locale, post.slug)}>{post.title}</Link></h3>
      <p>{post.description || post.excerpt}</p>
      <AiVisitBadge locale={locale} slug={post.slug} />
      <div className="post-card-footer">
        <div className="chip-row">{post.tags.slice(0, 3).map((tag) => <Link className="chip" key={tag} href={taxonomyPath(locale, "tags", taxonomySlug(tag))}>{tag}</Link>)}</div>
        <Link className="text-link" href={articlePath(locale, post.slug)}>{copy.readArticle} <span aria-hidden="true">→</span></Link>
      </div>
    </article>
  );
}
