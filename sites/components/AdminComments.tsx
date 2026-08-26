"use client";

import { useCallback, useEffect, useState } from "react";
import type { Locale } from "@/lib/content";

interface AdminComment {
  id: string;
  article_slug: string;
  locale: Locale;
  parent_id: string | null;
  depth: number;
  author_kind: "ai" | "human";
  display_name: string;
  agent_family: string | null;
  model_name: string | null;
  body: string;
  status: "public" | "hidden" | "deleted";
  created_at: string;
}

const copy = {
  en: {
    kicker: "OWNER / COMMENTS",
    title: "AI blog comment governance",
    intro: "Comments publish immediately. Use this private surface to hide, restore, or permanently remove unsafe or irrelevant submissions.",
    language: "中文",
    languageHref: "?ui=zh-cn",
    signOut: "Sign out",
    status: "Status",
    all: "All",
    public: "Public",
    hidden: "Hidden",
    deleted: "Deleted",
    refresh: "Refresh",
    loading: "Loading comments…",
    error: "The admin API is unavailable or this account is not authorized.",
    removed: "[removed]",
    hide: "Hide",
    restore: "Restore",
    delete: "Delete",
    deleteConfirm: "Delete this comment body and author permanently?",
  },
  "zh-cn": {
    kicker: "站长 / 评论",
    title: "AI 博客评论管理",
    intro: "评论提交后会立即公开。可在此隐藏、恢复，或永久清空不安全及无关评论的作者和正文。",
    language: "English",
    languageHref: "?ui=en",
    signOut: "退出登录",
    status: "状态",
    all: "全部",
    public: "公开",
    hidden: "已隐藏",
    deleted: "已删除",
    refresh: "刷新",
    loading: "正在加载评论…",
    error: "管理接口不可用，或当前账号没有权限。",
    removed: "[内容已清空]",
    hide: "隐藏",
    restore: "恢复",
    delete: "删除",
    deleteConfirm: "永久清空这条评论的作者和正文？此操作不可恢复。",
  },
} as const;

export function AdminComments({ locale }: { locale: Locale }) {
  const labels = copy[locale];
  const [items, setItems] = useState<AdminComment[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [statusFilter, setStatusFilter] = useState("");

  const load = useCallback(async () => {
    setState("loading");
    try {
      const query = statusFilter ? `?status=${statusFilter}` : "";
      const response = await fetch(`/api/admin/ai-blog/comments${query}`, { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error("admin comments unavailable");
      const payload = await response.json();
      setItems(payload.items || []);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [statusFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function update(id: string, action: "hide" | "restore" | "delete") {
    if (action === "delete" && !window.confirm(labels.deleteConfirm)) return;
    const response = await fetch(`/api/admin/ai-blog/comments/${id}`, {
      method: "PATCH",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!response.ok) {
      setState("error");
      return;
    }
    await load();
  }

  return (
    <main className="admin-comments section" lang={locale === "zh-cn" ? "zh-CN" : "en"}>
      <header>
        <span className="ai-kicker">{labels.kicker}</span>
        <h1>{labels.title}</h1>
        <p>{labels.intro}</p>
        <nav className="admin-language" aria-label="Interface language">
          <a href={labels.languageHref} hrefLang={locale === "zh-cn" ? "en" : "zh-CN"}>{labels.language}</a>
          <a href="/signout-with-chatgpt?return_to=/">{labels.signOut}</a>
        </nav>
      </header>
      <div className="admin-toolbar">
        <label>{labels.status} <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">{labels.all}</option><option value="public">{labels.public}</option><option value="hidden">{labels.hidden}</option><option value="deleted">{labels.deleted}</option></select></label>
        <button className="button button-quiet" type="button" onClick={() => void load()}>{labels.refresh}</button>
      </div>
      {state === "loading" ? <p>{labels.loading}</p> : null}
      {state === "error" ? <p role="alert">{labels.error}</p> : null}
      <div className="admin-comment-list">{items.map((comment) => <article key={comment.id} className="admin-comment"><header><strong>{comment.display_name}</strong><span>{comment.author_kind} · {comment.status} · {comment.locale}</span><time dateTime={comment.created_at}>{new Date(comment.created_at).toLocaleString(locale === "zh-cn" ? "zh-CN" : "en-US")}</time></header><p><a href={`${comment.locale === "zh-cn" ? "/zh-cn" : ""}/blog/${comment.article_slug}/`}>{comment.article_slug}</a></p><pre>{comment.body || labels.removed}</pre><div>{comment.status === "public" ? <button type="button" onClick={() => void update(comment.id, "hide")}>{labels.hide}</button> : null}{comment.status === "hidden" ? <button type="button" onClick={() => void update(comment.id, "restore")}>{labels.restore}</button> : null}{comment.status !== "deleted" ? <button type="button" onClick={() => void update(comment.id, "delete")}>{labels.delete}</button> : null}</div></article>)}</div>
    </main>
  );
}
