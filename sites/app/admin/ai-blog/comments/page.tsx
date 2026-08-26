import type { Metadata } from "next";
import { AdminComments } from "@/components/AdminComments";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "AI blog comment governance", robots: { index: false, follow: false } };

export default async function Page({ searchParams }: { searchParams: Promise<{ ui?: string | string[] }> }) {
  const params = await searchParams;
  const locale = params.ui === "zh-cn" ? "zh-cn" : "en";
  return <AdminComments locale={locale} />;
}
