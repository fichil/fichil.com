import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PostCard } from "@/components/PostCard";
import { getPageCount, getPagedPosts, getTerms, localizedPath, taxonomyPath, type Locale } from "@/lib/content";
import { labels } from "@/lib/i18n";

function pagePath(locale: Locale, page: number) {
  return localizedPath(locale, page === 1 ? "/blog/" : `/blog/page/${page}/`);
}

export function paginationWindow(current: number, total: number): Array<number | "ellipsis"> {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1);
  if (current <= 4) return [1, 2, 3, 4, 5, "ellipsis", total];
  if (current >= total - 3) return [1, "ellipsis", total - 4, total - 3, total - 2, total - 1, total];
  return [1, "ellipsis", current - 1, current, current + 1, "ellipsis", total];
}

export function BlogIndexPage({ locale, page }: { locale: Locale; page: number }) {
  const copy = labels[locale];
  const pageCount = getPageCount(locale);
  const categories = getTerms(locale, "categories").slice(0, 6);
  const posts = getPagedPosts(locale, page);
  const opposite = locale === "en" ? "zh-cn" : "en";
  const alternate = pagePath(opposite, page);
  return (
    <AppShell locale={locale} alternatePath={alternate}>
      <header className="page-hero section"><div className="eyebrow"><span>LOG</span>{copy.nav.blog}</div><h1>{copy.blogTitle}</h1><p>{copy.blogIntro}</p><div className="page-index">{copy.page} {page} / {pageCount}</div></header>
      <section className="section blog-browser"><nav className="category-nav" aria-label={copy.categories}>{categories.map((category) => <Link className="chip" href={taxonomyPath(locale, "categories", category.slug)} key={category.slug}>{category.name} <span>{category.count}</span></Link>)}<Link className="chip category-all" href={taxonomyPath(locale, "categories")}>{copy.allCategories} <span aria-hidden="true">→</span></Link></nav><div className="post-grid blog-grid">{posts.map((post, index) => <PostCard featured={page === 1 && index === 0} key={post.slug} locale={locale} post={post} />)}</div>
        <nav className="pagination" aria-label={copy.pagination}>
          {page > 1 ? <Link rel="prev" href={pagePath(locale, page - 1)}>← {copy.previous}</Link> : <span />}
          <div>{paginationWindow(page, pageCount).map((item, index) => item === "ellipsis" ? <span className="pagination-ellipsis" aria-hidden="true" key={`ellipsis-${index}`}>…</span> : <Link aria-label={locale === "zh-cn" ? copy.pageLabel.replace("{page}", String(item)) : `${copy.pageLabel} ${item}`} key={item} aria-current={item === page ? "page" : undefined} href={pagePath(locale, item)}>{item}</Link>)}</div>
          {page < pageCount ? <Link rel="next" href={pagePath(locale, page + 1)}>{copy.next} →</Link> : <span />}
        </nav>
      </section>
    </AppShell>
  );
}
