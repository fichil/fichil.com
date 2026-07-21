import Link from "next/link";
import type { Locale } from "@/lib/content";
import { labels } from "@/lib/i18n";
import { ThemeToggle } from "@/components/ThemeToggle";

export function SiteHeader({ locale, alternatePath }: { locale: Locale; alternatePath: string }) {
  const copy = labels[locale];
  const menuLabel = locale === "zh-cn" ? "菜单" : "Menu";
  const navigationLabel = locale === "zh-cn" ? "主导航" : "Primary navigation";
  const home = locale === "zh-cn" ? "/zh-cn/" : "/";
  const blog = locale === "zh-cn" ? "/zh-cn/blog/" : "/blog/";
  const navItems = [
    { href: `${home}#services`, label: copy.nav.about },
    { href: `${home}#projects`, label: copy.nav.projects },
    { href: blog, label: copy.nav.blog },
    { href: `${home}#contact`, label: copy.nav.contact },
  ];

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="brand" href={home} aria-label={locale === "zh-cn" ? "Fichil 首页" : "Fichil home"}><span className="brand-mark" aria-hidden="true">F</span><span>Fichil</span></Link>
        <nav className="desktop-nav" aria-label={navigationLabel}>
          {navItems.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
          <Link className="language-link" href={alternatePath} hrefLang={locale === "en" ? "zh-CN" : "en"}>{copy.language}</Link>
          <ThemeToggle />
        </nav>
        <details className="mobile-nav">
          <summary aria-label={locale === "zh-cn" ? "打开导航" : "Open navigation"}>{menuLabel}</summary>
          <div className="mobile-nav-panel">
            {navItems.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
            <Link href={alternatePath} hrefLang={locale === "en" ? "zh-CN" : "en"}>{copy.language}</Link>
            <ThemeToggle />
          </div>
        </details>
      </div>
    </header>
  );
}
