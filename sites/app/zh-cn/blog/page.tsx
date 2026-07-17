import { BlogIndexPage } from "@/components/BlogIndexPage";
import { createMetadata } from "@/lib/seo";

export const metadata = createMetadata({ locale: "zh-cn", title: "工程技术记录", description: "记录后端、DevOps、物流系统、生产恢复与 AI 辅助工程实践。", path: "/zh-cn/blog/", alternatePath: "/blog/" });
export default function Page() { return <BlogIndexPage locale="zh-cn" page={1} />; }
