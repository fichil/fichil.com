import { absoluteUrl } from "@/lib/seo";
import {
  articlePath,
  canonicalPaths,
  getPosts,
  type Locale,
} from "@/lib/content";

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function renderRss(locale: Locale): string {
  const posts = getPosts(locale);
  const title = locale === "zh-cn" ? "Fichil 技术博客" : "Fichil Engineering Notes";
  const description = locale === "zh-cn" ? "后端、DevOps、物流系统与 AI 辅助工程记录。" : "Backend, DevOps, logistics systems, and AI-assisted engineering notes.";
  const feedPath = locale === "zh-cn" ? "/zh-cn/blog/index.xml" : "/blog/index.xml";
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>${xmlEscape(title)}</title><link>${absoluteUrl(locale === "zh-cn" ? "/zh-cn/blog/" : "/blog/")}</link><description>${xmlEscape(description)}</description><language>${locale === "zh-cn" ? "zh-CN" : "en-US"}</language><atom:link xmlns:atom="http://www.w3.org/2005/Atom" href="${absoluteUrl(feedPath)}" rel="self" type="application/rss+xml"/>${posts
    .map((post) => `<item><title>${xmlEscape(post.title)}</title><link>${absoluteUrl(articlePath(locale, post.slug))}</link><guid isPermaLink="true">${absoluteUrl(articlePath(locale, post.slug))}</guid><pubDate>${new Date(`${post.date}T00:00:00Z`).toUTCString()}</pubDate><description>${xmlEscape(post.description)}</description></item>`)
    .join("")}</channel></rss>`;
}

export function renderLocaleSitemap(locale: Locale): string {
  const latest = getPosts(locale)[0]?.date ?? "2026-01-01";
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${canonicalPaths(locale)
    .map((path) => `<url><loc>${absoluteUrl(path)}</loc><lastmod>${latest}</lastmod></url>`)
    .join("")}</urlset>`;
}

export function renderSitemapIndex(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${absoluteUrl("/en/sitemap.xml")}</loc></sitemap><sitemap><loc>${absoluteUrl("/zh-cn/sitemap.xml")}</loc></sitemap></sitemapindex>`;
}

export const XML_HEADERS = { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=300, s-maxage=3600" };
