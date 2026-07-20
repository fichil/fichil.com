/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
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
      "/page/about/": "/#about",
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

    const headers = new Headers(request.headers);
    headers.set("x-fichil-locale", url.pathname === "/zh-cn" || url.pathname.startsWith("/zh-cn/") ? "zh-cn" : "en");
    const appUrl = new URL(url);
    if (/\.(?:json|xml|txt)$/.test(appUrl.pathname)) appUrl.pathname += "/";
    return handler.fetch(new Request(new Request(appUrl, request), { headers }), env, ctx);
  },
};

export default worker;
