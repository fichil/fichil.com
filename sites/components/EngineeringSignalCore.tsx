"use client";

import Link from "next/link";
import { useId, useRef, useState } from "react";
import type { SiteCopy } from "@/lib/content";

type EngineeringSignalCoreProps = {
  commit: string;
  signal: SiteCopy["hero"]["signal"];
};

export function EngineeringSignalCore({ commit, signal }: EngineeringSignalCoreProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const tabId = useId();
  const tabsRef = useRef<Array<HTMLButtonElement | null>>([]);
  const shortCommit = commit.slice(0, 8);

  function select(index: number, moveFocus = false) {
    setActiveIndex(index);
    if (moveFocus) tabsRef.current[index]?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = signal.phases.length - 1;
    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = index === last ? 0 : index + 1;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = index === 0 ? last : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    else return;
    event.preventDefault();
    select(next, true);
  }

  return (
    <section className="signal-core" aria-labelledby={`${tabId}-title`}>
      <header className="signal-core-header">
        <span className="signal-live"><i aria-hidden="true" />{signal.eyebrow}</span>
        <span className="signal-sequence" aria-hidden="true">0{activeIndex + 1}/04</span>
      </header>
      <div className="signal-visual" aria-hidden="true">
        <span className="signal-scan" />
        <span className="signal-ring signal-ring-outer" />
        <span className="signal-ring signal-ring-inner" />
        <span className="signal-node signal-node-one" />
        <span className="signal-node signal-node-two" />
        <span className="signal-node signal-node-three" />
        <span className="signal-pulse"><i /></span>
        <span className="signal-crosshair" />
      </div>
      <div className="signal-copy">
        <h2 id={`${tabId}-title`}>{signal.title}</h2>
        <div className="signal-tabs" role="tablist" aria-label={signal.title}>
          {signal.phases.map((phase, index) => (
            <button
              aria-controls={`${tabId}-panel-${index}`}
              aria-selected={activeIndex === index}
              id={`${tabId}-tab-${index}`}
              key={phase.code}
              onClick={() => select(index)}
              onKeyDown={(event) => handleKeyDown(event, index)}
              ref={(node) => { tabsRef.current[index] = node; }}
              role="tab"
              tabIndex={activeIndex === index ? 0 : -1}
              type="button"
            >
              <span>{phase.code}</span>
              <strong>{phase.label}</strong>
            </button>
          ))}
        </div>
        {signal.phases.map((phase, index) => (
          <div
            aria-labelledby={`${tabId}-tab-${index}`}
            className="signal-panel"
            hidden={activeIndex !== index}
            id={`${tabId}-panel-${index}`}
            key={phase.code}
            role="tabpanel"
            tabIndex={activeIndex === index ? 0 : -1}
          >
            <span>{phase.code}</span>
            <p>{phase.detail}</p>
          </div>
        ))}
      </div>
      <footer className="signal-release">
        <span>{signal.releaseLabel}</span>
        <Link href="/version.json"><code>{shortCommit}</code><span aria-hidden="true">↗</span></Link>
      </footer>
    </section>
  );
}
