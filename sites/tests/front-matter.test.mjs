import assert from "node:assert/strict";
import test from "node:test";
import { parseFrontMatter } from "../scripts/front-matter.mjs";

test("parses YAML metadata, draft booleans and timestamp offsets without changing the body", () => {
  const body = "\n## Heading\n\n```yaml\n---\n```\n";
  const parsed = parseFrontMatter('---\ntitle: "中文: quoted title"\ndate: 2026-10-08T23:30:00-05:00\ndraft: false\ntags: [SQL, Export]\nai:\n  schema_version: 1\n  problem: A bounded export\n---\n' + body);
  assert.equal(parsed.data.title, "中文: quoted title");
  assert.equal(parsed.data.date.toISOString(), "2026-10-09T04:30:00.000Z");
  assert.equal(parsed.data.draft, false);
  assert.deepEqual(parsed.data.tags, ["SQL", "Export"]);
  assert.deepEqual(parsed.data.ai, { schema_version: 1, problem: "A bounded export" });
  assert.equal(parsed.content, body);
});

test("supports UTF-8 BOM, CRLF, literal blocks, empty metadata and a closing fence at EOF", () => {
  const source = '\uFEFF---\r\ndescription: |\r\n  first line\r\n  第二行\r\n---\r\n\r\nbody\r\n';
  const parsed = parseFrontMatter(source);
  assert.equal(parsed.data.description, "first line\n第二行\n");
  assert.equal(parsed.content, "\r\nbody\r\n");
  assert.deepEqual(parseFrontMatter("---\n---"), { data: {}, content: "" });
  assert.deepEqual(parseFrontMatter("# Plain Markdown\n"), { data: {}, content: "# Plain Markdown\n" });
});

test("fails closed on malformed, duplicate, unclosed or non-mapping metadata", () => {
  assert.throws(() => parseFrontMatter("---\ntitle: [broken\n---\nbody"));
  assert.throws(() => parseFrontMatter("---\ntitle: first\ntitle: second\n---\nbody"), /unique|duplicate/i);
  assert.throws(() => parseFrontMatter("---\ntitle: missing closer\nbody"), /Unclosed/);
  assert.throws(() => parseFrontMatter("---\n- a\n- b\n---\nbody"), /mapping/);
  assert.throws(() => parseFrontMatter("---\nhello\n---\nbody"), /mapping/);
  assert.throws(() => parseFrontMatter("---\nvalue: !unsupported-tag something\n---\nbody"), /tag/i);
});

test("preserves YAML merge keys and bounds alias expansion", () => {
  const parsed = parseFrontMatter("---\nbase: &base {draft: false, title: title}\n<<: *base\n---\nbody");
  assert.equal(parsed.data.draft, false);
  assert.equal(parsed.data.title, "title");
  const aliases = ["a: &a [x, x, x, x, x, x, x, x, x, x]"];
  for (const [name, previous] of [["b", "a"], ["c", "b"], ["d", "c"]]) aliases.push(`${name}: &${name} [${Array(10).fill(`*${previous}`).join(", ")}]`);
  assert.throws(() => parseFrontMatter("---\n" + aliases.join("\n") + "\n---\nbody"), /alias|resource/i);
});
