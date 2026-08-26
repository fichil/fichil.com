import { getPost, type Locale } from "@/lib/content";

export const AI_AGENT_REGISTRY_VERSION = "2026-08-24";

export interface DetectedAiAgent {
  family: string;
  name: string;
  model?: string;
  source: "user-agent" | "self-declared";
}

const knownAgents: Array<{ pattern: RegExp; family: string; name: string }> = [
  // OpenAI publisher guidance documents GPTBot and OAI-SearchBot. ChatGPT-User
  // remains recognized for compatibility with user-directed retrieval.
  { pattern: /OAI-SearchBot/i, family: "openai", name: "OAI-SearchBot" },
  { pattern: /ChatGPT-User/i, family: "openai", name: "ChatGPT-User" },
  { pattern: /GPTBot/i, family: "openai", name: "GPTBot" },
  // Anthropic documents three distinct agents for training, search, and
  // user-directed retrieval.
  { pattern: /Claude-SearchBot/i, family: "anthropic", name: "Claude-SearchBot" },
  { pattern: /Claude-User/i, family: "anthropic", name: "Claude-User" },
  { pattern: /ClaudeBot/i, family: "anthropic", name: "ClaudeBot" },
  // Google-Extended is a robots product token, not an HTTP User-Agent. Only
  // the documented Vertex AI agent crawler is counted here.
  { pattern: /Google-CloudVertexBot/i, family: "google", name: "Google-CloudVertexBot" },
  { pattern: /Perplexity-User/i, family: "perplexity", name: "Perplexity-User" },
  { pattern: /PerplexityBot/i, family: "perplexity", name: "PerplexityBot" },
];

function safeHeader(value: string | null, maxLength: number): string | undefined {
  const normalized = value?.normalize("NFKC").trim().replace(/[\u0000-\u001f\u007f]/g, "").slice(0, maxLength);
  return normalized || undefined;
}

export function detectAiAgent(request: Request): DetectedAiAgent | null {
  const userAgent = request.headers.get("user-agent") || "";
  const known = knownAgents.find((agent) => agent.pattern.test(userAgent));
  if (known) {
    return {
      family: known.family,
      name: known.name,
      model: safeHeader(request.headers.get("x-fichil-agent-model"), 100),
      source: "user-agent",
    };
  }

  if (request.headers.get("x-fichil-agent-type")?.trim().toLowerCase() !== "ai") return null;
  return {
    // Keep the metric category bounded. Self-declared names and models are
    // accepted for protocol transparency but never create arbitrary D1 keys.
    family: "self-declared",
    name: safeHeader(request.headers.get("x-fichil-agent-name"), 80) || "Self-declared AI",
    model: safeHeader(request.headers.get("x-fichil-agent-model"), 100),
    source: "self-declared",
  };
}

export function matchHtmlArticle(pathname: string): { locale: Locale; slug: string } | null {
  const match = pathname.match(/^\/(?:zh-cn\/)?blog\/([a-z0-9][a-z0-9-]*)\/$/);
  if (!match) return null;
  const locale: Locale = pathname.startsWith("/zh-cn/") ? "zh-cn" : "en";
  return getPost(locale, match[1]) ? { locale, slug: match[1] } : null;
}

export function matchApiArticle(pathname: string): { locale: Locale; slug: string } | null {
  const match = pathname.match(/^\/api\/ai\/v1\/articles\/(en|zh-cn)\/([a-z0-9][a-z0-9-]*)\/?$/);
  if (!match) return null;
  const locale = match[1] as Locale;
  return getPost(locale, match[2]) ? { locale, slug: match[2] } : null;
}
