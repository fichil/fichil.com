import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { PostCard } from "@/components/PostCard";
import { getPosts, getSiteCopy, localizedPath, type Locale } from "@/lib/content";
import { labels } from "@/lib/i18n";

export function HomePage({ locale }: { locale: Locale }) {
  const site = getSiteCopy(locale);
  const copy = labels[locale];
  const alternate = locale === "en" ? "/zh-cn/" : "/";
  const latest = getPosts(locale).slice(0, 6);
  return (
    <AppShell locale={locale} alternatePath={alternate}>
      <section className="hero section-grid">
        <div className="hero-copy">
          <div className="eyebrow"><span>01</span>{site.hero.intro}</div>
          <h1>{site.hero.title}</h1>
          <h2>{site.hero.subtitle}</h2>
          <p>{site.hero.content}</p>
          <div className="hero-actions"><Link className="button button-primary" href={localizedPath(locale, "/blog/")}>{site.hero.buttonName}</Link><Link className="button button-quiet" href="#contact">{copy.nav.contact}</Link></div>
        </div>
        <div className="systems-panel" aria-label="Engineering workflow">
          <div className="panel-top"><span>fichil.engineering</span><span className="panel-state">LIVE</span></div>
          <div className="terminal-line"><span>$</span> trace --system logistics</div>
          <div className="flow-stack">
            <div><span>API</span><small>contracts · validation</small></div>
            <i aria-hidden="true" />
            <div><span>OPS</span><small>linux · nginx · docker</small></div>
            <i aria-hidden="true" />
            <div><span>FLOW</span><small>wms · tms · erp</small></div>
          </div>
          <div className="panel-result"><span>status</span><strong>problem isolated</strong></div>
        </div>
      </section>

      <section className="section latest-section">
        <div className="section-heading"><div><div className="eyebrow"><span>02</span>{copy.nav.blog}</div><h2>{copy.latestTitle}</h2><p>{copy.latestNote}</p></div><Link className="text-link" href={localizedPath(locale, "/blog/")}>{copy.allNotes} <span aria-hidden="true">→</span></Link></div>
        <div className="post-grid">{latest.map((post, index) => <PostCard key={post.slug} locale={locale} post={post} featured={index === 0} />)}</div>
      </section>

      <section id="about" className="section split-section">
        <div className="section-heading sticky-heading"><div className="eyebrow"><span>03</span>{copy.nav.about}</div><h2>{site.about.title}</h2></div>
        <div className="about-content"><div className="prose compact-prose" dangerouslySetInnerHTML={{ __html: site.about.html }} /><h3>{site.about.skillsTitle}</h3><div className="skill-grid">{site.about.skills.map((skill, index) => <div key={skill}><span>{String(index + 1).padStart(2, "0")}</span>{skill}</div>)}</div></div>
      </section>

      <section id="projects" className="section">
        <div className="section-heading"><div><div className="eyebrow"><span>04</span>{copy.nav.projects}</div><h2>{site.projects.title}</h2></div></div>
        <div className="project-grid">{site.projects.items.map((project, index) => <article className="project-card" key={project.title}><div className="project-number">0{index + 1}</div><div className="chip-row">{project.badges.map((badge) => <span className="chip" key={badge}>{badge}</span>)}</div><h3>{project.title}</h3><p>{project.content}</p>{project.actionLink && project.actionName ? <Link className="text-link" href={project.actionLink}>{project.actionName} <span aria-hidden="true">↗</span></Link> : null}</article>)}</div>
      </section>

      <section id="contact" className="contact-section section-grid">
        <div><div className="eyebrow"><span>05</span>{copy.nav.contact}</div><h2>{site.contact.title}</h2></div>
        <div><p>{site.contact.content}</p><Link className="button button-primary" href={site.contact.buttonLink}>{site.contact.buttonName}</Link></div>
      </section>
    </AppShell>
  );
}
