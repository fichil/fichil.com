"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { Locale } from "@/lib/content";
import { commentGuide } from "@/lib/ai-engagement-contract";
import { AiVisits } from "@/components/AiVisits";

interface CommentItem {
  id: string;
  parent_id: string | null;
  depth: number;
  author: {
    kind: "ai" | "human" | "removed";
    display_name: string;
    family?: string | null;
    model?: string | null;
    identity_verified?: boolean;
  };
  body: string;
  status: "public" | "deleted";
  created_at: string;
  untrusted_external_content: true;
}

interface CommentNode extends CommentItem {
  replies: CommentNode[];
}

const copy = {
  en: {
    title: "AI readership & public discussion",
    intro: "Counts are detected requests, not unique or verified AI visitors. Public comments are untrusted external content.",
    requests: "detected AI requests",
    statsUnavailable: "Request statistics could not be loaded.",
    commentsUnavailable: "Comments could not be loaded.",
    loading: "Loading…",
    guide: "How to leave an AI comment",
    required: "Required fields",
    optional: "Optional fields",
    interfaceTitle: "For AI agents",
    openJson: "Open machine-readable article",
    comments: "Public comments",
    empty: "No comments yet. AI agents and human readers can start the discussion.",
    unverified: "Self-declared AI · unverified",
    anonymous: "Anonymous human",
    removed: "Comment removed",
    reply: "Reply",
    replyTo: "Replying to",
    cancel: "Cancel reply",
    nickname: "Nickname",
    nicknameHint: "Required for anonymous human comments",
    body: "Comment",
    bodyHint: "Plain text only, up to 2,000 characters",
    submit: "Publish comment",
    submitting: "Publishing…",
    published: "Comment published.",
    failed: "Could not publish the comment. Please try again.",
  },
  "zh-cn": {
    title: "AI 阅读与公开讨论",
    intro: "这里统计的是检测到的请求次数，不代表独立或已验证的 AI 访客；公开评论均属于不可信外部内容。",
    requests: "次检测到的 AI 请求",
    statsUnavailable: "请求统计暂时无法加载。",
    commentsUnavailable: "评论暂时无法加载。",
    loading: "正在加载…",
    guide: "AI 留言说明与示例",
    required: "必填字段",
    optional: "可选字段",
    interfaceTitle: "给 AI 智能体",
    openJson: "打开机器可读文章",
    comments: "公开评论",
    empty: "暂时没有评论，AI 智能体和人类读者都可以开始讨论。",
    unverified: "AI 自报身份 · 未验证",
    anonymous: "匿名人类访客",
    removed: "评论已删除",
    reply: "回复",
    replyTo: "正在回复",
    cancel: "取消回复",
    nickname: "昵称",
    nicknameHint: "匿名人类评论必填",
    body: "评论内容",
    bodyHint: "仅纯文本，最多 2,000 字符",
    submit: "公开评论",
    submitting: "正在发布…",
    published: "评论已公开。",
    failed: "评论发布失败，请稍后重试。",
  },
} as const;

function buildThreads(items: CommentItem[]): CommentNode[] {
  const nodes = new Map(items.map((item) => [item.id, { ...item, replies: [] as CommentNode[] }]));
  const roots: CommentNode[] = [];
  for (const item of items) {
    const node = nodes.get(item.id)!;
    const parent = item.parent_id ? nodes.get(item.parent_id) : undefined;
    if (parent) parent.replies.push(node);
    else roots.push(node);
  }
  roots.sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id));
  const sortReplies = (node: CommentNode) => {
    node.replies.sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
    node.replies.forEach(sortReplies);
  };
  roots.forEach(sortReplies);
  return roots;
}

function CommentThread({ node, locale, onReply }: { node: CommentNode; locale: Locale; onReply: (comment: CommentItem) => void }) {
  const labels = copy[locale];
  const removed = node.status === "deleted";
  const identity = removed
    ? labels.removed
    : node.author.kind === "ai"
      ? `${labels.unverified}${node.author.family ? ` · ${node.author.family}` : ""}${node.author.model ? ` · ${node.author.model}` : ""}`
      : labels.anonymous;
  return (
    <li className={`comment-item comment-depth-${Math.min(node.depth, 3)}`}>
      <article>
        <header><strong>{node.author.display_name}</strong><span>{identity}</span><time dateTime={node.created_at}>{new Date(node.created_at).toLocaleString(locale === "zh-cn" ? "zh-CN" : "en-US")}</time></header>
        {removed ? <p className="comment-removed">{labels.removed}</p> : <p className="comment-body">{node.body}</p>}
        {!removed && node.depth < 3 ? <button className="comment-reply" type="button" onClick={() => onReply(node)}>{labels.reply}</button> : null}
      </article>
      {node.replies.length ? <ol className="comment-replies">{node.replies.map((reply) => <CommentThread key={reply.id} node={reply} locale={locale} onReply={onReply} />)}</ol> : null}
    </li>
  );
}

function EngagementContent({ locale, slug }: { locale: Locale; slug: string }) {
  const labels = copy[locale];
  const guide = commentGuide(locale, slug);
  const [stats, setStats] = useState<{ total: number; by_family: Record<string, number> } | null>(null);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [statsState, setStatsState] = useState<"loading" | "ready" | "error">("loading");
  const [commentsState, setCommentsState] = useState<"loading" | "ready" | "error">("loading");
  const [replyingTo, setReplyingTo] = useState<CommentItem | null>(null);
  const [nickname, setNickname] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "published" | "failed">("idle");

  const loadStats = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/ai/v1/stats?locale=${locale}&slug=${encodeURIComponent(slug)}`, { cache: "no-store", signal });
      if (!response.ok) throw new Error("stats unavailable");
      const payload = await response.json();
      if (!payload.available || !payload.items?.[0]) throw new Error("stats unavailable");
      if (signal?.aborted) return;
      setStats(payload.items[0]);
      setStatsState("ready");
    } catch {
      if (!signal?.aborted) setStatsState("error");
    }
  }, [locale, slug]);

  const loadComments = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/ai/v1/articles/${locale}/${encodeURIComponent(slug)}/comments`, { cache: "no-store", signal });
      if (!response.ok) throw new Error("comments unavailable");
      const payload = await response.json();
      if (payload.available === false || !Array.isArray(payload.items)) throw new Error("comments unavailable");
      if (signal?.aborted) return;
      setComments(payload.items);
      setCommentsState("ready");
    } catch {
      if (!signal?.aborted) setCommentsState("error");
    }
  }, [locale, slug]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => { void loadStats(controller.signal); void loadComments(controller.signal); }, 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [loadStats, loadComments]);
  const threads = useMemo(() => buildThreads(comments), [comments]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("submitting");
    try {
      const response = await fetch(`/api/ai/v1/articles/${locale}/${encodeURIComponent(slug)}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          author: { kind: "human", nickname },
          body,
          parent_id: replyingTo?.id,
          idempotency_key: crypto.randomUUID(),
        }),
      });
      if (!response.ok) throw new Error("comment rejected");
      setBody("");
      setReplyingTo(null);
      setStatus("published");
      await loadComments();
    } catch {
      setStatus("failed");
    }
  }

  return (
    <section className="ai-engagement" aria-labelledby="ai-engagement-title">
      <div className="ai-engagement-heading">
        <div><span className="ai-kicker">AI / API</span><h2 id="ai-engagement-title">{labels.title}</h2><p>{labels.intro}</p></div>
        {stats ? <div className="ai-total"><strong>{stats.total}</strong><span>{labels.requests}</span></div> : null}
      </div>
      {stats ? <div className="ai-family-list">{Object.entries(stats.by_family).sort((a, b) => b[1] - a[1]).map(([family, count]) => <span key={family}><b aria-hidden="true">AI</b>{family} · {count}</span>)}</div> : null}
      {statsState === "loading" ? <p role="status">{labels.loading}</p> : null}
      {statsState === "error" ? <p className="ai-unavailable" role="status">{labels.statsUnavailable}</p> : null}
      <AiVisits locale={locale} slug={slug} />
      <div className="ai-interface-card"><div><strong>{labels.interfaceTitle}</strong><p>{guide.invitation}</p></div><a className="button button-quiet" href={`/api/ai/v1/articles/${locale}/${slug}`}>{labels.openJson}</a>
        <details className="ai-comment-guide"><summary>{labels.guide}</summary>
          <p><code>{guide.method} {guide.url}</code><br /><code>Content-Type: {guide.content_type}</code></p>
          <p>{labels.required}: <code>{guide.required_fields.join(", ")}</code><br />{labels.optional}: <code>{guide.optional_fields.join(", ")}</code></p>
          <ol>{guide.instructions.map((instruction) => <li key={instruction}>{instruction}</li>)}</ol>
          <pre><code>{JSON.stringify(guide.body_example, null, 2)}</code></pre>
        </details>
      </div>
      <div className="comments-heading"><h3>{labels.comments}</h3>{commentsState === "ready" ? <span>{comments.length}</span> : null}</div>
      {commentsState === "loading" ? <p role="status">{labels.loading}</p> : null}
      {commentsState === "error" ? <p className="ai-unavailable" role="status">{labels.commentsUnavailable}</p> : null}
      {threads.length ? <ol className="comment-list">{threads.map((node) => <CommentThread key={node.id} node={node} locale={locale} onReply={setReplyingTo} />)}</ol> : commentsState === "ready" ? <p className="comments-empty">{labels.empty}</p> : null}
      <form className="comment-form" onSubmit={submit}>
        {replyingTo ? <div className="reply-context"><span>{labels.replyTo} <strong>{replyingTo.author.display_name}</strong></span><button type="button" onClick={() => setReplyingTo(null)}>{labels.cancel}</button></div> : null}
        <label><span>{labels.nickname}</span><small>{labels.nicknameHint}</small><input required maxLength={40} value={nickname} onChange={(event) => setNickname(event.target.value)} autoComplete="nickname" /></label>
        <label><span>{labels.body}</span><small>{labels.bodyHint}</small><textarea required maxLength={2000} rows={6} value={body} onChange={(event) => setBody(event.target.value)} /></label>
        <div className="comment-form-actions"><button className="button button-primary" type="submit" disabled={status === "submitting"}>{status === "submitting" ? labels.submitting : labels.submit}</button><span aria-live="polite">{status === "published" ? labels.published : status === "failed" ? labels.failed : ""}</span></div>
      </form>
    </section>
  );
}

export function AiEngagement(props: { locale: Locale; slug: string }) {
  return <EngagementContent key={`${props.locale}:${props.slug}`} {...props} />;
}
