import type { Metadata } from "next";
import { ServiceMetrics } from "@/components/ServiceMetrics";
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Service entry metrics", robots: { index: false, follow: false } };
export default async function Page({ searchParams }: { searchParams: Promise<{ ui?: string }> }) {
  return <ServiceMetrics locale={(await searchParams).ui === "zh-cn" ? "zh-cn" : "en"} />;
}
