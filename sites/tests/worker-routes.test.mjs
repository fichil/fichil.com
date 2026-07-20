import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const payload = JSON.parse(await readFile(new URL("../generated/content.json", import.meta.url), "utf8"));
const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);
const env = { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } };
const ctx = { waitUntil() {}, passThroughOnException() {} };

function fetchPath(path, host = "localhost") {
  return worker.fetch(new Request(`https://${host}${path}`, { headers: { accept: "text/html" } }), env, ctx);
}

function slugify(value) {
  return value.normalize("NFKC").trim().toLowerCase().replace(/&/g, " and ").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "");
}

function canonicalPaths() {
  const paths = ["/", "/blog/", "/blog/page/2/", "/blog/page/3/", "/tags/", "/categories/", "/zh-cn/", "/zh-cn/blog/", "/zh-cn/blog/page/2/", "/zh-cn/blog/page/3/", "/zh-cn/tags/", "/zh-cn/categories/"];
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
  assert.match(englishHtml, /https:\/\/fichil\.com\//);

  const chinese = await fetchPath("/zh-cn/");
  assert.match(await chinese.text(), /<html[^>]+lang="zh-CN"/i);

  const article = await fetchPath("/blog/database-backed-business-flow-acceptance/");
  const articleHtml = await article.text();
  assert.match(articleHtml, /application\/ld\+json/);
  assert.match(articleHtml, /On this page/);
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
  assert.match(await robots.text(), /Sitemap: https:\/\/fichil\.com\/sitemap\.xml/);
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
