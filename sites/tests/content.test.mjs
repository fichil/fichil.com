import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";

const payload = JSON.parse(await readFile(new URL("../generated/content.json", import.meta.url), "utf8"));
const english = payload.posts.filter((post) => post.locale === "en");
const chinese = payload.posts.filter((post) => post.locale === "zh-cn");
const execFileAsync = promisify(execFile);

async function sourceSlugs(locale) {
  const entries = await readdir(new URL(`../../content/${locale}/blog/`, import.meta.url), { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

test("migrates all bilingual Markdown posts", () => {
  return Promise.all([sourceSlugs("en"), sourceSlugs("zh-cn")]).then(([englishSources, chineseSources]) => {
    assert.ok(englishSources.length > 0);
    assert.deepEqual(englishSources, chineseSources);
    assert.deepEqual(english.map((post) => post.slug).sort(), englishSources);
    assert.deepEqual(chinese.map((post) => post.slug).sort(), chineseSources);
    assert.equal(payload.posts.length, englishSources.length + chineseSources.length);
  });
});

test("records the exact source commit and build time", async () => {
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
    cwd: new URL("../..", import.meta.url),
    encoding: "utf8",
  });
  assert.equal(payload.build.commit, stdout.trim());
  assert.match(payload.build.commit, /^[0-9a-f]{40}$/);
  assert.equal(new Date(payload.build.builtAt).toISOString(), payload.build.builtAt);
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
