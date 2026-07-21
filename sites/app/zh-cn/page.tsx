import { HomePage } from "@/components/HomePage";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({ locale: "zh-cn", title: "Fichil | 自由职业后端、DevOps 与企业集成工程师", description: "Fichil 记录以证据驱动的生产可靠性、DevOps 交付与企业物流系统集成实践。", path: "/zh-cn/", alternatePath: "/" });

export default function Page() { return <HomePage locale="zh-cn" />; }
