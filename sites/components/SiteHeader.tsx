import Link from "next/link";
import type { Locale } from "@/lib/content";
import { labels } from "@/lib/i18n";
import { ThemeToggle } from "@/components/ThemeToggle";

export function SiteHeader({ locale, alternatePath }: { locale: Locale; alternatePath: string }) {
  const copy = labels[locale];
  const home = locale === "zh-cn" ? "/zh-cn/" : "/";
  const blog = locale === "zh-cn" ? "/zh-cn/blog/" : "/blog/";
  const navItems = [
    { href: `${home}#about`, label: copy.nav.about },
    { href: `${home}#projects`, label: copy.nav.projects },
    { href: blog, label: copy.nav.blog },
    { href: `${home}#contact`, label: copy.nav.contact },
  ];

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link className="brand" href={home} aria-label="Fichil home"><span className="brand-mark" aria-hidden="true">F</span><span>Fichil</span></Link>
        <nav className="desktop-nav" aria-label="Primary navigation">
          {navItems.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
          <Link className="language-link" href={alternatePath} hrefLang={locale === "en" ? "zh-CN" : "en"}>{copy.language}</Link>
          <ThemeToggle />
        </nav>
        <details className="mobile-nav">
          <summary aria-label="Open navigation">Menu</summary>
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
