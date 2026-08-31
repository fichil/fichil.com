"use client";

import { useSyncExternalStore } from "react";
import type { Locale } from "@/lib/content";

export function ThemeToggle({ locale }: { locale: Locale }) {
  const dark = useSyncExternalStore(
    (notify) => {
      const media = window.matchMedia("(prefers-color-scheme: dark)");
      const syncFromPreference = (theme?: string | null) => {
        let saved = theme;
        if (saved === undefined) {
          try { saved = window.localStorage.getItem("fichil-theme"); } catch { saved = null; }
        }
        document.documentElement.dataset.theme = saved === "dark" || saved === "light" ? saved : media.matches ? "dark" : "light";
        notify();
      };
      const onStorage = (event: StorageEvent) => { if (event.key === "fichil-theme") syncFromPreference(event.newValue); };
      const onSystem = () => {
        let saved: string | null = null;
        try { saved = window.localStorage.getItem("fichil-theme"); } catch { /* use system theme */ }
        if (saved !== "dark" && saved !== "light") syncFromPreference(null);
      };
      window.addEventListener("fichil-theme-change", notify);
      window.addEventListener("storage", onStorage);
      media.addEventListener("change", onSystem);
      return () => {
        window.removeEventListener("fichil-theme-change", notify);
        window.removeEventListener("storage", onStorage);
        media.removeEventListener("change", onSystem);
      };
    },
    () => document.documentElement.dataset.theme === "dark",
    () => false,
  );

  function toggleTheme() {
    const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try { window.localStorage.setItem("fichil-theme", next); } catch { /* theme still applies for this page */ }
    window.dispatchEvent(new Event("fichil-theme-change"));
  }

  const label = locale === "zh-cn"
    ? dark ? "切换到浅色主题" : "切换到深色主题"
    : dark ? "Switch to light theme" : "Switch to dark theme";
  const state = locale === "zh-cn"
    ? dark ? "深色" : "浅色"
    : dark ? "Dark" : "Light";

  return (
    <button className="theme-toggle" type="button" onClick={toggleTheme} aria-label={label} aria-pressed={dark} title={label}>
      <span className="theme-toggle-orbit" aria-hidden="true"><span /></span>
      <span className="theme-toggle-label">{state}</span>
    </button>
  );
}
