import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { Consultation } from "@/components/Consultation";
import { consultationMailto, getServiceCopy, localizedPath, servicePath, type Locale } from "@/lib/content";

export function ServicePage({ locale }: { locale: Locale }) {
  const copy = getServiceCopy(locale);
  const zh = locale === "zh-cn";
  return <AppShell locale={locale} alternatePath={servicePath(zh ? "en" : "zh-cn")}>
    <div className="service-page">
    <header className="service-hero">
      <a className="text-link" href={localizedPath(locale, "/")}>{zh ? "← 首页" : "← Home"}</a>
      <p className="eyebrow">{copy.eyebrow}</p><h1>{copy.title}</h1><p className="service-lead">{copy.intro}</p>
      <div className="hero-actions"><a href="#enquire" className="button button-primary">{copy.cta}</a><Link className="text-link" href={localizedPath(locale, "/#projects")}>{zh ? "查看工程案例" : "Review engineering cases"} →</Link></div>
      <p className="service-note">{copy.scope_note}</p><ul className="service-highlights">{copy.highlights.map(item => <li key={item}>{item}</li>)}</ul>
    </header>
    <div className="service-body"><article className="prose" dangerouslySetInnerHTML={{ __html: copy.html }} /></div>
    <Consultation locale={locale} template={copy.request_template} mailto={consultationMailto(locale)} />
    </div>
  </AppShell>;
}
