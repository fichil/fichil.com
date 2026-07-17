import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const payload = JSON.parse(await readFile(new URL("../generated/content.json", import.meta.url), "utf8"));
const english = payload.posts.filter((post) => post.locale === "en");
const chinese = payload.posts.filter((post) => post.locale === "zh-cn");

test("migrates all bilingual Markdown posts", () => {
  assert.equal(payload.posts.length, 32);
  assert.equal(english.length, 16);
  assert.equal(chinese.length, 16);
  assert.deepEqual(english.map((post) => post.slug).sort(), chinese.map((post) => post.slug).sort());
});

test("keeps required article metadata and safe rendered HTML", () => {
  for (const post of payload.posts) {
    assert.match(post.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(post.title.length > 8);
    assert.ok(post.description.length > 20);
    assert.ok(Array.isArray(post.tags));
    assert.ok(Array.isArray(post.categories));
    assert.match(post.html, /<p>|<h2/);
    assert.doesNotMatch(post.html, /<script\b|<iframe\b/i);
  }
  assert.ok(payload.posts.filter((post) => post.html.includes("<pre>")).length >= 8);
});

test("reads localized homepage copy from hugo.yaml", () => {
  assert.match(payload.site.en.hero.intro, /Build/);
  assert.match(payload.site["zh-cn"].title, /后端|运维|企业/);
  assert.equal(payload.site.en.projects.items.length, 3);
  assert.equal(payload.site["zh-cn"].projects.items.length, 3);
});
