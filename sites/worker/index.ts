/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import payload from "@/generated/content.json";

const BUILD_COMMIT = (payload as { build: { commit: string } }).build.commit;
const HTML_CACHE_CONTROL = "public, max-age=60, s-maxage=3600, stale-while-revalidate=86400";
const IMMUTABLE_ASSET_CACHE_CONTROL = "public, max-age=31536000, immutable";
const ROOT_ASSET_CACHE_CONTROL = "public, max-age=86400";
const CACHE_STATUS_HEADER = "X-Fichil-Cache";

interface EdgeCache {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
}

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  HTML_CACHE?: EdgeCache;
  IMAGES: {
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

function withCacheStatus(response: Response, status: "HIT" | "MISS" | "BYPASS"): Response {
  const headers = new Headers(response.headers);
  headers.set(CACHE_STATUS_HEADER, status);
  return cloneResponse(response, headers);
}

function getEdgeCache(env: Env): EdgeCache | undefined {
  if (env.HTML_CACHE) return env.HTML_CACHE;
  const runtimeCaches = (globalThis as typeof globalThis & {
    caches?: CacheStorage & { default?: EdgeCache };
  }).caches;
  return runtimeCaches?.default;
}

function isHtmlRequest(request: Request): boolean {
  return request.headers.get("accept")?.toLowerCase().includes("text/html") === true;
}

function isHtmlCacheCandidate(request: Request, url: URL): boolean {
  if (request.method !== "GET" || !isHtmlRequest(request) || url.search) return false;
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
    || pathname === "/author-fichil.png"
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

    if (url.pathname === "/_vinext/image") {
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

    const htmlCandidate = isHtmlCacheCandidate(request, url);
    const edgeCache = htmlCandidate ? getEdgeCache(env) : undefined;
    const cacheKey = htmlCandidate && edgeCache ? htmlCacheKey(url) : undefined;
    if (edgeCache && cacheKey) {
      const cached = await edgeCache.match(cacheKey);
      if (cached) return withCacheStatus(cached, "HIT");
    }

    const headers = new Headers(request.headers);
    headers.set("x-fichil-locale", url.pathname === "/zh-cn" || url.pathname.startsWith("/zh-cn/") ? "zh-cn" : "en");
    const appUrl = new URL(url);
    if (/\.(?:json|xml|txt)$/.test(appUrl.pathname)) appUrl.pathname += "/";
    const response = await handler.fetch(new Request(new Request(appUrl, request), { headers }), env, ctx);

    if (!htmlCandidate || !edgeCache || !cacheKey || !isCacheableHtmlResponse(response)) {
      return isHtmlRequest(request) ? withCacheStatus(response, "BYPASS") : response;
    }

    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("Cache-Control", HTML_CACHE_CONTROL);
    responseHeaders.set(CACHE_STATUS_HEADER, "MISS");
    const optimized = cloneResponse(response, responseHeaders);
    ctx.waitUntil(edgeCache.put(cacheKey, optimized.clone()).catch((error) => {
      console.error("[fichil] HTML cache write failed", error);
    }));
    return optimized;
  },
};

export default worker;
