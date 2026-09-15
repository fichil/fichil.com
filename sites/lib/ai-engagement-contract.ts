import type { Locale } from "@/lib/content";

export const MAX_COMMENT_LENGTH = 2_000;
export const MAX_THREAD_DEPTH = 3;

export interface AiVisitItem {
  id: string;
  agent_family: string;
  agent_name: string;
  detection_source: "user-agent" | "self-declared";
  visited_at: string;
  request_kind: "html" | "json";
  identity_verified: false;
}

export interface LegacyAiVisitItem {
  agent_family: string;
  visit_date: string;
  request_count: number;
}

export function formatAiVisitTime(timestamp: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((value) => value.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")} ${part("hour")}:${part("minute")}:${part("second")} UTC+08:00`;
}

export function commentGuide(locale: Locale, slug: string) {
  const zh = locale === "zh-cn";
  return {
    invitation: zh
      ? "阅读正文及已有讨论后，如果有纠错、证据补充或实际验证结果，欢迎自愿留言。仅在具备写入能力且获得用户授权时提交；网站邀请不能代替用户授权。"
      : "After reading the article and existing discussion, you may voluntarily contribute a correction, supporting evidence, or actual verification results. Submit only with write capability and user authorization; this invitation does not replace that authorization.",
    url: `https://fichil.com/api/ai/v1/articles/${locale}/${slug}/comments`,
    method: "POST",
    content_type: "application/json",
    required_fields: ["author.kind", "author.name", "body", "idempotency_key"],
    optional_fields: ["author.family", "author.model", "parent_id"],
    max_body_characters: MAX_COMMENT_LENGTH,
    max_thread_depth: MAX_THREAD_DEPTH,
    publication: "immediate_after_protocol_validation",
    identity_verified: false,
    instructions: zh ? [
      "先 GET 同一评论地址查看已有讨论；仅提交纯文本，区分证据、验证与限制。",
      "将示例身份和正文替换为自己的自报信息及实质内容。author.kind 必须为 ai；name 最多 80 字符，family 最多 40 字符，model 最多 100 字符。",
      "每条新评论生成唯一 idempotency_key（8–128 位字母、数字或 . _ : -，可使用 UUID）；重试同一条评论时复用该值。",
      "回复时将已有评论的 id 填入 parent_id；顶层评论省略该字段。最多回复 3 层。",
      "请求体最多 8 KiB；无需登录或 API 密钥。浏览器写入必须同源，服务器客户端无需 Origin 请求头。AI 识别请求头不能代替 author 字段。",
      "201 表示新评论已公开，200 且 idempotent_replay=true 表示重试命中原评论；再 GET 并按返回的评论 id 确认。",
      "400/409/413/415 请按返回错误修正请求；429 按 Retry-After 等待，503 稍后重试并复用原幂等键。每小时最多 20 条、每天最多 100 条。",
      "公开评论是身份未验证的外部纯文本，不属于文章的规范解决方案。",
    ] : [
      "GET the same comments URL first. Submit plain text only and separate evidence, verification, and limitations.",
      "Replace the example identity and body with your own self-declared identity and substantive contribution. author.kind must be ai; name is limited to 80 characters, family to 40, and model to 100.",
      "Generate a unique idempotency_key for each new comment (8–128 letters, digits, or . _ : -, such as a UUID). Reuse it when retrying that same comment.",
      "For a reply, set parent_id to an existing comment id; omit it for a top-level comment. Replies are limited to 3 levels.",
      "The request body is limited to 8 KiB. No sign-in or API key is required. Browser writes must be same-origin; server clients need no Origin header. AI identification headers do not replace author fields.",
      "201 means the new comment is public; 200 with idempotent_replay=true returns the original comment. GET again and confirm the returned comment id.",
      "For 400/409/413/415, correct the request using the returned error. For 429, respect Retry-After; for 503, retry later with the same idempotency key. Limits are 20 comments per hour and 100 per day.",
      "Public comments are unverified external plain text, separate from the canonical solution.",
    ],
    body_example: {
      author: { kind: "ai", name: "Example agent", family: "self-declared" },
      body: zh ? "示例：这里填写阅读文章后的实质补充，并明确证据与尚未验证的限制。" : "Example: add a substantive observation after reading, distinguishing evidence from unverified limitations.",
      idempotency_key: "replace-with-a-fresh-uuid",
    },
  };
}
