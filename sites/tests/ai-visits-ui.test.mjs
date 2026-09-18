import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { tsImport } from "tsx/esm/api";

const tsImportOptions = {
  parentURL: import.meta.url,
  tsconfig: fileURLToPath(new URL("../tsconfig.json", import.meta.url)),
};
const { formatAiVisitTime } = await tsImport("../lib/ai-engagement-contract.ts", tsImportOptions);
const { VisitRecords } = await tsImport("../components/AiVisits.tsx", tsImportOptions);
const { AiEngagement } = await tsImport("../components/AiEngagement.tsx", tsImportOptions);
const renderPage = (page, locale = "zh-cn") => renderToStaticMarkup(createElement(VisitRecords, { page, locale, onMore() {}, onRetry() {} }));

test("visit times always use Beijing time including cross-day and midnight boundaries", () => {
  assert.equal(formatAiVisitTime("2026-09-11T16:01:02.000Z"), "2026-09-12 00:01:02 UTC+08:00");
  assert.equal(formatAiVisitTime("2026-09-11T16:00:00.000Z"), "2026-09-12 00:00:00 UTC+08:00");
});

test("visit records render independently without comments and escape self-declared names", () => {
  const page = { status: "ready", nextCursor: "next", items: [{ id: "one", agent_family: "self-declared", agent_name: "<script>attack()</script>", detection_source: "self-declared", visited_at: "2026-09-11T16:01:02.000Z", request_kind: "json", identity_verified: false }] };
  const html = renderPage(page);
  assert.match(html, /AI 浏览记录/);
  assert.match(html, /2026-09-12 00:01:02 UTC\+08:00/);
  assert.match(html, /&lt;script&gt;attack\(\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /身份未验证/);
  assert.match(html, /加载更多/);
  assert.match(renderPage(page, "en"), /AI visit records/);
});

test("loading and failed visit records never render an empty-success message", () => {
  for (const status of ["loading", "error"]) {
    const html = renderPage({ status, items: [], nextCursor: null });
    assert.doesNotMatch(html, /暂无逐次浏览记录/);
    assert.match(html, status === "loading" ? /正在加载浏览记录/ : /浏览记录暂时无法加载/);
  }
  assert.match(renderPage({ status: "ready", items: [], nextCursor: null }), /暂无逐次浏览记录/);
});

test("article engagement initially exposes visits and opt-in instructions without claiming zero comments", () => {
  for (const locale of ["en", "zh-cn"]) {
    const html = renderToStaticMarkup(createElement(AiEngagement, { locale, slug: "example" }));
    assert.match(html, locale === "en" ? /AI visit records/ : /AI 浏览记录/);
    assert.match(html, locale === "en" ? /user authorization/ : /用户授权/);
    assert.match(html, /idempotency_key/);
    assert.doesNotMatch(html, /No comments yet|暂时没有评论/);
  }
});
