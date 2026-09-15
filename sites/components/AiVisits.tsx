"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Locale } from "@/lib/content";
import { formatAiVisitTime, type AiVisitItem, type LegacyAiVisitItem } from "@/lib/ai-engagement-contract";

const copy = {
  en: {
    title: "AI visit records", intro: "Each row is a detected AI request, not a verified visitor. Times are shown in Beijing time (UTC+08:00).",
    empty: "No individual visit records yet.", legacy: "Historical summaries", legacyIntro: "Older records contain only a platform, UTC date, and request count. Individual names and visit times cannot be reconstructed.",
    legacyEmpty: "No older requests without individual records.", loading: "Loading visit records…", error: "Visit records could not be loaded.",
    more: "Load more", retry: "Retry", requests: "requests", unverified: "Unverified", declared: "Self-declared", html: "Web page", json: "Article JSON",
  },
  "zh-cn": {
    title: "AI 浏览记录", intro: "每行是一次检测到的 AI 请求，身份未经验证。时间统一为北京时间（UTC+08:00）。",
    empty: "暂无逐次浏览记录。", legacy: "历史汇总", legacyIntro: "旧记录仅保存平台、UTC 日期和请求次数，无法还原具体 AI 名称及每次访问时间。",
    legacyEmpty: "没有缺少逐次明细的历史请求。", loading: "正在加载浏览记录…", error: "浏览记录暂时无法加载。",
    more: "加载更多", retry: "重试", requests: "次请求", unverified: "身份未验证", declared: "自报身份", html: "网页", json: "文章 JSON",
  },
} as const;

export interface VisitPage<T> {
  items: T[];
  nextCursor: string | null;
  status: "loading" | "ready" | "error";
}

function useVisitPage<T>(url: string) {
  const [page, setPage] = useState<VisitPage<T>>({ items: [], nextCursor: null, status: "loading" });
  const controller = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const failedCursor = useRef<string | null>(null);
  const load = useCallback(async (cursor: string | null = null) => {
    if (busy.current) return;
    busy.current = true;
    const current = new AbortController();
    controller.current = current;
    failedCursor.current = cursor;
    setPage((previous) => ({ ...previous, status: "loading" }));
    try {
      const response = await fetch(`${url}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, { cache: "no-store", signal: current.signal });
      if (!response.ok) throw new Error("visits unavailable");
      const payload = await response.json();
      if (payload.available === false || !Array.isArray(payload.items)) throw new Error("visits unavailable");
      if (!current.signal.aborted) setPage((previous) => ({
        items: cursor ? [...previous.items, ...payload.items] : payload.items,
        nextCursor: payload.next_cursor ?? null, status: "ready",
      }));
    } catch {
      if (!current.signal.aborted) setPage((previous) => ({ ...previous, status: "error" }));
    } finally {
      if (controller.current === current) busy.current = false;
    }
  }, [url]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => { window.clearTimeout(timer); controller.current?.abort(); busy.current = false; };
  }, [load]);
  return { page, more: () => { void load(page.nextCursor); }, retry: () => { void load(failedCursor.current); } };
}

export function VisitRecords({ locale, page, onMore, onRetry }: { locale: Locale; page: VisitPage<AiVisitItem>; onMore: () => void; onRetry: () => void }) {
  const labels = copy[locale];
  return <section className="ai-visits" aria-labelledby="ai-visits-title" aria-busy={page.status === "loading"}>
    <h3 id="ai-visits-title">{labels.title}</h3><p className="ai-visit-note">{labels.intro}</p>
    <ol className="ai-visit-list">{page.items.map((item) => <li key={item.id}>
      <div><strong>{item.agent_name}</strong><span>{item.agent_family} · {item.detection_source === "self-declared" ? `${labels.declared} · ` : ""}{labels.unverified}</span></div>
      <div><time dateTime={item.visited_at}>{formatAiVisitTime(item.visited_at)}</time><span>{item.request_kind === "html" ? labels.html : labels.json}</span></div>
    </li>)}</ol>
    <VisitPageStatus locale={locale} page={page} empty={labels.empty} onMore={onMore} onRetry={onRetry} />
  </section>;
}

function VisitPageStatus<T>({ locale, page, empty, onMore, onRetry }: { locale: Locale; page: VisitPage<T>; empty: string; onMore: () => void; onRetry: () => void }) {
  const labels = copy[locale];
  return <div className="ai-visit-status" aria-live="polite">
    {page.status === "loading" ? <p role="status">{labels.loading}</p> : null}
    {page.status === "error" ? <p className="ai-unavailable" role="status">{labels.error} <button type="button" className="button button-quiet" onClick={onRetry}>{labels.retry}</button></p> : null}
    {page.status === "ready" && page.items.length === 0 ? <p>{empty}</p> : null}
    {page.nextCursor && page.status === "ready" ? <button type="button" className="button button-quiet" onClick={onMore}>{labels.more}</button> : null}
  </div>;
}

export function AiVisits({ locale, slug }: { locale: Locale; slug: string }) {
  const labels = copy[locale];
  const url = `/api/ai/v1/articles/${locale}/${encodeURIComponent(slug)}/visits`;
  const events = useVisitPage<AiVisitItem>(`${url}?view=events&limit=20`);
  const legacy = useVisitPage<LegacyAiVisitItem>(`${url}?view=legacy&limit=20`);
  return <>
    <VisitRecords locale={locale} page={events.page} onMore={events.more} onRetry={events.retry} />
    <details className="ai-legacy"><summary>{labels.legacy}</summary>
      <p className="ai-visit-note">{labels.legacyIntro}</p>
      <ul className="ai-visit-list">{legacy.page.items.map((item) => <li key={`${item.visit_date}:${item.agent_family}`}>
        <strong>{item.agent_family}</strong><time dateTime={item.visit_date}>{item.visit_date} UTC</time><span>{item.request_count} {labels.requests}</span>
      </li>)}</ul>
      <VisitPageStatus locale={locale} page={legacy.page} empty={labels.legacyEmpty} onMore={legacy.more} onRetry={legacy.retry} />
    </details>
  </>;
}
