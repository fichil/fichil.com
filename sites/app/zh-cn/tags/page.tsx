import { TaxonomyIndexPage } from "@/components/TaxonomyPages";
import { createMetadata } from "@/lib/seo";
export const metadata = createMetadata({ locale: "zh-cn", title: "标签", description: "按技术和主题浏览 Fichil 工程记录。", path: "/zh-cn/tags/", alternatePath: "/tags/" });
export default function Page() { return <TaxonomyIndexPage locale="zh-cn" kind="tags" />; }
