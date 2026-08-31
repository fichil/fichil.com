"use client";

import { useSyncExternalStore } from "react";
import type { Locale } from "@/lib/content";

export function ThemeToggle({ locale }: { locale: Locale }) {
  const dark = useSyncExternalStore(
    (notify) => {
      window.addEventListener("fichil-theme-change", notify);
      return () => window.removeEventListener("fichil-theme-change", notify);
    },
    () => document.documentElement.dataset.theme === "dark",
    () => false,
  );

  function toggleTheme() {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("fichil-theme", next);
    window.dispatchEvent(new Event("fichil-theme-change"));
  }

  const label = locale === "zh-cn"
    ? dark ? "切换到浅色主题" : "切换到深色主题"
    : dark ? "Switch to light theme" : "Switch to dark theme";

  return (
    <button className="theme-toggle" type="button" onClick={toggleTheme} aria-label={label} aria-pressed={dark} title={label}>
      <span className="theme-toggle-orbit" aria-hidden="true"><span /></span>
    </button>
  );
}
