import { HomePage } from "@/components/HomePage";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({ locale: "zh-cn", title: "Fichil | 后端、运维与企业集成工程师", description: "记录 Java 后端、物流系统、DevOps 运维、生产排障与 AI 辅助工程实践。", path: "/zh-cn/", alternatePath: "/" });

export default function Page() { return <HomePage locale="zh-cn" />; }
