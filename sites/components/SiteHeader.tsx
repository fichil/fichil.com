"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
  const [activeHref, setActiveHref] = useState("");
  const pathname = usePathname();
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const brandRef = useRef<HTMLAnchorElement>(null);
  const navItems = [
    { href: `${home}#services`, label: copy.nav.about },
    { href: `${home}#projects`, label: copy.nav.projects },
    { href: blog, label: copy.nav.blog },
    { href: `${home}#contact`, label: copy.nav.contact },
  ];

  useEffect(() => {
    let frame = 0;
    const update = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        setScrolled(window.scrollY > 18);
        frame = 0;
      });
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      window.removeEventListener("scroll", update);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (pathname !== home) return;
    const sections = ["services", "projects", "contact"]
      .map((id) => document.getElementById(id))
      .filter((section): section is HTMLElement => Boolean(section));
    if (!sections.length || !("IntersectionObserver" in window)) {
      window.requestAnimationFrame(() => setActiveHref(window.location.hash ? `${home}${window.location.hash}` : ""));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setActiveHref(`${home}#${visible[0].target.id}`);
      else if (window.scrollY < 320) setActiveHref("");
    }, { rootMargin: "-20% 0px -64%", threshold: [0, 0.01] });
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
    const hashTarget = window.location.hash ? document.getElementById(window.location.hash.slice(1)) : null;
    if (hashTarget) window.requestAnimationFrame(() => hashTarget.focus({ preventScroll: true }));
  }, [home, pathname]);

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
    window.requestAnimationFrame(() => menuRef.current?.querySelector<HTMLAnchorElement>("nav a")?.focus());
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.removeEventListener("pointerdown", closeOutside);
    };
  }, [open]);

  useEffect(() => {
    const media = window.matchMedia("(min-width: 961px)");
    const closeAtDesktop = (event: MediaQueryListEvent) => {
      if (!event.matches) return;
      const moveFocus = Boolean(menuRef.current?.contains(document.activeElement));
      setOpen(false);
      if (moveFocus) window.requestAnimationFrame(() => brandRef.current?.focus());
    };
    media.addEventListener("change", closeAtDesktop);
    return () => media.removeEventListener("change", closeAtDesktop);
  }, []);

  function currentValue(href: string): "page" | "location" | undefined {
    const blogRoot = blog.replace(/\/$/, "");
    if (href === blog && (pathname === blogRoot || pathname.startsWith(`${blogRoot}/`))) return "page";
    if (pathname === home && activeHref === href && href.includes("#")) return "location";
    return undefined;
  }

  function handleNavClick(event: React.MouseEvent<HTMLAnchorElement>, href: string) {
    setOpen(false);
    const destination = new URL(href, window.location.origin);
    if (!destination.hash || destination.pathname !== window.location.pathname) return;
    const target = document.getElementById(destination.hash.slice(1));
    if (!target) return;
    event.preventDefault();
    setActiveHref(href);
    window.history.pushState(null, "", destination.hash);
    target.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
    window.setTimeout(() => target.focus({ preventScroll: true }), 240);
  }

  return (
    <header className="site-header" data-scrolled={scrolled ? "true" : undefined}>
      <div className="header-inner">
        <Link ref={brandRef} className="brand" href={home} aria-label={locale === "zh-cn" ? "Fichil 首页" : "Fichil home"}><span className="brand-mark" aria-hidden="true">F</span><span>Fichil</span></Link>
        <nav className="desktop-nav" aria-label={navigationLabel}>
          {navItems.map((item) => <Link aria-current={currentValue(item.href)} key={item.href} href={item.href} onClick={(event) => handleNavClick(event, item.href)}>{item.label}</Link>)}
          <Link className="language-link" href={alternatePath} hrefLang={locale === "en" ? "zh-CN" : "en"}>{copy.language}</Link>
          <ThemeToggle locale={locale} />
        </nav>
        <div className="mobile-nav" ref={menuRef}>
          <button ref={triggerRef} className="mobile-nav-trigger" type="button" aria-expanded={open} aria-controls="mobile-site-nav" aria-label={open ? closeLabel : openLabel} onClick={() => setOpen((value) => !value)}>
            <span>{menuLabel}</span><span className="mobile-nav-icon" aria-hidden="true">{open ? "×" : "+"}</span>
          </button>
          {open ? <nav id="mobile-site-nav" className="mobile-nav-panel" aria-label={navigationLabel}>
            {navItems.map((item) => <Link aria-current={currentValue(item.href)} key={item.href} href={item.href} onClick={(event) => handleNavClick(event, item.href)}>{item.label}</Link>)}
            <Link href={alternatePath} hrefLang={locale === "en" ? "zh-CN" : "en"} onClick={() => setOpen(false)}>{copy.language}</Link>
            <ThemeToggle locale={locale} />
          </nav> : null}
        </div>
      </div>
    </header>
  );
}
