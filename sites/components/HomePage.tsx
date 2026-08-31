import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { EngineeringSignalCore } from "@/components/EngineeringSignalCore";
import { PostCard } from "@/components/PostCard";
import { ScrollReveal } from "@/components/ScrollReveal";
import { articlePath, getBuildInfo, getPosts, getSiteCopy, getTerms, localizedPath, taxonomyPath, type Locale } from "@/lib/content";
import { labels } from "@/lib/i18n";

export function HomePage({ locale }: { locale: Locale }) {
  const site = getSiteCopy(locale);
  const copy = labels[locale];
  const alternate = locale === "en" ? "/zh-cn/" : "/";
  const posts = getPosts(locale);
  const latest = posts.slice(0, 3);
  const categories = getTerms(locale, "categories").slice(0, 6);
  const blogPath = localizedPath(locale, "/blog/");
  const build = getBuildInfo();
  return (
    <AppShell locale={locale} alternatePath={alternate}>
      <ScrollReveal />
      <section className="hero section-grid" data-reveal>
        <div className="hero-copy">
          <div className="eyebrow"><span>01</span>{site.hero.intro}</div>
          <h1>{site.hero.title}</h1>
          <h2>{site.hero.subtitle}</h2>
          <p>{site.hero.content}</p>
          <div className="hero-actions"><Link className="button button-primary" href={latest[0] ? articlePath(locale, latest[0].slug) : blogPath}>{site.hero.buttonName}</Link><Link className="button button-quiet" href={blogPath}>{site.hero.secondaryButtonName}</Link></div>
        </div>
        <EngineeringSignalCore commit={build.commit} signal={site.hero.signal} />
      </section>

      <section className="trust-strip" aria-label={locale === "zh-cn" ? "公开信任证据" : "Public trust evidence"} data-reveal>
        <div><strong>{posts.length}</strong><span>{site.trust.postsLabel}</span></div>
        <a href="https://github.com/fichil/fichil.com"><strong>{site.trust.sourceValue}</strong><span>{site.trust.sourceLabel}</span></a>
        <a href="/version.json"><strong>{site.trust.releaseValue}</strong><span>{site.trust.releaseLabel}</span></a>
      </section>

      <section className="section latest-section" data-reveal>
        <div className="section-heading"><div><div className="eyebrow"><span>02</span>{copy.nav.blog}</div><h2>{copy.latestTitle}</h2><p>{copy.latestNote}</p></div><Link className="text-link" href={blogPath}>{copy.allNotes} <span aria-hidden="true">→</span></Link></div>
        <div className="post-grid latest-grid">{latest.map((post, index) => <PostCard featured={index === 0} key={post.slug} locale={locale} post={post} />)}</div>
      </section>

      <section className="section topic-section" data-reveal>
        <div className="section-heading"><div><div className="eyebrow"><span>03</span>{copy.topicsKicker}</div><h2>{copy.topicsTitle}</h2><p>{copy.topicsNote}</p></div></div>
        <nav className="topic-grid topic-grid-home" aria-label={copy.categories}>{categories.map((category, index) => <Link href={taxonomyPath(locale, "categories", category.slug)} key={category.slug}><span>0{index + 1}</span><strong>{category.name}</strong><small>{category.count} {copy.articles}</small><i aria-hidden="true">↗</i></Link>)}<Link className="topic-all" href={taxonomyPath(locale, "categories")}><span>ALL</span><strong>{copy.allCategories}</strong><i aria-hidden="true">→</i></Link></nav>
      </section>

      <section id="services" className="section service-section" data-reveal tabIndex={-1}>
        <div className="section-heading"><div><div className="eyebrow"><span>04</span>{copy.nav.about}</div><h2>{site.services.title}</h2><p>{site.services.intro}</p></div></div>
        <div className="service-grid">{site.services.items.map((service, index) => <article className="service-card" key={service.title}><div className="service-index">0{index + 1}</div><h3>{service.title}</h3><p>{service.content}</p><div className="chip-row">{service.badges.map((badge) => <span className="chip" key={badge}>{badge}</span>)}</div></article>)}</div>
      </section>

      <section id="projects" className="section" data-reveal tabIndex={-1}>
        <div className="section-heading"><div><div className="eyebrow"><span>05</span>{copy.nav.projects}</div><h2>{site.projects.title}</h2><p>{site.projects.intro}</p></div></div>
        <div className="case-stack">{site.projects.items.map((project, index) => <article className="case-card" key={project.title}>
          <div className="case-rail"><span>0{index + 1}</span><small>{project.kicker}</small></div>
          <div className="case-body"><div className="chip-row">{project.badges.map((badge) => <span className="chip" key={badge}>{badge}</span>)}</div><h3>{project.title}</h3><p className="case-summary">{project.content}</p>
            <div className="case-evidence"><div><h4>{copy.caseScope}</h4><ul>{project.scope.map((item) => <li key={item}>{item}</li>)}</ul></div><div><h4>{copy.caseEvidence}</h4><ul>{project.outcomes.map((item) => <li key={item}>{item}</li>)}</ul></div></div>
            <div className="case-links">{project.actionLink && project.actionName ? <Link className="button button-primary" href={project.actionLink}>{project.actionName}</Link> : null}<div>{project.proofLinks.map((proof) => <Link className="text-link" href={proof.link} key={proof.link}>{proof.name} <span aria-hidden="true">→</span></Link>)}</div></div>
          </div>
        </article>)}</div>
      </section>

      <section id="about" className="section split-section" data-reveal tabIndex={-1}>
        <div className="section-heading sticky-heading"><div className="eyebrow"><span>06</span>{copy.workingMethod}</div><h2>{site.about.title}</h2></div>
        <div className="about-content"><div className="prose compact-prose" dangerouslySetInnerHTML={{ __html: site.about.html }} /><h3>{site.about.skillsTitle}</h3><div className="skill-grid">{site.about.skills.map((skill, index) => <div key={skill}><span>{String(index + 1).padStart(2, "0")}</span>{skill}</div>)}</div></div>
      </section>

      <section id="contact" className="contact-section section-grid" data-reveal tabIndex={-1}>
        <div><div className="eyebrow"><span>07</span>{copy.nav.contact}</div><h2>{site.contact.title}</h2></div>
        <div><p>{site.contact.content}</p><Link className="button button-primary" href={site.contact.buttonLink}>{site.contact.buttonName}</Link></div>
      </section>
    </AppShell>
  );
}
