import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const payload = JSON.parse(await readFile(new URL("../generated/content.json", import.meta.url), "utf8"));
const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

class MemoryEdgeCache {
  responses = new Map();

  async match(request) {
    return this.responses.get(request.url)?.clone();
  }

  async put(request, response) {
    this.responses.set(request.url, response.clone());
  }
}

function createContext() {
  const pending = [];
  return {
    waitUntil(promise) { pending.push(promise); },
    passThroughOnException() {},
    async flush() { await Promise.all(pending.splice(0)); },
  };
}

function createEnv(cache) {
  return {
    ASSETS: {
      fetch: async (request) => {
        const pathname = new URL(request.url).pathname;
        if (pathname === "/favicon.png") {
          return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "content-type": "image/png" } });
        }
        if (pathname === "/og.png") {
          return new Response(new Uint8Array([137, 80, 78, 71]), { headers: { "content-type": "image/png" } });
        }
        if (pathname === "/assets/test-deadbeef.js") {
          return new Response("export default true;", { headers: { "content-type": "text/javascript" } });
        }
        return new Response("Not found", { status: 404 });
      },
    },
    ...(cache ? { HTML_CACHE: cache } : {}),
  };
}

const env = createEnv();
const ctx = createContext();

function fetchPath(path, host = "localhost", init = {}, targetEnv = env, targetCtx = ctx) {
  const headers = new Headers(init.headers);
  if (!headers.has("accept")) headers.set("accept", "text/html");
  return worker.fetch(new Request(`https://${host}${path}`, { ...init, headers }), targetEnv, targetCtx);
}

function slugify(value) {
  return value.normalize("NFKC").trim().toLowerCase().replace(/&/g, " and ").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
}

function canonicalPaths() {
  const paths = ["/", "/blog/", "/tags/", "/categories/", "/zh-cn/", "/zh-cn/blog/", "/zh-cn/tags/", "/zh-cn/categories/"];
  for (const locale of ["en", "zh-cn"]) {
    const count = payload.posts.filter((post) => post.locale === locale).length;
    const prefix = locale === "zh-cn" ? "/zh-cn" : "";
    for (let page = 2; page <= Math.ceil(count / 6); page += 1) paths.push(`${prefix}/blog/page/${page}/`);
  }
  for (const post of payload.posts) {
    const prefix = post.locale === "zh-cn" ? "/zh-cn" : "";
    paths.push(`${prefix}/blog/${post.slug}/`);
    for (const tag of post.tags) paths.push(`${prefix}/tags/${slugify(tag)}/`);
    for (const category of post.categories) paths.push(`${prefix}/categories/${slugify(category)}/`);
  }
  return [...new Set(paths)];
}

test("renders every canonical content route", async () => {
  for (const path of canonicalPaths()) {
    const response = await fetchPath(path);
    assert.equal(response.status, 200, path);
    await response.arrayBuffer();
  }
});

test("renders localized metadata and article structure", async () => {
  const english = await fetchPath("/");
  const englishHtml = await english.text();
  assert.match(englishHtml, /<html[^>]+lang="en"/i);
  assert.match(englishHtml, /Build\. Debug\. Ship\./);
  assert.match(englishHtml, /Trace the failure\. Keep the evidence\./);
  assert.match(englishHtml, /https:\/\/fichil\.com\//);

  const chinese = await fetchPath("/zh-cn/");
  const chineseHtml = await chinese.text();
  assert.match(chineseHtml, /<html[^>]+lang="zh-CN"/i);
  assert.match(chineseHtml, /定位系统问题，留下可复核证据/);
  assert.match(chineseHtml, /AI 辅助开发与运维的 fichil\.com/);
  assert.doesNotMatch(chineseHtml, /Repo2AI|VPS 与 Nginx 恢复|自由职业后端/);

  const article = await fetchPath("/blog/database-backed-business-flow-acceptance/");
  const articleHtml = await article.text();
  assert.match(articleHtml, /application\/ld\+json/);
  assert.match(articleHtml, /On this page/);
  assert.match(articleHtml, /Related Engineering Notes/);
  assert.match(articleHtml, /Updated/);
});

test("keeps the engineering signal reading interface discoverable and accessible", async () => {
  const home = await fetchPath("/");
  const homeHtml = await home.text();
  const latestEnglish = payload.posts.find((post) => post.locale === "en");
  assert.ok(latestEnglish);
  assert.match(homeHtml, /class="mobile-nav-trigger"[^>]+aria-expanded="false"[^>]+aria-controls="mobile-site-nav"/);
  assert.match(homeHtml, /class="theme-toggle"[^>]+aria-label="Switch to dark theme"[^>]+aria-pressed="false"/);
  assert.match(homeHtml, new RegExp(`href="/blog/${latestEnglish.slug}/"[^>]+button button-primary`));
  assert.match(homeHtml, /class="topic-grid topic-grid-home" aria-label="Categories"/);
  assert.match(homeHtml, /class="post-card post-card-featured"/);
  assert.match(homeHtml, /role="tablist"[^>]+From system signal to exact release/);
  assert.match(homeHtml, /Exact reviewed build/);
  assert.match(homeHtml, /href="\/version\.json"/);
  assert.doesNotMatch(homeHtml, /author-fichil|fetchpriority="high"/i);
  assert.match(homeHtml, /class="skip-link" href="#main-content"/);

  const article = await fetchPath(`/blog/${latestEnglish.slug}/`);
  const articleHtml = await article.text();
  assert.match(articleHtml, /class="toc-desktop"/);
  assert.match(articleHtml, /<details class="toc-mobile">/);
  assert.match(articleHtml, /aria-current="location"/);

  const articleTools = await readFile(new URL("../components/ArticleTools.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(articleTools, /navigator\.clipboard\.writeText/);
  assert.match(articleTools, /requestAnimationFrame/);
  assert.match(articleTools, /role="status"/);
  assert.match(articleTools, /window\.history\.replaceState/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /backdrop-filter: blur/);
  assert.doesNotMatch(styles, /reveal-ready/);
});

test("serves RSS, robots, and clean sitemap output", async () => {
  const rss = await fetchPath("/blog/index.xml");
  assert.equal(rss.status, 200);
  assert.match(rss.headers.get("content-type") ?? "", /application\/xml/);
  assert.match(await rss.text(), /<rss version="2\.0">/);

  const sitemap = await fetchPath("/en/sitemap.xml");
  const xml = await sitemap.text();
  assert.match(xml, /<urlset/);
  assert.doesNotMatch(xml, /\/es\/|\/fr\/|\/blogs\//);

  const robots = await fetchPath("/robots.txt");
  const robotsText = await robots.text();
  assert.match(robotsText, /Sitemap: https:\/\/fichil\.com\/sitemap\.xml/);
  assert.match(robotsText, /User-agent: OAI-SearchBot/);
  assert.match(robotsText, /User-agent: Claude-SearchBot/);
  assert.match(robotsText, /User-agent: Perplexity-User/);
});

test("exposes the deployed source version without caching", async () => {
  const response = await fetchPath("/version.json");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /application\/json/);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const version = await response.json();
  assert.match(version.commit, /^[0-9a-f]{40}$/);
  assert.equal(version.commit, payload.build.commit);
  assert.equal(new Date(version.builtAt).toISOString(), version.builtAt);
});

test("caches canonical HTML by source commit and isolates locales", async () => {
  const cache = new MemoryEdgeCache();
  const oldCommit = "0".repeat(40);
  await cache.put(
    new Request(`https://localhost/?__fichil_version=${oldCommit}`),
    new Response("stale", { headers: { "content-type": "text/html" } }),
  );
  const cacheEnv = createEnv(cache);
  const cacheCtx = createContext();

  const englishMiss = await fetchPath("/", "localhost", {}, cacheEnv, cacheCtx);
  assert.equal(englishMiss.headers.get("x-fichil-cache"), "MISS");
  assert.equal(englishMiss.headers.get("cache-control"), "public, max-age=60, s-maxage=3600, stale-while-revalidate=86400");
  assert.match(await englishMiss.text(), /<html[^>]+lang="en"/i);
  await cacheCtx.flush();

  const currentCacheKey = [...cache.responses.keys()].find((key) => key.includes(payload.build.commit));
  assert.ok(currentCacheKey, "cache key should include the current source commit");

  const englishHit = await fetchPath("/", "localhost", {}, cacheEnv, cacheCtx);
  assert.equal(englishHit.headers.get("x-fichil-cache"), "HIT");
  assert.match(await englishHit.text(), /<html[^>]+lang="en"/i);

  const chineseMiss = await fetchPath("/zh-cn/", "localhost", {}, cacheEnv, cacheCtx);
  assert.equal(chineseMiss.headers.get("x-fichil-cache"), "MISS");
  assert.match(await chineseMiss.text(), /<html[^>]+lang="zh-CN"/i);
  await cacheCtx.flush();

  const chineseHit = await fetchPath("/zh-cn/", "localhost", {}, cacheEnv, cacheCtx);
  assert.equal(chineseHit.headers.get("x-fichil-cache"), "HIT");
  assert.match(await chineseHit.text(), /<html[^>]+lang="zh-CN"/i);
});

test("renders HTML when the platform edge cache is unavailable", async (t) => {
  t.mock.method(console, "error", () => {});
  const failingCache = {
    async match() { throw new Error("platform cache unavailable"); },
    async put() { throw new Error("platform cache unavailable"); },
  };
  const response = await fetchPath("/zh-cn/", "localhost", {}, createEnv(failingCache), createContext());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-fichil-cache"), "BYPASS");
  assert.match(await response.text(), /定位系统问题，留下可复核证据/);
});

test("bypasses HTML cache for request-specific and noncanonical requests", async () => {
  const cacheEnv = createEnv(new MemoryEdgeCache());
  const cacheCtx = createContext();
  const cases = [
    ["/?utm_source=test", {}],
    ["/", { headers: { cookie: "session=test" } }],
    ["/", { headers: { authorization: "Bearer test" } }],
    ["/", { headers: { rsc: "1" } }],
    ["/", { headers: { "next-router-prefetch": "1" } }],
    ["/", { headers: { "next-router-segment-prefetch": "1" } }],
  ];
  for (const [path, init] of cases) {
    const response = await fetchPath(path, "localhost", init, cacheEnv, cacheCtx);
    assert.equal(response.headers.get("x-fichil-cache"), "BYPASS", path);
    await response.arrayBuffer();
  }

  const version = await fetchPath("/version.json", "localhost", {}, cacheEnv, cacheCtx);
  assert.equal(version.headers.get("x-fichil-cache"), "BYPASS");
  assert.equal(version.headers.get("cache-control"), "no-store");
});

test("serves static assets with explicit browser caching", async () => {
  const asset = await fetchPath("/assets/test-deadbeef.js");
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.equal(asset.headers.get("x-fichil-cache"), "BYPASS");

  const favicon = await fetchPath("/favicon.ico/");
  assert.equal(favicon.status, 200);
  assert.match(favicon.headers.get("content-type") ?? "", /image\/png/);
  assert.equal(favicon.headers.get("cache-control"), "public, max-age=86400");

  const imageFallback = await fetchPath("/_vinext/image?url=%2Fauthor-fichil.png&w=640&q=75");
  assert.equal(imageFallback.status, 400);

  const compatibilityImage = await readFile(new URL("../public/author-fichil.png", import.meta.url));
  assert.deepEqual([...compatibilityImage.subarray(0, 4)], [137, 80, 78, 71]);

  const rejectedImageSource = await fetchPath("/_vinext/image?url=%2Fblog%2F&w=640&q=75");
  assert.equal(rejectedImageSource.status, 400);

  const missing = await fetchPath("/assets/missing.js");
  assert.equal(missing.status, 404);
  assert.notEqual(missing.headers.get("cache-control"), "public, max-age=31536000, immutable");
});

test("packages asset binding and source cache rules", async () => {
  const wrangler = JSON.parse(await readFile(new URL("../dist/server/wrangler.json", import.meta.url), "utf8"));
  assert.equal(wrangler.assets.binding, "ASSETS");
  assert.deepEqual(wrangler.assets.run_worker_first, ["/assets/*", "/favicon.ico*", "/favicon.png", "/og.png"]);

  const headers = await readFile(new URL("../public/_headers", import.meta.url), "utf8");
  assert.match(headers, /\/assets\/\*/);
  assert.match(headers, /max-age=31536000, immutable/);
  assert.doesNotMatch(headers, /\/author-fichil\.png/);

  const hosting = JSON.parse(await readFile(new URL("../dist/.openai/hosting.json", import.meta.url), "utf8"));
  assert.deepEqual(Object.keys(hosting).sort(), ["d1", "project_id", "r2"]);
  assert.equal(hosting.d1, "DB");
  assert.equal(hosting.r2, null);
  const migration = await readFile(new URL("../dist/.openai/drizzle/0000_tidy_doomsday.sql", import.meta.url), "utf8");
  assert.match(migration, /CREATE TABLE `ai_visit_daily`/);
  assert.match(migration, /CREATE TABLE `comments`/);
  assert.match(migration, /PRAGMA optimize/);
});

test("preserves only intended compatibility redirects", async () => {
  const cases = [
    ["/en/blog/", "/blog/"],
    ["/blog/page/1/", "/blog/"],
    ["/tags/java/page/1/", "/tags/java/"],
    ["/posts/fix-err-connection-refused-on-vps/", "/blog/fix-vps-connection/"],
  ];
  for (const [from, to] of cases) {
    const response = await fetchPath(from);
    assert.equal(response.status, 308);
    assert.equal(new URL(response.headers.get("location")).pathname, to);
  }

  const www = await fetchPath("/blog/", "www.fichil.com");
  assert.equal(www.status, 308);
  assert.equal(new URL(www.headers.get("location")).hostname, "fichil.com");

  const removed = await fetchPath("/es/blogs/emoji-support/");
  assert.equal(removed.status, 404);

  const removedBlogs = await fetchPath("/blogs/");
  assert.equal(removedBlogs.status, 404);

  const normalizedBlogs = await fetchPath("/blogs");
  assert.equal(normalizedBlogs.status, 308);
  assert.equal(new URL(normalizedBlogs.headers.get("location"), "https://fichil.com").pathname, "/blogs/");
});
