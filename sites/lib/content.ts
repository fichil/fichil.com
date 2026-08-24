import payload from "@/generated/content.json";

export type Locale = "en" | "zh-cn";
export type TaxonomyKind = "tags" | "categories";

export interface TocItem {
  depth: number;
  id: string;
  text: string;
}

export interface AiSolution {
  schemaVersion: 1;
  problem: string;
  symptoms: string[];
  evidence: string[];
  rootCause: string;
  resolutionSteps: string[];
  verification: string[];
  limitations: string[];
  appliesTo: string[];
  keywords: string[];
  structureSource: "authored" | "legacy-derived";
  completeness: "complete" | "partial";
}

export interface Post {
  locale: Locale;
  slug: string;
  title: string;
  date: string;
  lastModified: string;
  description: string;
  tags: string[];
  categories: string[];
  contentMarkdown: string;
  ai: AiSolution;
  html: string;
  toc: TocItem[];
  readingMinutes: number;
  excerpt: string;
}

export interface ProjectItem {
  kicker: string;
  title: string;
  content: string;
  badges: string[];
  scope: string[];
  outcomes: string[];
  proofLinks: Array<{ name: string; link: string }>;
  actionName: string | null;
  actionLink: string | null;
}

export interface ServiceItem {
  title: string;
  content: string;
  badges: string[];
}

export interface SiteCopy {
  title: string;
  description: string;
  hero: {
    intro: string;
    title: string;
    subtitle: string;
    content: string;
    image: string;
    imageAlt: string;
    buttonName: string;
    buttonLink: string;
    secondaryButtonName: string;
    secondaryButtonLink: string;
  };
  trust: { postsLabel: string; sourceValue: string; sourceLabel: string; releaseValue: string; releaseLabel: string };
  services: { title: string; intro: string; items: ServiceItem[] };
  about: { title: string; html: string; skillsTitle: string; skills: string[] };
  projects: { title: string; intro: string; items: ProjectItem[] };
  contact: { title: string; content: string; buttonName: string; buttonLink: string };
}

export interface BuildInfo {
  commit: string;
  builtAt: string;
}

export interface ContentPolicy {
  aiSchemaRequiredFrom: string;
}

export const PAGE_SIZE = 6;
const posts = payload.posts as Post[];
const site = payload.site as Record<Locale, SiteCopy>;
const build = payload.build as BuildInfo;
const contentPolicy = payload.contentPolicy as ContentPolicy;

export function getBuildInfo(): BuildInfo {
  return build;
}

export function getContentPolicy(): ContentPolicy {
  return contentPolicy;
}

export function getSiteCopy(locale: Locale): SiteCopy {
  return site[locale];
}

export function getPosts(locale: Locale): Post[] {
  return posts.filter((post) => post.locale === locale);
}

export function getPost(locale: Locale, slug: string): Post | undefined {
  return posts.find((post) => post.locale === locale && post.slug === slug);
}

export function getRelatedPosts(locale: Locale, current: Post, limit = 3): Post[] {
  const currentTags = new Set(current.tags.map((tag) => taxonomySlug(tag)));
  const currentCategories = new Set(current.categories.map((category) => taxonomySlug(category)));
  return getPosts(locale)
    .filter((post) => post.slug !== current.slug)
    .map((post) => {
      const tagScore = post.tags.reduce((score, tag) => score + (currentTags.has(taxonomySlug(tag)) ? 2 : 0), 0);
      const categoryScore = post.categories.reduce((score, category) => score + (currentCategories.has(taxonomySlug(category)) ? 3 : 0), 0);
      return { post, score: tagScore + categoryScore };
    })
    .sort((a, b) => b.score - a.score || b.post.date.localeCompare(a.post.date) || a.post.slug.localeCompare(b.post.slug))
    .slice(0, limit)
    .map(({ post }) => post);
}

export function getAdjacentPosts(locale: Locale, current: Post): { previous?: Post; next?: Post } {
  const ordered = getPosts(locale);
  const index = ordered.findIndex((post) => post.slug === current.slug);
  return {
    previous: index >= 0 ? ordered[index + 1] : undefined,
    next: index > 0 ? ordered[index - 1] : undefined,
  };
}

export function getPageCount(locale: Locale): number {
  return Math.max(1, Math.ceil(getPosts(locale).length / PAGE_SIZE));
}

export function getPagedPosts(locale: Locale, page: number): Post[] {
  const start = (page - 1) * PAGE_SIZE;
  return getPosts(locale).slice(start, start + PAGE_SIZE);
}

export function taxonomySlug(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

export function getTerms(locale: Locale, kind: TaxonomyKind) {
  const counts = new Map<string, number>();
  for (const post of getPosts(locale)) {
    for (const term of post[kind]) counts.set(term, (counts.get(term) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, slug: taxonomySlug(name), count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, locale));
}

export function getTerm(locale: Locale, kind: TaxonomyKind, slug: string) {
  return getTerms(locale, kind).find((term) => term.slug === slug);
}

export function getPostsByTerm(locale: Locale, kind: TaxonomyKind, slug: string): Post[] {
  return getPosts(locale).filter((post) => post[kind].some((term) => taxonomySlug(term) === slug));
}

export function localizedPath(locale: Locale, path: string): string {
  return locale === "zh-cn" ? `/zh-cn${path === "/" ? "/" : path}` : path;
}

export function articlePath(locale: Locale, slug: string): string {
  return localizedPath(locale, `/blog/${slug}/`);
}

export function taxonomyPath(locale: Locale, kind: TaxonomyKind, slug?: string): string {
  return localizedPath(locale, `/${kind}/${slug ? `${slug}/` : ""}`);
}

export function alternateTaxonomyPath(locale: Locale, kind: TaxonomyKind, slug: string): string {
  const other: Locale = locale === "en" ? "zh-cn" : "en";
  const paired = getPostsByTerm(locale, kind, slug)
    .map((post) => getPost(other, post.slug))
    .filter((post): post is Post => Boolean(post));
  const counts = new Map<string, number>();
  for (const post of paired) {
    for (const term of post[kind]) counts.set(term, (counts.get(term) ?? 0) + 1);
  }
  const best = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return best ? taxonomyPath(other, kind, taxonomySlug(best)) : localizedPath(other, `/${kind}/`);
}

export function canonicalPaths(locale: Locale): string[] {
  const paths = [localizedPath(locale, "/"), localizedPath(locale, "/blog/")];
  for (let page = 2; page <= getPageCount(locale); page += 1) {
    paths.push(localizedPath(locale, `/blog/page/${page}/`));
  }
  for (const post of getPosts(locale)) paths.push(articlePath(locale, post.slug));
  for (const kind of ["tags", "categories"] as const) {
    paths.push(taxonomyPath(locale, kind));
    for (const term of getTerms(locale, kind)) paths.push(taxonomyPath(locale, kind, term.slug));
  }
  return paths;
}
