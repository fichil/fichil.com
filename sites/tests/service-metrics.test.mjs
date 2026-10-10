import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

const { default: worker } = await import(new URL("../dist/server/index.js", import.meta.url).href);
const journal = JSON.parse(await readFile(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
const sql = await Promise.all(journal.entries.map(({ tag }) => readFile(new URL(`../drizzle/${tag}.sql`, import.meta.url), "utf8")));
class Database {
  constructor() { this.raw = new DatabaseSync(":memory:"); sql.forEach(source => this.raw.exec(source)); }
  prepare(query) {
    const raw = this.raw; let values = [];
    return { bind(...args) { values = args; return this; }, async run() { raw.prepare(query).run(...values); return { success: true }; }, async all() { return { success: true, results: raw.prepare(query).all(...values) }; }, async first() { return raw.prepare(query).get(...values); } };
  }
  rows() { return this.raw.prepare("SELECT * FROM service_metrics_daily").all(); }
  close() { this.raw.close(); }
}
function setup(db = new Database()) {
  const pending = []; const cached = new Map();
  const env = { DB: db, AI_BLOG_ADMIN_EMAILS: "owner@example.com", ASSETS: { fetch: async () => new Response("", { status: 404 }) }, HTML_CACHE: { match: async req => cached.get(req.url)?.clone(), put: async (req, res) => cached.set(req.url, res.clone()) } };
  const ctx = { waitUntil(value) { pending.push(value); }, passThroughOnException() {}, async flush() { await Promise.all(pending.splice(0)); } };
  const fetch = (path, init = {}) => worker.fetch(new Request(`https://localhost${path}`, { ...init, headers: { accept: "text/html", ...init.headers } }), env, ctx);
  return { db, ctx, env, fetch };
}
const service = "/services/excel-csv-automation/";
const click = "/api/services/v1/contact-click";
const admin = { "oai-authenticated-user-id": "test-owner", "oai-authenticated-user-email": "owner@example.com" };
const body = { locale: "en", surface: "service", source: "github", placement: "template" };
const post = value => ({ method: "POST", headers: { origin: "https://localhost", "content-type": "application/json" }, body: JSON.stringify(value) });

test("service pages and home links are bilingual and use canonical Markdown without altering blog counts", async () => {
  const s = setup();
  try {
    for (const prefix of ["", "/zh-cn"]) {
      const response = await s.fetch(`${prefix}${service}`); assert.equal(response.status, 200);
      const html = await response.text(); assert.match(html, /Excel \/ CSV/); assert.match(html, /fichilzhang@gmail.com/); assert.match(html, /mailto:/); assert.match(html, /Email your requirements|发邮件说明需求/); assert.match(html, /One consolidated revision|一轮集中修改/);
      const home = await (await s.fetch(`${prefix}/`)).text(); assert.ok(home.includes(`href="${prefix}${service}"`)); assert.match(home, /id="projects"/); assert.match(home, /post-card/);
      const sitemap = await (await s.fetch(prefix ? `${prefix}/sitemap.xml` : "/en/sitemap.xml")).text(); assert.ok(sitemap.includes(`${prefix}${service}`));
    }
    await s.ctx.flush();
  } finally { s.db.close(); }
});

test("service reads count cache hits and concurrent repeats, classifying automation separately", async () => {
  const s = setup();
  try {
    await s.fetch(service); await s.ctx.flush();
    const hit = await s.fetch(service); assert.equal(hit.headers.get("x-fichil-cache"), "HIT"); await s.ctx.flush();
    await Promise.all(Array.from({ length: 8 }, () => s.fetch(service))); await s.ctx.flush();
    for (const ua of ["GPTBot", "Googlebot", "curl/8.0", "HeadlessChrome"]) await s.fetch(service, { headers: { "user-agent": ua } });
    await s.fetch(`/zh-cn${service}`, { headers: { "user-agent": "Mozilla/5.0 Chrome/140" } }); await s.ctx.flush();
    assert.equal(s.db.rows().find(row => row.locale === "en" && row.request_class === "unknown").request_count, 10);
    assert.equal(s.db.rows().find(row => row.request_class === "detected_automation").request_count, 4);
    assert.equal(s.db.rows().find(row => row.locale === "zh-cn").request_class, "unknown");
  } finally { s.db.close(); }
});

test("prefetch, HEAD, range and invalid service routes do not inflate reads", async () => {
  const s = setup();
  try {
    for (const headers of [{ purpose: "prefetch" }, { "sec-purpose": "prefetch;prerender" }, { "next-router-prefetch": "1" }, { "next-router-segment-prefetch": "1" }, { range: "bytes=0-20" }]) await s.fetch(service, { headers });
    await s.fetch(service, { method: "HEAD" }); await s.fetch("/services/missing/"); await s.ctx.flush(); assert.equal(s.db.rows().length, 0);
  } finally { s.db.close(); }
});

test("source buckets discard raw URLs, arbitrary query values, identifiers and User-Agent", async () => {
  const s = setup();
  try {
    await s.fetch(`${service}?utm_source=private-person@example.com&secret=never-save-this`, { headers: { referer: "https://private-client.example/private/path?token=private", "cf-connecting-ip": "192.0.2.10", "user-agent": "Mozilla/5.0 private-device-marker" } });
    await s.fetch(service, { headers: { referer: "https://www.google.com/search?q=private-question" } });
    await s.fetch(service, { headers: { referer: "https://google.com.attacker.example/private" } });
    await s.fetch(`${service}?utm_source=github`, { headers: { referer: "https://localhost/blog/example/" } });
    await s.ctx.flush(); const rows=s.db.rows();
    assert.deepEqual(new Set(rows.map(row => row.source)), new Set(["other_campaign", "google", "other_referral", "github"]));
    assert.doesNotMatch(JSON.stringify(rows), /private|192\.0\.2|never-save|Mozilla|attacker/);
    assert.deepEqual(Object.keys(rows[0]).sort(), ["metric_date", "service_id", "locale", "event_kind", "surface", "source", "placement", "request_class", "request_count"].sort());
  } finally { s.db.close(); }
});

test("email activations validate provenance and bounded fields without recording enquiry content", async () => {
  const s = setup();
  try {
    assert.equal((await s.fetch(click, post(body))).status, 204);
    assert.equal((await s.fetch(click, { ...post(body), headers: { origin: "https://elsewhere.example", "content-type": "application/json" } })).status, 403);
    assert.equal((await s.fetch(click, { ...post(body), headers: { "content-type": "application/json" } })).status, 403);
    assert.equal((await s.fetch(click, post({ ...body, enquiry: "must not be stored" }))).status, 400);
    assert.equal((await s.fetch(click, post({ ...body, source: "person@example.com" }))).status, 400);
    assert.equal((await s.fetch(click, post({ ...body, locale: ["en"] }))).status, 400);
    assert.equal((await s.fetch(click, post({ ...body, extra: "a".repeat(600) }))).status, 413);
    assert.equal((await s.fetch(click, { ...post(body), headers: { origin: "https://localhost", "content-type": "text/plain" } })).status, 415);
    assert.equal(s.db.rows().length, 1); assert.equal(s.db.rows()[0].event_kind, "contact_click"); assert.equal(s.db.rows()[0].request_count, 1);
  } finally { s.db.close(); }
});

test("admin metrics enforce existing identity and date limits; outages never report valid zero", async () => {
  const s = setup();
  try {
    assert.equal((await s.fetch("/api/admin/services/metrics")).status, 401);
    assert.equal((await s.fetch("/api/admin/services/metrics", { headers: { ...admin, "oai-authenticated-user-email": "someone@example.com" } })).status, 403);
    assert.equal((await s.fetch("/admin/services/metrics")).status, 302);
    assert.equal((await s.fetch("/api/admin/services/metrics?days=91", { headers: admin })).status, 400);
    await s.fetch(service); await s.fetch(click, post(body)); await s.ctx.flush();
    const response=await s.fetch("/api/admin/services/metrics", { headers: admin }); const result=await response.json();
    assert.match(response.headers.get("cache-control"), /no-store/); assert.equal(result.available, true); assert.equal(result.timezone, "UTC"); assert.equal(result.unique_visitors, false); assert.equal(result.contact_clicks_are_enquiries, false); assert.equal(result.items.length, 2);
    s.env.DB={prepare(){throw new Error("test outage");}};
    assert.equal((await s.fetch(service)).status, 200); await s.ctx.flush();
    const unavailable=await s.fetch("/api/admin/services/metrics", { headers: admin }); assert.equal(unavailable.status, 503); assert.equal((await unavailable.json()).available, false);
    assert.equal((await s.fetch(click, post(body))).status, 503);
  } finally { s.db.close(); }
});
