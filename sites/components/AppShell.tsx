import Link from "next/link";
import type { Locale } from "@/lib/content";
import { SiteHeader } from "@/components/SiteHeader";

export function AppShell({ locale, alternatePath, children }: { locale: Locale; alternatePath: string; children: React.ReactNode }) {
  return (
    <div className="site-shell" lang={locale === "zh-cn" ? "zh-CN" : "en"}>
      <SiteHeader locale={locale} alternatePath={alternatePath} />
      <main>{children}</main>
      <footer className="site-footer">
        <div><span className="status-dot" aria-hidden="true" />Fichil · Build. Debug. Ship.</div>
        <div className="footer-links"><Link href="https://github.com/fichil" target="_blank" rel="noreferrer">GitHub</Link><Link href="mailto:fichilzhang@gmail.com">Email</Link></div>
        <div>© {new Date().getUTCFullYear()}</div>
      </footer>
    </div>
  );
}
