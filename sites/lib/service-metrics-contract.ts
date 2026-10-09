export const SERVICE_ID = "excel-csv";
export const SOURCES = ["direct_or_unknown", "internal", "google", "bing", "baidu", "github", "wechat", "linkedin", "zhihu", "newsletter", "other_campaign", "other_referral"] as const;
export const SURFACES = ["home", "service", "article", "other"] as const;
export const PLACEMENTS = ["hero", "service", "template", "contact", "footer", "article", "other"] as const;
export type SourceBucket = typeof SOURCES[number];

// Return only bounded categories; discard URLs and arbitrary campaign values.
export function sourceBucket(page: URL, referrer: string | null): SourceBucket {
  const campaign = page.searchParams.get("utm_source");
  if (campaign) {
    const normalized = campaign.toLowerCase();
    return (["google", "bing", "baidu", "github", "wechat", "linkedin", "zhihu", "newsletter"] as string[]).includes(normalized) ? normalized as SourceBucket : "other_campaign";
  }
  if (!referrer) return "direct_or_unknown";
  try {
    const from = new URL(referrer);
    if (!["https:", "http:"].includes(from.protocol)) return "direct_or_unknown";
    const host = from.hostname.toLowerCase();
    if (host === page.hostname.toLowerCase() || ["fichil.com", "www.fichil.com"].includes(host)) return "internal";
    const sources: Array<[string, SourceBucket]> = [["google.com", "google"], ["google.com.hk", "google"], ["bing.com", "bing"], ["baidu.com", "baidu"], ["github.com", "github"], ["weixin.qq.com", "wechat"], ["linkedin.com", "linkedin"], ["zhihu.com", "zhihu"]];
    return sources.find(([domain]) => host === domain || host.endsWith(`.${domain}`))?.[1] ?? "other_referral";
  } catch { return "direct_or_unknown"; }
}

export function surfaceFromPath(path: string): typeof SURFACES[number] {
  if (/^\/(?:zh-cn\/?)?$/.test(path)) return "home";
  if (/^\/(?:zh-cn\/)?services\/excel-csv-automation\/?$/.test(path)) return "service";
  if (/^\/(?:zh-cn\/)?blog\/[a-z0-9-]+\/$/.test(path)) return "article";
  return "other";
}
