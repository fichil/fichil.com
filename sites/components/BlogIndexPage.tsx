import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PostCard } from "@/components/PostCard";
import { getPageCount, getPagedPosts, localizedPath, type Locale } from "@/lib/content";
import { labels } from "@/lib/i18n";

function pagePath(locale: Locale, page: number) {
  return localizedPath(locale, page === 1 ? "/blog/" : `/blog/page/${page}/`);
}

export function BlogIndexPage({ locale, page }: { locale: Locale; page: number }) {
  const copy = labels[locale];
  const pageCount = getPageCount(locale);
  const opposite = locale === "en" ? "zh-cn" : "en";
  const alternate = pagePath(opposite, page);
  return (
    <AppShell locale={locale} alternatePath={alternate}>
      <header className="page-hero section"><div className="eyebrow"><span>LOG</span>{copy.nav.blog}</div><h1>{copy.blogTitle}</h1><p>{copy.blogIntro}</p><div className="page-index">{copy.page} {page} / {pageCount}</div></header>
      <section className="section"><div className="post-grid blog-grid">{getPagedPosts(locale, page).map((post) => <PostCard key={post.slug} locale={locale} post={post} />)}</div>
        <nav className="pagination" aria-label="Pagination">
          {page > 1 ? <Link href={pagePath(locale, page - 1)}>← {copy.previous}</Link> : <span />}
          <div>{Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => <Link key={number} aria-current={number === page ? "page" : undefined} href={pagePath(locale, number)}>{number}</Link>)}</div>
          {page < pageCount ? <Link href={pagePath(locale, page + 1)}>{copy.next} →</Link> : <span />}
        </nav>
      </section>
    </AppShell>
  );
}
