"use client";

import { useEffect, useState } from "react";

type TocItem = { id: string; text: string; depth: number };

export function ArticleToc({ items, title, toggleLabel }: { items: TocItem[]; title: string; toggleLabel: string }) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");

  useEffect(() => {
    const headings = items.map((item) => document.getElementById(item.id)).filter((heading): heading is HTMLElement => Boolean(heading));
    if (!headings.length || !("IntersectionObserver" in window)) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]?.target.id) setActiveId(visible[0].target.id);
    }, { rootMargin: "-18% 0px -68%", threshold: [0, 1] });
    headings.forEach((heading) => observer.observe(heading));
    return () => observer.disconnect();
  }, [items]);

  if (!items.length) return null;
  return (
    <aside className="toc-panel">
      <details className="toc-disclosure" open>
        <summary><span>{title}</span><span className="toc-disclosure-label">{toggleLabel}</span></summary>
        <nav aria-label={title}>{items.map((item) => <a className={item.depth === 3 ? "toc-subitem" : ""} aria-current={item.id === activeId ? "location" : undefined} key={item.id} href={`#${item.id}`} onClick={(event) => {
          const target = document.getElementById(item.id);
          if (!target) return;
          event.preventDefault();
          setActiveId(item.id);
          window.history.replaceState(null, "", `#${item.id}`);
          target.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
        }}>{item.text}</a>)}</nav>
      </details>
    </aside>
  );
}

export function ArticleEnhancements({ copyCode, copied, copyFailed, copySectionLink }: { copyCode: string; copied: string; copyFailed: string; copySectionLink: string }) {
  useEffect(() => {
    const timers: number[] = [];

    document.querySelectorAll<HTMLElement>(".article-main .prose pre").forEach((pre) => {
      if (pre.querySelector(".code-copy")) return;
      const code = pre.innerText;
      pre.classList.add("code-block-enhanced");
      const button = document.createElement("button");
      button.className = "code-copy";
      button.type = "button";
      button.textContent = copyCode;
      button.setAttribute("aria-label", copyCode);
      button.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(code);
          button.textContent = copied;
        } catch {
          button.textContent = copyFailed;
        }
        timers.push(window.setTimeout(() => { button.textContent = copyCode; }, 1800));
      });
      pre.append(button);
    });

    document.querySelectorAll<HTMLElement>(".article-main .prose :is(h2, h3)[id]").forEach((heading) => {
      if (heading.querySelector(".heading-anchor")) return;
      const anchor = document.createElement("a");
      anchor.className = "heading-anchor";
      anchor.href = `#${heading.id}`;
      anchor.textContent = "#";
      anchor.setAttribute("aria-label", `${copySectionLink}: ${heading.innerText}`);
      heading.append(anchor);
    });

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [copied, copyCode, copyFailed, copySectionLink]);

  return null;
}
