import YAML from "yaml";

// The repository uses YAML front matter only. Keep the body byte-for-byte and
// add timestamp support to the core schema for js-yaml-compatible date handling.
export function parseFrontMatter(source) {
  if (typeof source !== "string") throw new TypeError("Markdown source must be a string");
  const opening = /^(?:\uFEFF)?---[\t ]*\r?\n/.exec(source);
  if (!opening) return { data: {}, content: source };

  const remainder = source.slice(opening[0].length);
  const closing = /^---[\t ]*(?:\r?\n|$)/m.exec(remainder);
  if (!closing) throw new Error("Unclosed YAML front matter");
  const document = YAML.parseDocument(remainder.slice(0, closing.index), {
    customTags: ["timestamp", "binary"],
    merge: true,
    uniqueKeys: true,
  });
  if (document.errors.length) throw document.errors[0];
  if (document.warnings.length) throw document.warnings[0];
  const data = document.toJS({ maxAliasCount: 100 }) ?? {};
  if (typeof data !== "object" || Array.isArray(data) || data instanceof Date || data instanceof Uint8Array) {
    throw new Error("YAML front matter must be a mapping");
  }
  return { data, content: remainder.slice(closing.index + closing[0].length) };
}
