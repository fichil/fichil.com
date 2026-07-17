import type { Metadata } from "next";
import type { Locale } from "@/lib/content";

export const SITE_URL = "https://fichil.com";
export const DEFAULT_DESCRIPTION =
  "Backend and DevOps engineer focused on Java systems, logistics platforms, SAP/WMS/TMS integrations, open-source tools, and AI-assisted development.";

export function absoluteUrl(path: string): string {
  return new URL(path, SITE_URL).toString();
}

interface MetadataInput {
  locale: Locale;
  title: string;
  description: string;
  path: string;
  alternatePath?: string;
  type?: "website" | "article";
  publishedTime?: string;
  tags?: string[];
}

export function createMetadata(input: MetadataInput): Metadata {
  const canonical = absoluteUrl(input.path);
  const alternate = input.alternatePath ?? (input.locale === "en" ? `/zh-cn${input.path}` : input.path.replace(/^\/zh-cn/, ""));
  const englishPath = input.locale === "en" ? input.path : alternate;
  const chinesePath = input.locale === "zh-cn" ? input.path : alternate;
  return {
    title: input.title,
    description: input.description,
    alternates: {
      canonical,
      languages: {
        en: absoluteUrl(englishPath),
        "zh-CN": absoluteUrl(chinesePath),
        "x-default": absoluteUrl(englishPath),
      },
    },
    openGraph: {
      type: input.type ?? "website",
      url: canonical,
      title: input.title,
      description: input.description,
      siteName: "Fichil | Engineering Notes",
      locale: input.locale === "zh-cn" ? "zh_CN" : "en_US",
      images: [{ url: absoluteUrl("/og.png"), width: 1536, height: 1024, alt: "Fichil engineering notes" }],
      ...(input.publishedTime ? { publishedTime: input.publishedTime } : {}),
      ...(input.tags ? { tags: input.tags } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title: input.title,
      description: input.description,
      images: [absoluteUrl("/og.png")],
    },
  };
}
