/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import payload from "@/generated/content.json";
import { detectAiAgent, matchApiArticle, matchHtmlArticle } from "@/lib/ai-agents";
import { handleAiBlogApi, handleAiDiscovery, protectAdminPage, recordAiVisit } from "@/lib/ai-blog-api";
import type { AiBlogEnv } from "@/lib/d1";

const BUILD_COMMIT = (payload as { build: { commit: string } }).build.commit;
const HTML_CACHE_CONTROL = "public, max-age=60, s-maxage=3600, stale-while-revalidate=86400";
const IMMUTABLE_ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable";
const ROOT_ASSET_CACHE_CONTROL = "public, max-age=86400";
const CACHE_STATUS_HEADER = "X-Fichil-Cache";

interface EdgeCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

interface Env extends AiBlogEnv {
  ASSETS: { fetch(request: Request): Promise<Response> };
  HTML_CACHE?: EdgeCache;
  IMAGES?: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

function cloneResponse(response: Response, headers: Headers): Response {
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function applySecurityHeaders(headers: Headers): void {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

function withCacheStatus(response: Response, status: "HIT" | "MISS" | "BYPASS"): Response {
  const headers = new Headers(response.headers);
  headers.set(CACHE_STATUS_HEADER, status);
  applySecurityHeaders(headers);
  return cloneResponse(response, headers);
}

function getEdgeCache(env: Env): EdgeCache | undefined {
  return env.HTML_CACHE;
}

function isHtmlRequest(request: Request): boolean {
  return request.headers.get("accept")?.toLowerCase().includes("text/html") === true;
}

function isPrefetchRequest(request: Request): boolean {
  return request.headers.has("next-router-prefetch")
    || request.headers.has("next-router-segment-prefetch")
    || request.headers.get("purpose")?.toLowerCase().includes("prefetch") === true
    || request.headers.get("sec-purpose")?.toLowerCase().includes("prefetch") === true;
}

function isHtmlCacheCandidate(request: Request, url: URL): boolean {
  if (request.method !== "GET" || !isHtmlRequest(request) || url.search) return false;
  if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) return false;
  if (url.pathname.startsWith("/_vinext/") || url.pathname.startsWith("/__vinext/")) return false;
  if (/\.(?:json|xml|txt)$/.test(url.pathname)) return false;
  for (const header of [
    "authorization",
    "cookie",
    "range",
    "rsc",
    "next-router-state-tree",
    "next-router-prefetch",
    "next-router-segment-prefetch",
    "next-url",
    "oai-authenticated-user-id",
    "oai-authenticated-user-email",
  ]) {
    if (request.headers.has(header)) return false;
  }
  return true;
}

function htmlCacheKey(url: URL): Request {
  const cacheUrl = new URL(url);
  cacheUrl.searchParams.set("__fichil_version", BUILD_COMMIT);
  return new Request(cacheUrl, { headers: { accept: "text/html" } });
}

function isCacheableHtmlResponse(response: Response): boolean {
  return response.status === 200
    && response.headers.get("content-type")?.toLowerCase().includes("text/html") === true
    && !response.headers.has("set-cookie");
}

function isStaticAssetPath(pathname: string): boolean {
  return pathname.startsWith("/assets/")
    || pathname === "/favicon.png"
    || pathname === "/og.png"
    || pathname === "/favicon.ico"
    || pathname === "/favicon.ico/";
}

async function serveStaticAsset(request: Request, env: Env, url: URL): Promise<Response> {
  const assetUrl = new URL(url);
  const isHashedAsset = assetUrl.pathname.startsWith("/assets/");
  if (assetUrl.pathname === "/favicon.ico" || assetUrl.pathname === "/favicon.ico/") {
    assetUrl.pathname = "/favicon.png";
  }

  const response = await env.ASSETS.fetch(new Request(assetUrl, request));
  const headers = new Headers(response.headers);
  headers.set(CACHE_STATUS_HEADER, "BYPASS");
  applySecurityHeaders(headers);
  if (response.ok) {
    headers.set("Cache-Control", isHashedAsset ? IMMUTABLE_ASSET_CACHE_CONTROL : ROOT_ASSET_CACHE_CONTROL);
  }
  return cloneResponse(response, headers);
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const detectedAi = request.method === "GET" && !isPrefetchRequest(request) ? detectAiAgent(request) : null;

    if (url.hostname.toLowerCase() === "www.fichil.com") {
      url.hostname = "fichil.com";
      return Response.redirect(url, 308);
    }

    const legacyRedirects: Record<string, string> = {
      "/posts/fix-err-connection-refused-on-vps/": "/blog/fix-vps-connection/",
      "/posts/fix/": "/blog/fix-vps-connection/",
      "/page/about/": "/#services",
      "/page/contact/": "/#contact",
    };
    const exactRedirect = legacyRedirects[url.pathname];
    if (exactRedirect) return Response.redirect(new URL(exactRedirect, url), 308);

    if (url.pathname !== "/en/sitemap.xml" && (url.pathname === "/en" || url.pathname.startsWith("/en/"))) {
      url.pathname = url.pathname === "/en" || url.pathname === "/en/" ? "/" : url.pathname.slice(3);
      return Response.redirect(url, 308);
    }

    const pageOneMatch = url.pathname.match(/^(.*\/)(?:page\/1)\/?$/);
    if (pageOneMatch) {
      url.pathname = pageOneMatch[1] || "/";
      return Response.redirect(url, 308);
    }

    const discovery = handleAiDiscovery(request, url);
    if (discovery) return discovery;

    const apiResponse = await handleAiBlogApi(request, env, ctx, url);
    if (apiResponse) {
      const apiArticle = request.method === "GET" ? matchApiArticle(url.pathname) : null;
      if (apiArticle && detectedAi && env.DB && apiResponse.status === 200) {
        ctx.waitUntil(recordAiVisit(env.DB, apiArticle.locale, apiArticle.slug, detectedAi.family).catch((error) => {
          console.error("[fichil] AI visit counter write failed", error);
        }));
      }
      return apiResponse;
    }

    if (url.pathname === "/admin/ai-blog/comments" || url.pathname === "/admin/ai-blog/comments/") {
      const protectedResponse = protectAdminPage(request, env);
      if (protectedResponse) return protectedResponse;
    }

    if (url.pathname === "/_vinext/image") {
      if (!env.IMAGES) {
        const source = url.searchParams.get("url");
        if (!source || !source.startsWith("/") || source.startsWith("//")) {
          return new Response("Invalid image source", { status: 400 });
        }
        const sourceUrl = new URL(source, request.url);
        if (!isStaticAssetPath(sourceUrl.pathname)) {
          return new Response("Image source is not a public site asset", { status: 400 });
        }
        return serveStaticAsset(request, env, sourceUrl);
      }
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    if (isStaticAssetPath(url.pathname)) {
      return serveStaticAsset(request, env, url);
    }

    const htmlArticle = request.method === "GET" ? matchHtmlArticle(url.pathname) : null;
    const htmlCandidate = isHtmlCacheCandidate(request, url);
    let edgeCache = htmlCandidate ? getEdgeCache(env) : undefined;
    let cacheKey = htmlCandidate && edgeCache ? htmlCacheKey(url) : undefined;
    if (edgeCache && cacheKey) {
      try {
        const cached = await edgeCache.match(cacheKey);
        if (cached) {
          if (htmlArticle && detectedAi && env.DB && cached.status === 200) {
            ctx.waitUntil(recordAiVisit(env.DB, htmlArticle.locale, htmlArticle.slug, detectedAi.family).catch((error) => {
              console.error("[fichil] AI visit counter write failed", error);
            }));
          }
          return withCacheStatus(cached, "HIT");
        }
      } catch (error) {
        console.error("[fichil] HTML cache read failed; rendering without edge cache", error);
        edgeCache = undefined;
        cacheKey = undefined;
      }
    }

    const headers = new Headers(request.headers);
    headers.set("x-fichil-locale", url.pathname === "/zh-cn" || url.pathname.startsWith("/zh-cn/") ? "zh-cn" : "en");
    const appUrl = new URL(url);
    if (/\.(?:json|xml|txt)$/.test(appUrl.pathname)) appUrl.pathname += "/";
    const response = await handler.fetch(new Request(new Request(appUrl, request), { headers }), env, ctx);

    if (url.pathname === "/admin/ai-blog/comments" || url.pathname === "/admin/ai-blog/comments/") {
      const adminHeaders = new Headers(response.headers);
      adminHeaders.set("Cache-Control", "private, no-store");
      adminHeaders.set(CACHE_STATUS_HEADER, "BYPASS");
      applySecurityHeaders(adminHeaders);
      return cloneResponse(response, adminHeaders);
    }

    if (htmlArticle && detectedAi && env.DB && response.status === 200) {
      ctx.waitUntil(recordAiVisit(env.DB, htmlArticle.locale, htmlArticle.slug, detectedAi.family).catch((error) => {
        console.error("[fichil] AI visit counter write failed", error);
      }));
    }

    if (!htmlCandidate || !edgeCache || !cacheKey || !isCacheableHtmlResponse(response)) {
      return isHtmlRequest(request) ? withCacheStatus(response, "BYPASS") : response;
    }

    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("Cache-Control", HTML_CACHE_CONTROL);
    responseHeaders.set(CACHE_STATUS_HEADER, "MISS");
    applySecurityHeaders(responseHeaders);
    const optimized = cloneResponse(response, responseHeaders);
    ctx.waitUntil(edgeCache.put(cacheKey, optimized.clone()).catch((error) => {
      console.error("[fichil] HTML cache write failed", error);
    }));
    return optimized;
  },
};

export default worker;
