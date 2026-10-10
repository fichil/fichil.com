"use client";

import { useCallback, useEffect, useState } from "react";
import type { Locale } from "@/lib/content";

interface Row { locale: Locale; event_kind: "service_read" | "contact_click"; surface: string; source: string; placement: string; request_class: "detected_automation" | "unknown"; request_count: number; }
interface Report { available: true; since: string; until: string; timezone: "UTC"; items: Row[]; }
const sourceNames: Record<string, [string, string]> = { direct_or_unknown: ["Direct / unavailable", "直接或来源不可用"], internal: ["Internal link", "站内链接"], other_campaign: ["Other campaign", "其他来源标签"], other_referral: ["Other referral", "其他外部链接"], newsletter: ["Newsletter", "邮件订阅"] };
const surfaceNames: Record<string, [string, string]> = { home: ["Home", "首页"], service: ["Service", "服务页"], article: ["Article", "文章"], other: ["Other", "其他"] };
const placementNames: Record<string, [string, string]> = { hero: ["Hero", "首屏"], service: ["Service", "服务页"], template: ["Template", "需求模板"], contact: ["Contact", "联系区"], footer: ["Footer", "页脚"], article: ["Article", "正文"], other: ["Other", "其他"] };

export function ServiceMetrics({ locale }: { locale: Locale }) {
  const zh = locale === "zh-cn";
  const [days, setDays] = useState("30");
  const [report, setReport] = useState<Report | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const load = useCallback(async (signal?: AbortSignal) => {
    setState("loading"); setReport(null);
    try {
      const response = await fetch(`/api/admin/services/metrics?days=${days}`, { cache: "no-store", signal });
      if (!response.ok) throw new Error("metrics unavailable");
      const value = await response.json();
      if (!value.available || !Array.isArray(value.items)) throw new Error("metrics unavailable");
      if (!signal?.aborted) { setReport(value); setState("ready"); }
    } catch { if (!signal?.aborted) setState("error"); }
  }, [days]);
  useEffect(() => { const controller = new AbortController(); const timer = setTimeout(() => { void load(controller.signal); }, 0); return () => { clearTimeout(timer); controller.abort(); }; }, [load]);
  const name = (map: Record<string, [string, string]>, value: string) => map[value]?.[zh ? 1 : 0] ?? value;
  const eventName = (event: string) => event === "service_read" ? (zh ? "服务页读取请求" : "Service read requests") : (zh ? "邮件入口点击" : "Email link activations");
  const className = (kind: string) => kind === "unknown" ? (zh ? "无法判定" : "Unclassified") : (zh ? "检测到自动化标识" : "Detected automation");
  return <main className="service-metrics">
    <a href={zh ? "/zh-cn/" : "/"}>{zh ? "返回网站" : "Back to the site"}</a><h1>{zh ? "服务入口统计" : "Service entry metrics"}</h1>
    <p>{zh ? "这些是请求和点击次数，含重复记录。无法判定的请求不能当作真人；点击邮件入口也不代表邮件已发送或已收到有效咨询。" : "These are request and activation counts, including repeats. Unclassified traffic is not verified human traffic, and activating an email link does not mean a message was sent or a qualified enquiry received."}</p>
    <p>{zh ? "有效咨询请以邮箱中实际收到并确认有明确需求的消息为准。这里不计算咨询转化率。" : "Confirm qualified enquiries from messages actually received with a clear need. No enquiry conversion rate is calculated here."}</p>
    <div className="metrics-controls"><label>{zh ? "统计范围" : "Period"} <select value={days} disabled={state === "loading"} onChange={event => setDays(event.target.value)}>{[7, 30, 90].map(value => <option key={value} value={value}>{zh ? `最近 ${value} 天` : `Last ${value} days`}</option>)}</select></label><button type="button" className="button button-quiet" disabled={state === "loading"} onClick={() => { void load(); }}>{zh ? "刷新" : "Refresh"}</button></div>
    {state === "loading" ? <p role="status">{zh ? "正在读取统计…" : "Loading metrics…"}</p> : null}
    {state === "error" ? <p role="alert">{zh ? "统计暂时不可用，请确认管理员登录后重试。无法据此判断为零。" : "Metrics are unavailable. Check your administrator sign-in and retry; this does not establish a zero count."}</p> : null}
    {report ? <><p>{report.since} — {report.until} · UTC</p><div className="metrics-grid">{(["service_read", "contact_click"] as const).flatMap(event => (["unknown", "detected_automation"] as const).map(kind => <section key={`${event}:${kind}`}><h2>{eventName(event)}</h2><p>{className(kind)}</p><strong>{report.items.filter(row => row.event_kind === event && row.request_class === kind).reduce((sum, row) => sum + Number(row.request_count), 0)}</strong></section>))}</div>
      {!report.items.length ? <p>{zh ? "这段时间尚无已记录的数据。" : "No recorded data in this period."}</p> : <div className="metrics-table" tabIndex={0} role="region" aria-label={zh ? "按来源与入口划分的次数" : "Counts by source and entry point"}><table><caption>{zh ? "按来源与入口划分" : "Source and entry breakdown"}</caption><thead><tr>{(zh ? ["事件", "语言", "页面", "来源", "入口", "请求分类", "次数"] : ["Event", "Language", "Page", "Source", "Entry", "Request class", "Count"]).map(title => <th scope="col" key={title}>{title}</th>)}</tr></thead><tbody>{report.items.map((row, index) => <tr key={index}><td>{eventName(row.event_kind)}</td><td>{row.locale}</td><td>{name(surfaceNames, row.surface)}</td><td>{name(sourceNames, row.source)}</td><td>{name(placementNames, row.placement)}</td><td>{className(row.request_class)}</td><td>{row.request_count}</td></tr>)}</tbody></table></div>}</> : null}
    <details className="metrics-method"><summary>{zh ? "统计口径与隐私" : "Method and privacy"}</summary><ul>
      <li>{zh ? "服务读取只计成功返回的服务页 HTML 或非预取的导航响应；包含缓存命中和重复请求。失败、重定向、HEAD、预取及范围请求不计入。" : "Service reads count successful HTML or non-prefetch navigation responses, including cache hits and repeats. Failures, redirects, HEAD, prefetch and range requests are excluded."}</li>
      <li>{zh ? "邮件入口点击来自启用 JavaScript 的页面；脚本被禁用、拦截或请求丢失时会漏记。点击分类及来源未经身份验证，也可能被伪造。" : "Email activations rely on JavaScript. Disabled or blocked scripts and lost requests can undercount. Identity and source labels are unverified and can be spoofed."}</li>
      <li>{zh ? "来源按当前页面的白名单 utm_source 或上一跳链接归类；缺少来源时归入直接或不可用。不追踪跨页访客路径。" : "Source uses allowlisted utm_source values or the preceding link. Missing referrers are grouped with direct traffic. Visitor journeys are not tracked across pages."}</li>
      <li>{zh ? "只保存 UTC 日期、固定类别和累计次数；不保存 IP、完整 User-Agent、原始来源网址、敏感查询参数、邮件正文或访客标识，不使用统计 Cookie。" : "Only UTC dates, bounded categories and totals are saved. No IPs, full User-Agent, raw referrers, sensitive query values, email content, visitor identifiers or analytics cookies are stored."}</li>
    </ul></details>
  </main>;
}
