import path from "node:path";
import { glob, globSync } from "tinyglobby";

// This is not the fast-glob package or a full implementation of its API.
// It covers globSync for Next root directories and sync for vinext's dynamic
// import plugin, plus their equivalent promise API. Fail on unknown options
// so an upstream caller change cannot silently lose filtering semantics.
const supportedOptions = new Set([
  "cwd", "onlyDirectories", "onlyFiles", "ignore", "dot", "absolute", "followSymbolicLinks",
]);

function validatePattern(pattern) {
  if (typeof pattern !== "string" || !pattern || pattern.length > 4096) {
    throw new TypeError("Glob patterns must be nonempty strings of at most 4096 characters");
  }
  const stack = [];
  const pairs = { "}": "{", ")": "(", "]": "[" };
  for (let index = 0; index < pattern.length; index++) {
    if (pattern[index] === "\\") { index++; continue; }
    if ("{([".includes(pattern[index])) {
      stack.push(pattern[index]);
      if (stack.length > 32) throw new RangeError("Glob pattern nesting exceeds 32 levels");
    } else if (pairs[pattern[index]] === stack.at(-1)) {
      stack.pop();
    }
  }
}

function prepare(patterns, options = {}) {
  const list = Array.isArray(patterns) ? patterns : [patterns];
  if (!list.length || list.length > 128) throw new RangeError("Expected between 1 and 128 glob patterns");
  list.forEach(validatePattern);
  if (!options || typeof options !== "object" || Array.isArray(options)) throw new TypeError("Expected glob options object");
  for (const key of Object.keys(options)) {
    if (!supportedOptions.has(key)) throw new TypeError(`Unsupported glob option: ${key}`);
  }
  if (options.ignore !== undefined) {
    const ignored = Array.isArray(options.ignore) ? options.ignore : [options.ignore];
    if (ignored.length > 128) throw new RangeError("Too many ignored patterns");
    ignored.forEach(validatePattern);
  }
  const positive = list.filter(pattern => !pattern.startsWith("!"));
  const absolute = positive.map(pattern => path.posix.isAbsolute(pattern) || path.win32.isAbsolute(pattern));
  if (absolute.some(Boolean) && !absolute.every(Boolean)) throw new TypeError("Mixed absolute and relative glob patterns are unsupported");
  return { patterns: list, options: { ...options, absolute: options.absolute ?? absolute.some(Boolean), expandDirectories: false } };
}

// tinyglobby directory results have a trailing slash; pinned callers expect
// fast-glob-style paths. Preserve filesystem root spellings.
function clean(results) {
  return results.map(entry => entry === "/" || /^[A-Za-z]:\/$/.test(entry) ? entry : entry.replace(/\/+$/, ""));
}

function sync(patterns, options) {
  const prepared = prepare(patterns, options);
  return clean(globSync(prepared.patterns, prepared.options));
}

async function asyncGlob(patterns, options) {
  const prepared = prepare(patterns, options);
  return clean(await glob(prepared.patterns, prepared.options));
}

const compatibleGlob = Object.assign(asyncGlob, { glob: asyncGlob, async: asyncGlob, globSync: sync, sync });

// Node >=22.13 supports this ESM-to-CommonJS export without a require hook or
// install-time mutation. Next's require() and vinext's default import receive
// the same callable adapter; the existing lint policy remains unchanged.
export default compatibleGlob;
export { compatibleGlob as "module.exports", asyncGlob as glob, asyncGlob as async, sync as globSync, sync };
