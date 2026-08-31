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
const AI_SCHEMA_REQUIRED_FROM = "2026-08-25";

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

const sectionAliases = {
  problem: ["problem", "symptom", "symptoms", "phenomenon", "issue", "现象", "问题", "问题现象", "故障现象", "症状"],
  evidence: ["evidence", "observations", "investigation", "证据", "观察与证据", "排查证据", "调查证据"],
  rootCause: ["root cause", "cause", "why it happened", "根因", "根本原因", "原因"],
  resolution: ["resolution", "implementation", "fix", "solution", "handling", "解决方案", "处理", "实现", "修复", "处理方式", "实施"],
  verification: ["verification", "validation", "result", "results", "验证", "验证结果", "结果"],
  limitations: ["limitations", "limits", "boundaries", "caveats", "经验与限制", "限制", "适用边界", "边界", "局限"],
  appliesTo: ["applies to", "scope", "applicability", "适用范围", "范围"],
};

function normalizeHeading(value) {
  return value.normalize("NFKC").trim().toLowerCase().replace(/[：:]/g, "").replace(/\s+/g, " ");
}

function markdownSections(markdown) {
  const sections = [];
  let current = null;
  for (const line of markdown.split(/\r?\n/)) {
    const heading = line.match(/^#{2,3}\s+(.+?)\s*#*$/);
    if (heading) {
      if (current) sections.push(current);
      current = { heading: normalizeHeading(heading[1]), body: [] };
    } else if (current) {
      current.body.push(line);
    }
  }
  if (current) sections.push(current);
  return sections.map((section) => ({ ...section, body: section.body.join("\n").trim() }));
}

function findSection(sections, aliases) {
  return sections.find((section) => aliases.some((alias) => section.heading === alias || section.heading.includes(alias)))?.body || "";
}

function sectionItems(markdown) {
  if (!markdown) return [];
  const blocks = markdown
    .split(/\n\s*\n|\n(?=\s*(?:[-*+] |\d+[.)] ))/)
    .map((value) => stripMarkdown(value))
    .filter(Boolean);
  return blocks.length ? blocks : [stripMarkdown(markdown)].filter(Boolean);
}

function requireText(value, field, sourcePath) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result) throw new Error(`Invalid ai.${field} in ${sourcePath}`);
  return result;
}

function requireTextArray(value, field, sourcePath) {
  const result = Array.isArray(value) ? value.map((item) => String(item).trim()).filter(Boolean) : [];
  if (!result.length) throw new Error(`Invalid ai.${field} in ${sourcePath}`);
  return result;
}

function authoredAi(data, sourcePath) {
  if (!data || Number(data.schema_version) !== 1) {
    throw new Error(`Invalid ai.schema_version in ${sourcePath}`);
  }
  return {
    schemaVersion: 1,
    problem: requireText(data.problem, "problem", sourcePath),
    symptoms: requireTextArray(data.symptoms, "symptoms", sourcePath),
    evidence: requireTextArray(data.evidence, "evidence", sourcePath),
    rootCause: requireText(data.root_cause, "root_cause", sourcePath),
    resolutionSteps: requireTextArray(data.resolution_steps, "resolution_steps", sourcePath),
    verification: requireTextArray(data.verification, "verification", sourcePath),
    limitations: requireTextArray(data.limitations, "limitations", sourcePath),
    appliesTo: requireTextArray(data.applies_to, "applies_to", sourcePath),
    keywords: requireTextArray(data.keywords, "keywords", sourcePath),
    structureSource: "authored",
    completeness: "complete",
  };
}

function legacyAi(markdown, description, tags) {
  const sections = markdownSections(markdown);
  const problemSection = findSection(sections, sectionAliases.problem);
  const rootCauseSection = findSection(sections, sectionAliases.rootCause);
  return {
    schemaVersion: 1,
    problem: stripMarkdown(problemSection) || description,
    symptoms: sectionItems(problemSection),
    evidence: sectionItems(findSection(sections, sectionAliases.evidence)),
    rootCause: stripMarkdown(rootCauseSection),
    resolutionSteps: sectionItems(findSection(sections, sectionAliases.resolution)),
    verification: sectionItems(findSection(sections, sectionAliases.verification)),
    limitations: sectionItems(findSection(sections, sectionAliases.limitations)),
    appliesTo: sectionItems(findSection(sections, sectionAliases.appliesTo)),
    keywords: tags,
    structureSource: "legacy-derived",
    completeness: "partial",
  };
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
    const description = String(parsed.data.description || plain.slice(0, 180)).trim();
    const tags = toStringArray(parsed.data.tags);
    if (date >= AI_SCHEMA_REQUIRED_FROM && !parsed.data.ai) {
      throw new Error(`Missing required ai front matter in ${sourcePath}`);
    }
    const ai = parsed.data.ai
      ? authoredAi(parsed.data.ai, sourcePath)
      : legacyAi(parsed.content, description, tags);
    const units = parsed.content.match(/[\u3400-\u9fff]|[A-Za-z0-9]+/g)?.length ?? 0;
    posts.push({
      locale,
      slug: entry.name,
      title,
      date,
      lastModified,
      description,
      tags,
      categories: toStringArray(parsed.data.categories),
      contentMarkdown: parsed.content.trim(),
      ai,
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
      signal: {
        eyebrow: params.hero.signal.eyebrow,
        title: params.hero.signal.title,
        releaseLabel: params.hero.signal.releaseLabel,
        phases: params.hero.signal.phases.map((phase) => ({
          code: phase.code,
          label: phase.label,
          detail: phase.detail,
        })),
      },
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
  contentPolicy: {
    aiSchemaRequiredFrom: AI_SCHEMA_REQUIRED_FROM,
  },
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
