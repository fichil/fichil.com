import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const evidenceRoot = path.join(process.cwd(), "work", "ui-signal-core-redesign", "screenshots");

async function saveEvidence(page: Page, name: string) {
  await mkdir(evidenceRoot, { recursive: true });
  await page.screenshot({ path: path.join(evidenceRoot, name), fullPage: false });
}

async function gotoReady(page: Page, target: string) {
  await page.goto(target);
  await expect(page.locator("html")).toHaveAttribute("data-app-ready", "true");
}

async function expectNoSeriousAxeIssues(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"]).analyze();
  const severe = results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
  expect(severe, severe.map((item) => `${item.id}: ${item.help}`).join("\n")).toEqual([]);
}

function captureConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

const homeCases = [
  { locale: "en", path: "/", width: 1440, height: 900, theme: "light" },
  { locale: "zh", path: "/zh-cn/", width: 768, height: 1024, theme: "dark" },
  { locale: "en", path: "/", width: 390, height: 844, theme: "dark" },
  { locale: "zh", path: "/zh-cn/", width: 360, height: 800, theme: "light" },
] as const;

for (const scenario of homeCases) {
  test(`home ${scenario.locale} ${scenario.width}x${scenario.height} ${scenario.theme}`, async ({ page }) => {
    const errors = captureConsoleErrors(page);
    await page.setViewportSize({ width: scenario.width, height: scenario.height });
    await page.addInitScript((theme) => window.localStorage.setItem("fichil-theme", theme), scenario.theme);
    await gotoReady(page, scenario.path);
    const tabs = page.getByRole("tablist").getByRole("tab");
    await expect(tabs).toHaveCount(4);
    await expect(page.getByRole("tablist").locator('[role="tab"][tabindex="0"]')).toHaveCount(1);
    const controlledPanels = await tabs.evaluateAll((elements) => elements.map((element) => element.getAttribute("aria-controls")));
    for (const panelId of controlledPanels) await expect(page.locator(`#${panelId}`)).toHaveCount(1);
    await page.getByRole("tab", { name: /OBSERVE/ }).press("ArrowRight");
    const isolateTab = page.getByRole("tab", { name: /ISOLATE/ });
    await expect(isolateTab).toHaveAttribute("aria-selected", "true");
    const activePanelId = await isolateTab.getAttribute("aria-controls");
    await expect(page.locator(`#${activePanelId}`)).toBeVisible();
    await expect(page.locator(`#${activePanelId}`)).toHaveAttribute("aria-labelledby", await isolateTab.getAttribute("id") ?? "");
    await expect(page.locator('img[src*="author-fichil"], link[rel="preload"][href*="author-fichil"]')).toHaveCount(0);

    const metrics = await page.evaluate(() => ({
      viewport: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      ctaBottom: document.querySelector(".hero-actions")?.getBoundingClientRect().bottom ?? 0,
      latestTop: document.querySelector(".latest-section")?.getBoundingClientRect().top ?? 0,
      avatarRequests: performance.getEntriesByType("resource").filter((entry) => entry.name.includes("author-fichil")).length,
    }));
    expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.viewport);
    expect(metrics.avatarRequests).toBe(0);
    if (scenario.width <= 390) {
      expect(metrics.ctaBottom).toBeLessThanOrEqual(scenario.height);
      expect(metrics.latestTop).toBeLessThanOrEqual(1100);
    }
    await expectNoSeriousAxeIssues(page);
    await saveEvidence(page, `home-${scenario.locale}-${scenario.width}x${scenario.height}-${scenario.theme}.png`);
    expect(errors).toEqual([]);
  });
}

test("mobile menu restores focus, focuses same-page targets, and closes across breakpoints", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoReady(page, "/");
  const trigger = page.getByRole("button", { name: "Open navigation" });
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();

  await trigger.click();
  await page.getByRole("link", { name: "Services" }).click();
  await page.waitForTimeout(300);
  await expect(page.locator("#services")).toBeFocused();

  await page.evaluate(() => window.scrollTo(0, 0));
  await trigger.click();
  await page.setViewportSize({ width: 1200, height: 900 });
  await expect(page.locator("#mobile-site-nav")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Fichil home" })).toBeFocused();
});

test("theme selection persists and reduced motion removes nonessential animation", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await gotoReady(page, "/");
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-app-ready", "true");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const duration = await page.locator(".signal-ring-outer").evaluate((element) => getComputedStyle(element).animationDuration);
  expect(["0.01ms", "1e-05s"]).toContain(duration);
});

test("blog keeps categories and pagination compact", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoReady(page, "/blog/");
  await expect(page.locator(".category-nav a")).toHaveCount(7);
  await expect(page.getByRole("link", { name: /All categories/ })).toBeVisible();
  await expect(page.locator(".blog-grid .post-card-featured")).toHaveCount(1);
  await expect(page.getByRole("navigation", { name: "Pagination" }).locator("a[aria-current=page]")).toHaveText("1");
  const metrics = await page.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width);
  await expectNoSeriousAxeIssues(page);
  await saveEvidence(page, "blog-en-390x844-light.png");
});

test("article TOC, copy feedback, progress, and back-to-top stay accessible", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.setViewportSize({ width: 390, height: 844 });
  await gotoReady(page, "/blog/windows-excluded-port-debugger-bind-failure/");
  const toc = page.locator("details.toc-mobile");
  await expect(toc).not.toHaveAttribute("open", "");
  await toc.locator("summary").click();
  const firstTocLink = toc.locator("nav a").first();
  const targetId = (await firstTocLink.getAttribute("href"))?.slice(1) ?? "";
  await firstTocLink.click();
  await page.waitForTimeout(300);
  await expect(page.locator(`#${targetId}`)).toBeFocused();

  const copyButton = page.locator(".code-copy").first();
  await copyButton.click();
  await expect(copyButton).toHaveText("Copied");
  await expect(page.locator('.article-main .sr-only[role="status"]')).toHaveText("Copied");

  await page.waitForTimeout(1900);
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, "writeText", {
      configurable: true,
      value: async () => { throw new Error("synthetic clipboard failure"); },
    });
  });
  await copyButton.click();
  await expect(copyButton).toHaveText("Copy failed");
  await expect(page.locator('.article-main .sr-only[role="status"]')).toHaveText("Copy failed");

  const scrollToFooter = async () => {
    await expect.poll(() => page.evaluate(async () => {
      document.documentElement.style.scrollBehavior = "auto";
      window.scrollTo(0, document.documentElement.scrollHeight);
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      return document.documentElement.scrollHeight - window.innerHeight - window.scrollY;
    })).toBeLessThanOrEqual(2);
  };
  const expectBackToTopClear = async () => {
    const geometry = await page.evaluate(() => {
      const button = document.querySelector<HTMLElement>(".back-to-top");
      if (!button) return { hit: false, overlap: true };
      const buttonRect = button.getBoundingClientRect();
      const center = document.elementFromPoint(buttonRect.left + buttonRect.width / 2, buttonRect.top + buttonRect.height / 2);
      const targets = document.querySelectorAll<HTMLElement>(".site-footer a, .site-footer > div:last-child");
      const overlap = Array.from(targets).some((target) => {
        const rect = target.getBoundingClientRect();
        return buttonRect.left < rect.right && buttonRect.right > rect.left && buttonRect.top < rect.bottom && buttonRect.bottom > rect.top;
      });
      return { hit: center === button || button.contains(center), overlap };
    });
    expect(geometry).toEqual({ hit: true, overlap: false });
  };

  await scrollToFooter();
  const backToTop = page.getByRole("button", { name: "Back to top" });
  await expect(backToTop).toBeVisible();
  await expectBackToTopClear();
  await saveEvidence(page, "article-footer-en-390x844-light.png");
  await backToTop.click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(2);
  await expect(page.locator(".article-header h1")).toBeFocused();
  await toc.locator("summary").click();
  await expectNoSeriousAxeIssues(page);
  await toc.locator("summary").click();
  await saveEvidence(page, "article-en-390x844-light.png");

  await page.setViewportSize({ width: 1440, height: 900 });
  await scrollToFooter();
  await expectBackToTopClear();
});

test("200 percent zoom reflows without page-level horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await gotoReady(page, "/zh-cn/blog/");
  await page.evaluate(() => { document.documentElement.style.zoom = "2"; });
  const metrics = await page.evaluate(() => ({ width: window.innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.width);
});

test.describe("admin comment governance", () => {
  test.use({ extraHTTPHeaders: { "oai-authenticated-user-id": "e2e-owner", "oai-authenticated-user-email": "e2e@example.com" } });

  test("filters, refreshes, and confirms deletion without locking other records", async ({ page }) => {
    const items = [
      { id: "11111111-1111-4111-8111-111111111111", article_slug: "windows-excluded-port-debugger-bind-failure", locale: "en", parent_id: null, depth: 0, author_kind: "human", display_name: "Alex", agent_family: null, model_name: null, body: "Useful verification evidence.", status: "public", created_at: "2026-08-30T10:00:00.000Z" },
      { id: "22222222-2222-4222-8222-222222222222", article_slug: "typora-pandoc-multi-format-export", locale: "zh-cn", parent_id: null, depth: 0, author_kind: "ai", display_name: "Review Agent", agent_family: "test", model_name: "synthetic", body: "需要进一步核对。", status: "hidden", created_at: "2026-08-30T11:00:00.000Z" },
    ];
    await page.route("**/api/admin/ai-blog/comments**", async (route) => {
      if (route.request().method() === "GET") return route.fulfill({ json: { items, limit: 200 } });
      const id = route.request().url().split("/").pop() ?? "";
      const { action } = route.request().postDataJSON() as { action: "hide" | "restore" | "delete" };
      const current = items.find((item) => item.id === id)!;
      const updated = action === "delete"
        ? { ...current, display_name: "Removed comment", body: "", status: "deleted" }
        : { ...current, status: action === "hide" ? "hidden" : "public" };
      items.splice(items.indexOf(current), 1, updated);
      return route.fulfill({ json: { comment: updated } });
    });

    await page.setViewportSize({ width: 390, height: 844 });
    await gotoReady(page, "/admin/ai-blog/comments/");
    await expect(page.locator(".admin-stats")).toContainText("2");
    await page.getByPlaceholder("Author, model, article, or comment text").fill("Alex");
    await expect(page.locator(".admin-comment")).toHaveCount(1);
    await page.getByPlaceholder("Author, model, article, or comment text").fill("");
    await page.locator(".admin-toolbar select").nth(0).selectOption("hidden");
    await expect(page.locator(".admin-comment")).toHaveCount(1);
    await page.locator(".admin-toolbar select").nth(0).selectOption("");

    const firstCard = page.locator(".admin-comment").filter({ hasText: "windows-excluded-port-debugger-bind-failure" });
    const otherCard = page.locator(".admin-comment").filter({ hasText: "Review Agent" });
    await firstCard.getByRole("button", { name: "Delete permanently" }).click();
    await expect(firstCard).toContainText("This permanently clears");
    await expect(otherCard.getByRole("button", { name: "Restore" })).toBeEnabled();
    await firstCard.getByRole("button", { name: "Confirm permanent deletion" }).click();
    await expect(firstCard).toContainText("[removed]");
    await expect(page.locator('[role="status"]')).toContainText("Comment updated");
    await expectNoSeriousAxeIssues(page);
    await saveEvidence(page, "admin-en-390x844-light.png");
  });

  test("initial admin error can retry into the empty state", async ({ page }) => {
    let calls = 0;
    await page.route("**/api/admin/ai-blog/comments", async (route) => {
      calls += 1;
      if (calls === 1) return route.fulfill({ status: 503, json: { error: "synthetic" } });
      return route.fulfill({ json: { items: [], limit: 200 } });
    });
    await gotoReady(page, "/admin/ai-blog/comments/");
    await expect(page.getByRole("alert")).toBeVisible();
    await page.getByRole("button", { name: "Try again" }).click();
    await expect(page.getByText("No comments match these filters.")).toBeVisible();
  });
});
