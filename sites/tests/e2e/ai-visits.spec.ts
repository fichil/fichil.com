import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const slug = "ai-maintained-hugo-site";
const visits = Array.from({ length: 21 }, (_, index) => ({
  id: `visit-${index}`, agent_family: "openai", agent_name: index === 0 ? "GPTBot" : "OAI-SearchBot",
  detection_source: "user-agent", visited_at: "2026-09-11T16:01:02.000Z", request_kind: "html", identity_verified: false,
}));

for (const locale of ["en", "zh-cn"] as const) {
  for (const [width, height] of [[390, 844], [360, 800]]) {
    test(`AI visits remain visible with zero comments ${locale} ${width}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.route("**/api/ai/v1/**", async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname.endsWith("/stats")) return route.fulfill({ json: { available: true, items: [{ total: 28, by_family: { openai: 28 } }] } });
        if (url.pathname.endsWith("/comments")) return route.fulfill({ json: { items: [] } });
        if (url.searchParams.get("view") === "legacy") return route.fulfill({ json: { available: true, items: [{ agent_family: "openai", visit_date: "2026-09-10", request_count: 7 }], next_cursor: null } });
        return route.fulfill({ json: { available: true, items: url.searchParams.has("cursor") ? visits.slice(20) : visits.slice(0, 20), next_cursor: url.searchParams.has("cursor") ? null : "next-page" } });
      });
      await page.goto(`${locale === "zh-cn" ? "/zh-cn" : ""}/blog/${slug}/`);
      await expect(page.locator("html")).toHaveAttribute("data-app-ready", "true");
      await expect(page.locator(".ai-visit-list").first().locator("li")).toHaveCount(20);
      await expect(page.locator(".comments-heading span")).toHaveText("0");
      await expect(page.locator(".comments-empty")).toBeVisible();
      await expect(page.locator(".ai-visits")).toContainText("GPTBot");
      await expect(page.locator(".ai-visits time").first()).toHaveText("2026-09-12 00:01:02 UTC+08:00");
      await page.locator(".ai-visits button").click();
      await expect(page.locator(".ai-visits li")).toHaveCount(21);
      await expect(page.locator(".ai-visits button")).toHaveCount(0);
      await page.locator(".ai-legacy summary").click();
      await expect(page.locator(".ai-legacy")).toContainText("2026-09-10 UTC");
      await page.locator(".ai-comment-guide summary").click();
      await expect(page.locator(".ai-comment-guide")).toContainText("idempotency_key");
      await expect(page.locator(".ai-comment-guide")).toContainText(`/articles/${locale}/${slug}/comments`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const accessibility = await new AxeBuilder({ page }).include(".ai-engagement").analyze();
      expect(accessibility.violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""))).toEqual([]);
      const folder = path.join(process.cwd(), "work", "ai-visit-records", "screenshots");
      await mkdir(folder, { recursive: true });
      await page.screenshot({ path: path.join(folder, `${locale}-${width}-full.png`), fullPage: true });
      await page.locator("#ai-visits-title").scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(folder, `${locale}-${width}.png`) });
    });
  }
}

test("visit errors retry independently of unavailable statistics and comments", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/ai/v1/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/stats") || url.pathname.endsWith("/comments")) return route.fulfill({ json: { available: false, items: [] } });
    if (url.searchParams.get("view") === "legacy") return route.fulfill({ json: { available: true, items: [], next_cursor: null } });
    if (++attempts === 1) return route.fulfill({ status: 503, json: { error: { code: "visits_unavailable" } } });
    return route.fulfill({ json: { available: true, items: visits.slice(0, 1), next_cursor: null } });
  });
  await page.goto(`/zh-cn/blog/${slug}/`);
  await expect(page.getByText("请求统计暂时无法加载。")).toBeVisible();
  await expect(page.getByText("评论暂时无法加载。")).toBeVisible();
  await expect(page.locator(".comments-heading span")).toHaveCount(0);
  await expect(page.locator(".comments-empty")).toHaveCount(0);
  await expect(page.locator(".ai-visits")).not.toContainText("暂无逐次浏览记录");
  await page.locator(".ai-visits").getByRole("button", { name: "重试" }).click();
  await expect(page.locator(".ai-visits")).toContainText("GPTBot");
  await expect(page.getByText("评论暂时无法加载。")).toBeVisible();
});
