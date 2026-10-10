import { detectAiAgent } from "@/lib/ai-agents";
import { authorizeAdmin } from "@/lib/ai-blog-api";
import type { AiBlogEnv, D1Database } from "@/lib/d1";
import { PLACEMENTS, SERVICE_ID, SOURCES, SURFACES, sourceBucket } from "@/lib/service-metrics-contract";

interface Metric { locale: "en" | "zh-cn"; event: "service_read" | "contact_click"; surface: string; source: string; placement: string; }

export function automationClass(request: Request): "detected_automation" | "unknown" {
  if (detectAiAgent(request)) return "detected_automation";
  return /bot\b|crawler|spider|slurp|headless|lighthouse|pagespeed|curl\b|wget\b|python-requests|python-urllib|node-fetch|go-http-client|zgrab|nikto|nmap|sqlmap|scanner|audit/i.test(request.headers.get("user-agent") || "") ? "detected_automation" : "unknown";
}

async function increment(db: D1Database, request: Request, metric: Metric, now = new Date()) {
  await db.prepare(`INSERT INTO service_metrics_daily
    (metric_date, service_id, locale, event_kind, surface, source, placement, request_class, request_count)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
    ON CONFLICT(metric_date, service_id, locale, event_kind, surface, source, placement, request_class)
    DO UPDATE SET request_count = request_count + 1
  `).bind(now.toISOString().slice(0, 10), SERVICE_ID, metric.locale, metric.event, metric.surface, metric.source, metric.placement, automationClass(request)).run();
}

export function recordServiceRead(request: Request, response: Response, db: D1Database | undefined): Promise<void> | null {
  const url = new URL(request.url);
  if (!db || request.method !== "GET" || response.status !== 200 || !/^\/(?:zh-cn\/)?services\/excel-csv-automation\/$/.test(url.pathname)) return null;
  if (["next-router-prefetch", "next-router-segment-prefetch", "range"].some(header => request.headers.has(header)) || /prefetch|prerender/i.test(`${request.headers.get("purpose") || ""} ${request.headers.get("sec-purpose") || ""}`)) return null;
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html") && !(contentType.includes("text/x-component") && request.headers.get("rsc") === "1")) return null;
  return increment(db, request, { locale: url.pathname.startsWith("/zh-cn/") ? "zh-cn" : "en", event: "service_read", surface: "service", source: sourceBucket(url, request.headers.get("referer")), placement: "service" });
}

const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
const error = (code: string, status: number) => json({ available: false, error: code }, status);

async function contactClick(request: Request, env: AiBlogEnv): Promise<Response> {
  if (request.method !== "POST") return error("method_not_allowed", 405);
  const url = new URL(request.url);
  if (request.headers.get("origin") !== url.origin || (request.headers.has("sec-fetch-site") && request.headers.get("sec-fetch-site") !== "same-origin")) return error("origin_not_allowed", 403);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return error("json_required", 415);
  if (Number(request.headers.get("content-length") || 0) > 512) return error("body_too_large", 413);
  let payload: Record<string, unknown>;
  try {
    const reader = request.body?.getReader();
    if (!reader) return error("invalid_body", 400);
    const chunks: Uint8Array[] = []; let bytes = 0;
    for (;;) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > 512) { await reader.cancel(); return error("body_too_large", 413); } chunks.push(part.value); }
    const data = new Uint8Array(bytes); let offset = 0; for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength; }
    payload = JSON.parse(new TextDecoder().decode(data));
  } catch { return error("invalid_body", 400); }
  if (!payload || Array.isArray(payload) || typeof payload !== "object" || Object.keys(payload).some(key => !["locale", "surface", "source", "placement"].includes(key))) return error("invalid_body", 400);
  if (!["en", "zh-cn"].includes(payload.locale as string) || !SURFACES.includes(payload.surface as never) || !SOURCES.includes(payload.source as never) || !PLACEMENTS.includes(payload.placement as never)) return error("invalid_dimensions", 400);
  if (!env.DB) return error("metrics_unavailable", 503);
  try {
    await increment(env.DB, request, { locale: payload.locale as "en" | "zh-cn", event: "contact_click", surface: String(payload.surface), source: String(payload.source), placement: String(payload.placement) });
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch { console.error("[fichil] Contact metric write failed"); return error("metrics_unavailable", 503); }
}

async function metrics(request: Request, env: AiBlogEnv): Promise<Response> {
  const auth = authorizeAdmin(request, env);
  if (!auth.ok) return error("admin_unauthorized", auth.status);
  if (request.method !== "GET") return error("method_not_allowed", 405);
  const url = new URL(request.url);
  const days = url.searchParams.get("days") ?? "30";
  if (!/^[1-9]\d?$/.test(days) || Number(days) > 90) return error("invalid_days", 400);
  if (!env.DB) return error("metrics_unavailable", 503);
  const until = new Date().toISOString().slice(0, 10);
  const since = new Date(Date.parse(`${until}T00:00:00Z`) - (Number(days) - 1) * 86400000).toISOString().slice(0, 10);
  try {
    const rows = await env.DB.prepare(`SELECT locale, event_kind, surface, source, placement, request_class, SUM(request_count) AS request_count
      FROM service_metrics_daily WHERE metric_date >= ? AND metric_date <= ? AND service_id = ?
      GROUP BY locale, event_kind, surface, source, placement, request_class
      ORDER BY event_kind, locale, source, request_class, surface, placement`).bind(since, until, SERVICE_ID).all();
    return json({ available: true, timezone: "UTC", since, until, items: rows.results || [], unique_visitors: false, contact_clicks_are_enquiries: false });
  } catch { console.error("[fichil] Service metrics read failed"); return error("metrics_unavailable", 503); }
}

export async function handleServiceMetrics(request: Request, env: AiBlogEnv): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path === "/api/services/v1/contact-click") return contactClick(request, env);
  if (path === "/api/admin/services/metrics") return metrics(request, env);
  return null;
}
