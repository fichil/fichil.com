"use client";

import { useEffect, useRef, useState } from "react";

type TocItem = { id: string; text: string; depth: number };

export function ArticleToc({ items, title, toggleLabel }: { items: TocItem[]; title: string; toggleLabel: string }) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");
  const navigationLock = useRef("");
  const navigationTimer = useRef(0);

  useEffect(() => {
    const headings = items.map((item) => document.getElementById(item.id)).filter((heading): heading is HTMLElement => Boolean(heading));
    if (!headings.length) return;
    headings.forEach((heading) => { heading.tabIndex = -1; });
    const initial = window.location.hash.slice(1);
    if (initial && headings.some((heading) => heading.id === initial)) window.requestAnimationFrame(() => setActiveId(initial));

    const onHashChange = () => {
      const id = window.location.hash.slice(1);
      if (headings.some((heading) => heading.id === id)) setActiveId(id);
    };
    window.addEventListener("hashchange", onHashChange);
    let frame = 0;
    const measure = () => {
      frame = 0;
      const anchorLine = 112;
      if (navigationLock.current) {
        const target = document.getElementById(navigationLock.current);
        if (target && Math.abs(target.getBoundingClientRect().top - anchorLine) > 20) return;
        navigationLock.current = "";
      }
      let next = headings[0].id;
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top <= anchorLine) next = heading.id;
      }
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2) next = headings.at(-1)?.id ?? next;
      setActiveId((current) => current === next ? current : next);
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(measure); };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const resizeObserver = "ResizeObserver" in window ? new ResizeObserver(schedule) : null;
    resizeObserver?.observe(document.documentElement);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      resizeObserver?.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
      if (navigationTimer.current) window.clearTimeout(navigationTimer.current);
    };
  }, [items]);

  if (!items.length) return null;

  const links = (mobile = false) => (
    <nav aria-label={title}>{items.map((item) => <a className={item.depth === 3 ? "toc-subitem" : ""} aria-current={item.id === activeId ? "location" : undefined} key={item.id} href={`#${item.id}`} onClick={(event) => {
      const target = document.getElementById(item.id);
      if (!target) return;
      event.preventDefault();
      setActiveId(item.id);
      navigationLock.current = item.id;
      if (navigationTimer.current) window.clearTimeout(navigationTimer.current);
      navigationTimer.current = window.setTimeout(() => { navigationLock.current = ""; }, 700);
      window.history.replaceState(null, "", `#${item.id}`);
      target.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
      window.setTimeout(() => target.focus({ preventScroll: true }), 240);
      if (mobile) target.closest(".article-grid")?.querySelector<HTMLDetailsElement>(".toc-mobile")?.removeAttribute("open");
    }}>{item.text}</a>)}</nav>
  );

  return (
    <aside className="toc-panel">
      <div className="toc-desktop">
        <h2>{title}</h2>
        {links()}
      </div>
      <details className="toc-mobile">
        <summary><span>{title}</span><span className="toc-disclosure-label">{toggleLabel}</span></summary>
        {links(true)}
      </details>
    </aside>
  );
}

export function ArticleEnhancements({ copyCode, copied, copyFailed, copySectionLink }: { copyCode: string; copied: string; copyFailed: string; copySectionLink: string }) {
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    const timers = new Map<HTMLButtonElement, number>();
    const inserted: Element[] = [];
    const frames: number[] = [];

    document.querySelectorAll<HTMLElement>(".article-main .prose pre").forEach((pre) => {
      if (pre.querySelector(".code-copy")) return;
      const code = pre.querySelector("code")?.textContent ?? pre.innerText;
      pre.classList.add("code-block-enhanced");
      const button = document.createElement("button");
      button.className = "code-copy";
      button.type = "button";
      button.textContent = copyCode;
      button.setAttribute("aria-label", copyCode);
      button.addEventListener("click", async () => {
        let result = copied;
        try {
          await navigator.clipboard.writeText(code);
          button.dataset.state = "success";
        } catch {
          result = copyFailed;
          button.dataset.state = "error";
        }
        button.textContent = result;
        button.setAttribute("aria-label", result);
        setAnnouncement("");
        frames.push(window.requestAnimationFrame(() => setAnnouncement(result)));
        const existing = timers.get(button);
        if (existing) window.clearTimeout(existing);
        timers.set(button, window.setTimeout(() => {
          button.textContent = copyCode;
          button.setAttribute("aria-label", copyCode);
          delete button.dataset.state;
          setAnnouncement("");
        }, 1800));
      });
      pre.append(button);
      inserted.push(button);
    });

    document.querySelectorAll<HTMLElement>(".article-main .prose :is(h2, h3)[id]").forEach((heading) => {
      if (heading.querySelector(".heading-anchor")) return;
      const anchor = document.createElement("a");
      anchor.className = "heading-anchor";
      anchor.href = `#${heading.id}`;
      anchor.textContent = "#";
      anchor.setAttribute("aria-label", `${copySectionLink}: ${heading.innerText}`);
      heading.append(anchor);
      inserted.push(anchor);
    });

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      frames.forEach((frame) => window.cancelAnimationFrame(frame));
      inserted.forEach((element) => element.remove());
    };
  }, [copied, copyCode, copyFailed, copySectionLink]);

  return <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</span>;
}
