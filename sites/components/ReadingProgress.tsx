"use client";

import { useEffect, useState } from "react";

export function ReadingProgress({ label }: { label: string }) {
  const [progress, setProgress] = useState(0);
  const [showTop, setShowTop] = useState(false);

  useEffect(() => {
    function update() {
      const available = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(available > 0 ? Math.min(100, (window.scrollY / available) * 100) : 0);
      setShowTop(window.scrollY > 560);
    }
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <>
      <div className="reading-progress" aria-hidden="true"><span style={{ width: `${progress}%` }} /></div>
      {showTop ? <button className="back-to-top" type="button" aria-label={label} onClick={() => window.scrollTo({ top: 0, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" })}><span aria-hidden="true">↑</span>{label}</button> : null}
    </>
  );
}
