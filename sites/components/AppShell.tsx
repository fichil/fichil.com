import Link from "next/link";
import type { Locale } from "@/lib/content";
import { SiteHeader } from "@/components/SiteHeader";
import { labels } from "@/lib/i18n";

export function AppShell({ locale, alternatePath, children, readingTools = false }: { locale: Locale; alternatePath: string; children: React.ReactNode; readingTools?: boolean }) {
  return (
    <div className={`site-shell${readingTools ? " site-shell-reading" : ""}`} lang={locale === "zh-cn" ? "zh-CN" : "en"}>
      <a className="skip-link" href="#main-content">{labels[locale].skipContent}</a>
      <SiteHeader locale={locale} alternatePath={alternatePath} />
      <main id="main-content" tabIndex={-1}>{children}</main>
      <footer className="site-footer">
        <div><span className="status-dot" aria-hidden="true" />Fichil · Build. Debug. Ship.</div>
        <div className="footer-links"><Link href="https://github.com/fichil" target="_blank" rel="noreferrer">GitHub</Link><Link href="mailto:fichilzhang@gmail.com">Email</Link></div>
        <div>© {new Date().getUTCFullYear()}</div>
      </footer>
    </div>
  );
}
