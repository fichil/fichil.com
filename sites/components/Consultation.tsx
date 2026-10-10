"use client";

import { useState } from "react";
import type { Locale } from "@/lib/content";

export function Consultation({ locale, template, mailto }: { locale: Locale; template: string; mailto: string }) {
  const zh = locale === "zh-cn";
  const [status, setStatus] = useState("");
  async function copy() {
    try { await navigator.clipboard.writeText(template); setStatus(zh ? "模板已复制，可粘贴到邮件中。" : "Template copied. Paste it into your email."); }
    catch { setStatus(zh ? "未能自动复制，请选中下方文字复制。" : "Copy was unavailable. Select the text below to copy it."); }
  }
  return <section id="enquire" className="consultation" aria-labelledby="consultation-title" tabIndex={-1}>
    <div><span className="eyebrow">{zh ? "从一句话开始" : "Start with a short description"}</span><h2 id="consultation-title">{zh ? "把需要的结果发给我" : "Tell me the result you need"}</h2>
      <p>{zh ? "不必先写完整方案。按下面几项说明，暂时不确定的可以留空。" : "You do not need a full specification. Use these prompts and leave anything you do not know blank."}</p>
      <div className="hero-actions"><a className="button button-primary" data-contact-placement="template" href={mailto}>{zh ? "用邮件填写需求" : "Open the email template"}</a><button type="button" className="button button-quiet" onClick={copy}>{zh ? "复制需求模板" : "Copy the template"}</button></div>
      <p className="consultation-address">fichilzhang@gmail.com</p><p className="service-note">{zh ? "按钮会打开你的邮件应用。请检查内容并自行发送；也可以复制模板到网页邮箱。" : "The button opens your email app. Review and send the message yourself, or paste the template into webmail."}</p>
      <p role="status">{status}</p>
    </div>
    <pre tabIndex={0} aria-label={zh ? "需求邮件模板" : "Enquiry email template"}>{template}</pre>
  </section>;
}
