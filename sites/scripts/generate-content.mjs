import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import matter from "gray-matter";
import rehypeHighlight from "rehype-highlight";
import rehypeSlug from "rehype-slug";
import rehypeStringify from "rehype-stringify";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import YAML from "yaml";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const siteRoot = resolve(scriptDir, "..");
const repositoryRoot = resolve(siteRoot, "..");
const outputPath = join(siteRoot, "generated", "content.json");
const execFileAsync = promisify(execFile);

const markdownProcessor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkRehype)
  .use(rehypeSlug)
  .use(rehypeHighlight, { detect: true })
  .use(rehypeStringify);

function stripMarkdown(value) {
  return value
    .replace(/~~~[\s\S]*?~~~/g, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~>|-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function decodeEntities(value) {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function renderMarkdown(markdown) {
  const html = String(await markdownProcessor.process(markdown));
  const toc = [];
  const headingPattern = /<h([23]) id="([^"]+)">([\s\S]*?)<\/h\1>/g;
  let match;
  while ((match = headingPattern.exec(html)) !== null) {
    toc.push({ depth: Number(match[1]), id: match[2], text: decodeEntities(match[3]) });
  }
  return { html, toc };
}

function toStringArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.map(String) : [String(value)];
}

async function readPosts(locale) {
  const blogRoot = join(repositoryRoot, "content", locale, "blog");
  const entries = await readdir(blogRoot, { withFileTypes: true });
  const posts = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const sourcePath = join(blogRoot, entry.name, "index.md");
    const source = await readFile(sourcePath, "utf8");
    const parsed = matter(source);
    if (parsed.data.draft === true) continue;

    const title = String(parsed.data.title || "").trim();
    const dateValue = parsed.data.date;
    const date = dateValue instanceof Date ? dateValue.toISOString().slice(0, 10) : String(dateValue || "").slice(0, 10);
    const lastModifiedValue = parsed.data.lastmod || parsed.data.lastModified || dateValue;
    const lastModified = lastModifiedValue instanceof Date ? lastModifiedValue.toISOString().slice(0, 10) : String(lastModifiedValue || "").slice(0, 10);
    if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{4}-\d{2}-\d{2}$/.test(lastModified)) {
      throw new Error(`Invalid front matter in ${sourcePath}`);
    }

    const rendered = await renderMarkdown(parsed.content);
    const plain = stripMarkdown(parsed.content);
    const units = parsed.content.match(/[\u3400-\u9fff]|[A-Za-z0-9]+/g)?.length ?? 0;
    posts.push({
      locale,
      slug: entry.name,
      title,
      date,
      lastModified,
      description: String(parsed.data.description || plain.slice(0, 180)).trim(),
      tags: toStringArray(parsed.data.tags),
      categories: toStringArray(parsed.data.categories),
      html: rendered.html,
      toc: rendered.toc,
      readingMinutes: Math.max(1, Math.ceil(units / (locale === "zh-cn" ? 350 : 220))),
      excerpt: plain.slice(0, 220),
    });
  }

  return posts.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}

async function readSiteCopy(config, locale) {
  const language = config.languages[locale];
  const params = language.params;
  const about = await renderMarkdown(params.about.content || "");
  return {
    title: language.title,
    description: params.description,
    hero: {
      intro: params.hero.intro,
      title: params.hero.title,
      subtitle: params.hero.subtitle,
      content: params.hero.content,
      image: params.hero.image,
      imageAlt: params.hero.imageAlt,
      buttonName: params.hero.button.name,
      buttonLink: params.hero.button.url,
      secondaryButtonName: params.hero.secondaryButton.name,
      secondaryButtonLink: params.hero.secondaryButton.url,
    },
    trust: {
      postsLabel: params.trust.postsLabel,
      sourceValue: params.trust.sourceValue,
      sourceLabel: params.trust.sourceLabel,
      releaseValue: params.trust.releaseValue,
      releaseLabel: params.trust.releaseLabel,
    },
    services: {
      title: params.services.title,
      intro: params.services.intro,
      items: params.services.items.map((item) => ({
        title: item.title,
        content: item.content,
        badges: item.badges || [],
      })),
    },
    about: {
      title: params.about.title,
      html: about.html,
      skillsTitle: params.about.skills.title,
      skills: params.about.skills.items,
    },
    projects: {
      title: params.projects.title,
      intro: params.projects.intro,
      items: params.projects.items.map((item) => ({
        kicker: item.kicker,
        title: item.title,
        content: item.content,
        badges: item.badges || [],
        scope: item.scope || [],
        outcomes: item.outcomes || [],
        proofLinks: (item.proofLinks || []).map((link) => ({ name: link.name, link: link.link })),
        actionName: item.featured?.name || null,
        actionLink: item.featured?.link || null,
      })),
    },
    contact: {
      title: params.contact.title,
      content: params.contact.content,
      buttonName: params.contact.btnName,
      buttonLink: params.contact.btnLink,
    },
  };
}

async function readSourceCommit() {
  const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  const commit = stdout.trim();
  if (!/^[0-9a-f]{40}$/.test(commit)) {
    throw new Error(`Invalid Git commit: ${commit}`);
  }
  return commit;
}

const [configSource, englishPosts, chinesePosts, sourceCommit] = await Promise.all([
  readFile(join(repositoryRoot, "hugo.yaml"), "utf8"),
  readPosts("en"),
  readPosts("zh-cn"),
  readSourceCommit(),
]);
const config = YAML.parse(configSource);

if (englishPosts.length !== chinesePosts.length) {
  throw new Error(`Translation count mismatch: en=${englishPosts.length}, zh-cn=${chinesePosts.length}`);
}
const chineseSlugs = new Set(chinesePosts.map((post) => post.slug));
const missingTranslations = englishPosts.filter((post) => !chineseSlugs.has(post.slug));
if (missingTranslations.length) {
  throw new Error(`Missing Chinese translations: ${missingTranslations.map((post) => post.slug).join(", ")}`);
}

const builtAt = new Date().toISOString();
const payload = {
  generatedAt: builtAt,
  build: {
    commit: sourceCommit,
    builtAt,
  },
  posts: [...englishPosts, ...chinesePosts],
  site: {
    en: await readSiteCopy(config, "en"),
    "zh-cn": await readSiteCopy(config, "zh-cn"),
  },
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`Generated ${payload.posts.length} posts at ${outputPath}`);
