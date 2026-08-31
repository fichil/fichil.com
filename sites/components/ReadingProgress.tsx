"use client";

import { useEffect, useState } from "react";

export function ReadingProgress({ label }: { label: string }) {
  const [progress, setProgress] = useState(0);
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    let frame = 0;
    function measure() {
      frame = 0;
      const available = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(available > 0 ? Math.min(100, (window.scrollY / available) * 100) : 0);
      setShowTop(window.scrollY > 560);
    }
    function schedule() {
      if (!frame) frame = window.requestAnimationFrame(measure);
    }
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const resizeObserver = "ResizeObserver" in window ? new ResizeObserver(schedule) : null;
    if (resizeObserver) resizeObserver.observe(document.documentElement);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
    };
  }, []);

  return (
    <>
      <div className="reading-progress" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
      {showTop ? <button className="back-to-top" type="button" aria-label={label} onClick={() => {
        const target = document.querySelector<HTMLElement>("#main-content h1") ?? document.getElementById("main-content");
        if (target) {
          target.tabIndex = -1;
          target.focus({ preventScroll: true });
        }
        window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      }}><span aria-hidden="true">↑</span>{label}</button> : null}
    </>
  );
}
