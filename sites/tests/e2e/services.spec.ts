import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

for (const locale of ["en", "zh-cn"] as const) {
  for (const [width, height] of [[390, 844], [360, 800]]) {
    test(`service journey ${locale} ${width}`, async ({ page }) => {
      const prefix = locale === "zh-cn" ? "/zh-cn" : "";
      await page.setViewportSize({ width, height });
      const folder = path.join(process.cwd(), "work/service-acquisition/screenshots");
      await mkdir(folder, { recursive: true });
      await page.goto(`${prefix}/`);
      await expect(page.locator("html")).toHaveAttribute("data-app-ready", "true");
      const primary = page.locator(".hero-actions a").first();
      await expect(primary).toHaveAttribute("href", `${prefix}/services/excel-csv-automation/`);
      expect((await primary.boundingBox())!.y + (await primary.boundingBox())!.height).toBeLessThan(height);
      await expect(page.locator("#projects")).toHaveCount(1); await expect(page.locator(".latest-section")).toHaveCount(1);
      await page.screenshot({ path: path.join(folder, `home-${locale}-${width}.png`) });
      await primary.click();
      await expect(page).toHaveURL(new RegExp(`${prefix}/services/excel-csv-automation/`));
      await expect(page.locator("html")).toHaveAttribute("data-app-ready", "true");
      await expect(page.locator("h1")).toContainText("Excel / CSV");
      await expect(page.locator(".service-highlights")).toContainText(locale === "zh-cn" ? "一轮集中修改" : "One consolidated revision");
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const axe = await new AxeBuilder({ page }).analyze();
      expect(axe.violations.filter(v => ["critical", "serious"].includes(v.impact || ""))).toEqual([]);
      await page.screenshot({ path: path.join(folder, `service-${locale}-${width}-full.png`), fullPage: true });
      await page.screenshot({ path: path.join(folder, `service-${locale}-${width}.png`) });
      const email = page.locator('#enquire a[href^="mailto:"]');
      const mailto = new URL((await email.getAttribute("href"))!);
      expect(mailto.pathname).toBe("fichilzhang@gmail.com");
      expect(mailto.searchParams.get("body")).toBe((await page.locator("#enquire pre").textContent())!.trimEnd());
      await page.locator('.service-hero a[href="#enquire"]').click();
      await expect(email).toBeVisible();
      const activations: unknown[] = [];
      await page.route("**/api/services/v1/contact-click", route => { activations.push(route.request().postDataJSON()); return route.fulfill({ status: 503 }); });
      // Prevent the test from opening a real email client; still dispatch the normal click event.
      await page.evaluate(() => document.addEventListener("click", e => { if ((e.target as Element)?.closest('a[href^="mailto:"]')) e.preventDefault(); }, { capture: true }));
      await email.click();
      await expect.poll(() => activations.length).toBe(1);
      expect(activations[0]).toEqual({ locale, surface: "service", source: "internal", placement: "template" });
      await expect(email).toHaveAttribute("href", /^mailto:fichilzhang@gmail.com/);
      await page.screenshot({ path: path.join(folder, `contact-${locale}-${width}.png`) });
    });
  }
}

test("private metrics show unavailable state and separate automation, unknown requests and email activations", async ({ page }) => {
  await page.setExtraHTTPHeaders({ "oai-authenticated-user-id": "e2e-owner", "oai-authenticated-user-email": "e2e@example.com" });
  await page.setViewportSize({ width: 360, height: 800 });
  let fail = true;
  await page.route("**/api/admin/services/metrics?**", route => fail ? route.fulfill({ status: 503, json: { available: false } }) : route.fulfill({ json: { available: true, since: "2026-09-01", until: "2026-09-22", timezone: "UTC", items: [{ event_kind: "service_read", locale: "en", surface: "service", source: "other_referral", placement: "service", request_class: "detected_automation", request_count: 100 }, { event_kind: "contact_click", locale: "zh-cn", surface: "service", source: "github", placement: "template", request_class: "unknown", request_count: 3 }] } }));
  await page.goto("/admin/services/metrics?ui=zh-cn");
  await expect(page.getByRole("alert")).toContainText("无法据此判断为零");
  await expect(page.locator(".metrics-grid")).toHaveCount(0);
  fail = false; await page.getByRole("button", { name: "刷新" }).click();
  await expect(page.locator(".metrics-grid section")).toHaveCount(4);
  await expect(page.locator(".metrics-grid")).toContainText("无法判定");
  await expect(page.locator(".metrics-grid")).toContainText("100");
  await expect(page.getByText("有效咨询请以邮箱中实际收到并确认有明确需求的消息为准。这里不计算咨询转化率。")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const folder = path.join(process.cwd(), "work/service-acquisition/screenshots"); await mkdir(folder, { recursive: true });
  await page.screenshot({ path: path.join(folder, "metrics-zh-cn-360.png"), fullPage: true });
});
