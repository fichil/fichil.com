"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/content";
import { labels } from "@/lib/i18n";
import { ThemeToggle } from "@/components/ThemeToggle";

export function SiteHeader({ locale, alternatePath }: { locale: Locale; alternatePath: string }) {
  const copy = labels[locale];
  const menuLabel = locale === "zh-cn" ? "菜单" : "Menu";
  const navigationLabel = locale === "zh-cn" ? "主导航" : "Primary navigation";
  const openLabel = locale === "zh-cn" ? "打开导航" : "Open navigation";
  const closeLabel = locale === "zh-cn" ? "关闭导航" : "Close navigation";
  const home = locale === "zh-cn" ? "/zh-cn/" : "/";
  const blog = locale === "zh-cn" ? "/zh-cn/blog/" : "/blog/";
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const navItems = [
    { href: `${home}#services`, label: copy.nav.about },
    { href: `${home}#projects`, label: copy.nav.projects },
    { href: blog, label: copy.nav.blog },
    { href: `${home}#contact`, label: copy.nav.contact },
  ];

  useEffect(() => {
    const update = () => setScrolled(window.scrollY > 18);
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => window.removeEventListener("scroll", update);
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    const closeOutside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);
    document.addEventListener("pointerdown", closeOutside);
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOutside);
    };
  }, [open]);

  const closeMenu = () => setOpen(false);

  return (
    <header className="site-header" data-scrolled={scrolled ? "true" : undefined}>
      <div className="header-inner">
        <Link className="brand" href={home} aria-label={locale === "zh-cn" ? "Fichil 首页" : "Fichil home"}><span className="brand-mark" aria-hidden="true">F</span><span>Fichil</span></Link>
        <nav className="desktop-nav" aria-label={navigationLabel}>
          {navItems.map((item) => <Link key={item.href} href={item.href}>{item.label}</Link>)}
          <Link className="language-link" href={alternatePath} hrefLang={locale === "en" ? "zh-CN" : "en"}>{copy.language}</Link>
          <ThemeToggle locale={locale} />
        </nav>
        <div className="mobile-nav" ref={menuRef}>
          <button ref={triggerRef} className="mobile-nav-trigger" type="button" aria-expanded={open} aria-controls="mobile-site-nav" aria-label={open ? closeLabel : openLabel} onClick={() => setOpen((value) => !value)}>
            <span>{menuLabel}</span><span className="mobile-nav-icon" aria-hidden="true">{open ? "×" : "+"}</span>
          </button>
          {open ? <nav id="mobile-site-nav" className="mobile-nav-panel" aria-label={navigationLabel}>
            {navItems.map((item) => <Link key={item.href} href={item.href} onClick={closeMenu}>{item.label}</Link>)}
            <Link href={alternatePath} hrefLang={locale === "en" ? "zh-CN" : "en"} onClick={closeMenu}>{copy.language}</Link>
            <ThemeToggle locale={locale} />
          </nav> : null}
        </div>
      </div>
    </header>
  );
}
