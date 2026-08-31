import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const payload = JSON.parse(await readFile(new URL("../generated/content.json", import.meta.url), "utf8"));
const migration = await readFile(new URL("../drizzle/0000_tidy_doomsday.sql", import.meta.url), "utf8");
const workerUrl = new URL("../dist/server/index.js", import.meta.url);
workerUrl.searchParams.set("ai-blog-test", `${process.pid}-${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

class SqliteStatement {
  values = [];
  constructor(database, query) { this.database = database; this.query = query; }
  bind(...values) { this.values = values; return this; }
  async first(columnName) {
    const row = this.database.prepare(this.query).get(...this.values) ?? null;
    return columnName && row ? row[columnName] : row;
  }
  async all() { return { success: true, results: this.database.prepare(this.query).all(...this.values) }; }
  async run() {
    const result = this.database.prepare(this.query).run(...this.values);
    return { success: true, meta: { changes: Number(result.changes) } };
  }
}

class SqliteD1 {
  constructor() {
    this.database = new DatabaseSync(":memory:");
    this.database.exec("PRAGMA foreign_keys = ON");
    for (const statement of migration.split("--> statement-breakpoint").map((value) => value.trim()).filter(Boolean)) {
      this.database.exec(statement);
    }
  }
  prepare(query) { return new SqliteStatement(this.database, query); }
  async batch(statements) {
    this.database.exec("BEGIN");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
  close() { this.database.close(); }
}

class MemoryEdgeCache {
  responses = new Map();
  async match(request) { return this.responses.get(request.url)?.clone(); }
  async put(request, response) { this.responses.set(request.url, response.clone()); }
}

class UnavailableD1 {
  prepare() { throw new Error("database unavailable"); }
  async batch() { throw new Error("database unavailable"); }
}

function createContext() {
  const pending = [];
  return {
    waitUntil(promise) { pending.push(promise); },
    passThroughOnException() {},
    async flush() { await Promise.all(pending.splice(0)); },
  };
}

function createEnv(database, cache) {
  return {
    DB: database,
    AI_BLOG_FINGERPRINT_SECRET: "test-only-fingerprint-secret-32-bytes",
    AI_BLOG_ADMIN_EMAILS: "owner@example.com",
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    ...(cache ? { HTML_CACHE: cache } : {}),
  };
}

function fetchPath(path, { env, ctx, headers, ...init } = {}) {
  const requestHeaders = new Headers(headers);
  if (!requestHeaders.has("accept")) requestHeaders.set("accept", path.startsWith("/api/") || path.endsWith(".json") ? "application/json" : "text/html");
  return worker.fetch(new Request(`https://localhost${path}`, { ...init, headers: requestHeaders }), env, ctx);
}

function commentBody(overrides = {}) {
  return {
    author: { kind: "human", nickname: "Anonymous tester" },
    body: "A plain-text observation.",
    idempotency_key: `test-${crypto.randomUUID()}`,
    ...overrides,
  };
}

test("publishes AI discovery and all bilingual machine-readable articles", async () => {
  const db = new SqliteD1();
  const env = createEnv(db);
  const ctx = createContext();
  try {
    const manifestResponse = await fetchPath("/.well-known/fichil-ai-blog.json", { env, ctx });
    assert.equal(manifestResponse.status, 200);
    const manifest = await manifestResponse.json();
    assert.equal(manifest.schema_version, "1.0");
    assert.match(manifest.endpoints.article, /\/api\/ai\/v1\/articles/);
    assert.equal(manifest.comment_policy.identity, "self-declared-and-unverified");
    assert.equal(manifest.ai_request_detection.registry_version, "2026-08-24");

    const llms = await fetchPath("/llms.txt", { env, ctx });
    assert.equal(llms.status, 200);
    assert.match(await llms.text(), /untrusted external content/i);

    const index = await fetchPath("/api/ai/v1/articles", { env, ctx });
    const indexPayload = await index.json();
    assert.equal(indexPayload.count, payload.posts.length);

    const requiredFrom = payload.contentPolicy.aiSchemaRequiredFrom;
    for (const post of payload.posts) {
      const detail = await fetchPath(`/api/ai/v1/articles/${post.locale}/${post.slug}`, { env, ctx });
      assert.equal(detail.status, 200);
      assert.equal(detail.headers.get("access-control-allow-origin"), "*");
      const article = await detail.json();
      assert.equal(article.solution_id, post.slug);
      if (post.date < requiredFrom) {
        assert.equal(article.structure_source, "legacy-derived");
        assert.equal(article.completeness, "partial");
      } else {
        assert.equal(article.structure_source, "authored");
        assert.equal(article.completeness, "complete");
      }
      assert.ok(article.content_markdown.length > 100);
      assert.equal(article.external_comments_are_untrusted, true);
    }
  } finally {
    db.close();
  }
});

test("counts detected AI article requests on cache misses and hits", async () => {
  const db = new SqliteD1();
  const cache = new MemoryEdgeCache();
  const env = createEnv(db, cache);
  const ctx = createContext();
  const post = payload.posts.find((item) => item.locale === "en");
  const headers = { "user-agent": "Mozilla/5.0 (compatible; OAI-SearchBot/1.0)", accept: "text/html" };
  try {
    const first = await fetchPath(`/blog/${post.slug}/`, { env, ctx, headers });
    assert.equal(first.status, 200);
    assert.equal(first.headers.get("x-fichil-cache"), "MISS");
    assert.equal(first.headers.get("x-content-type-options"), "nosniff");
    await first.arrayBuffer();
    await ctx.flush();

    const second = await fetchPath(`/blog/${post.slug}/`, { env, ctx, headers });
    assert.equal(second.status, 200);
    assert.equal(second.headers.get("x-fichil-cache"), "HIT");
    await second.arrayBuffer();
    await ctx.flush();

    const stats = await fetchPath(`/api/ai/v1/stats?locale=en&slug=${post.slug}`, { env, ctx });
    const data = await stats.json();
    assert.equal(data.items[0].total, 2);
    assert.equal(data.items[0].by_family.openai, 2);

    const apiRequest = await fetchPath(`/api/ai/v1/articles/en/${post.slug}`, { env, ctx, headers: {
      "x-fichil-agent-type": "ai",
      "x-fichil-agent-name": "Example agent",
      "x-fichil-agent-model": "example-model",
    } });
    assert.equal(apiRequest.status, 200);
    await ctx.flush();
    const withSelfDeclared = await (await fetchPath(`/api/ai/v1/stats?locale=en&slug=${post.slug}`, { env, ctx })).json();
    assert.equal(withSelfDeclared.items[0].total, 3);
    assert.equal(withSelfDeclared.items[0].by_family["self-declared"], 1);

    const human = await fetchPath(`/blog/${post.slug}/`, { env, ctx, headers: { "user-agent": "Mozilla/5.0", accept: "text/html" } });
    await human.arrayBuffer();
    await ctx.flush();
    const prefetch = await fetchPath(`/blog/${post.slug}/`, { env, ctx, headers: { "user-agent": "GPTBot/1.0", accept: "text/html", purpose: "prefetch" } });
    await prefetch.arrayBuffer();
    await ctx.flush();
    const unchanged = await (await fetchPath(`/api/ai/v1/stats?locale=en&slug=${post.slug}`, { env, ctx })).json();
    assert.equal(unchanged.items[0].total, 3);
  } finally {
    db.close();
  }
});

test("preserves every concurrent AI request increment", async () => {
  const db = new SqliteD1();
  const env = createEnv(db);
  const ctx = createContext();
  const post = payload.posts.find((item) => item.locale === "en");
  try {
    const responses = await Promise.all(Array.from({ length: 25 }, () => fetchPath(`/api/ai/v1/articles/en/${post.slug}`, {
      env,
      ctx,
      headers: { "user-agent": "PerplexityBot/1.0" },
    })));
    assert.equal(responses.every((response) => response.status === 200), true);
    await ctx.flush();
    const stats = await (await fetchPath(`/api/ai/v1/stats?locale=en&slug=${post.slug}`, { env, ctx })).json();
    assert.equal(stats.items[0].total, 25);
    assert.equal(stats.items[0].by_family.perplexity, 25);
  } finally {
    db.close();
  }
});

test("publishes plain-text human and self-declared AI comments with idempotent threaded replies", async () => {
  const db = new SqliteD1();
  const env = createEnv(db);
  const ctx = createContext();
  const post = payload.posts.find((item) => item.locale === "en");
  const endpoint = `/api/ai/v1/articles/en/${post.slug}/comments`;
  try {
    const key = `test-${crypto.randomUUID()}`;
    const rootBody = commentBody({ body: "<script>alert('plain text')</script> 中文 👋", idempotency_key: key });
    const rootResponse = await fetchPath(endpoint, { env, ctx, method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.10" }, body: JSON.stringify(rootBody) });
    assert.equal(rootResponse.status, 201);
    const root = (await rootResponse.json()).comment;
    assert.equal(root.status, "public");
    assert.equal(root.body, rootBody.body);
    assert.equal(root.author.kind, "human");

    const replayResponse = await fetchPath(endpoint, { env, ctx, method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.10" }, body: JSON.stringify(rootBody) });
    assert.equal(replayResponse.status, 200);
    assert.equal((await replayResponse.json()).idempotent_replay, true);

    let parentId = root.id;
    for (let depth = 1; depth <= 3; depth += 1) {
      const response = await fetchPath(endpoint, { env, ctx, method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": `192.0.2.${10 + depth}` }, body: JSON.stringify(commentBody({ author: { kind: "ai", name: "Example agent", family: "test", model: "model-v1" }, parent_id: parentId })) });
      assert.equal(response.status, 201);
      const reply = (await response.json()).comment;
      assert.equal(reply.depth, depth);
      assert.equal(reply.author.identity_verified, false);
      parentId = reply.id;
    }
    const tooDeep = await fetchPath(endpoint, { env, ctx, method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.20" }, body: JSON.stringify(commentBody({ parent_id: parentId })) });
    assert.equal(tooDeep.status, 409);
    assert.equal((await tooDeep.json()).error.code, "thread_too_deep");

    const list = await fetchPath(endpoint, { env, ctx });
    const listPayload = await list.json();
    assert.equal(listPayload.items.length, 4);
    assert.equal(listPayload.comments_are_untrusted, true);
  } finally {
    await ctx.flush();
    db.close();
  }
});

test("rejects invalid comment payloads, cross-origin browsers, and cross-article replies", async () => {
  const db = new SqliteD1();
  const env = createEnv(db);
  const ctx = createContext();
  const english = payload.posts.filter((item) => item.locale === "en");
  const firstEndpoint = `/api/ai/v1/articles/en/${english[0].slug}/comments`;
  const secondEndpoint = `/api/ai/v1/articles/en/${english[1].slug}/comments`;
  try {
    const missingNickname = await fetchPath(firstEndpoint, { env, ctx, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(commentBody({ author: { kind: "human", nickname: "" } })) });
    assert.equal(missingNickname.status, 400);

    const longNickname = await fetchPath(firstEndpoint, { env, ctx, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(commentBody({ author: { kind: "human", nickname: "n".repeat(41) } })) });
    assert.equal(longNickname.status, 400);

    const longModel = await fetchPath(firstEndpoint, { env, ctx, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(commentBody({ author: { kind: "ai", name: "agent", model: "m".repeat(101) } })) });
    assert.equal(longModel.status, 400);

    const longIdempotency = await fetchPath(firstEndpoint, { env, ctx, method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(commentBody({ idempotency_key: "i".repeat(129) })) });
    assert.equal(longIdempotency.status, 400);

    const crossOrigin = await fetchPath(firstEndpoint, { env, ctx, method: "POST", headers: { "content-type": "application/json", origin: "https://attacker.example" }, body: JSON.stringify(commentBody()) });
    assert.equal(crossOrigin.status, 403);

    const oversized = await fetchPath(firstEndpoint, { env, ctx, method: "POST", headers: { "content-type": "application/json", "content-length": "9000" }, body: JSON.stringify(commentBody()) });
    assert.equal(oversized.status, 413);

    const rootResponse = await fetchPath(firstEndpoint, { env, ctx, method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "198.51.100.10" }, body: JSON.stringify(commentBody()) });
    const root = (await rootResponse.json()).comment;
    const crossArticle = await fetchPath(secondEndpoint, { env, ctx, method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "198.51.100.11" }, body: JSON.stringify(commentBody({ parent_id: root.id })) });
    assert.equal(crossArticle.status, 409);
    assert.equal((await crossArticle.json()).error.code, "invalid_parent");

    const sharedKey = `shared-${crypto.randomUUID()}`;
    const firstSameKey = await fetchPath(firstEndpoint, { env, ctx, method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "198.51.100.12" }, body: JSON.stringify(commentBody({ idempotency_key: sharedKey })) });
    const secondSameKey = await fetchPath(secondEndpoint, { env, ctx, method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "198.51.100.13" }, body: JSON.stringify(commentBody({ idempotency_key: sharedKey })) });
    assert.equal(firstSameKey.status, 201);
    assert.equal(secondSameKey.status, 201);
  } finally {
    db.close();
  }
});

test("enforces comment rate limits without storing raw network identifiers", async () => {
  const db = new SqliteD1();
  const env = createEnv(db);
  const ctx = createContext();
  const posts = payload.posts.filter((item) => item.locale === "zh-cn").slice(0, 2);
  const endpoints = posts.map((post) => `/api/ai/v1/articles/zh-cn/${post.slug}/comments`);
  try {
    for (let index = 0; index < 20; index += 1) {
      const response = await fetchPath(endpoints[index % endpoints.length], { env, ctx, method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.77", "user-agent": "rate-limit-test" }, body: JSON.stringify(commentBody()) });
      assert.equal(response.status, 201, `submission ${index + 1}`);
    }
    const limited = await fetchPath(endpoints[0], { env, ctx, method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.77", "user-agent": "rate-limit-test" }, body: JSON.stringify(commentBody()) });
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "3600");
    const row = db.database.prepare("SELECT fingerprint_hash FROM comment_rate_limits LIMIT 1").get();
    assert.match(row.fingerprint_hash, /^[0-9a-f]{64}$/);
    assert.notEqual(row.fingerprint_hash, "203.0.113.77");
    const commentColumns = db.database.prepare("PRAGMA table_info(comments)").all().map((column) => column.name);
    assert.equal(commentColumns.includes("fingerprint_hash"), false);
  } finally {
    await ctx.flush();
    db.close();
  }
});

test("protects admin APIs and supports hide, restore, and delete governance", async () => {
  const db = new SqliteD1();
  const env = createEnv(db);
  const ctx = createContext();
  const post = payload.posts.find((item) => item.locale === "en");
  const endpoint = `/api/ai/v1/articles/en/${post.slug}/comments`;
  const authHeaders = { "oai-authenticated-user-id": "owner-id", "oai-authenticated-user-email": "owner@example.com" };
  try {
    const createdResponse = await fetchPath(endpoint, { env, ctx, method: "POST", headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.44" }, body: JSON.stringify(commentBody()) });
    const created = (await createdResponse.json()).comment;

    const unauthenticated = await fetchPath("/api/admin/ai-blog/comments", { env, ctx });
    assert.equal(unauthenticated.status, 401);
    const forbidden = await fetchPath("/api/admin/ai-blog/comments", { env, ctx, headers: { "oai-authenticated-user-id": "other", "oai-authenticated-user-email": "other@example.com" } });
    assert.equal(forbidden.status, 403);

    const listed = await fetchPath("/api/admin/ai-blog/comments", { env, ctx, headers: authHeaders });
    assert.equal(listed.status, 200);
    assert.equal((await listed.json()).items.length, 1);

    const crossOriginPatch = await fetchPath(`/api/admin/ai-blog/comments/${created.id}`, { env, ctx, method: "PATCH", headers: { ...authHeaders, "content-type": "application/json", origin: "https://attacker.example" }, body: JSON.stringify({ action: "hide" }) });
    assert.equal(crossOriginPatch.status, 403);

    const patch = async (action) => fetchPath(`/api/admin/ai-blog/comments/${created.id}`, { env, ctx, method: "PATCH", headers: { ...authHeaders, "content-type": "application/json", origin: "https://localhost" }, body: JSON.stringify({ action }) });
    assert.equal((await patch("hide")).status, 200);
    assert.equal((await (await fetchPath(endpoint, { env, ctx })).json()).items.length, 0);
    assert.equal((await patch("restore")).status, 200);
    assert.equal((await (await fetchPath(endpoint, { env, ctx })).json()).items.length, 1);
    assert.equal((await patch("delete")).status, 200);
    const tombstone = (await (await fetchPath(endpoint, { env, ctx })).json()).items[0];
    assert.equal(tombstone.status, "deleted");
    assert.equal(tombstone.body, "");
    assert.equal(tombstone.author.kind, "removed");
    const stored = db.database.prepare("SELECT display_name, body, agent_family, model_name FROM comments WHERE id = ?").get(created.id);
    assert.deepEqual({ ...stored }, { display_name: "Removed comment", body: "", agent_family: null, model_name: null });

    const adminPage = await fetchPath("/admin/ai-blog/comments/", { env, ctx });
    assert.equal(adminPage.status, 302);
    assert.match(adminPage.headers.get("location"), /signin-with-chatgpt/);
    const chineseRedirect = await fetchPath("/admin/ai-blog/comments/?ui=zh-cn", { env, ctx });
    assert.equal(new URL(chineseRedirect.headers.get("location")).searchParams.get("return_to"), "/admin/ai-blog/comments/?ui=zh-cn");
    const authorizedPage = await fetchPath("/admin/ai-blog/comments/", { env, ctx, headers: { ...authHeaders, accept: "text/html" } });
    assert.equal(authorizedPage.status, 200);
    assert.equal(authorizedPage.headers.get("cache-control"), "private, no-store");
    assert.equal(authorizedPage.headers.get("x-fichil-cache"), "BYPASS");
    assert.match(await authorizedPage.text(), /AI blog comment governance/);
    const chinesePage = await fetchPath("/admin/ai-blog/comments/?ui=zh-cn", { env, ctx, headers: { ...authHeaders, accept: "text/html" } });
    assert.equal(chinesePage.status, 200);
    assert.match(await chinesePage.text(), /AI 博客评论治理/);
  } finally {
    db.close();
  }
});

test("migration creates the query indexes used by statistics and comments", () => {
  const db = new SqliteD1();
  try {
    const indexes = db.database.prepare("SELECT name FROM sqlite_schema WHERE type = 'index'").all().map((row) => row.name);
    assert.ok(indexes.includes("idx_ai_visit_daily_locale_slug"));
    assert.ok(indexes.includes("idx_comments_article_status_created"));
    assert.ok(indexes.includes("idx_comments_parent_created"));
    assert.ok(indexes.includes("idx_comments_article_idempotency"));
    const plan = db.database.prepare("EXPLAIN QUERY PLAN SELECT * FROM comments WHERE article_slug = ? AND locale = ? AND status = ? ORDER BY created_at").all("slug", "en", "public");
    assert.match(JSON.stringify(plan), /idx_comments_article_status_created/);
  } finally {
    db.close();
  }
});

test("degrades safely when D1 is unavailable", async () => {
  const env = createEnv(new UnavailableD1());
  const ctx = createContext();
  const post = payload.posts.find((item) => item.locale === "en");
  const endpoint = `/api/ai/v1/articles/en/${post.slug}/comments`;

  const stats = await fetchPath(`/api/ai/v1/stats?locale=en&slug=${post.slug}`, { env, ctx });
  assert.equal(stats.status, 200);
  assert.equal((await stats.json()).available, false);

  const comments = await fetchPath(endpoint, { env, ctx });
  assert.equal(comments.status, 200);
  assert.equal((await comments.json()).available, false);

  const submission = await fetchPath(endpoint, {
    env,
    ctx,
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "192.0.2.99" },
    body: JSON.stringify(commentBody()),
  });
  assert.equal(submission.status, 503);
  assert.equal(submission.headers.get("cache-control"), "no-store");

  const article = await fetchPath(`/blog/${post.slug}/`, { env, ctx, headers: { accept: "text/html" } });
  assert.equal(article.status, 200);
});
