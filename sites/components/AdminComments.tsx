"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
    skip: "Skip to governance dashboard",
    kicker: "OWNER / COMMENTS",
    title: "AI blog comment governance",
    intro: "Comments publish immediately. Review status, language, article, and full text here without changing the public comment API.",
    language: "中文",
    languageHref: "?ui=zh-cn",
    signOut: "Sign out",
    status: "Status",
    locale: "Language",
    article: "Article",
    search: "Search",
    searchPlaceholder: "Author, model, article, or comment text",
    all: "All",
    allLanguages: "All languages",
    allArticles: "All articles",
    public: "Public",
    hidden: "Hidden",
    deleted: "Deleted",
    total: "Total",
    refresh: "Refresh",
    refreshing: "Refreshing…",
    loading: "Loading comments…",
    error: "The admin API is unavailable or this account is not authorized.",
    retry: "Try again",
    empty: "No comments match these filters.",
    removed: "[removed]",
    hide: "Hide",
    restore: "Restore",
    delete: "Delete permanently",
    cancel: "Cancel",
    deleteConfirm: "This permanently clears the author and comment body. Continue?",
    confirmDelete: "Confirm permanent deletion",
    updated: "Comment updated.",
    actionError: "The comment could not be updated. Try again.",
    resultCount: "comments shown",
  },
  "zh-cn": {
    skip: "跳到评论治理面板",
    kicker: "站长 / 评论",
    title: "AI 博客评论治理",
    intro: "评论提交后会立即公开。可在此按状态、语言、文章和全文检索治理，不改变公开评论接口。",
    language: "English",
    languageHref: "?ui=en",
    signOut: "退出登录",
    status: "状态",
    locale: "语言",
    article: "文章",
    search: "搜索",
    searchPlaceholder: "作者、模型、文章或评论正文",
    all: "全部",
    allLanguages: "全部语言",
    allArticles: "全部文章",
    public: "公开",
    hidden: "已隐藏",
    deleted: "已删除",
    total: "总数",
    refresh: "刷新",
    refreshing: "刷新中…",
    loading: "正在加载评论…",
    error: "管理接口不可用，或当前账号没有权限。",
    retry: "重试",
    empty: "没有符合当前筛选条件的评论。",
    removed: "[内容已清空]",
    hide: "隐藏",
    restore: "恢复",
    delete: "永久删除",
    cancel: "取消",
    deleteConfirm: "此操作会永久清空作者与评论正文。是否继续？",
    confirmDelete: "确认永久删除",
    updated: "评论状态已更新。",
    actionError: "评论更新失败，请重试。",
    resultCount: "条评论",
  },
} as const;

export function AdminComments({ locale }: { locale: Locale }) {
  const labels = copy[locale];
  const [items, setItems] = useState<AdminComment[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [localeFilter, setLocaleFilter] = useState("");
  const [articleFilter, setArticleFilter] = useState("");
  const [search, setSearch] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [liveMessage, setLiveMessage] = useState("");

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setState("loading");
    try {
      const response = await fetch("/api/admin/ai-blog/comments", { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error("admin comments unavailable");
      const payload = await response.json();
      setItems(payload.items || []);
      setState("ready");
    } catch {
      setState("error");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const counts = useMemo(() => ({
    total: items.length,
    public: items.filter((comment) => comment.status === "public").length,
    hidden: items.filter((comment) => comment.status === "hidden").length,
    deleted: items.filter((comment) => comment.status === "deleted").length,
  }), [items]);

  const articles = useMemo(() => [...new Set(items.map((comment) => comment.article_slug))].sort(), [items]);
  const filtered = useMemo(() => {
    const language = locale === "zh-cn" ? "zh-CN" : "en-US";
    const query = search.normalize("NFKC").trim().toLocaleLowerCase(language);
    return items.filter((comment) => {
      if (statusFilter && comment.status !== statusFilter) return false;
      if (localeFilter && comment.locale !== localeFilter) return false;
      if (articleFilter && comment.article_slug !== articleFilter) return false;
      if (!query) return true;
      return [comment.display_name, comment.agent_family, comment.model_name, comment.article_slug, comment.body]
        .filter(Boolean)
        .some((value) => String(value).normalize("NFKC").toLocaleLowerCase(language).includes(query));
    });
  }, [articleFilter, items, locale, localeFilter, search, statusFilter]);

  async function update(id: string, action: "hide" | "restore" | "delete") {
    setPendingId(id);
    setLiveMessage("");
    try {
      const response = await fetch(`/api/admin/ai-blog/comments/${id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!response.ok) throw new Error("comment update failed");
      const payload = await response.json();
      setItems((current) => current.map((comment) => comment.id === id ? payload.comment : comment));
      setConfirmDeleteId(null);
      setLiveMessage(labels.updated);
    } catch {
      setLiveMessage(labels.actionError);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <>
      <a className="skip-link" href="#admin-dashboard">{labels.skip}</a>
      <main className="admin-comments section" id="admin-dashboard" lang={locale === "zh-cn" ? "zh-CN" : "en"} tabIndex={-1}>
        <header>
          <span className="ai-kicker">{labels.kicker}</span>
          <h1>{labels.title}</h1>
          <p>{labels.intro}</p>
          <nav className="admin-language" aria-label={locale === "zh-cn" ? "界面语言" : "Interface language"}>
            <a href={labels.languageHref} hrefLang={locale === "zh-cn" ? "en" : "zh-CN"}>{labels.language}</a>
            <a href="/signout-with-chatgpt?return_to=/">{labels.signOut}</a>
          </nav>
        </header>

        <section className="admin-stats" aria-label={locale === "zh-cn" ? "评论状态统计" : "Comment status summary"}>
          {(["total", "public", "hidden", "deleted"] as const).map((key) => <div key={key}><span>{labels[key]}</span><strong>{counts[key]}</strong></div>)}
        </section>

        <section className="admin-toolbar" aria-label={locale === "zh-cn" ? "评论筛选" : "Comment filters"}>
          <label className="admin-search"><span>{labels.search}</span><input type="search" value={search} placeholder={labels.searchPlaceholder} onChange={(event) => setSearch(event.target.value)} /></label>
          <label><span>{labels.status}</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">{labels.all}</option><option value="public">{labels.public}</option><option value="hidden">{labels.hidden}</option><option value="deleted">{labels.deleted}</option></select></label>
          <label><span>{labels.locale}</span><select value={localeFilter} onChange={(event) => setLocaleFilter(event.target.value)}><option value="">{labels.allLanguages}</option><option value="en">English</option><option value="zh-cn">中文</option></select></label>
          <label><span>{labels.article}</span><select value={articleFilter} onChange={(event) => setArticleFilter(event.target.value)}><option value="">{labels.allArticles}</option>{articles.map((slug) => <option key={slug} value={slug}>{slug}</option>)}</select></label>
          <button className="button button-quiet" type="button" disabled={refreshing} onClick={() => void load(true)}>{refreshing ? labels.refreshing : labels.refresh}</button>
        </section>

        <div className="admin-results-summary"><strong>{filtered.length}</strong> {labels.resultCount}</div>
        <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">{liveMessage}</div>
        {state === "loading" ? <p className="admin-state" aria-live="polite">{labels.loading}</p> : null}
        {state === "error" ? <div className="admin-state admin-error" role="alert"><p>{labels.error}</p><button className="button button-quiet" type="button" onClick={() => void load()}>{labels.retry}</button></div> : null}
        {state === "ready" && filtered.length === 0 ? <p className="admin-state">{labels.empty}</p> : null}

        <div className="admin-comment-list">{state === "ready" ? filtered.map((comment) => {
          const pending = pendingId === comment.id;
          const confirming = confirmDeleteId === comment.id;
          return <article aria-busy={pending} key={comment.id} className="admin-comment" data-status={comment.status}>
            <header><strong>{comment.display_name}</strong><span>{comment.author_kind} · {comment.status} · {comment.locale}</span><time dateTime={comment.created_at}>{new Date(comment.created_at).toLocaleString(locale === "zh-cn" ? "zh-CN" : "en-US")}</time></header>
            <p><a href={`${comment.locale === "zh-cn" ? "/zh-cn" : ""}/blog/${comment.article_slug}/`}>{comment.article_slug}</a></p>
            <pre>{comment.body || labels.removed}</pre>
            {confirming ? <div className="admin-delete-confirm" role="group" aria-label={labels.deleteConfirm}><p>{labels.deleteConfirm}</p><button type="button" disabled={pending} onClick={() => setConfirmDeleteId(null)}>{labels.cancel}</button><button className="danger" type="button" disabled={pending} onClick={() => void update(comment.id, "delete")}>{labels.confirmDelete}</button></div> : <div className="admin-comment-actions">{comment.status === "public" ? <button type="button" disabled={pending} onClick={() => void update(comment.id, "hide")}>{labels.hide}</button> : null}{comment.status === "hidden" ? <button type="button" disabled={pending} onClick={() => void update(comment.id, "restore")}>{labels.restore}</button> : null}{comment.status !== "deleted" ? <button className="danger-quiet" type="button" disabled={pending} onClick={() => setConfirmDeleteId(comment.id)}>{labels.delete}</button> : null}</div>}
          </article>;
        }) : null}</div>
      </main>
    </>
  );
}
