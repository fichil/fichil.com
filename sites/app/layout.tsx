import type { Metadata } from "next";
import { headers } from "next/headers";
import "@fontsource-variable/ibm-plex-sans";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./globals.css";
import { absoluteUrl, DEFAULT_DESCRIPTION } from "@/lib/seo";
import { HydrationMarker } from "@/components/HydrationMarker";

export async function generateMetadata(): Promise<Metadata> {
  return {
    metadataBase: new URL(absoluteUrl("/")),
    title: { default: "Fichil | Backend, DevOps & Integration Engineer", template: "%s | Fichil" },
    description: DEFAULT_DESCRIPTION,
    icons: { icon: "/favicon.png", shortcut: "/favicon.png" },
    openGraph: { siteName: "Fichil | Engineering Notes", images: [{ url: "/og.png", width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", images: ["/og.png"] },
  };
}

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const requestHeaders = await headers();
  const locale = requestHeaders.get("x-fichil-locale") === "zh-cn" ? "zh-CN" : "en";
  const themeScript = `(function(){var t='';try{t=localStorage.getItem('fichil-theme')||''}catch(e){}if(t!=='light'&&t!=='dark')t=matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';document.documentElement.dataset.theme=t})()`;
  return <html lang={locale} suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head><body><HydrationMarker />{children}</body></html>;
}
