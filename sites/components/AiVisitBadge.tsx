"use client";

import { useEffect, useState } from "react";
import type { Locale } from "@/lib/content";

export function AiVisitBadge({ locale, slug }: { locale: Locale; slug: string }) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/ai/v1/stats?locale=${locale}&slug=${encodeURIComponent(slug)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("stats unavailable")))
      .then((payload) => setCount(payload.available ? Number(payload.items?.[0]?.total || 0) : null))
      .catch((error) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setCount(null);
      });
    return () => controller.abort();
  }, [locale, slug]);

  if (count === null) return null;
  const label = locale === "zh-cn" ? `${count} 次检测到的 AI 请求` : `${count} detected AI requests`;
  return <span className="ai-visit-badge" title={label}><span aria-hidden="true">AI</span>{count}</span>;
}
