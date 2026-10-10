"use client";

import { useEffect } from "react";
import { PLACEMENTS, sourceBucket, surfaceFromPath } from "@/lib/service-metrics-contract";

export function ContactMetrics() {
  useEffect(() => {
    const capture = (event: MouseEvent) => {
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href^="mailto:"]') : null;
      if (!anchor || !/^mailto:fichilzhang@gmail\.com(?:\?|$)/i.test(anchor.getAttribute("href") || "")) return;
      const page = new URL(window.location.href);
      const requestedPlacement = anchor.dataset.contactPlacement;
      const placement = requestedPlacement && PLACEMENTS.includes(requestedPlacement as never) ? requestedPlacement : anchor.closest("footer") ? "footer" : anchor.closest("#contact") ? "contact" : anchor.closest("article") ? "article" : "other";
      const body = JSON.stringify({ locale: page.pathname.startsWith("/zh-cn/") ? "zh-cn" : "en", surface: surfaceFromPath(page.pathname), source: sourceBucket(page, document.referrer), placement });
      // Preserve mailto behavior; never read its subject/body, persist IDs, or retry clicks.
      try {
        if (navigator.sendBeacon?.("/api/services/v1/contact-click", new Blob([body], { type: "application/json" }))) return;
        void fetch("/api/services/v1/contact-click", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
      } catch { /* Email remains usable when analytics is unavailable. */ }
    };
    document.addEventListener("click", capture);
    return () => document.removeEventListener("click", capture);
  }, []);
  return null;
}
