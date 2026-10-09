import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
const require = createRequire(import.meta.url);
const glob = require("fast-glob");

test("both upstream consumers resolve the actual local replacement package", async () => {
  for (const consumer of ["@next/eslint-plugin-next", "vite-plugin-dynamic-import"]) {
    const upstreamRequire = createRequire(require.resolve(consumer));
    assert.equal(upstreamRequire("fast-glob"), glob);
  }
  assert.equal(require("fast-glob/package.json").name, "@fichil/glob-compat");
  assert.equal(glob.sync, glob.globSync);
  assert.equal(glob, glob.glob);
  const imported = await import("fast-glob");
  assert.equal(imported.default, glob);
  assert.equal(imported.globSync, glob.sync);
});

test("the lock records the real replacement identity and excludes both vulnerable dependency chains", async () => {
  const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
  assert.equal(lock.packages["node_modules/fast-glob"].resolved, "packages/glob-compat");
  assert.equal(lock.packages["packages/glob-compat"].name, "@fichil/glob-compat");
  for (const dependency of ["braces", "micromatch", "sprintf-js", "gray-matter"]) {
    assert.ok(Object.keys(lock.packages).every(location => !location.endsWith(`/node_modules/${dependency}`) && location !== `node_modules/${dependency}`), dependency);
  }
  assert.ok(Object.keys(lock.packages).every(location => !/node_modules\/.*\/packages\/glob-compat$/.test(location)), "no stale nested local links");
});

test("preserves dynamic-import file matching and Next root-directory paths", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "fichil-glob-"));
  try {
    for (const directory of ["src/foo", "src/bar", "apps/a/app", "apps/b/app", "node_modules/ignore"]) await mkdir(path.join(root, directory), { recursive: true });
    for (const file of ["src/foo.ts", "src/bar.tsx", "src/skip.json", "src/.hidden.ts", "src/foo/index.ts", "src/bar/nested.js"]) await writeFile(path.join(root, file), "export default 1;\n");
    const options = { cwd: root };
    const dynamic = glob.sync(["src/*.{js,ts,tsx}", "src/*/index.{js,ts,tsx}"], options).sort();
    assert.deepEqual(dynamic, ["src/bar.tsx", "src/foo.ts", "src/foo/index.ts"]);
    assert.deepEqual(await glob(["src/*.{js,ts,tsx}", "src/*/index.{js,ts,tsx}"], options).then(files => files.sort()), dynamic);
    assert.deepEqual(glob.sync("src", options), []); // no implicit directory expansion
    assert.deepEqual(glob.sync(["src/**/*.ts", "!src/foo/**"], options), ["src/foo.ts"]);
    assert.deepEqual(glob.sync("src/**/*.ts", { ...options, ignore: "src/foo/**" }), ["src/foo.ts"]);
    assert.deepEqual(glob.sync("src/.*.ts", options), ["src/.hidden.ts"]);
    assert.equal(glob.sync("src/*.ts", { ...options, dot: true }).length, 2);
    const absolutePattern = path.join(root, "apps/*").replaceAll("\\", "/");
    const expected = ["a", "b"].map(name => path.join(root, "apps", name).replaceAll("\\", "/"));
    assert.deepEqual(glob.globSync(absolutePattern, { onlyDirectories: true }).sort(), expected);
    const nextPluginEntry = require.resolve("@next/eslint-plugin-next");
    const { getRootDirs } = require(path.join(path.dirname(nextPluginEntry), "utils/get-root-dirs.js"));
    assert.deepEqual(getRootDirs({ cwd: root, settings: { next: { rootDir: absolutePattern } } }).sort(), expected);
    assert.deepEqual(glob.globSync("apps/*", { ...options, onlyDirectories: true }).sort(), ["apps/a", "apps/b"]);
    assert.deepEqual(glob.globSync("apps/a", { ...options, onlyDirectories: true }), ["apps/a"]);
    assert.deepEqual(glob.sync("src/foo.ts", { ...options, absolute: true }), [path.join(root, "src/foo.ts").replaceAll("\\", "/")]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects unsupported APIs, options and excessive pattern nesting before glob evaluation", async () => {
  assert.throws(() => glob.sync("*.ts", { deep: 1 }), /Unsupported/);
  assert.throws(() => glob.sync("*.ts", { objectMode: true }), /Unsupported/);
  assert.throws(() => glob.sync(["*.ts", "/absolute/*.ts"]), /Mixed/);
  assert.throws(() => glob.sync("{".repeat(33) + "a,b" + "}".repeat(33)), /nesting/);
  assert.throws(() => glob.sync("{)".repeat(33) + "a,b" + "}".repeat(33)), /nesting/);
  assert.throws(() => glob.sync("*.ts", { ignore: "(".repeat(33) }), /nesting/);
  assert.throws(() => glob.sync("x".repeat(4097)), /4096/);
  assert.throws(() => glob.sync(Array(129).fill("*.ts")), /128/);
  await assert.rejects(glob("{".repeat(33) + "a,b" + "}".repeat(33)), /nesting/);
});
